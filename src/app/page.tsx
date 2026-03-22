import HypeBacktrackingChart from "@/components/HypeBacktrackingChart";
import DayStatsCalendar from "@/components/DayStatsCalendar";
import ScrollReveal from "@/components/ScrollReveal";
import Image from "next/image";

type NewsItem = {
  title: string;
  link: string;
  pubDate: string;
  source: string;
  summary: string;
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

type CalendarDayStats = {
  date: string;
  stats: {
    headlineCount: number;
    uniqueSources: number;
    eventHits: number;
    pressureHits: number;
    sentiment: number;
    dayScore: number;
    signalQuality?: number;
    eventSignals?: Array<{
      label: string;
      group: string;
      weight: number;
    }>;
  };
  headlines: Array<{
    title: string;
    link: string;
    source: string;
    pubDate: string;
  }>;
};

type TimelineEventSignal = {
  year: number;
  label: string;
  intensity: number;
};

type PokemonOfDay = {
  id: number;
  name: string;
  image: string | null;
  types: string[];
};

type PokemonOfDayArticle = {
  title: string;
  link: string;
  source: string;
  summary: string;
  pokemonMentions: string[];
};

// Revalidate the server-rendered homepage every 30 minutes.
export const revalidate = 1800;

// Curated Google News query tuned for Pokemon relevance and noise reduction.
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

const LIVE_EVENT_SIGNAL_PATTERNS: Array<{ label: string; group: string; weight: number; regex: RegExp }> = [
  { label: "Pokemon Direct", group: "event", weight: 4.6, regex: /\bpokemon direct\b/i },
  { label: "Pokemon Presents", group: "event", weight: 4.3, regex: /\bpok[eé]mon presents\b/i },
  { label: "Major Reveal", group: "event", weight: 2.8, regex: /\breveal|announc(e|ed|ement)|unveil|trailer\b/i },
  { label: "Release Window", group: "event", weight: 2.3, regex: /\brelease|launch|debut|premiere\b/i },
  { label: "Expansion Cycle", group: "event", weight: 2.1, regex: /\bexpansion|set list|new set|pre-?release\b/i },
  { label: "Pokemon Day / Worlds", group: "event", weight: 2.2, regex: /\bpok[eé]mon day|worlds|championship\b/i },
  { label: "Demand Spike", group: "pressure", weight: 1.8, regex: /\bsold out|out of stock|pre-?order|queue|allocation\b/i },
  { label: "Supply Stress", group: "pressure", weight: 1.4, regex: /\breprint|restock|scarcity|shortage\b/i },
  { label: "Gameplay Footage", group: "event", weight: 1.9, regex: /\bgameplay|hands-on|preview\b/i },
  { label: "New Region / Gen", group: "event", weight: 2, regex: /\bnew region|generation|gen\s?\d+|starter\b/i },
  { label: "Legendary / Mythic Focus", group: "event", weight: 1.6, regex: /\blegendary|mythical\b/i },
  { label: "TCG Set Momentum", group: "market", weight: 1.7, regex: /\btcg|booster box|elite trainer box|etb|set list\b/i },
  { label: "Mobile / GO Wave", group: "community", weight: 1.5, regex: /\bpokemon go|mobile|event bonus|raid\b/i },
  { label: "Competitive Circuit", group: "community", weight: 1.5, regex: /\bvgc|regional|world championship|tournament\b/i },
  { label: "Community Volatility", group: "sentiment", weight: 1.4, regex: /\bcontroversy|backlash|debate|mixed reactions\b/i },
];

const CONTEXTUAL_SIGNAL_PATTERNS: Array<{
  label: string;
  group: string;
  baseWeight: number;
  regex: RegExp;
}> = [
  { label: "Multiple Reveal Headlines", group: "event", baseWeight: 1.9, regex: /\breveal|announc(e|ed|ement)|trailer\b/i },
  { label: "New Games Mentioned", group: "event", baseWeight: 2.4, regex: /\bnew game|new games|new title|legends|gen\s?\d+\b/i },
  { label: "Release Timing Chatter", group: "event", baseWeight: 1.8, regex: /\brelease date|coming soon|launch window|drops\b/i },
  { label: "High TCG Activity", group: "market", baseWeight: 1.6, regex: /\btcg|booster|set|card market\b/i },
  { label: "Community Buzz Spike", group: "community", baseWeight: 1.5, regex: /\bhype|massive|viral|trending\b/i },
];

type WeightedHeadlineSignal = {
  label: string;
  weight: number;
  regex: RegExp;
};

// These signal families power the right-side market pressure cards.
const AVAILABILITY_SIGNAL_PATTERNS: WeightedHeadlineSignal[] = [
  { label: "Sold Out", weight: 1.9, regex: /\bsold out|out of stock\b/i },
  { label: "Preorder Wave", weight: 1.5, regex: /\bpre-?order|preorder\b/i },
  { label: "Queue / Allocation", weight: 1.4, regex: /\bqueue|allocation|waiting list\b/i },
  { label: "Scarcity", weight: 1.2, regex: /\bscarcity|shortage|hard to find\b/i },
  { label: "Retail Constraint", weight: 1.3, regex: /\bpurchase limit|per customer|limited quantities\b/i },
];

const PRODUCT_STRESS_SIGNAL_PATTERNS: WeightedHeadlineSignal[] = [
  { label: "Reprint / Restock", weight: 1.2, regex: /\breprint|restock\b/i },
  { label: "Shipping Delay", weight: 1.6, regex: /\bshipping delay|delayed|delay\b/i },
  { label: "Platform Instability", weight: 1.5, regex: /\bserver issue|maintenance|crash|outage\b/i },
  { label: "Restriction Language", weight: 1.3, regex: /\blimit|restriction|quota\b/i },
  { label: "Fulfillment Pressure", weight: 1.1, regex: /\bbackorder|fulfillment|dispatch\b/i },
];

const timelineEventSignals: TimelineEventSignal[] = [
  { year: 2006, label: "Diamond & Pearl Era", intensity: 66 },
  { year: 2010, label: "HGSS + Competitive Upswing", intensity: 62 },
  { year: 2013, label: "X/Y 3D Transition", intensity: 70 },
  { year: 2016, label: "Pokemon GO Global Shock", intensity: 98 },
  { year: 2019, label: "Sword/Shield Reset", intensity: 64 },
  { year: 2021, label: "Pandemic TCG Mania", intensity: 93 },
  { year: 2024, label: "Pocket + New Cycle", intensity: 81 },
  { year: 2025, label: "Direct/Presents Volatility", intensity: 74 },
];

// Keep every synthetic score in a strict 0-100 range.
function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

// Lightweight XML tag extractor used across RSS-style feeds.
function readTag(itemXml: string, tag: string) {
  const regex = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i");
  const match = itemXml.match(regex);
  return match ? match[1].trim() : "";
}

// Decode common HTML/XML entities from RSS payloads.
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

// Some feeds append source in the title, this recovers it when <source> is missing.
function extractSourceFromTitle(title: string) {
  const chunks = title.split(" - ");
  if (chunks.length < 2) {
    return "Unknown Source";
  }
  return chunks[chunks.length - 1].trim();
}

// Parse Google News RSS into typed objects and keep newest headlines first.
function parseNews(xml: string): NewsItem[] {
  const items: NewsItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match = itemRegex.exec(xml);

  while (match) {
    const block = match[1];
    const title = decodeHtml(readTag(block, "title"));
    const link = decodeHtml(readTag(block, "link"));
    const pubDate = decodeHtml(readTag(block, "pubDate"));
    const summary = decodeHtml(readTag(block, "description"));
    const sourceTag = decodeHtml(readTag(block, "source"));
    const source = sourceTag || extractSourceFromTitle(title);

    if (title && link) {
      items.push({ title, link, pubDate, source, summary });
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

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Count weighted headline signals with a per-item cap to avoid spam-like inflation.
function weightedSignalHitsAcrossItems(items: NewsItem[], signals: WeightedHeadlineSignal[]) {
  let total = 0;
  for (const item of items) {
    const text = normalize(`${item.title} ${item.summary}`);
    let perItem = 0;
    for (const signal of signals) {
      if (signal.regex.test(text)) {
        perItem += signal.weight;
      }
    }
    total += Math.min(perItem, 3.8);
  }
  return total;
}

function extractLiveEventSignals(items: NewsItem[], limit = 12) {
  const titles = items.map((item) => item.title);
  const text = titles.join(" | ");
  const directSignals = LIVE_EVENT_SIGNAL_PATTERNS.filter((signal) => signal.regex.test(text))
    .sort((a, b) => b.weight - a.weight)
    .map((signal) => ({
      label: signal.label,
      group: signal.group,
      weight: signal.weight,
    }));

  const contextualSignals = CONTEXTUAL_SIGNAL_PATTERNS.map((pattern) => {
    const hits = titles.reduce((sum, title) => sum + (pattern.regex.test(title) ? 1 : 0), 0);
    if (hits === 0) return null;
    return {
      label: hits >= 2 ? `${pattern.label} x${hits}` : pattern.label,
      group: pattern.group,
      weight: pattern.baseWeight + Math.min(2, (hits - 1) * 0.45),
    };
  }).filter((signal): signal is { label: string; group: string; weight: number } => Boolean(signal));

  const merged = [...directSignals, ...contextualSignals];
  const deduped = new Map<string, { label: string; group: string; weight: number }>();
  for (const signal of merged) {
    const key = `${signal.group}:${signal.label}`;
    const existing = deduped.get(key);
    if (!existing || signal.weight > existing.weight) {
      deduped.set(key, signal);
    }
  }

  return Array.from(deduped.values())
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit);
}

function computeLiveSignalQuality(args: {
  items: NewsItem[];
  eventSignalCount: number;
  searchInterest: number;
  components: SignalComponent[];
}) {
  const { items, eventSignalCount, searchInterest, components } = args;
  if (items.length === 0) return 0;
  const sourceCounts = new Map<string, number>();
  for (const item of items) {
    const key = normalize(item.source || "Unknown");
    sourceCounts.set(key, (sourceCounts.get(key) ?? 0) + 1);
  }
  const headlineCount = items.length;
  const uniqueSources = sourceCounts.size;
  const maxSourceShare = Math.max(...Array.from(sourceCounts.values())) / headlineCount;
  const unknownShare = (sourceCounts.get("unknown") ?? 0) / headlineCount;

  const coverage = Math.max(0, Math.min(1, Math.log10(headlineCount + 1) / Math.log10(36)));
  const sourceSpread = Math.max(0, Math.min(1, (uniqueSources - 1) / 10));
  const eventDensity = Math.max(0, Math.min(1, eventSignalCount / 10));
  const socialBuckets = [
    { label: "reddit", count: 0 },
    { label: "youtube", count: 0 },
    { label: "facebook", count: 0 },
    { label: "official", count: 0 },
  ];
  for (const item of items) {
    const source = normalize(item.source || "");
    if (source.includes("reddit")) socialBuckets[0].count += 1;
    if (source.includes("youtube")) socialBuckets[1].count += 1;
    if (source.includes("facebook")) socialBuckets[2].count += 1;
    if (
      source.includes("pokemon.com") ||
      source.includes("the pokemon company") ||
      source.includes("nintendo")
    ) {
      socialBuckets[3].count += 1;
    }
  }
  const socialActive = socialBuckets.filter((bucket) => bucket.count > 0).length;
  const socialPresence = Math.max(0, Math.min(1, socialActive / socialBuckets.length));
  const totalSocialHits = socialBuckets.reduce((sum, bucket) => sum + bucket.count, 0);
  const expectedPerBucket = totalSocialHits / Math.max(1, socialBuckets.length);
  const socialImbalance =
    totalSocialHits > 0
      ? socialBuckets.reduce(
          (sum, bucket) => sum + Math.abs(bucket.count - expectedPerBucket),
          0,
        ) /
        Math.max(1, totalSocialHits * 1.2)
      : 1;
  const socialHarmony = Math.max(
    0,
    Math.min(1, socialPresence * 0.65 + (1 - Math.min(1, socialImbalance)) * 0.35),
  );

  // "Others" harmony: reward coherence among all core components (less contradictory spread).
  const componentScores = components.map((component) => component.score);
  const componentHarmony =
    componentScores.length > 0
      ? (() => {
          const componentMean =
            componentScores.reduce((sum, value) => sum + value, 0) / componentScores.length;
          const componentVariance =
            componentScores.reduce((sum, value) => sum + (value - componentMean) ** 2, 0) /
            componentScores.length;
          const componentStd = Math.sqrt(componentVariance);
          return Math.max(0, Math.min(1, 1 - componentStd / 35));
        })()
      : 0.55;
  const searchHealth = Math.max(0, Math.min(1, searchInterest / 100));

  const raw =
    coverage * 0.25 +
    sourceSpread * 0.25 +
    eventDensity * 0.18 +
    socialHarmony * 0.18 +
    componentHarmony * 0.09 +
    searchHealth * 0.05;
  const penalty = Math.max(0, maxSourceShare - 0.5) * 0.65 + unknownShare * 0.8;
  return clampScore((raw - penalty) * 100);
}

// Filter out low-signal commerce spam and noisy listing-style headlines.
function isLowSignalItem(item: NewsItem) {
  const source = normalize(item.source);
  const title = normalize(item.title);
  const blockedSource = blockedSourceHints.some((hint) => source.includes(hint));
  const blockedTitle = blockedTitleHints.some((hint) => title.includes(hint));
  return blockedSource || blockedTitle;
}

// Final newsroom curation pass: Pokemon-only, filtered noise, deduped by title+source.
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

// Convert traffic strings like "120K"/"1.4M" into numeric values.
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

type SearchInterestStats = {
  score: number;
  todayTraffic: number;
  yesterdayTraffic: number;
};

type SocialTrafficSnapshot = Record<
  string,
  {
    current: number;
    previous: number;
  }
>;

let lastSocialTrafficSnapshot: SocialTrafficSnapshot | null = null;

async function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeoutMs?: number } = {},
) {
  const { timeoutMs = 8000, ...rest } = options;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...rest, signal: controller.signal });
    return response;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseCompactMetric(raw: string) {
  const normalized = raw.trim().toUpperCase().replace(/\s+/g, "");
  const unit = normalized.endsWith("K") ? "K" : normalized.endsWith("M") ? "M" : normalized.endsWith("B") ? "B" : "";
  const numberPart = unit ? normalized.slice(0, -1) : normalized;
  if (!numberPart) return 0;
  if (!unit) {
    const digits = numberPart.replace(/[^\d]/g, "");
    return digits ? Number(digits) : 0;
  }
  const numeric = Number(numberPart.replace(/,/g, ".").replace(/[^\d.]/g, ""));
  if (Number.isNaN(numeric)) return 0;
  const multiplier = unit === "K" ? 1_000 : unit === "M" ? 1_000_000 : 1_000_000_000;
  return Math.round(numeric * multiplier);
}

