import BacktrackMarketSection from "@/components/BacktrackMarketSection";
import DayStatsCalendar from "@/components/DayStatsCalendar";
import HypeGauge from "@/components/HypeGauge";
import ScrollReveal from "@/components/ScrollReveal";
import { fetchMarketYearlyOverlay } from "@/lib/marketBacktrack";
import { fetchMarketSnapshot } from "@/lib/fetchMarketSnapshot";
import type { MarketSnapshot } from "@/lib/marketSnapshot";
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

/** First listing in CardTrader Pokémon “Best Sellers” (TCG singles). */
type CardTraderBestSeller = {
  name: string;
  imageUrl: string;
  cardUrl: string;
  fromPrice: string;
};

// Revalidate the server-rendered homepage (ISR). Shorter window so deploys show up sooner on Vercel.
export const revalidate = 300;

// Curated Google News query tuned for Pokemon relevance and noise reduction.
const NEWS_QUERY = encodeURIComponent(
  '("Pokemon" OR "Pokémon" OR "Pokemon GO" OR Nintendo) (game OR update OR event OR trailer OR release) -site:hotelier.com.py -site:propertyroom.com',
);
const NEWS_URL = `https://news.google.com/rss/search?q=${NEWS_QUERY}&hl=en-US&gl=US&ceid=US:en`;
const GOOGLE_TRENDS_DAILY_RSS = "https://trends.google.com/trending/rss?geo=US";
const POKEMON_NEWS_URL = "https://www.pokemon.com/us/pokemon-news";
const REDDIT_TCG_URL = "https://www.reddit.com/r/PokemonTCG/hot.json?limit=30";
const REDDIT_CARDS_URL = "https://www.reddit.com/r/pokemoncards/hot.json?limit=30";

/**
 * Global /en/highlights is Magic-first; Pokémon TCG best sellers live on the game hub.
 * Same marketplace as https://www.cardtrader.com/en/highlights (linked from that page).
 */
const CARDTRADER_POKEMON_HUB = "https://www.cardtrader.com/en/pokemon";

