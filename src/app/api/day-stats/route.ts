import { NextRequest, NextResponse } from "next/server";

type NewsItem = {
  title: string;
  link: string;
  pubDate: string;
  source: string;
};

const MAX_YEARS = 5;
type WeightedSignal = { label: string; pattern: RegExp; weight: number };

const EVENT_TOKENS: WeightedSignal[] = [
  { label: "Pokemon Direct", pattern: /\bpokemon direct\b/i, weight: 4.5 },
  { label: "Pokemon Presents", pattern: /\bpok[eé]mon presents\b/i, weight: 4.2 },
  { label: "Direct", pattern: /\bdirect\b/i, weight: 2.4 },
  { label: "Presents", pattern: /\bpresents\b/i, weight: 2.1 },
  { label: "Reveal / Announcement", pattern: /\breveal|announc(e|ed|ement)|unveil|trailer\b/i, weight: 1.8 },
  { label: "Release / Launch", pattern: /\brelease|launch|debut|premiere\b/i, weight: 1.6 },
  { label: "Expansion / Set", pattern: /\bexpansion|set list|new set|pre-?release\b/i, weight: 1.5 },
  { label: "Pokemon Day / Worlds", pattern: /\bpok[eé]mon day|worlds|championship\b/i, weight: 2.2 },
];

const PRESSURE_TOKENS: WeightedSignal[] = [
  { label: "Sold Out / OOS", pattern: /\bsold out|out of stock|sellout\b/i, weight: 2.4 },
  { label: "Preorder / Queue", pattern: /\bpre-?order|queue|line\b/i, weight: 1.6 },
  { label: "Allocation / Scarcity", pattern: /\ballocation|shortage|scarcity\b/i, weight: 1.9 },
  { label: "Reprint / Restock", pattern: /\breprint|restock|supply\b/i, weight: 1.2 },
];

const POSITIVE_TOKENS: WeightedSignal[] = [
  { label: "Hype / Surge", pattern: /\bhype|surge|boom|record|strong|rally\b/i, weight: 1.6 },
  { label: "Success / Win", pattern: /\bwin|popular|success|top|massive\b/i, weight: 1.2 },
  { label: "Positive Buzz", pattern: /\blove|excited|best|great\b/i, weight: 1.0 },
];

const NEGATIVE_TOKENS: WeightedSignal[] = [
  { label: "Delay / Cancel", pattern: /\bdelay|postpone|cancel\b/i, weight: 1.8 },
  { label: "Drop / Crash", pattern: /\bdrop|crash|slump|weak\b/i, weight: 1.6 },
  { label: "Backlash / Risk", pattern: /\bbacklash|scam|lawsuit|problem\b/i, weight: 1.4 },
];

// Small XML helper to extract a single tag value from an <item> block.
function readTag(itemXml: string, tag: string) {
  const regex = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i");
  const match = itemXml.match(regex);
  return match ? match[1].trim() : "";
}

// Decode RSS entities and strip remaining HTML tags from feed content.
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

// Parse feed XML into typed news entries for scoring.
function parseNews(xml: string): NewsItem[] {
  const items: NewsItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match = itemRegex.exec(xml);
  while (match) {
    const block = match[1];
    const title = decodeHtml(readTag(block, "title"));
    const link = decodeHtml(readTag(block, "link"));
    const pubDate = decodeHtml(readTag(block, "pubDate"));
    const source = decodeHtml(readTag(block, "source")) || "Unknown";
    if (title && link) {
      items.push({ title, link, pubDate, source });
    }
    match = itemRegex.exec(xml);
  }
  return items;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function weightedTokenHits(text: string, tokens: WeightedSignal[]) {
  return tokens.reduce((sum, token) => sum + (token.pattern.test(text) ? token.weight : 0), 0);
}

function collectSignals(
  text: string,
  groups: Array<{ group: string; tokens: WeightedSignal[] }>,
  limit = 8,
) {
  return groups
    .flatMap((entry) =>
      entry.tokens
        .filter((token) => token.pattern.test(text))
        .map((token) => ({ label: token.label, group: entry.group, weight: token.weight })),
    )
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit);
}

// Ensure Google query date syntax uses UTC yyyy-mm-dd.
function toIsoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