function safeTrafficFromCache(key: string, current: number, previous: number) {
  const cached = lastSocialTrafficSnapshot?.[key];
  const safeCurrent = current > 0 ? current : (cached?.current ?? 0);
  const safePrevious =
    previous > 0 ? previous : cached?.previous ?? cached?.current ?? safeCurrent;
  return { current: safeCurrent, previous: safePrevious };
}

async function fetchRedditTraffic() {
  const now = Date.now();
  const startToday = new Date();
  startToday.setUTCHours(0, 0, 0, 0);
  const startYesterday = new Date(startToday.getTime() - 24 * 60 * 60 * 1000);
  let today = 0;
  let yesterday = 0;
  const urls = [REDDIT_TCG_URL, REDDIT_CARDS_URL, "https://www.reddit.com/r/pokemon/hot.json?limit=40"];
  for (const url of urls) {
    const res = await fetchWithTimeout(url, { next: { revalidate: 600 }, timeoutMs: 7000 });
    if (!res?.ok) continue;
    const payload = (await res.json().catch(() => null)) as
      | {
          data?: {
            children?: Array<{
              data?: { created_utc?: number; score?: number; num_comments?: number };
            }>;
          };
        }
      | null;
    for (const child of payload?.data?.children ?? []) {
      const createdUtcMs = (child.data?.created_utc ?? 0) * 1000;
      const engagement = Math.max(0, child.data?.score ?? 0) + Math.max(0, child.data?.num_comments ?? 0) * 2;
      if (createdUtcMs >= startToday.getTime() && createdUtcMs <= now) today += engagement;
      else if (
        createdUtcMs >= startYesterday.getTime() &&
        createdUtcMs < startToday.getTime()
      ) {
        yesterday += engagement;
      }
    }
  }
  return { current: today, previous: yesterday };
}

