import { NextRequest, NextResponse } from "next/server";

type NewsItem = {
  title: string;
  link: string;
  pubDate: string;
  source: string;
};

const MAX_YEARS = 5;

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

function toIsoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

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

function computeStats(items: NewsItem[]) {
  const text = items.map((item) => item.title.toLowerCase()).join(" | ");
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
  const sentiment = clamp(
    Math.round(50 + (positiveHits - negativeHits) * 8 + Math.log10(headlineCount + 1) * 12),
    0,
    100,
  );
  const dayScore = clamp(
    Math.round(
      headlineCount * 4 +
        uniqueSources * 2 +
        eventHits * 9 +
        pressureHits * 7 +
        (sentiment - 50) * 0.6,
    ),
    0,
    100,
  );

  return {
    headlineCount,
    uniqueSources,
    eventHits,
    pressureHits,
    sentiment,
    dayScore,
  };
}

export async function GET(request: NextRequest) {
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