// Validate date input and enforce rolling 5-year range.
function validateDate(dateStr: string) {
  const parsed = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return { ok: false as const, error: "Invalid date format" };
  }

  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const min = new Date(today);
  min.setUTCFullYear(min.getUTCFullYear() - MAX_YEARS);

  if (parsed > today) return { ok: false as const, error: "Date cannot be in the future" };
  if (parsed < min) return { ok: false as const, error: "Date older than 5-year window" };
  return { ok: true as const, parsed };
}

// Convert headline language into simple day-level market/sentiment metrics.
function computeStats(items: NewsItem[]) {
  const titles = items.map((item) => item.title);
  const text = titles.join(" | ");
  const eventHits = weightedTokenHits(text, EVENT_TOKENS);
  const pressureHits = weightedTokenHits(text, PRESSURE_TOKENS);
  const positiveHits = weightedTokenHits(text, POSITIVE_TOKENS);
  const negativeHits = weightedTokenHits(text, NEGATIVE_TOKENS);

  const headlineCount = items.length;
  const uniqueSources = new Set(items.map((item) => item.source)).size;
  const attentionScore = clamp(
    (Math.log10(headlineCount + 1) / Math.log10(26)) * 72 + (uniqueSources / 12) * 28,
    0,
    100,
  );
  const eventCatalystScore = clamp(eventHits * 12.5, 0, 100);
  const availabilityPressureScore = clamp(pressureHits * 14 + Math.log10(headlineCount + 1) * 7, 0, 100);
  const productStressScore = clamp(pressureHits * 17 + Math.max(0, negativeHits - positiveHits) * 4.5, 0, 100);
  const communitySentimentScore = clamp(
    50 + (positiveHits - negativeHits) * 6 + Math.log10(headlineCount + 1) * 8,
    0,
    100,
  );
  const marketMomentumProxyScore = clamp(
    50 + (positiveHits - negativeHits) * 4 + eventCatalystScore * 0.22 - productStressScore * 0.1,
    0,
    100,
  );
  const eventSignals = collectSignals(text, [
    { group: "event", tokens: EVENT_TOKENS },
    { group: "pressure", tokens: PRESSURE_TOKENS },
    { group: "sentiment+", tokens: POSITIVE_TOKENS },
    { group: "sentiment-", tokens: NEGATIVE_TOKENS },
  ]);

  // Same 6-component weighting philosophy used by the main hype meter.
  const dayScore = clamp(
    Math.round(
      attentionScore * 0.2 +
        marketMomentumProxyScore * 0.25 +
        availabilityPressureScore * 0.2 +
        eventCatalystScore * 0.15 +
        communitySentimentScore * 0.1 +
        productStressScore * 0.1,
    ),
    0,
    100,
  );
  const sentiment = Math.round(communitySentimentScore);

  return {
    headlineCount,
    uniqueSources,
    eventHits: Math.round(eventHits),
    pressureHits: Math.round(pressureHits),
    sentiment,
    dayScore,
    eventSignals,
  };
}

export async function GET(request: NextRequest) {
  // Query param driving stats computation for a specific calendar day.
  const date = request.nextUrl.searchParams.get("date");
  if (!date) {
    return NextResponse.json({ error: "Missing date query param" }, { status: 400 });
  }

  const valid = validateDate(date);
  if (!valid.ok) {
    return NextResponse.json({ error: valid.error }, { status: 400 });
  }

  const start = valid.parsed;
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);

  const query = encodeURIComponent(
    `("Pokemon" OR "Pokémon" OR "Pokemon TCG") after:${toIsoDate(start)} before:${toIsoDate(end)}`,
  );
  const url = `https://news.google.com/rss/search?q=${query}&hl=en-US&gl=US&ceid=US:en`;

  try {
    // Force fresh fetch for selected day so user sees runtime-computed data.
    const response = await fetch(url, {
      next: { revalidate: 0 },
      headers: { "user-agent": "Mozilla/5.0 hypemeter-runtime" },
    });
    if (!response.ok) {
      return NextResponse.json({ error: "Upstream feed unavailable" }, { status: 502 });
    }

    const xml = await response.text();
    const allItems = parseNews(xml).filter((item) => /(pokemon|pokémon)/i.test(item.title));
    const items = allItems.slice(0, 20);
    const stats = computeStats(items);
    return NextResponse.json({
      date,
      stats,
      headlines: items.slice(0, 8),
    });
  } catch {
    return NextResponse.json({ error: "Failed to compute daily stats" }, { status: 500 });
  }
}