async function fetchYouTubeTraffic() {
  const res = await fetchWithTimeout(
    "https://www.youtube.com/results?search_query=pokemon&hl=en&gl=US",
    {
      headers: { "user-agent": "Mozilla/5.0", "accept-language": "en-US,en;q=0.9" },
      next: { revalidate: 900 },
      timeoutMs: 8000,
    },
  );
  if (!res?.ok) return { current: 0, previous: 0 };
  const html = await res.text();
  const views = [...html.matchAll(/\"viewCountText\":\{\"simpleText\":\"([^\"]+)\"\}/g)].map((m) =>
    parseCompactMetric(m[1]),
  );
  const times = [...html.matchAll(/\"publishedTimeText\":\{\"simpleText\":\"([^\"]+)\"\}/g)].map((m) =>
    normalize(m[1]),
  );
  let today = 0;
  let yesterday = 0;
  const len = Math.min(views.length, times.length, 20);
  for (let i = 0; i < len; i += 1) {
    const t = times[i];
    const v = views[i];
    if (/minute|hour|today|streamed/.test(t)) today += v;
    else if (/1 day ago/.test(t)) yesterday += v;
  }
  return { current: today, previous: yesterday };
}

async function fetchFacebookTraffic() {
  const res = await fetchWithTimeout("https://r.jina.ai/http://www.facebook.com/Pokemon", {
    headers: { "user-agent": "Mozilla/5.0" },
    next: { revalidate: 900 },
    timeoutMs: 9000,
  });
  if (!res?.ok) return { facebookCurrent: 0, facebookPrevious: 0, officialCurrent: 0, officialPrevious: 0 };
  const text = await res.text();
  const reactionMatch = text.match(/All reactions:\s*([\d.,KMB]+)\s*[\n\r ]+([\d.,KMB]+)\s*[\n\r ]+([\d.,KMB]+)/i);
  const reactions = reactionMatch ? parseCompactMetric(reactionMatch[1]) : 0;
  const comments = reactionMatch ? parseCompactMetric(reactionMatch[2]) : 0;
  const shares = reactionMatch ? parseCompactMetric(reactionMatch[3]) : 0;
  const followersMatch = text.match(/\*\*([\d.,]+\s*[KMB])\*\*\s+followers/i);
  const followers = followersMatch ? parseCompactMetric(followersMatch[1]) : 0;
  return {
    facebookCurrent: reactions + comments * 2 + shares * 3,
    facebookPrevious: 0,
    officialCurrent: followers,
    officialPrevious: 0,
  };
}

async function fetchThreadsTraffic() {
  const res = await fetchWithTimeout("https://r.jina.ai/http://www.threads.net/@pokemon", {
    headers: { "user-agent": "Mozilla/5.0" },
    next: { revalidate: 900 },
    timeoutMs: 9000,
  });
  if (!res?.ok) return { current: 0, previous: 0 };
  const text = await res.text();
  const numericLines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^[0-9][0-9.,]*(?:\s*[KMB])?$/.test(line))
    .map((line) => parseCompactMetric(line))
    .filter((value) => value > 0)
    .slice(0, 20);
  const current = numericLines.slice(0, 10).reduce((sum, value) => sum + value, 0);
  const previous = numericLines.slice(10, 20).reduce((sum, value) => sum + value, 0);
  return { current, previous };
}

async function fetchSocialTrafficSnapshot(searchStats: SearchInterestStats) {
  const [reddit, youtube, facebook, threads] = await Promise.all([
    fetchRedditTraffic(),
    fetchYouTubeTraffic(),
    fetchFacebookTraffic(),
    fetchThreadsTraffic(),
  ]);

  const merged = {
    "google-search": safeTrafficFromCache(
      "google-search",
      searchStats.todayTraffic,
      searchStats.yesterdayTraffic,
    ),
    reddit: safeTrafficFromCache("reddit", reddit.current, reddit.previous),
    youtube: safeTrafficFromCache("youtube", youtube.current, youtube.previous),
    facebook: safeTrafficFromCache("facebook", facebook.facebookCurrent, facebook.facebookPrevious),
    threads: safeTrafficFromCache("threads", threads.current, threads.previous),
    "pokemon-official": safeTrafficFromCache(
      "pokemon-official",
      facebook.officialCurrent,
      facebook.officialPrevious,
    ),
  } as SocialTrafficSnapshot;

  lastSocialTrafficSnapshot = merged;
  return merged;
}

// Derive demand proxy from daily Google Trends RSS.
async function fetchSearchInterestStats(items: NewsItem[] = []): Promise<SearchInterestStats> {
  const fallbackFromNews = () => {
    if (items.length === 0) return 35;
    const recent24 = items.filter((item) => hoursAgo(item.pubDate) <= 24).length;
    // Strong non-zero floor when Pokemon headlines are clearly active.
    return clampScore(24 + Math.min(34, items.length * 1.25) + Math.min(18, recent24 * 1.9));
  };
  const now = new Date();
  const todayIso = now.toISOString().slice(0, 10);
  const yesterdayIso = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  try {
    const response = await fetch(GOOGLE_TRENDS_DAILY_RSS, { next: { revalidate: 900 } });
    if (!response.ok) {
      return {
        score: fallbackFromNews(),
        todayTraffic: 0,
        yesterdayTraffic: 0,
      };
    }
    const xml = await response.text();
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    const keywordRegex =
      /(pokemon cards|pokemon tcg|pokemon center preorder|pokemon center|pokemon|pokémon|pokemon go|pokemon presents|pokemon direct)/i;
    let totalTraffic = 0;
    let todayTraffic = 0;
    let yesterdayTraffic = 0;
    let pokemonTrendHits = 0;
    let match = itemRegex.exec(xml);
    while (match) {
      const item = match[1];
      const title = readTag(item, "title");
      const trafficRaw = readTag(item, "ht:approx_traffic");
      const pubDateRaw = readTag(item, "pubDate");
      if (keywordRegex.test(title)) {
        pokemonTrendHits += 1;
        const traffic = parseApproxTraffic(trafficRaw);
        totalTraffic += traffic;
        const pubTs = new Date(pubDateRaw).getTime();
        if (!Number.isNaN(pubTs)) {
          const iso = new Date(pubTs).toISOString().slice(0, 10);
          if (iso === todayIso) todayTraffic += traffic;
          if (iso === yesterdayIso) yesterdayTraffic += traffic;
        }
      }
      match = itemRegex.exec(xml);
    }

    const trendScore = clampScore((Math.log10(totalTraffic + 1) / 6) * 100 + pokemonTrendHits * 6);
    const fallback = fallbackFromNews();
    if (pokemonTrendHits === 0 || trendScore <= 0) {
      return { score: fallback, todayTraffic, yesterdayTraffic };
    }

    // Blend trend RSS with live Pokemon news activity, keeping search signal meaningful.
    return {
      score: clampScore(Math.max(trendScore, fallback * 0.74 + trendScore * 0.26)),
      todayTraffic,
      yesterdayTraffic,
    };
  } catch {
    return {
      score: fallbackFromNews(),
      todayTraffic: 0,
      yesterdayTraffic: 0,
    };
  }
}

// Approximate card market momentum from PriceCharting, with market-based fallback.
async function fetchMarketMomentumScore(marketFallback?: MarketSnapshot) {
  const scoreFromMacroFallback = () => {
    if (!marketFallback) return 46;
    const btc = marketFallback.bitcoinGrowthPct;
    const spx = marketFallback.sp500GrowthPct;
    if (btc === null && spx === null) return 46;
    const btcSignal = btc === null ? 0 : Math.tanh(btc / 3);
    const spxSignal = spx === null ? 0 : Math.tanh(spx / 1.5);
    const blended = btcSignal * 0.65 + spxSignal * 0.35;
    return clampScore(50 + blended * 28);
  };

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
      const price = Number(changeMatch[1].replace(/[^\d.-]/g, ""));
      const delta = Number(changeMatch[2].replace(/[^\d.-]/g, ""));
      if (!Number.isNaN(delta)) {
        const pctChange = !Number.isNaN(price) && price > 0 ? (delta / price) * 100 : delta / 10;
        changes.push(pctChange);
      }
    }
    if (changes.length === 0) return scoreFromMacroFallback();

    const positiveRatio =
      changes.filter((delta) => delta > 0).length / Math.max(1, changes.length);
    const avgSigned = changes.reduce((sum, delta) => sum + delta, 0) / Math.max(1, changes.length);
    const intensity = Math.min(
      1,
      changes.reduce((sum, delta) => sum + Math.abs(delta), 0) /
        Math.max(1, changes.length) /
        6,
    );
    const directional = Math.tanh(avgSigned / 2.2);
    const score = 50 + directional * (18 + intensity * 16) + (positiveRatio - 0.5) * 18;
    return clampScore(score);
  } catch {
    return scoreFromMacroFallback();
  }
}

