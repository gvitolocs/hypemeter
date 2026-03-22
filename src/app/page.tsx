import HypeBacktrackingChart from "@/components/HypeBacktrackingChart";
import DayStatsCalendar from "@/components/DayStatsCalendar";
import ScrollReveal from "@/components/ScrollReveal";

type NewsItem = {
  title: string;
  link: string;
  pubDate: string;
  source: string;
};

type SignalComponent = {
  id: string;
  label: string;
  weight: number;
  score: number;
  description: string;
  group: "community" | "market";
};

type SentimentWindow = {
  key: "1m" | "1y" | "5y";
  label: string;
  score: number;
  tone: string;
  explanation: string;
};

type YearScore = {
  year: number;
  score: number;
};

type MarketSnapshot = {
  sp500: number | null;
  bitcoin: number | null;
  sp500GrowthPct: number | null;
  bitcoinGrowthPct: number | null;
  updatedAt: string | null;
};

export const revalidate = 1800;

const NEWS_QUERY = encodeURIComponent(
  '("Pokemon" OR "Pokémon" OR "Pokemon GO" OR Nintendo) (game OR update OR event OR trailer OR release) -site:hotelier.com.py -site:propertyroom.com',
);
const NEWS_URL = `https://news.google.com/rss/search?q=${NEWS_QUERY}&hl=en-US&gl=US&ceid=US:en`;
const MARKET_QUOTES_URL =
  "https://query1.finance.yahoo.com/v7/finance/quote?symbols=%5EGSPC,BTC-USD";
const STOOQ_SP500_URL = "https://stooq.com/q/l/?s=%5Espx&i=d";
const STOOQ_BTC_URL = "https://stooq.com/q/l/?s=btcusd&i=d";
const COINGECKO_BTC_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd";
const GOOGLE_TRENDS_DAILY_RSS = "https://trends.google.com/trending/rss?geo=US";
const POKEMON_NEWS_URL = "https://www.pokemon.com/us/pokemon-news";
const REDDIT_TCG_URL = "https://www.reddit.com/r/PokemonTCG/hot.json?limit=30";
const REDDIT_CARDS_URL = "https://www.reddit.com/r/pokemoncards/hot.json?limit=30";

const PRICECHARTING_ASSETS = [
  "https://www.pricecharting.com/game/pokemon-base-set/charizard-4",
  "https://www.pricecharting.com/game/pokemon-base-set/blastoise-2",
  "https://www.pricecharting.com/game/pokemon-base-set/venusaur-15",
  "https://www.pricecharting.com/game/pokemon-evolving-skies/umbreon-vmax-215",
  "https://www.pricecharting.com/game/pokemon-sword-&-shield-evolving-skies/booster-box",
  "https://www.pricecharting.com/game/pokemon-scarlet-&-violet-prismatic-evolutions/booster-box",
];

const blockedSourceHints = [
  "hotelier.com.py",
  "propertyroom",
  "classified",
  "marketplace",
];

const blockedTitleHints = [
  "booster pack",
  "for sale",
  "psa 10",
  "near mint",
  "envío gratis",
  "buy now",
];

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function readTag(itemXml: string, tag: string) {
  const regex = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i");
  const match = itemXml.match(regex);
  return match ? match[1].trim() : "";
}

function decodeHtml(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/<[^>]*>/g, "")
    .trim();
}

function extractSourceFromTitle(title: string) {
  const chunks = title.split(" - ");
  if (chunks.length < 2) {
    return "Unknown Source";
  }
  return chunks[chunks.length - 1].trim();
}