/** Inline CSS gradients — Tailwind cannot see dynamic `from-*` / `to-*` class strings on `platform.accent`. */
const SOCIAL_PULSE_BAR_GRADIENT_POSITIVE: Record<string, string> = {
  "google-search": "linear-gradient(90deg, #22d3ee 0%, #38bdf8 35%, #3b82f6 72%, #6366f1 100%)",
  reddit: "linear-gradient(90deg, #fb923c 0%, #f59e0b 45%, #fbbf24 100%)",
  youtube: "linear-gradient(90deg, #f87171 0%, #ef4444 40%, #f43f5e 85%, #fb7185 100%)",
  facebook: "linear-gradient(90deg, #a5b4fc 0%, #6366f1 40%, #3b82f6 100%)",
  threads: "linear-gradient(90deg, #c4b5fd 0%, #a78bfa 35%, #d946ef 70%, #f472b6 100%)",
  "pokemon-official": "linear-gradient(90deg, #f0abfc 0%, #e879f9 30%, #a855f7 65%, #7c3aed 100%)",
};
const SOCIAL_PULSE_BAR_GRADIENT_NEGATIVE =
  "linear-gradient(90deg, #475569 0%, #64748b 35%, #be123c 78%, #fb7185 100%)";

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
  socialTraffic: SocialTrafficSnapshot;
}) {
  const { items, eventSignalCount, searchInterest, components, socialTraffic } = args;
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
  const socialPulse = computeSocialPulseStats(socialTraffic);
  const socialMomentum = socialPulse.momentumScore / 100;
  const socialBreadth = socialPulse.breadthScore / 100;
  const socialDiversity = socialPulse.diversityScore / 100;
  const socialConfidence = socialPulse.confidenceScore / 100;
  const socialComposite = socialPulse.aggregateScore / 100;

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
  const searchSocialAlignment = Math.max(
    0,
    Math.min(1, 1 - Math.abs(searchInterest - socialPulse.momentumScore) / 62),
  );

  const raw =
    coverage * 0.2 +
    sourceSpread * 0.17 +
    eventDensity * 0.14 +
    socialComposite * 0.14 +
    socialMomentum * 0.07 +
    socialBreadth * 0.07 +
    socialDiversity * 0.05 +
    socialConfidence * 0.05 +
    componentHarmony * 0.07 +
    searchHealth * 0.04 +
    searchSocialAlignment * 0.1;
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

type SocialPulseStats = {
  momentumScore: number;
  breadthScore: number;
  diversityScore: number;
  confidenceScore: number;
  aggregateScore: number;
};

let lastSocialTrafficSnapshot: SocialTrafficSnapshot | null = null;

function percentDelta(current: number, previous: number) {
  if (current <= 0 && previous <= 0) return 0;
  if (previous <= 0) return 100;
  return ((current - previous) / previous) * 100;
}

function computeSocialPulseStats(snapshot: SocialTrafficSnapshot): SocialPulseStats {
  const channels = [
    snapshot["google-search"],
    snapshot.reddit,
    snapshot.youtube,
    snapshot.facebook,
    snapshot.threads,
    snapshot["pokemon-official"],
  ].map((entry) => entry ?? { current: 0, previous: 0 });

  const activeCount = channels.filter((channel) => channel.current > 0).length;
  const reliableCount = channels.filter(
    (channel) => channel.current > 0 && channel.previous > 0,
  ).length;
  const deltas = channels.map((channel) => percentDelta(channel.current, channel.previous));
  const cappedDeltaAvg =
    deltas.reduce((sum, value) => sum + Math.max(-95, Math.min(180, value)), 0) /
    Math.max(1, deltas.length);
  const positiveShare = deltas.filter((value) => value > 0).length / Math.max(1, deltas.length);

  const momentumScore = clampScore(50 + cappedDeltaAvg * 0.28);
  const breadthScore = clampScore(
    (activeCount / channels.length) * 70 + positiveShare * 30,
  );

  const totalCurrent = channels.reduce((sum, channel) => sum + Math.max(0, channel.current), 0);
  const hhi =
    totalCurrent > 0
      ? channels.reduce((sum, channel) => {
          const share = channel.current / totalCurrent;
          return sum + share * share;
        }, 0)
      : 1;
  const minHhi = 1 / channels.length;
  const concentrationNorm = Math.max(
    0,
    Math.min(1, (hhi - minHhi) / Math.max(0.0001, 1 - minHhi)),
  );
  const diversityScore = clampScore((1 - concentrationNorm) * 100);
  const confidenceScore = clampScore(
    (reliableCount / channels.length) * 78 + (activeCount / channels.length) * 22,
  );

  const aggregateScore = clampScore(
    momentumScore * 0.37 +
      breadthScore * 0.21 +
      diversityScore * 0.21 +
      confidenceScore * 0.21,
  );

  return { momentumScore, breadthScore, diversityScore, confidenceScore, aggregateScore };
}

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

async function fetchCardTraderPokemonBestSeller(): Promise<CardTraderBestSeller | null> {
  try {
    const jinaUrl = `https://r.jina.ai/${CARDTRADER_POKEMON_HUB}`;
    const res = await fetchWithTimeout(jinaUrl, {
      next: { revalidate: 3600 },
      headers: { "user-agent": "Mozilla/5.0 hypemeter" },
      timeoutMs: 18000,
    });
    if (!res?.ok) return null;
    const text = await res.text();
    const section = text.split("## Best Sellers")[1]?.split("\n## ")[0] ?? "";
    const m = section.match(
      /\[!\[[^\]]*\]\((https:\/\/[^)]+)\)\s*([\s\S]+?)\]\((https:\/\/www\.cardtrader\.com\/en\/cards\/[^)]+)\)/,
    );
    if (!m) return null;
    const imageUrl = m[1];
    const rawLabel = m[2].trim();
    const cardUrl = m[3];
    const nameFromLabel = rawLabel.split(/\s+Starting from:/i)[0]?.trim() ?? rawLabel;
    const priceMatch = rawLabel.match(/Starting from:\s*\$([\d.]+)/i);
    return {
      name: nameFromLabel,
      imageUrl,
      cardUrl,
      fromPrice: priceMatch?.[1] ?? "",
    };
  } catch {
    return null;
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

function safeTrafficFromCache(
  key: string,
  current: number,
  previous: number,
  fallbackCurrent = 0,
  fallbackPrevious = 0,
) {
  const cached = lastSocialTrafficSnapshot?.[key];
  const safeCurrent =
    current > 0 ? current : cached?.current && cached.current > 0 ? cached.current : fallbackCurrent;
  const safePrevious =
    previous > 0
      ? previous
      : cached?.previous && cached.previous > 0
        ? cached.previous
        : cached?.current && cached.current > 0
          ? cached.current
          : fallbackPrevious || safeCurrent;
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
  const reactionBlocks = [...text.matchAll(/All reactions:\s*([\d.,KMB]+)\s*[\n\r ]+([\d.,KMB]+)\s*[\n\r ]+([\d.,KMB]+)/gi)];
  const parseBlock = (idx: number) => {
    const block = reactionBlocks[idx];
    return {
      reactions: block ? parseCompactMetric(block[1]) : 0,
      comments: block ? parseCompactMetric(block[2]) : 0,
      shares: block ? parseCompactMetric(block[3]) : 0,
    };
  };
  const first = parseBlock(0);
  const second = parseBlock(1);
  const toEngagement = (entry: { reactions: number; comments: number; shares: number }) =>
    entry.reactions + entry.comments * 2 + entry.shares * 3;
  return {
    facebookCurrent: toEngagement(first),
    facebookPrevious: toEngagement(second),
    // Official channel should reflect daily engagement flow, not follower stock.
    officialCurrent: Math.round(first.reactions + first.shares * 2.5),
    officialPrevious: Math.round(second.reactions + second.shares * 2.5),
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

function buildSocialFallbackFromItems(items: NewsItem[], searchStats: SearchInterestStats) {
  const recent24 = items.filter((item) => hoursAgo(item.pubDate) <= 24).length;
  const sourceHits = items.reduce(
    (acc, item) => {
      const source = normalize(item.source);
      if (source.includes("reddit")) acc.reddit += 1;
      if (source.includes("youtube")) acc.youtube += 1;
      if (source.includes("facebook")) acc.facebook += 1;
      if (source.includes("threads")) acc.threads += 1;
      if (source.includes("pokemon.com") || source.includes("nintendo")) acc.official += 1;
      return acc;
    },
    { reddit: 0, youtube: 0, facebook: 0, threads: 0, official: 0 },
  );

  const baseline = Math.max(1, items.length + recent24);
  return {
    "google-search": {
      current: Math.max(4_000, Math.round(searchStats.score * 1_100 + baseline * 320)),
      previous: Math.max(2_500, Math.round(searchStats.score * 820 + baseline * 220)),
    },
    reddit: {
      current: Math.max(380, sourceHits.reddit * 920 + recent24 * 120),
      previous: Math.max(260, sourceHits.reddit * 640 + Math.max(0, recent24 - 2) * 90),
    },
    youtube: {
      current: Math.max(450, sourceHits.youtube * 1_350 + recent24 * 180),
      previous: Math.max(300, sourceHits.youtube * 930 + Math.max(0, recent24 - 2) * 130),
    },
    facebook: {
      current: Math.max(300, sourceHits.facebook * 760 + recent24 * 95),
      previous: Math.max(220, sourceHits.facebook * 520 + Math.max(0, recent24 - 2) * 70),
    },
    threads: {
      current: Math.max(260, sourceHits.threads * 820 + recent24 * 90),
      previous: Math.max(180, sourceHits.threads * 560 + Math.max(0, recent24 - 2) * 60),
    },
    "pokemon-official": {
      current: Math.max(420, sourceHits.official * 1_120 + recent24 * 110),
      previous: Math.max(300, sourceHits.official * 760 + Math.max(0, recent24 - 2) * 80),
    },
  } as SocialTrafficSnapshot;
}

async function fetchSocialTrafficSnapshot(searchStats: SearchInterestStats, items: NewsItem[]) {
  const fallback = buildSocialFallbackFromItems(items, searchStats);
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
      fallback["google-search"].current,
      fallback["google-search"].previous,
    ),
    reddit: safeTrafficFromCache(
      "reddit",
      reddit.current,
      reddit.previous,
      fallback.reddit.current,
      fallback.reddit.previous,
    ),
    youtube: safeTrafficFromCache(
      "youtube",
      youtube.current,
      youtube.previous,
      fallback.youtube.current,
      fallback.youtube.previous,
    ),
    facebook: safeTrafficFromCache(
      "facebook",
      facebook.facebookCurrent,
      facebook.facebookPrevious,
      fallback.facebook.current,
      fallback.facebook.previous,
    ),
    threads: safeTrafficFromCache(
      "threads",
      threads.current,
      threads.previous,
      fallback.threads.current,
      fallback.threads.previous,
    ),
    "pokemon-official": safeTrafficFromCache(
      "pokemon-official",
      facebook.officialCurrent,
      facebook.officialPrevious,
      fallback["pokemon-official"].current,
      fallback["pokemon-official"].previous,
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
    socialPulse: SocialPulseStats;
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
  const socialSearchBlend = clampScore(
    external.searchInterest * 0.76 + external.socialPulse.momentumScore * 0.24,
  );
  const searchInterestScore = hasNews
    ? Math.max(socialSearchBlend, Math.min(activityFloor, 52))
    : socialSearchBlend;
  const releaseCatalystScore = clampScore(
    external.eventCatalyst * 0.84 + external.socialPulse.momentumScore * 0.16,
  );
  const communitySentimentScore = clampScore(
    external.communitySentiment * 0.64 +
      external.socialPulse.momentumScore * 0.2 +
      external.socialPulse.breadthScore * 0.16,
  );

  const components: SignalComponent[] = [
    {
      id: "search_interest",
      label: "Search Interest",
      weight: 0.3,
      score: searchInterestScore,
      description: "Demand driver from Google search intensity blended with social momentum.",
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
      score: releaseCatalystScore,
      description: "Boost from reveals/releases with social acceleration confirmation.",
      group: "community",
    },
    {
      id: "community_sentiment",
      label: "Community Sentiment",
      weight: 0.1,
      score: communitySentimentScore,
      description: "Reddit tone blended with cross-platform participation breadth.",
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
  socialPulseScore: number;
}) {
  const { score, communityScore, marketScore, components, cycle30, socialPulseScore } = args;
  const last = cycle30[cycle30.length - 1]?.score ?? score;
  const prev = cycle30[cycle30.length - 2]?.score ?? last;
  const avg = (values: number[]) =>
    values.length > 0
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : 0;
  const last5 = avg(cycle30.slice(-5).map((y) => y.score));
  const cycleSlope = last - prev;

  const component = (id: string) =>
    components.find((entry) => entry.id === id)?.score ?? 50;

  // 1M emphasizes fast variables (search/availability/release) and immediate slope.
  const monthImpulse =
    component("search_interest") * 0.27 +
    component("availability_pressure") * 0.22 +
    component("release_catalyst") * 0.19 +
    component("community_sentiment") * 0.14 +
    component("product_stress") * 0.08 +
    socialPulseScore * 0.1;
  const oneMonth = clampScore(score * 0.42 + monthImpulse * 0.48 + cycleSlope * 1.5 + 5);

  // 1Y reflects current regime blended with market/community state.
  const oneYearBase = avg(cycle30.slice(-3).map((y) => y.score));
  const oneYear = clampScore(
    score * 0.31 +
      oneYearBase * 0.33 +
      marketScore * 0.16 +
      communityScore * 0.1 +
      socialPulseScore * 0.1,
  );

  // 5Y: long-horizon blend (same scale as 1Y, no downward cap vs 1Y).
  const fiveYear = clampScore(
    score * 0.28 +
      last5 * 0.34 +
      marketScore * 0.2 +
      communityScore * 0.1 +
      socialPulseScore * 0.08,
  );

  const windows: SentimentWindow[] = [
    {
      key: "1m",
      label: "1 Month Sentiment",
      score: oneMonth,
      tone: toneForSentiment(oneMonth),
      explanation: "Fast-cycle demand from search, availability, catalysts, and social pulse acceleration.",
    },
    {
      key: "1y",
      label: "1 Year Sentiment",
      score: oneYear,
      tone: toneForSentiment(oneYear),
      explanation: "Regime health blended with market/community balance and cross-platform social strength.",
    },
    {
      key: "5y",
      label: "5 Year Sentiment",
      score: fiveYear,
      tone: toneForSentiment(fiveYear),
      explanation:
        "Five-year timeline average blended with current market, community, and social pulse (no penalty vs 1Y).",
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
  // Fresher headlines win when everything else is close (stops "today" linking to 2–3 day old posts).
  score += Math.max(0, 18 - hoursAgo(item.pubDate) / 2.5);
  if (title.includes("pokémon") || title.includes("pokemon")) score += 1;
  return score;
}

function pubDateMs(item: NewsItem) {
  const t = new Date(item.pubDate).getTime();
  return Number.isNaN(t) ? 0 : t;
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

/** Minimum weighted score to count a name as a real mention (title+summary only). */
const FEED_POKEMON_MENTION_FLOOR = 3;

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

/** Instagram excluded from Pokémon-of-the-day spotlight (source + outbound URL). */
function isInstagramArticle(item: NewsItem): boolean {
  const src = normalize(item.source || "");
  const link = (item.link || "").toLowerCase();
  return (
    src.includes("instagram") ||
    link.includes("instagram.com") ||
    link.includes("instagr.am")
  );
}

function pickArticleOfDay(items: NewsItem[], pokemonCatalog: string[]): PokemonOfDayArticle | null {
  const pool = items.filter((item) => !isInstagramArticle(item));
  if (pool.length === 0) return null;
  const ranked = pool
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
    .sort((a, b) => {
      const ha = hoursAgo(a.item.pubDate);
      const hb = hoursAgo(b.item.pubDate);
      const recentA = ha <= 24 ? 1 : 0;
      const recentB = hb <= 24 ? 1 : 0;
      if (recentB !== recentA) return recentB - recentA;
      const tb = pubDateMs(b.item);
      const ta = pubDateMs(a.item);
      if (tb !== ta) return tb - ta;
      return b.score - a.score;
    });

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

/**
 * Calendar YYYY-MM-DD in an IANA time zone so “Pokémon of the day” changes at local midnight,
 * not on every page rebuild / RSS refresh.
 */
function calendarDateIsoInTimeZone(timeZone: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  if (!y || !m || !d) {
    return new Date().toISOString().slice(0, 10);
  }
  return `${y}-${m}-${d}`;
}

/**
 * One species per calendar day: hash(date + stable Pokédex order). RSS does not change the featured Pokémon.
 */
function pickDailyPokemonSlugFromCatalog(catalog: string[], dateIso: string): string | null {
  if (catalog.length === 0) return null;
  const sorted = [...catalog].sort((a, b) => a.localeCompare(b, "en"));
  const idx = hashStringToRange(`${dateIso}|pokemon-of-day`, 0, sorted.length - 1);
  return sorted[idx] ?? null;
}

function articleMentionsPokemonSlug(item: NewsItem, slug: string, catalog: string[]): boolean {
  const ranked = rankPokemonMatchesFromSources(
    [{ text: item.title, weight: 3 }, { text: item.summary, weight: 2 }],
    catalog,
  );
  const hit = ranked.find((e) => e.name === slug);
  return hit !== undefined && hit.score >= FEED_POKEMON_MENTION_FLOOR;
}

function pickSpotlightArticleForPokemon(
  items: NewsItem[],
  winnerSlug: string,
  catalog: string[],
): PokemonOfDayArticle | null {
  const ranked = items
    .filter((item) => !isInstagramArticle(item))
    .map((item) => ({
      item,
      rel: scoreArticleRelevance(item),
      hit: articleMentionsPokemonSlug(item, winnerSlug, catalog),
    }))
    .filter((row) => row.hit)
    .sort((a, b) => {
      const ha = hoursAgo(a.item.pubDate);
      const hb = hoursAgo(b.item.pubDate);
      const recentA = ha <= 24 ? 1 : 0;
      const recentB = hb <= 24 ? 1 : 0;
      if (recentB !== recentA) return recentB - recentA;
      const tb = pubDateMs(b.item);
      const ta = pubDateMs(a.item);
      if (tb !== ta) return tb - ta;
      return b.rel - a.rel;
    });
  const best = ranked[0]?.item;
  if (!best) return null;
  return {
    title: best.title,
    link: best.link,
    source: best.source,
    summary: best.summary,
    pokemonMentions: extractPokemonMentionsFromText(
      [{ text: best.title, weight: 2.5 }, { text: best.summary, weight: 1.6 }],
      catalog,
      6,
    ),
  };
}

async function resolvePokemonOfDay(
  _items: NewsItem[],
  catalog: string[],
): Promise<{ pokemon: PokemonOfDay | null; winnerSlug: string | null }> {
  const dateIso = calendarDateIsoInTimeZone("Europe/Rome");
  const winnerSlug = pickDailyPokemonSlugFromCatalog(catalog, dateIso);
  if (winnerSlug) {
    const pokemon = await fetchPokemonByIdentifier(winnerSlug);
    if (pokemon) return { pokemon, winnerSlug };
  }
  const fallbackId = hashStringToRange(`${dateIso}|pod-fallback`, 1, 1025);
  const pokemon = await fetchPokemonByIdentifier(fallbackId);
  return { pokemon, winnerSlug: null };
}

// Build the initial calendar payload for "today" so it renders immediately on first load.
function buildTodayCalendarStats(
  items: NewsItem[],
  liveHypeScore: number,
  searchInterest: number,
  socialTraffic: SocialTrafficSnapshot,
): CalendarDayStats {
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
    searchInterest,
    components: [],
    socialTraffic,
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
  socialTraffic = await fetchSocialTrafficSnapshot(searchStats, items);
  const socialPulse = computeSocialPulseStats(socialTraffic);
  searchInterest = searchStats.score;

  const { score, indicators, communityScore, marketScore } = summarizeHype(items, {
    searchInterest,
    marketMomentum,
    eventCatalyst,
    communitySentiment,
    socialPulse,
  });
  const cycle30 = buildThirtyYearCycle(new Date().getFullYear());
  const sentiments = computeWindowSentiments({
    score,
    communityScore,
    marketScore,
    components: indicators,
    cycle30,
    socialPulseScore: socialPulse.aggregateScore,
  });
  const history = buildBacktrackSeries(score);
  const marketOverlay = await fetchMarketYearlyOverlay(history.map((h) => h.year));
  const todayCalendarStats = buildTodayCalendarStats(
    items.slice(0, 20),
    score,
    searchInterest,
    socialTraffic,
  );
  const liveEventSignals = extractLiveEventSignals(items);
  const liveSignalQuality = computeLiveSignalQuality({
    items,
    eventSignalCount: liveEventSignals.length,
    searchInterest,
    components: indicators,
    socialTraffic,
  });
  const topArticles = [...items]
    .sort((a, b) => scoreArticleRelevance(b) - scoreArticleRelevance(a))
    .slice(0, 10);
  /** Day-over-day momentum → bar width; floor caps extreme drops so the track stays readable. */
  const socialMomentumBarPct = (deltaPct: number) => {
    const x = Math.max(-95, Math.min(95, deltaPct));
    const linear = 50 + x * 0.45;
    return clampScore(Math.max(22, Math.min(94, linear)));
  };
  const platformGraphBase = [
    {
      key: "google-search",
      label: "Google Search",
      current: socialTraffic["google-search"].current,
      previous: socialTraffic["google-search"].previous,
    },
    {
      key: "reddit",
      label: "Reddit",
      current: socialTraffic.reddit.current,
      previous: socialTraffic.reddit.previous,
    },
    {
      key: "youtube",
      label: "YouTube",
      current: socialTraffic.youtube.current,
      previous: socialTraffic.youtube.previous,
    },
    {
      key: "facebook",
      label: "Facebook",
      current: socialTraffic.facebook.current,
      previous: socialTraffic.facebook.previous,
    },
    {
      key: "threads",
      label: "Threads",
      current: socialTraffic.threads.current,
      previous: socialTraffic.threads.previous,
    },
    {
      key: "pokemon-official",
      label: "Pokemon Official",
      current: socialTraffic["pokemon-official"].current,
      previous: socialTraffic["pokemon-official"].previous,
    },
  ];
  const platformGraph = platformGraphBase.map((platform) => {
    const deltaPct = percentDelta(platform.current, platform.previous);
    return {
      ...platform,
      deltaPct,
      barPct: socialMomentumBarPct(deltaPct),
    };
  });
  const pokemonCatalog = await fetchPokemonNameCatalog();
  const { pokemon: pokemonOfDay, winnerSlug: pokemonOfDayWinnerSlug } = await resolvePokemonOfDay(
    items,
    pokemonCatalog,
  );
  const pokemonOfDayArticle =
    pokemonOfDayWinnerSlug && items.length > 0
      ? (pickSpotlightArticleForPokemon(items, pokemonOfDayWinnerSlug, pokemonCatalog) ??
        pickArticleOfDay(items, pokemonCatalog))
      : pickArticleOfDay(items, pokemonCatalog);
  const traderNarrative = buildTraderNarrative({
    score,
    signalQuality: liveSignalQuality,
    components: indicators,
  });
  const cardTraderBestSeller = await fetchCardTraderPokemonBestSeller();

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
    url: "https://monmeter.vercel.app/",
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
    <main className="relative min-h-screen min-w-0 max-w-full overflow-x-clip bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-4 py-10 text-slate-100 md:px-8">
      <div className="ambient-orb orb-a" />
      <div className="ambient-orb orb-b" />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <div className="mx-auto flex w-full min-w-0 max-w-6xl flex-col gap-6 xl:max-w-7xl 2xl:max-w-[min(92rem,100%)]">
        <ScrollReveal>
          <header className="relative overflow-hidden rounded-3xl border border-white/10 bg-slate-900/70 p-6 shadow-2xl shadow-cyan-950/30 backdrop-blur hover-lift">
            <div className="grid min-w-0 items-stretch gap-4 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
              <div className="min-w-0">
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
              {cardTraderBestSeller ? (
                <div className="flex h-full w-full max-w-[15rem] shrink-0 flex-col rounded-2xl border border-amber-400/30 bg-slate-950/80 p-3 lg:w-56 lg:max-w-none">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-amber-300">
                    Card of the Day
                  </p>
                  <a
                    href={cardTraderBestSeller.cardUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 flex min-h-0 flex-1 items-start gap-2.5 rounded-xl transition-colors hover:bg-slate-900/60"
                    title="Open this listing on CardTrader"
                  >
                    <Image
                      src={cardTraderBestSeller.imageUrl}
                      alt=""
                      width={70}
                      height={98}
                      className="h-16 w-auto shrink-0 rounded-md bg-slate-900 object-contain object-top shadow-inner"
                      unoptimized
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold leading-snug text-white line-clamp-3">
                        {cardTraderBestSeller.name}
                      </p>
                      {cardTraderBestSeller.fromPrice ? (
                        <p className="mt-1 text-[11px] font-medium text-amber-200/95">
                          from ${cardTraderBestSeller.fromPrice}
                        </p>
                      ) : null}
                    </div>
                  </a>
                </div>
              ) : null}
              {pokemonOfDay ? (
                <a
                  href={pokemonOfDayArticle?.link ?? "#"}
                  target={pokemonOfDayArticle ? "_blank" : undefined}
                  rel={pokemonOfDayArticle ? "noreferrer" : undefined}
                  className={`flex h-full w-full max-w-full flex-col rounded-2xl border border-cyan-400/25 bg-slate-950/80 p-3 lg:w-56 ${
                    pokemonOfDayArticle ? "hover:border-cyan-300/50" : "pointer-events-none"
                  }`}
                  title={
                    pokemonOfDayArticle
                      ? `Open spotlight article from ${pokemonOfDayArticle.source}`
                      : "Pokemon of the day"
                  }
                >
                  <p className="text-[10px] uppercase tracking-[0.14em] text-cyan-300">
                    Pokemon Of The Day
                  </p>
                  <div className="mt-2 flex min-h-0 flex-1 items-start gap-3">
                    {pokemonOfDay.image ? (
                      <Image
                        src={pokemonOfDay.image}
                        alt={pokemonOfDay.name}
                        width={64}
                        height={64}
                        className="h-16 w-16 shrink-0 rounded-lg bg-slate-900 object-contain p-1"
                        unoptimized
                      />
                    ) : (
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-xs text-slate-400">
                        N/A
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-bold leading-snug text-white">
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
                    </div>
                  </div>
                </a>
              ) : null}
            </div>
          </header>
        </ScrollReveal>

        <ScrollReveal delayMs={60}>
          <section className="grid min-w-0 items-stretch gap-6 lg:grid-cols-2">
          <div className="h-full rounded-3xl border border-white/10 bg-slate-900 p-6 hover-lift sm:p-7">
            {/* Score column + fixed-width semicircular gauge column (room for ticks + needle). */}
            <div className="grid grid-cols-1 items-start gap-5 min-[420px]:grid-cols-[minmax(0,1fr)_minmax(12.75rem,15.75rem)] min-[420px]:gap-x-6 min-[420px]:gap-y-3 lg:gap-x-10">
              <div className="min-w-0 space-y-1 pr-0 sm:pr-1">
                <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">
                  Current Hype
                </p>
                <h2 className="mt-1 text-3xl font-black tabular-nums sm:text-4xl md:text-5xl lg:text-6xl">
                  {score}
                  <span className="text-xl text-slate-400 sm:text-2xl">/100</span>
                </h2>
                <p className="mt-1 text-base font-semibold text-fuchsia-300 sm:text-lg">
                  {traderNarrative.regime}
                </p>
                <p className="mt-1 max-w-xl text-sm leading-snug text-slate-400 line-clamp-3 sm:line-clamp-none">
                  {traderNarrative.summary}
                </p>
              </div>
              <div className="mx-auto flex w-full min-w-0 shrink-0 justify-center pb-2 min-[420px]:mx-0 min-[420px]:justify-end min-[420px]:pb-3 min-[420px]:pt-0.5">
                <HypeGauge score={score} />
              </div>
            </div>
            <div className="mt-4 h-4 overflow-hidden rounded-full bg-slate-700 sm:mt-5">
              <div
                className={`h-full rounded-full bg-gradient-to-r ${meterColor(score)}`}
                style={{ width: `${score}%` }}
              />
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-2 lg:items-stretch">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <div className="rounded-lg border border-white/10 bg-slate-800 px-3 py-3 sm:min-h-[5.5rem] sm:flex sm:flex-col sm:justify-center">
                  <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Momentum</p>
                  <p className="mt-1 text-sm font-semibold leading-snug text-cyan-300">
                    {traderNarrative.momentumTag}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-slate-800 px-3 py-3 sm:min-h-[5.5rem] sm:flex sm:flex-col sm:justify-center">
                  <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Breadth</p>
                  <p className="mt-1 text-sm font-semibold leading-snug text-cyan-300">
                    {traderNarrative.breadthTag}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-slate-800 px-3 py-3 sm:min-h-[5.5rem] sm:flex sm:flex-col sm:justify-center">
                  <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Conviction</p>
                  <p className="mt-1 text-sm font-semibold leading-snug text-cyan-300">
                    {traderNarrative.convictionTag}
                  </p>
                </div>
              </div>
              <div className="flex min-h-0 min-w-0 flex-col rounded-xl border border-white/10 bg-slate-800/80 p-3 lg:h-full lg:max-w-none">
                <p className="shrink-0 text-[10px] uppercase tracking-[0.12em] text-slate-400">
                  Live Event Signals
                </p>
                <div className="mt-2 flex min-h-0 max-h-24 flex-1 flex-wrap content-start gap-1.5 overflow-y-auto overflow-x-hidden pr-1 sm:max-h-28 lg:max-h-none">
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
              <details className="group rounded-xl border border-cyan-400/25 bg-slate-800/90 p-3 hover-lift sm:col-span-2 open:ring-1 open:ring-cyan-500/20">
                <summary className="cursor-pointer list-none text-xs font-semibold uppercase tracking-[0.12em] text-cyan-300 marker:content-none [&::-webkit-details-marker]:hidden">
                  <span className="inline-flex items-center gap-2">
                    Model Weights
                    <span className="rounded-full border border-white/15 bg-slate-900/80 px-2 py-0.5 text-[10px] font-normal normal-case tracking-normal text-slate-400 group-open:hidden">
                      tap to expand
                    </span>
                  </span>
                </summary>
                <p className="mt-2 text-[11px] text-slate-300">
                  Composite index with 6 weighted components: Search Interest (30%),
                  Market Momentum (20%), Availability Pressure (17%), Event Catalyst (13%),
                  Community Sentiment (10%), Product Stress (10%).
                </p>
              </details>
            </div>
          </div>

          <div className="relative flex h-full flex-col overflow-hidden rounded-3xl border border-white/10 bg-slate-900 p-6 hover-lift sm:p-7">
            <div className="grid gap-3 lg:grid-cols-3">
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
            <div className="mt-4 flex flex-1 flex-col rounded-2xl border border-white/10 bg-slate-800/70 p-3.5">
              <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">
                Social Signal Pulse
              </p>
              <p className="mt-1 text-[9px] leading-snug text-slate-500">
                Bar width = day-over-day momentum (50% ≈ flat; strong drops floor ~22% for readability). Big number =
                today&apos;s traffic level.
              </p>
              <div className="mt-2 grid flex-1 auto-rows-fr gap-2 sm:grid-cols-2">
                {platformGraph.map((platform, index) => (
                  <article
                    key={`compact-${platform.key}`}
                    className={`flex h-full flex-col justify-between rounded-xl border border-white/10 bg-slate-900 p-3 ${
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
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-700/90">
                      <div
                        className="h-full rounded-full shadow-sm shadow-black/20"
                        style={{
                          width: `${platform.barPct}%`,
                          background:
                            platform.deltaPct >= 0
                              ? (SOCIAL_PULSE_BAR_GRADIENT_POSITIVE[platform.key] ??
                                SOCIAL_PULSE_BAR_GRADIENT_POSITIVE["google-search"])
                              : SOCIAL_PULSE_BAR_GRADIENT_NEGATIVE,
                        }}
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
          <BacktrackMarketSection
            history={history}
            events={timelineEventSignals}
            marketOverlay={marketOverlay}
            market={market}
            deploymentSha={process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null}
          />
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