// Detect catalyst intensity from Pokemon.com news language.
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

// Build a simple sentiment ratio from two core Pokemon-related subreddits.
async function fetchCommunitySentimentScore() {
  const extractPosts = (payload: string) => {
    try {
      const data = JSON.parse(payload) as {
        data?: {
          children?: Array<{
            data?: {
              title?: string;
              score?: number;
              num_comments?: number;
              upvote_ratio?: number;
            };
          }>;
        };
      };
      return (data.data?.children ?? [])
        .map((entry) => ({
          title: (entry.data?.title ?? "").toLowerCase(),
          score: entry.data?.score ?? 0,
          comments: entry.data?.num_comments ?? 0,
          upvoteRatio: entry.data?.upvote_ratio ?? 0.5,
        }))
        .filter((post) => post.title.length > 0);
    } catch {
      return [] as Array<{
        title: string;
        score: number;
        comments: number;
        upvoteRatio: number;
      }>;
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

    const posts = [...extractPosts(a), ...extractPosts(b)];
    if (posts.length === 0) return 46;

    const positive = [
      "hype",
      "bull",
      "surge",
      "sold out",
      "win",
      "great",
      "love",
      "pump",
      "strong",
      "undervalued",
    ];
    const negative = [
      "crash",
      "dead",
      "overpriced",
      "scam",
      "doom",
      "drop",
      "bad",
      "dump",
      "weak",
      "bubble",
    ];
    let pos = 0;
    let neg = 0;
    let engagementSkew = 0;
    let engagementWeightSum = 0;

    for (const post of posts) {
      const weight = 1 + Math.log10(Math.max(1, post.score + post.comments) + 1);
      const p = positive.filter((term) => post.title.includes(term)).length;
      const n = negative.filter((term) => post.title.includes(term)).length;
      pos += p * weight;
      neg += n * weight;
      engagementSkew += (post.upvoteRatio - 0.5) * weight;
      engagementWeightSum += weight;
    }

    // Laplace-style smoothing prevents unstable jumps on low-sample days.
    const ratio = (pos + 2) / (neg + 2);
    const lexicalCore = 50 + (Math.log(ratio) / Math.log(2)) * 16;
    const confidence = Math.min(1, Math.max(0.25, posts.length / 40));
    const upvoteBias =
      engagementWeightSum > 0 ? (engagementSkew / engagementWeightSum) * 24 : 0;
    const blended = 50 + (lexicalCore - 50) * confidence + upvoteBias;
    return clampScore(blended);
  } catch {
    return 46;
  }
}

// Convert publication date into age (hours) for recency weighting.
function hoursAgo(dateString: string) {
  const timestamp = new Date(dateString).getTime();
  if (Number.isNaN(timestamp)) {
    return 999;
  }
  return (Date.now() - timestamp) / (1000 * 60 * 60);
}

// Main composite scoring engine combining external and headline-derived components.
function summarizeHype(
  items: NewsItem[],
  external: {
    searchInterest: number;
    marketMomentum: number;
    eventCatalyst: number;
    communitySentiment: number;
  },
) {
  // Recency and scarcity signals drive market pressure-style components.
  const hasNews = items.length > 0;
  const recent24 = items.filter((item) => hoursAgo(item.pubDate) <= 24).length;
  const uniqueSources = new Set(items.map((item) => normalize(item.source || "Unknown"))).size;
  const availabilityHits = weightedSignalHitsAcrossItems(items, AVAILABILITY_SIGNAL_PATTERNS);
  const productStressHits = weightedSignalHitsAcrossItems(items, PRODUCT_STRESS_SIGNAL_PATTERNS);
  const coverage = clamp01(Math.log10(items.length + 1) / Math.log10(26));
  const sourceSpread = clamp01((uniqueSources - 1) / 7);
  const recencyCoverage = hasNews ? clamp01(recent24 / Math.max(3, items.length * 0.8)) : 0;
  const confidence = hasNews ? clamp01(0.34 + coverage * 0.36 + sourceSpread * 0.3) : 0;
  const activityBoost = Math.min(11, Math.log10(recent24 + 1) * 9);

  // "Density over headlines" keeps values comparable regardless of news volume.
  const availabilityDensity = hasNews ? availabilityHits / Math.max(3, items.length * 1.25) : 0;
  const productStressDensity = hasNews ? productStressHits / Math.max(3, items.length * 1.2) : 0;

  // Method inspired by composite-index practice: normalize to a neutral anchor and then
  // scale by confidence (coverage + source diversity), avoiding very low locked values.
  const availabilityRaw =
    50 +
    Math.tanh((availabilityDensity - 0.46) * 3.4) * 30 +
    recencyCoverage * 9 +
    activityBoost * 0.45;
  const availabilityPressureScore = hasNews
    ? clampScore(50 + (availabilityRaw - 50) * confidence)
    : 34;

  const productStressRaw =
    48 +
    Math.tanh((productStressDensity - 0.4) * 3.6) * 31 +
    Math.tanh((availabilityDensity - 0.52) * 2.2) * 8 +
    recencyCoverage * 8 +
    activityBoost * 0.4;
  const productStressScore = hasNews
    ? clampScore(50 + (productStressRaw - 50) * confidence)
    : 32;

  const activityFloor = clampScore(12 + (recent24 / 28) * 24);
  const searchInterestScore = hasNews
    ? Math.max(external.searchInterest, Math.min(activityFloor, 52))
    : external.searchInterest;

  const components: SignalComponent[] = [
    {
      id: "search_interest",
      label: "Search Interest",
      weight: 0.3,
      score: searchInterestScore,
      description: "Primary demand driver from Google search intensity.",
      group: "community",
    },
    {
      id: "market_momentum",
      label: "Market Momentum",
      weight: 0.2,
      score: external.marketMomentum,
      description: "PriceCharting momentum proxy on cards/sealed assets.",
      group: "market",
    },
    {
      id: "availability_pressure",
      label: "Availability Pressure",
      weight: 0.17,
      score: availabilityPressureScore,
      description: "Confidence-adjusted sellout/preorder scarcity density.",
      group: "market",
    },
    {
      id: "release_catalyst",
      label: "Release/Event Catalyst",
      weight: 0.13,
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
      score: productStressScore,
      description: "Operational stress density (queues, delays, restrictions).",
      group: "market",
    },
  ];

  // Weighted master score plus community/market sub-indices used by the UI.
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

// Translate numeric score into dashboard regime label and short interpretation.
function labelForScore(score: number) {
  if (score >= 90) return { label: "MANIA", vibe: "Demand pressure is extreme." };
  if (score >= 75) return { label: "FRENZY", vibe: "Strong acceleration across signals." };
  if (score >= 60) return { label: "HYPE", vibe: "Momentum is clearly above baseline." };
  if (score >= 45) return { label: "WARM", vibe: "Constructive but selective strength." };
  if (score >= 25) return { label: "CALM", vibe: "Balanced cycle, no major squeeze." };
  return { label: "DEAD", vibe: "Low attention and low market pressure." };
}

function buildTraderNarrative(args: {
  score: number;
  signalQuality: number;
  components: SignalComponent[];
}) {
  const { score, signalQuality, components } = args;
  const componentScore = (id: string) =>
    components.find((component) => component.id === id)?.score ?? 50;
  const momentum = componentScore("market_momentum");
  const breadth = Math.round(
    (componentScore("search_interest") +
      componentScore("release_catalyst") +
      componentScore("community_sentiment")) /
      3,
  );

  const regime =
    score >= 75
      ? "Risk-On Expansion"
      : score >= 55
        ? "Constructive Risk-On"
        : score >= 40
          ? "Neutral / Two-Way"
          : "Defensive Risk-Off";
  const summary =
    score >= 55
      ? "Buyers control flow, but focus on confirmation and follow-through."
      : score >= 40
        ? "Tape is mixed; favor selective entries and tighter risk."
        : "Capital preservation first; wait for stronger participation breadth.";
  const momentumTag = momentum >= 60 ? "Trend Up" : momentum >= 45 ? "Range" : "Trend Soft";
  const breadthTag = breadth >= 60 ? "Broad" : breadth >= 45 ? "Mixed" : "Narrow";
  const convictionTag =
    signalQuality >= 75 ? "High Conviction" : signalQuality >= 55 ? "Medium Conviction" : "Low Conviction";

  return { regime, summary, momentumTag, breadthTag, convictionTag };
}

// Synthetic long-cycle baseline model used for contextual 30-year sentiment framing.
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

// Build 1M/1Y/5Y sentiment windows with different time-horizon sensitivities.
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

  // 1M emphasizes fast variables (search/availability/release) and immediate slope.
  const monthImpulse =
    component("search_interest") * 0.3 +
    component("availability_pressure") * 0.25 +
    component("release_catalyst") * 0.2 +
    component("community_sentiment") * 0.15 +
    component("product_stress") * 0.1;
  const oneMonth = clampScore(score * 0.45 + monthImpulse * 0.45 + cycleSlope * 1.5 + 5);

  // 1Y reflects current regime blended with market/community state.
  const oneYearBase = avg(cycle30.slice(-3).map((y) => y.score));
  const oneYear = clampScore(
    score * 0.35 + oneYearBase * 0.35 + marketScore * 0.2 + communityScore * 0.1,
  );

  // 5Y is intentionally conservative and mildly below 1Y for realism.
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

// Color ramp for the main progress bar by score regime.
function meterColor(score: number) {
  if (score >= 70) return "from-fuchsia-500 via-red-500 to-orange-400";
  if (score >= 40) return "from-cyan-400 via-blue-500 to-purple-500";
  return "from-slate-400 via-slate-500 to-slate-700";
}

// Build the displayed 2005->today timeline and blend latest point with live score.
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

// UI formatter for sidecar market levels.
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

// UI formatter for sidecar day growth percentages.
function formatGrowthPct(value: number | null) {
  if (value === null || Number.isNaN(value)) {
    return "N/A";
  }
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function formatInteger(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.max(0, value));
}

function titleCase(value: string) {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function sourceQuality(source: string) {
  const normalized = normalize(source);
  const premium = [
    "pokemon.com",
    "nintendo",
    "ign",
    "gamespot",
    "eurogamer",
    "polygon",
    "serebii",
    "bulbagarden",
    "gameinformer",
    "dexerto",
  ];
  const lowTrust = ["reddit", "youtube", "tiktok", "x.com", "twitter", "quora", "forum", "threads"];
  if (premium.some((hint) => normalized.includes(hint))) return 3;
  if (lowTrust.some((hint) => normalized.includes(hint))) return -2;
  return 0;
}

function scoreArticleRelevance(item: NewsItem) {
  const title = normalize(item.title);
  const source = normalize(item.source);
  const link = normalize(item.link);
  let score = 0;
  score += sourceQuality(item.source) * 4;
  // Strong priority for official Pokemon.com coverage in the article-of-day pipeline.
  if (source.includes("pokemon.com") || link.includes("pokemon.com")) score += 50;
  if (/(pokemon|pokémon)/i.test(item.title)) score += 3;
  if (/(direct|presents|reveal|announcement|launch|release|expansion|worlds|championship)/i.test(item.title)) {
    score += 4;
  }
  if (/(guide|beginner|best game|opinion|reddit|thread|question)/i.test(item.title)) {
    score -= 4;
  }
  score += Math.max(0, 10 - hoursAgo(item.pubDate) / 4);
  if (title.includes("pokémon") || title.includes("pokemon")) score += 1;
  return score;
}

function normalizePokemonToken(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

async function fetchPokemonNameCatalog() {
  try {
    const res = await fetch("https://pokeapi.co/api/v2/pokemon?limit=2000", {
      next: { revalidate: 86400 },
    });
    if (!res.ok) return [] as string[];
    const payload = (await res.json()) as { results?: Array<{ name?: string }> };
    return (payload.results ?? []).map((entry) => entry.name ?? "").filter(Boolean);
  } catch {
    return [] as string[];
  }
}

function findPokemonNameMatchInText(articleText: string, names: string[]) {
  const text = normalizePokemonToken(articleText);
  if (!text) return null;

  let winner: { name: string; index: number; len: number } | null = null;
  for (const name of names) {
    const normalizedName = normalizePokemonToken(name.replace(/-/g, " "));
    if (!normalizedName) continue;
    const regex = new RegExp(`(^|\\s)${escapeRegex(normalizedName)}(?=\\s|$)`);
    const match = text.match(regex);
    if (!match || match.index === undefined) continue;
    const index = match.index;
    const len = normalizedName.length;
    if (!winner || index < winner.index || (index === winner.index && len > winner.len)) {
      winner = { name, index, len };
    }
  }
  return winner?.name ?? null;
}

async function fetchArticleTextForPokemonMatching(url: string) {
  try {
    const res = await fetch(url, {
      next: { revalidate: 1800 },
      headers: { "user-agent": "Mozilla/5.0 hypemeter" },
    });
    if (!res.ok) return "";
    const html = await res.text();
    if (!html) return "";
    const sanitized = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ");
    const plain = decodeHtml(sanitized).replace(/\s+/g, " ").trim();
    return plain.slice(0, 18000);
  } catch {
    return "";
  }
}

function rankPokemonMatchesFromSources(
  sources: Array<{ text: string; weight: number }>,
  names: string[],
) {
  const scored = new Map<string, { score: number; firstIndex: number }>();

  for (const source of sources) {
    const text = normalizePokemonToken(source.text);
    if (!text) continue;

    for (const name of names) {
      const normalizedName = normalizePokemonToken(name.replace(/-/g, " "));
      if (!normalizedName) continue;
      const regex = new RegExp(`(^|\\s)${escapeRegex(normalizedName)}(?=\\s|$)`, "g");
      let hits = 0;
      let first = -1;
      let match = regex.exec(text);
      while (match) {
        hits += 1;
        if (first < 0) first = match.index;
        if (hits >= 5) break;
        match = regex.exec(text);
      }
      if (hits === 0) continue;

      const existing = scored.get(name) ?? { score: 0, firstIndex: first };
      existing.score += hits * source.weight;
      existing.firstIndex =
        existing.firstIndex < 0 ? first : first < 0 ? existing.firstIndex : Math.min(existing.firstIndex, first);
      scored.set(name, existing);
    }
  }

  return Array.from(scored.entries())
    .map(([name, stats]) => ({ name, ...stats }))
    .sort((a, b) => b.score - a.score || a.firstIndex - b.firstIndex);
}

function extractPokemonMentionsFromText(
  sources: Array<{ text: string; weight: number }>,
  names: string[],
  max = 8,
) {
  return rankPokemonMatchesFromSources(sources, names)
    .map((entry) => entry.name)
    .slice(0, max);
}

async function fetchPokemonByIdentifier(identifier: string | number): Promise<PokemonOfDay | null> {
  const url = `https://pokeapi.co/api/v2/pokemon/${identifier}`;
  try {
    const res = await fetch(url, { next: { revalidate: 86400 } });
    if (!res.ok) return null;
    const payload = (await res.json()) as {
      id: number;
      name: string;
      sprites?: {
        other?: {
          "official-artwork"?: {
            front_default?: string | null;
          };
        };
      };
      types?: Array<{ type?: { name?: string } }>;
    };

    return {
      id: payload.id,
      name: titleCase(payload.name),
      image: payload.sprites?.other?.["official-artwork"]?.front_default ?? null,
      types: (payload.types ?? [])
        .map((entry) => entry.type?.name ?? "")
        .filter(Boolean)
        .map((name) => titleCase(name)),
    };
  } catch {
    return null;
  }
}

function pickArticleOfDay(items: NewsItem[], pokemonCatalog: string[]): PokemonOfDayArticle | null {
  if (items.length === 0) return null;
  const ranked = items
    .map((item) => {
      const mentions = extractPokemonMentionsFromText(
        [
          { text: item.title, weight: 2.5 },
          { text: item.summary, weight: 1.6 },
        ],
        pokemonCatalog,
        6,
      );
      const mentionBoost = mentions.length > 0 ? 8 + Math.min(8, mentions.length * 3) : 0;
      return { item, score: scoreArticleRelevance(item) + mentionBoost, mentions };
    })
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  const bestItem = best?.item;
  const mentions = best?.mentions ?? [];
  if (!bestItem) return null;
  if (!best) return null;
  return {
    title: bestItem.title,
    link: bestItem.link,
    source: bestItem.source,
    summary: bestItem.summary,
    pokemonMentions: mentions,
  };
}

function hashStringToRange(input: string, min: number, max: number) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  const span = max - min + 1;
  return min + (Math.abs(hash) % span);
}

function buildPokemonCandidateNamesFromTitle(title: string) {
  const text = normalize(title);
  const baseTokens = text
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const stop = new Set([
    "pokemon",
    "pokémon",
    "the",
    "for",
    "and",
    "with",
    "from",
    "this",
    "that",
    "your",
    "game",
    "games",
    "new",
    "best",
    "guide",
    "today",
    "first",
    "host",
    "what",
    "why",
    "how",
    "play",
  ]);
  const candidates = new Set<string>();
  for (const token of baseTokens) {
    if (token.length < 3 || stop.has(token)) continue;
    candidates.add(token);
  }
  if (text.includes("mr mime")) candidates.add("mr-mime");
  if (text.includes("mime jr")) candidates.add("mime-jr");
  if (text.includes("type null")) candidates.add("type-null");
  if (text.includes("jangmo o")) candidates.add("jangmo-o");
  return Array.from(candidates).slice(0, 12);
}

async function pickPokemonOfDayFromArticle(article: PokemonOfDayArticle | null, pokemonCatalog: string[]) {
  if (!article) return null;

  for (const mention of article.pokemonMentions) {
    const matched = await fetchPokemonByIdentifier(mention);
    if (matched) return matched;
  }

  const articlePageText = await fetchArticleTextForPokemonMatching(article.link);
  const articleText = `${article.title} ${article.summary} ${articlePageText}`;
  const rankedMatches = rankPokemonMatchesFromSources(
    [
      { text: article.title, weight: 2.4 },
      { text: article.summary, weight: 1.4 },
      { text: articlePageText, weight: 1.8 },
    ],
    pokemonCatalog,
  );
  const exactMatch = rankedMatches[0]?.name ?? findPokemonNameMatchInText(articleText, pokemonCatalog);
  if (exactMatch) {
    const matched = await fetchPokemonByIdentifier(exactMatch);
    if (matched) return matched;
  }

  const candidates = buildPokemonCandidateNamesFromTitle(articleText);
  for (const candidate of candidates) {
    const pokemon = await fetchPokemonByIdentifier(candidate);
    if (pokemon) return pokemon;
  }

  // Guaranteed fallback still tied to the article itself.
  const fallbackId = hashStringToRange(`${article.title}|${article.link}`, 1, 1025);
  return fetchPokemonByIdentifier(fallbackId);
}

// Build the initial calendar payload for "today" so it renders immediately on first load.
function buildTodayCalendarStats(items: NewsItem[], liveHypeScore: number): CalendarDayStats {
  const today = new Date().toISOString().slice(0, 10);
  const text = items.map((item) => normalize(item.title)).join(" | ");
  const eventHits = ["reveal", "release", "presents", "prerelease", "expansion"].reduce(
    (sum, token) => sum + (text.includes(token) ? 1 : 0),
    0,
  );
  const pressureHits = ["sold out", "preorder", "queue", "allocation", "reprint"].reduce(
    (sum, token) => sum + (text.includes(token) ? 1 : 0),
    0,
  );
  const positiveHits = ["hype", "surge", "launch", "strong", "record", "win"].reduce(
    (sum, token) => sum + (text.includes(token) ? 1 : 0),
    0,
  );
  const negativeHits = ["delay", "drop", "crash", "backlash", "scam", "lawsuit"].reduce(
    (sum, token) => sum + (text.includes(token) ? 1 : 0),
    0,
  );
  const headlineCount = items.length;
  const uniqueSources = new Set(items.map((item) => item.source)).size;
  const sentiment = clampScore(
    Math.round(50 + (positiveHits - negativeHits) * 8 + Math.log10(headlineCount + 1) * 12),
  );

  const eventSignals = extractLiveEventSignals(items, 8);
  const signalQuality = computeLiveSignalQuality({
    items,
    eventSignalCount: eventSignals.length,
    searchInterest: liveHypeScore,
    components: [],
  });

  return {
    date: today,
    stats: {
      headlineCount,
      uniqueSources,
      eventHits,
      pressureHits,
      sentiment,
      // Explicitly aligned with the homepage live hype score for today's preloaded card.
      dayScore: liveHypeScore,
      signalQuality,
      eventSignals,
    },
    headlines: items.slice(0, 8),
  };
}

// Fetch live S&P 500 + BTC snapshot with layered fallbacks (Stooq -> CoinGecko/Yahoo).
async function fetchMarketSnapshot(): Promise<MarketSnapshot> {
  const fallback: MarketSnapshot = {
    sp500: null,
    bitcoin: null,
    sp500GrowthPct: null,
    bitcoinGrowthPct: null,
    updatedAt: null,
  };

  // Parse Stooq CSV line and derive close + session growth.
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
  // Defensive defaults keep the page renderable even on upstream failures.
  let items: NewsItem[] = [];
  let searchStats: SearchInterestStats = { score: 35, todayTraffic: 0, yesterdayTraffic: 0 };
  let socialTraffic: SocialTrafficSnapshot = lastSocialTrafficSnapshot ?? {
    "google-search": { current: 0, previous: 0 },
    reddit: { current: 0, previous: 0 },
    youtube: { current: 0, previous: 0 },
    facebook: { current: 0, previous: 0 },
    threads: { current: 0, previous: 0 },
    "pokemon-official": { current: 0, previous: 0 },
  };
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

  const market = await fetchMarketSnapshot();

  // Pull independent external signals in parallel to minimize latency.
  [searchStats, marketMomentum, eventCatalyst, communitySentiment] = await Promise.all([
    fetchSearchInterestStats(items),
    fetchMarketMomentumScore(market),
    fetchEventCatalystScore(),
    fetchCommunitySentimentScore(),
  ]);
  socialTraffic = await fetchSocialTrafficSnapshot(searchStats);
  searchInterest = searchStats.score;

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
  const mood = labelForScore(score);
  const history = buildBacktrackSeries(score);
  const todayCalendarStats = buildTodayCalendarStats(items.slice(0, 20), score);
  const liveEventSignals = extractLiveEventSignals(items);
  const liveSignalQuality = computeLiveSignalQuality({
    items,
    eventSignalCount: liveEventSignals.length,
    searchInterest,
    components: indicators,
  });
  const topArticles = [...items]
    .sort((a, b) => scoreArticleRelevance(b) - scoreArticleRelevance(a))
    .slice(0, 10);
  const pctDelta = (current: number, previous: number) => {
    if (current <= 0 && previous <= 0) return 0;
    if (previous <= 0) return 100;
    return ((current - previous) / previous) * 100;
  };
  const platformGraphBase = [
    {
      key: "google-search",
      label: "Google Search",
      current: socialTraffic["google-search"].current,
      previous: socialTraffic["google-search"].previous,
      accent: "from-cyan-400 to-blue-500",
    },
    {
      key: "reddit",
      label: "Reddit",
      current: socialTraffic.reddit.current,
      previous: socialTraffic.reddit.previous,
      accent: "from-orange-400 to-amber-500",
    },
    {
      key: "youtube",
      label: "YouTube",
      current: socialTraffic.youtube.current,
      previous: socialTraffic.youtube.previous,
      accent: "from-red-400 to-rose-500",
    },
    {
      key: "facebook",
      label: "Facebook",
      current: socialTraffic.facebook.current,
      previous: socialTraffic.facebook.previous,
      accent: "from-indigo-400 to-blue-500",
    },
    {
      key: "threads",
      label: "Threads",
      current: socialTraffic.threads.current,
      previous: socialTraffic.threads.previous,
      accent: "from-violet-400 to-fuchsia-500",
    },
    {
      key: "pokemon-official",
      label: "Pokemon Official",
      current: socialTraffic["pokemon-official"].current,
      previous: socialTraffic["pokemon-official"].previous,
      accent: "from-fuchsia-400 to-purple-500",
    },
  ];
  const maxPlatformCurrent = Math.max(
    1,
    ...platformGraphBase.map((platform) => Math.log10(platform.current + 1)),
  );
  const platformGraph = platformGraphBase.map((platform) => {
    return {
      ...platform,
      deltaPct: pctDelta(platform.current, platform.previous),
      barPct: clampScore((Math.log10(platform.current + 1) / maxPlatformCurrent) * 100),
    };
  });
  const pokemonCatalog = await fetchPokemonNameCatalog();
  const pokemonOfDayArticle = pickArticleOfDay(items, pokemonCatalog);
  const pokemonOfDay = await pickPokemonOfDayFromArticle(pokemonOfDayArticle, pokemonCatalog);
  const traderNarrative = buildTraderNarrative({
    score,
    signalQuality: liveSignalQuality,
    components: indicators,
  });

  // Single timestamp used as visible "last refreshed" marker in header.
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
            <div className="grid items-start gap-4 lg:grid-cols-[1fr_auto]">
              <div>
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
              </div>
              {pokemonOfDay ? (
                <a
                  href={pokemonOfDayArticle?.link ?? "#"}
                  target={pokemonOfDayArticle ? "_blank" : undefined}
                  rel={pokemonOfDayArticle ? "noreferrer" : undefined}
                  className={`block rounded-2xl border border-cyan-400/25 bg-slate-950/80 p-3 lg:min-w-64 ${
                    pokemonOfDayArticle ? "hover:border-cyan-300/50" : "pointer-events-none"
                  }`}
                  title={
                    pokemonOfDayArticle
                      ? `Read today's spotlight article from ${pokemonOfDayArticle.source}`
                      : "No matching article found today"
                  }
                >
                  <p className="text-[10px] uppercase tracking-[0.14em] text-cyan-300">
                    Pokemon Of The Day
                  </p>
                  <div className="mt-2 flex items-center gap-3">
                    {pokemonOfDay.image ? (
                      <Image
                        src={pokemonOfDay.image}
                        alt={pokemonOfDay.name}
                        width={64}
                        height={64}
                        className="h-16 w-16 rounded-lg bg-slate-900 object-contain p-1"
                        unoptimized
                      />
                    ) : (
                      <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-slate-900 text-xs text-slate-400">
                        N/A
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-bold text-white">
                        #{pokemonOfDay.id} {pokemonOfDay.name}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {pokemonOfDay.types.map((type) => (
                          <span
                            key={type}
                            className="rounded-full border border-fuchsia-400/35 bg-fuchsia-500/10 px-2 py-0.5 text-[10px] text-fuchsia-200"
                          >
                            {type}
                          </span>
                        ))}
                      </div>
                      {pokemonOfDayArticle ? (
                        <p className="mt-1 text-[10px] text-cyan-300/90">
                          Read today&apos;s spotlight article →
                        </p>
                      ) : (
                        <p className="mt-1 text-[10px] text-slate-500">
                          Spotlight article unavailable for today.
                        </p>
                      )}
                    </div>
                  </div>
                </a>
              ) : null}
            </div>
          </header>
        </ScrollReveal>

        <ScrollReveal delayMs={60}>
          <section className="grid items-stretch gap-6 lg:grid-cols-2">
          <div className="h-full rounded-3xl border border-white/10 bg-slate-900 p-7 hover-lift">
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
                  {traderNarrative.regime}
                </p>
                <p className="max-w-md text-sm text-slate-400">{traderNarrative.summary}</p>
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
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <div className="rounded-lg border border-white/10 bg-slate-800 px-3 py-2">
                <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Momentum</p>
                <p className="text-sm font-semibold text-cyan-300">{traderNarrative.momentumTag}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-slate-800 px-3 py-2">
                <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Breadth</p>
                <p className="text-sm font-semibold text-cyan-300">{traderNarrative.breadthTag}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-slate-800 px-3 py-2">
                <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Conviction</p>
                <p className="text-sm font-semibold text-cyan-300">{traderNarrative.convictionTag}</p>
              </div>
            </div>
            <div className="mt-3 rounded-xl border border-white/10 bg-slate-800/80 p-3">
              <p className="text-[10px] uppercase tracking-[0.12em] text-slate-400">
                Live Event Signals
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {liveEventSignals.length > 0 ? (
                  liveEventSignals.map((signal) => (
                    <span
                      key={`${signal.group}-${signal.label}`}
                      className="rounded-full border border-fuchsia-400/35 bg-fuchsia-500/10 px-2 py-0.5 text-[11px] text-fuchsia-200"
                      title={`Weight ${signal.weight.toFixed(1)} • ${signal.group}`}
                    >
                      {signal.label}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-slate-400">
                    No strong event triggers in latest headlines.
                  </span>
                )}
              </div>
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
              <div className="rounded-xl border border-white/10 bg-slate-800 p-3 hover-lift sm:col-span-2">
                <p className="text-xs uppercase tracking-[0.12em] text-slate-400">
                  Signal Quality
                </p>
                <div className="mt-1 flex items-center justify-between">
                  <p className="text-2xl font-bold text-cyan-200">{liveSignalQuality}/100</p>
                  <p className="text-xs text-slate-400">
                    based on source diversity, coverage, and signal density
                  </p>
                </div>
              </div>
              <div className="rounded-xl border border-cyan-400/25 bg-slate-800/90 p-3 hover-lift sm:col-span-2">
                <p className="text-xs uppercase tracking-[0.12em] text-cyan-300">
                  Model Weights
                </p>
                <p className="mt-1 text-[11px] text-slate-300">
                  Composite index with 6 weighted components: Search Interest (30%),
                  Market Momentum (20%), Availability Pressure (17%), Event Catalyst (13%),
                  Community Sentiment (10%), Product Stress (10%).
                </p>
              </div>
            </div>
          </div>

          <div className="relative flex h-full flex-col overflow-hidden rounded-3xl border border-white/10 bg-slate-900 p-6 hover-lift">
            <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-300">
              How this meter works
            </h3>
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
            <div className="mt-4 rounded-2xl border border-white/10 bg-slate-800/70 p-3">
              <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">
                Social Signal Pulse
              </p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {platformGraph.map((platform, index) => (
                  <article
                    key={`compact-${platform.key}`}
                    className={`rounded-xl border border-white/10 bg-slate-900 p-2.5 ${
                      platformGraph.length % 2 === 1 && index === platformGraph.length - 1
                        ? "sm:col-span-2"
                        : ""
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[10px] uppercase tracking-[0.12em] text-slate-400">
                        {platform.label}
                      </p>
                      <p className="text-sm font-bold text-white">{formatInteger(platform.current)}</p>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-700">
                      <div
                        className={`h-full rounded-full bg-gradient-to-r ${platform.accent}`}
                        style={{ width: `${platform.barPct}%` }}
                      />
                    </div>
                    <p
                      className={`mt-1 text-[10px] ${
                        platform.deltaPct >= 0 ? "text-emerald-300" : "text-rose-300"
                      }`}
                    >
                      {platform.deltaPct >= 0 ? "▲" : "▼"} {Math.abs(platform.deltaPct).toFixed(0)}% vs day before
                    </p>
                  </article>
                ))}
              </div>
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
            <HypeBacktrackingChart history={history} events={timelineEventSignals} />
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
          <DayStatsCalendar
            initialDate={todayCalendarStats.date}
            initialData={todayCalendarStats}
          />
        </ScrollReveal>

        <ScrollReveal delayMs={180}>
        <section className="rounded-3xl border border-white/10 bg-slate-900 p-6 hover-lift">
          <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-300">
            Top 10 Pokemon Articles Today
          </h3>
          {items.length === 0 ? (
            <p className="mt-3 text-sm text-slate-400">
              News feed temporarily unavailable. Deploy and refresh in a minute.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {topArticles.map((item, index) => (
                <li
                  key={`${item.link}-${item.pubDate}`}
                  className={`rounded-2xl border bg-slate-800 p-4 hover-lift ${
                    index < 3 ? "border-cyan-400/35" : "border-white/10"
                  }`}
                >
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-fuchsia-300">
                    #{index + 1} Top pick
                  </p>
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