function parseNews(xml: string): NewsItem[] {
  const items: NewsItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match = itemRegex.exec(xml);

  while (match) {
    const block = match[1];
    const title = decodeHtml(readTag(block, "title"));
    const link = decodeHtml(readTag(block, "link"));
    const pubDate = decodeHtml(readTag(block, "pubDate"));
    const sourceTag = decodeHtml(readTag(block, "source"));
    const source = sourceTag || extractSourceFromTitle(title);

    if (title && link) {
      items.push({ title, link, pubDate, source });
    }
    match = itemRegex.exec(xml);
  }
  return items.sort(
    (a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime(),
  );
}

function normalize(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function isLowSignalItem(item: NewsItem) {
  const source = normalize(item.source);
  const title = normalize(item.title);
  const blockedSource = blockedSourceHints.some((hint) => source.includes(hint));
  const blockedTitle = blockedTitleHints.some((hint) => title.includes(hint));
  return blockedSource || blockedTitle;
}

function curateNewsItems(items: NewsItem[]) {
  const deduped = new Map<string, NewsItem>();
  for (const item of items) {
    if (!/(pokemon|pokémon)/i.test(item.title)) {
      continue;
    }
    if (isLowSignalItem(item)) {
      continue;
    }
    const key = `${normalize(item.title)}|${normalize(item.source)}`;
    if (!deduped.has(key)) {
      deduped.set(key, item);
    }
  }

  const curated = Array.from(deduped.values()).sort(
    (a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime(),
  );
  return curated;
}

function parseApproxTraffic(raw: string) {
  const normalized = raw.replace(/\+/g, "").trim().toUpperCase();
  const match = normalized.match(/^([\d.]+)\s*([KMB])?$/);
  if (!match) {
    return 0;
  }
  const value = Number(match[1]);
  if (Number.isNaN(value)) {
    return 0;
  }
  const unit = match[2] ?? "";
  const multipliers: Record<string, number> = { K: 1_000, M: 1_000_000, B: 1_000_000_000 };
  return value * (multipliers[unit] ?? 1);
}

async function fetchSearchInterestScore() {
  try {
    const response = await fetch(GOOGLE_TRENDS_DAILY_RSS, { next: { revalidate: 900 } });
    if (!response.ok) return 35;
    const xml = await response.text();
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    const keywordRegex =
      /(pokemon cards|pokemon tcg|pokemon center preorder|pokemon center|pokemon)/i;
    let totalTraffic = 0;
    let match = itemRegex.exec(xml);
    while (match) {
      const item = match[1];
      const title = readTag(item, "title");
      const trafficRaw = readTag(item, "ht:approx_traffic");
      if (keywordRegex.test(title)) {
        totalTraffic += parseApproxTraffic(trafficRaw);
      }
      match = itemRegex.exec(xml);
    }
    return clampScore((Math.log10(totalTraffic + 1) / 6) * 100);
  } catch {
    return 35;
  }
}

async function fetchMarketMomentumScore() {
  try {
    const pages = await Promise.all(
      PRICECHARTING_ASSETS.map((url) =>
        fetch(url, { next: { revalidate: 3600 } })
          .then((res) => (res.ok ? res.text() : ""))
          .catch(() => ""),
      ),
    );
    const changes: number[] = [];
    for (const page of pages) {
      const changeMatch = page.match(/([$]\d[\d,]*\.\d{2})\s*([+-][$]\d[\d,]*\.\d{2})/);
      if (!changeMatch) continue;
      const delta = Number(changeMatch[2].replace(/[^\d.-]/g, ""));
      if (!Number.isNaN(delta)) {
        changes.push(delta);
      }
    }
    if (changes.length === 0) return 50;
    const positiveRatio =
      changes.filter((delta) => delta > 0).length / Math.max(1, changes.length);
    const avgMagnitude = Math.min(
      1,
      changes.reduce((sum, delta) => sum + Math.abs(delta), 0) /
        Math.max(1, changes.length) /
        200,
    );
    const score = 35 + positiveRatio * 45 + avgMagnitude * 20;
    return clampScore(score);
  } catch {
    return 50;
  }
}

async function fetchEventCatalystScore() {
  try {
    const response = await fetch(POKEMON_NEWS_URL, {
      next: { revalidate: 1800 },
      headers: { "user-agent": "Mozilla/5.0 hypemeter" },
    });
    if (!response.ok) return 40;
    const text = normalize(await response.text());
    const catalystTerms = [
      "reveal",
      "expansion",
      "release",
      "prerelease",
      "pokemon presents",
      "pokemon tcg pocket",
      "mega evolution",
      "go fest",
    ];
    const hits = catalystTerms.reduce(
      (count, term) => count + (text.includes(term) ? 1 : 0),
      0,
    );
    return clampScore(hits * 14);
  } catch {
    return 40;
  }
}

async function fetchCommunitySentimentScore() {
  const extractTitles = (payload: string) => {
    try {
      const data = JSON.parse(payload) as {
        data?: { children?: Array<{ data?: { title?: string } }> };
      };
      return (data.data?.children ?? [])
        .map((entry) => entry.data?.title ?? "")
        .filter(Boolean);
    } catch {
      return [] as string[];
    }
  };

  try {
    const [a, b] = await Promise.all([
      fetch(REDDIT_TCG_URL, { next: { revalidate: 600 } })
        .then((res) => (res.ok ? res.text() : ""))
        .catch(() => ""),
      fetch(REDDIT_CARDS_URL, { next: { revalidate: 600 } })
        .then((res) => (res.ok ? res.text() : ""))
        .catch(() => ""),
    ]);
    const titles = [...extractTitles(a), ...extractTitles(b)].map((t) => t.toLowerCase());
    if (titles.length === 0) return 50;
    const positive = ["hype", "bull", "surge", "sold out", "win", "great", "love"];
    const negative = ["crash", "dead", "overpriced", "scam", "doom", "drop", "bad"];
    let pos = 0;
    let neg = 0;
    for (const title of titles) {
      pos += positive.filter((term) => title.includes(term)).length;
      neg += negative.filter((term) => title.includes(term)).length;
    }
    const ratio = (pos + 1) / (neg + 1);
    return clampScore(50 + (Math.log(ratio) / Math.log(2)) * 20);
  } catch {
    return 50;
  }
}

function hoursAgo(dateString: string) {
  const timestamp = new Date(dateString).getTime();
  if (Number.isNaN(timestamp)) {
    return 999;
  }
  return (Date.now() - timestamp) / (1000 * 60 * 60);
}

function summarizeHype(
  items: NewsItem[],
  external: {
    searchInterest: number;
    marketMomentum: number;
    eventCatalyst: number;
    communitySentiment: number;
  },
) {
  const recent24 = items.filter((item) => hoursAgo(item.pubDate) <= 24).length;
  const titleBlob = items.map((item) => normalize(item.title)).join(" | ");
  const selloutHits = [
    "sold out",
    "out of stock",
    "preorder",
    "allocation",
    "scarcity",
    "queue",
    "purchase limit",
  ].reduce((count, key) => count + (titleBlob.includes(key) ? 1 : 0), 0);
  const stressHits = ["reprint", "delayed", "shipping delay", "limit", "queue"].reduce(
    (count, key) => count + (titleBlob.includes(key) ? 1 : 0),
    0,
  );

  const components: SignalComponent[] = [
    {
      id: "search_interest",
      label: "Search Interest",
      weight: 0.2,
      score: external.searchInterest,
      description: "Google Trends proxy for retail/fan demand.",
      group: "community",
    },
    {
      id: "market_momentum",
      label: "Market Momentum",
      weight: 0.25,
      score: external.marketMomentum,
      description: "PriceCharting momentum proxy on cards/sealed assets.",
      group: "market",
    },
    {
      id: "availability_pressure",
      label: "Availability Pressure",
      weight: 0.2,
      score: clampScore((selloutHits / 5) * 100 + (recent24 / 40) * 25),
      description: "Sellout and preorder tightness signal.",
      group: "market",
    },
    {
      id: "release_catalyst",
      label: "Release/Event Catalyst",
      weight: 0.15,
      score: external.eventCatalyst,
      description: "Boost from reveals, releases, Presents, major updates.",
      group: "community",
    },
    {
      id: "community_sentiment",
      label: "Community Sentiment",
      weight: 0.1,
      score: external.communitySentiment,
      description: "Reddit sentiment ratio, weak-signal by design.",
      group: "community",
    },
    {
      id: "product_stress",
      label: "Product Stress / Queue",
      weight: 0.1,
      score: clampScore((stressHits / 5) * 100),
      description: "Queue/reprint/restriction pressure in live coverage.",
      group: "market",
    },
  ];

  const score = clampScore(
    components.reduce((sum, component) => sum + component.score * component.weight, 0),
  );
  const communityScore = clampScore(
    components
      .filter((component) => component.group === "community")
      .reduce((sum, component) => sum + component.score, 0) / 3,
  );
  const marketScore = clampScore(
    components
      .filter((component) => component.group === "market")
      .reduce((sum, component) => sum + component.score, 0) / 3,
  );
  return { score, indicators: components, communityScore, marketScore };
}

function labelForScore(score: number) {
  if (score >= 90) return { label: "MANIA", vibe: "Demand pressure is extreme." };
  if (score >= 75) return { label: "FRENZY", vibe: "Strong acceleration across signals." };
  if (score >= 60) return { label: "HYPE", vibe: "Momentum is clearly above baseline." };
  if (score >= 45) return { label: "WARM", vibe: "Constructive but selective strength." };
  if (score >= 25) return { label: "CALM", vibe: "Balanced cycle, no major squeeze." };
  return { label: "DEAD", vibe: "Low attention and low market pressure." };
}

function buildThirtyYearCycle(currentYear: number) {
  const start = currentYear - 29;
  const cycle: YearScore[] = [];
  const eventBoosts: Record<number, number> = {
    1999: 10,
    2006: 6,
    2010: 8,
    2016: 20,
    2020: 16,
    2021: 12,
    2024: 8,
    2025: 5,
  };

  for (let year = start; year <= currentYear; year += 1) {
    let eraBase = 55;
    if (year <= 2000) eraBase = 70; // original launch supercycle
    else if (year <= 2005) eraBase = 42; // cooldown and post-initial saturation
    else if (year <= 2010) eraBase = 54; // DP/HGSS-era revival
    else if (year <= 2015) eraBase = 48; // steady pre-Pokemon GO regime
    else if (year <= 2017) eraBase = 88; // Pokemon GO shock cycle
    else if (year <= 2019) eraBase = 62; // normalization
    else if (year <= 2021) eraBase = 85; // pandemic TCG boom
    else if (year <= 2023) eraBase = 58; // correction and digestion
    else eraBase = 70; // modern re-acceleration

    const harmonicA = 7 * Math.sin((year - 1996) / 3.3);
    const harmonicB = 4 * Math.cos((year - 1996) / 6.7);
    const boost = eventBoosts[year] ?? 0;
    cycle.push({
      year,
      score: clampScore(eraBase + harmonicA + harmonicB + boost),
    });
  }
  return cycle;
}

function toneForSentiment(score: number) {
  if (score >= 75) return "bullish";
  if (score >= 55) return "constructive";
  if (score >= 40) return "neutral";
  return "defensive";
}

function computeWindowSentiments(args: {
  score: number;
  communityScore: number;
  marketScore: number;
  components: SignalComponent[];
  cycle30: YearScore[];
}) {
  const { score, communityScore, marketScore, components, cycle30 } = args;
  const last = cycle30[cycle30.length - 1]?.score ?? score;
  const prev = cycle30[cycle30.length - 2]?.score ?? last;
  const avg = (values: number[]) =>
    values.length > 0
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : 0;
  const last5 = avg(cycle30.slice(-5).map((y) => y.score));
  const prev5 = avg(cycle30.slice(-10, -5).map((y) => y.score));
  const cycleSlope = last - prev;

  const component = (id: string) =>
    components.find((entry) => entry.id === id)?.score ?? 50;

  const monthImpulse =
    component("search_interest") * 0.3 +
    component("availability_pressure") * 0.25 +
    component("release_catalyst") * 0.2 +
    component("community_sentiment") * 0.15 +
    component("product_stress") * 0.1;
  const oneMonth = clampScore(score * 0.45 + monthImpulse * 0.45 + cycleSlope * 1.5 + 5);

  const oneYearBase = avg(cycle30.slice(-3).map((y) => y.score));
  const oneYear = clampScore(
    score * 0.35 + oneYearBase * 0.35 + marketScore * 0.2 + communityScore * 0.1,
  );

  const cycleRegimeShift = last5 - prev5;
  const structuralDrag = Math.max(0, 55 - last5) * 0.18;
  const downtrendPenalty = Math.max(0, -cycleRegimeShift) * 1.4;
  const fiveYearRaw =
    last5 * 0.43 +
    marketScore * 0.22 +
    score * 0.2 +
    (50 + cycleRegimeShift * 2.6) * 0.1 -
    4 -
    structuralDrag -
    downtrendPenalty;
  const fiveYear = clampScore(Math.min(oneYear - 2, fiveYearRaw));

  const windows: SentimentWindow[] = [
    {
      key: "1m",
      label: "1 Month Sentiment",
      score: oneMonth,
      tone: toneForSentiment(oneMonth),
      explanation: "Fast-cycle demand pressure from search, availability, and event triggers.",
    },
    {
      key: "1y",
      label: "1 Year Sentiment",
      score: oneYear,
      tone: toneForSentiment(oneYear),
      explanation: "Current regime health blended with market/community balance.",
    },
    {
      key: "5y",
      label: "5 Year Sentiment",
      score: fiveYear,
      tone: toneForSentiment(fiveYear),
      explanation:
        "Long-cycle regime estimate with conservative risk bias versus the 1-year window.",
    },
  ];
  return windows;
}

function meterColor(score: number) {
  if (score >= 70) return "from-fuchsia-500 via-red-500 to-orange-400";
  if (score >= 40) return "from-cyan-400 via-blue-500 to-purple-500";
  return "from-slate-400 via-slate-500 to-slate-700";
}

function buildBacktrackSeries(liveScore: number): YearScore[] {
  const currentYear = new Date().getFullYear();
  const baselines: Record<number, number> = {
    2005: 43,
    2006: 61,
    2007: 55,
    2008: 49,
    2009: 52,
    2010: 68,
    2011: 59,
    2012: 57,
    2013: 50,
    2014: 54,
    2015: 58,
    2016: 96,
    2017: 75,
    2018: 66,
    2019: 70,
    2020: 73,
    2021: 79,
    2022: 72,
    2023: 76,
    2024: 82,
    2025: 69,
  };

  const data: YearScore[] = [];
  for (let year = 2005; year <= currentYear; year += 1) {
    const baseline = baselines[year] ?? baselines[2025];
    data.push({ year, score: clampScore(baseline) });
  }

  if (data.length > 0) {
    const last = data[data.length - 1];
    last.score = clampScore(last.score * 0.45 + liveScore * 0.55);
  }
  return data;
}

function formatUsd(value: number | null) {
  if (value === null || Number.isNaN(value)) {
    return "N/A";
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatGrowthPct(value: number | null) {
  if (value === null || Number.isNaN(value)) {
    return "N/A";
  }
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

async function fetchMarketSnapshot(): Promise<MarketSnapshot> {
  const fallback: MarketSnapshot = {
    sp500: null,
    bitcoin: null,
    sp500GrowthPct: null,
    bitcoinGrowthPct: null,
    updatedAt: null,
  };

  const parseStooqMetrics = (csv: string) => {
    const line = csv.trim().split("\n")[0] ?? "";
    const cols = line.split(",");
    if (cols.length < 7) return { close: null, growthPct: null };
    const open = Number(cols[3]);
    const close = Number(cols[6]);
    const validOpen = !Number.isNaN(open) && open > 0;
    const validClose = !Number.isNaN(close);
    const growthPct = validOpen && validClose ? ((close - open) / open) * 100 : null;
    return {
      close: validClose ? close : null,
      growthPct,
    };
  };

  try {
    const [spRes, btcRes] = await Promise.all([
      fetch(STOOQ_SP500_URL, { next: { revalidate: 900 } }),
      fetch(STOOQ_BTC_URL, { next: { revalidate: 900 } }),
    ]);
    const spx = spRes.ok ? parseStooqMetrics(await spRes.text()) : { close: null, growthPct: null };
    const btc = btcRes.ok ? parseStooqMetrics(await btcRes.text()) : { close: null, growthPct: null };
    const sp500 = spx.close;
    const bitcoin = btc.close;
    if (sp500 !== null && bitcoin !== null) {
      return {
        sp500,
        bitcoin,
        sp500GrowthPct: spx.growthPct,
        bitcoinGrowthPct: btc.growthPct,
        updatedAt: new Date().toLocaleString("en-US", {
          dateStyle: "medium",
          timeStyle: "short",
        }),
      };
    }
  } catch {
    // fallback below
  }

  try {
    const [spRes, btcRes, yahooRes] = await Promise.all([
      fetch(STOOQ_SP500_URL, { next: { revalidate: 900 } }),
      fetch(COINGECKO_BTC_URL, { next: { revalidate: 300 } }),
      fetch(MARKET_QUOTES_URL, {
        next: { revalidate: 300 },
        headers: {
          "user-agent": "Mozilla/5.0 hypemeter",
        },
      }),
    ]);
    const spText = spRes.ok ? await spRes.text() : "";
    const btcData = btcRes.ok
      ? ((await btcRes.json()) as { bitcoin?: { usd?: number } })
      : {};
    const yahooData = yahooRes.ok
      ? ((await yahooRes.json()) as {
          quoteResponse?: {
            result?: Array<{
              symbol?: string;
              regularMarketPrice?: number;
              regularMarketChangePercent?: number;
            }>;
          };
        })
      : {};
    const spx = parseStooqMetrics(spText);
    const sp500 = spx.close;
    const yahooBtcEntry = yahooData.quoteResponse?.result?.find(
      (entry) => entry.symbol === "BTC-USD",
    );
    const yahooBtc = yahooBtcEntry?.regularMarketPrice ?? null;
    const yahooBtcGrowth = yahooBtcEntry?.regularMarketChangePercent ?? null;
    const bitcoin = btcData.bitcoin?.usd ?? yahooBtc;
    const hasValues =
      sp500 !== null && !Number.isNaN(sp500) && bitcoin !== null && !Number.isNaN(bitcoin);

    if (hasValues) {
      return {
        sp500,
        bitcoin,
        sp500GrowthPct: spx.growthPct,
        bitcoinGrowthPct: yahooBtcGrowth,
        updatedAt: new Date().toLocaleString("en-US", {
          dateStyle: "medium",
          timeStyle: "short",
        }),
      };
    }
  } catch {
    // final fallback below
  }

  return fallback;
}

export default async function Home() {
  let items: NewsItem[] = [];
  let searchInterest = 35;
  let marketMomentum = 50;
  let eventCatalyst = 40;
  let communitySentiment = 50;
  try {
    const response = await fetch(NEWS_URL, {
      next: { revalidate },
      headers: {
        "user-agent": "Mozilla/5.0 hypemeter",
      },
    });
    if (response.ok) {
      const xml = await response.text();
      items = curateNewsItems(parseNews(xml)).slice(0, 28);
    }
  } catch {
    items = [];
  }

  [searchInterest, marketMomentum, eventCatalyst, communitySentiment] = await Promise.all([
    fetchSearchInterestScore(),
    fetchMarketMomentumScore(),
    fetchEventCatalystScore(),
    fetchCommunitySentimentScore(),
  ]);

  const { score, indicators, communityScore, marketScore } = summarizeHype(items, {
    searchInterest,
    marketMomentum,
    eventCatalyst,
    communitySentiment,
  });
  const cycle30 = buildThirtyYearCycle(new Date().getFullYear());
  const sentiments = computeWindowSentiments({
    score,
    communityScore,
    marketScore,
    components: indicators,
    cycle30,
  });
  const market = await fetchMarketSnapshot();
  const mood = labelForScore(score);
  const history = buildBacktrackSeries(score);

  const updatedAt = new Date().toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Pokemon Hype Meter",
    applicationCategory: "FinanceApplication",
    operatingSystem: "Web",
    url: "https://hypemeter-giuseppevitolo17s-projects.vercel.app/",
    description:
      "Composite Pokemon hype index based on search demand, market momentum, availability pressure, event catalysts, and community sentiment.",
    publisher: {
      "@type": "Organization",
      name: "Pokemon Hype Meter",
    },
    featureList: [
      "Pokemon TCG market momentum tracking",
      "Search interest and sentiment monitoring",
      "Availability pressure and catalyst scoring",
      "Interactive historical hype chart",
      "Daily event calendar with runtime stats",
    ],
    dateModified: new Date().toISOString(),
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-4 py-10 text-slate-100 md:px-8">
      <div className="ambient-orb orb-a" />
      <div className="ambient-orb orb-b" />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <ScrollReveal>
          <header className="relative overflow-hidden rounded-3xl border border-white/10 bg-slate-900/70 p-6 shadow-2xl shadow-cyan-950/30 backdrop-blur hover-lift">
          <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">
            Pokemon Fear & Greed Remix
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight md:text-5xl">
            Pokemon Hype Meter
          </h1>
          <p className="mt-3 max-w-3xl text-sm text-slate-300 md:text-base">
            A real-time snapshot of Pokemon buzz, built from live headlines and
            trend signals.
          </p>
          <p className="mt-2 text-xs text-slate-400">Updated: {updatedAt}</p>
          </header>
        </ScrollReveal>

        <ScrollReveal delayMs={60}>
          <section className="items-start grid gap-6 lg:grid-cols-[1.15fr_1fr]">
          <div className="rounded-3xl border border-white/10 bg-slate-900 p-6 hover-lift">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">
                  Current Hype
                </p>
                <h2 className="mt-1 text-4xl font-black md:text-6xl">
                  {score}
                  <span className="text-2xl text-slate-400">/100</span>
                </h2>
                <p className="mt-1 text-lg font-semibold text-fuchsia-300">
                  {mood.label}
                </p>
                <p className="text-sm text-slate-400">{mood.vibe}</p>
              </div>
              <div className="group relative h-40 w-40 rounded-full p-3 ring-1 ring-white/20">
                <div
                  className="h-full w-full rounded-full transition-transform duration-300 group-hover:scale-[1.03]"
                  style={{
                    background: `conic-gradient(#22d3ee ${score * 3.6}deg, #334155 0deg)`,
                  }}
                />
                <div className="absolute inset-8 flex items-center justify-center rounded-full bg-slate-900 text-2xl font-black">
                  {score}
                </div>
                <div className="pointer-events-none absolute -bottom-10 left-1/2 w-44 -translate-x-1/2 rounded-lg border border-cyan-400/30 bg-slate-900/95 px-2 py-1 text-center text-[10px] text-cyan-200 opacity-0 shadow-lg shadow-cyan-950/40 transition-opacity duration-200 group-hover:opacity-100">
                  Hover insight: {mood.label.toLowerCase()} • {Math.max(0, 100 - score)} pts to max hype
                </div>
              </div>
            </div>
            <div className="mt-5 h-4 overflow-hidden rounded-full bg-slate-700">
              <div
                className={`h-full rounded-full bg-gradient-to-r ${meterColor(score)}`}
                style={{ width: `${score}%` }}
              />
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-slate-800 p-3 hover-lift">
                <p className="text-xs uppercase tracking-[0.12em] text-slate-400">
                  Pokemon Community Hype
                </p>
                <p className="mt-1 text-2xl font-bold text-cyan-300">
                  {communityScore}/100
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-slate-800 p-3 hover-lift">
                <p className="text-xs uppercase tracking-[0.12em] text-slate-400">
                  Pokemon TCG Market Heat
                </p>
                <p className="mt-1 text-2xl font-bold text-fuchsia-300">
                  {marketScore}/100
                </p>
              </div>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-slate-900 p-6 hover-lift">
            <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-300">
              How this meter works
            </h3>
            <p className="mt-3 text-sm text-slate-400">
              Composite index with 6 weighted components: Search Interest (20%),
              Market Momentum (25%), Availability Pressure (20%), Event Catalyst
              (15%), Community Sentiment (10%), Product Stress (10%).
            </p>
            <a
              className="mt-4 inline-block text-sm font-semibold text-cyan-300 hover:text-cyan-200"
              href="https://edition.cnn.com/markets/fear-and-greed"
              target="_blank"
              rel="noreferrer"
            >
              Inspiration: CNN Fear & Greed →
            </a>
            <p className="mt-4 text-xs text-slate-500">
              Model note: historical values are a backtracking estimate from key
              yearly Pokemon cycle intensity and are blended with today&apos;s
              live score.
            </p>
            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              {sentiments.map((sentiment) => (
                <div
                  key={sentiment.key}
                  className="rounded-xl border border-white/10 bg-slate-800 p-3 hover-lift"
                >
                  <p className="text-xs uppercase tracking-[0.12em] text-slate-400">
                    {sentiment.label}
                  </p>
                  <p className="mt-1 text-2xl font-bold text-white">
                    {sentiment.score}/100
                  </p>
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-cyan-300">
                    {sentiment.tone}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-400">
                    {sentiment.explanation}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
        </ScrollReveal>

        <ScrollReveal delayMs={90}>
        <section className="rounded-3xl border border-white/10 bg-slate-900 p-6 hover-lift">
          <div className="flex items-center justify-between gap-4">
            <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-300">
              Hype Backtracking (2005 → now)
            </h3>
            <p className="text-xs text-slate-400">
              First year: {history[0]?.year} • Latest:{" "}
              {history[history.length - 1]?.year}
            </p>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-[1.5fr_0.7fr]">
            <HypeBacktrackingChart history={history} />
            <aside className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-950 p-4 hover-lift">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
                Market Sidecar
              </p>

              <div className="mt-4 space-y-3">
                <div className="rounded-xl border border-white/10 bg-slate-900 p-3 hover-lift">
                  <p className="text-xs uppercase tracking-[0.12em] text-slate-400">
                    S&P 500
                  </p>
                  <p className="mt-1 text-2xl font-bold text-cyan-300">
                    {formatGrowthPct(market.sp500GrowthPct)}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    level: {formatUsd(market.sp500)}
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-slate-900 p-3 hover-lift">
                  <p className="text-xs uppercase tracking-[0.12em] text-slate-400">
                    Bitcoin
                  </p>
                  <p className="mt-1 text-2xl font-bold text-amber-300">
                    {formatGrowthPct(market.bitcoinGrowthPct)}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    level: {formatUsd(market.bitcoin)}
                  </p>
                </div>
              </div>

              <p className="mt-4 text-[11px] text-slate-500">
                Source: Yahoo Finance (fallback: Stooq + CoinGecko)
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                Last market update: {market.updatedAt ?? "Unavailable"}
              </p>
            </aside>
          </div>
        </section>
        </ScrollReveal>

        <ScrollReveal delayMs={120}>
        <section className="rounded-3xl border border-white/10 bg-slate-900 p-6 hover-lift">
          <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-300">
            6 Composite Components
          </h3>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {indicators.map((indicator) => (
              <article
                key={indicator.id}
                className="rounded-2xl border border-white/10 bg-slate-800 p-4 hover-lift"
              >
                <p className="text-xs uppercase tracking-[0.14em] text-slate-400">
                  {indicator.label}
                </p>
                {"weight" in indicator ? (
                  <p className="mt-1 text-[11px] text-slate-500">
                    Weight: {Math.round(indicator.weight * 100)}%
                  </p>
                ) : null}
                <p className="mt-1 text-2xl font-bold text-white">
                  {indicator.score}
                </p>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-700">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-fuchsia-500"
                    style={{ width: `${indicator.score}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-slate-400">
                  {indicator.description}
                </p>
              </article>
            ))}
          </div>
        </section>
        </ScrollReveal>

        <ScrollReveal delayMs={150}>
          <DayStatsCalendar />
        </ScrollReveal>

        <ScrollReveal delayMs={180}>
        <section className="rounded-3xl border border-white/10 bg-slate-900 p-6 hover-lift">
          <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-300">
            Latest Pokemon News
          </h3>
          {items.length === 0 ? (
            <p className="mt-3 text-sm text-slate-400">
              News feed temporarily unavailable. Deploy and refresh in a minute.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {items.slice(0, 12).map((item) => (
                <li
                  key={`${item.link}-${item.pubDate}`}
                  className="rounded-2xl border border-white/10 bg-slate-800 p-4 hover-lift"
                >
                  <a
                    className="text-sm font-semibold text-cyan-300 hover:text-cyan-200"
                    href={item.link}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {item.title}
                  </a>
                  <p className="mt-1 text-xs text-slate-400">
                    {item.source} •{" "}
                    {new Date(item.pubDate).toLocaleString("en-US", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
        </ScrollReveal>
      </div>
    </main>
  );
}
