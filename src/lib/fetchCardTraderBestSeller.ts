/**
 * CardTrader Pokémon hub “Best sellers” via Jina reader (markdown/HTML varies).
 */

import { unstable_cache } from "next/cache";
import { cardHighlightCalendarDayKey } from "@/lib/cardHighlightCalendarDay";
import { CARD_TRADER_HIGHLIGHT_CACHE_SEC } from "@/lib/homePageCacheConfig";

export type CardTraderBestSeller = {
  name: string;
  /** Empty string → UI shows placeholder */
  imageUrl: string;
  cardUrl: string;
  fromPrice: string;
};

export const CARDTRADER_POKEMON_HUB = "https://www.cardtrader.com/en/pokemon";

const JINA_PREFIX = "https://r.jina.ai/";

function dbg(...args: unknown[]) {
  if (process.env.DEBUG_CARDTRADER === "1") {
    console.log("[cardtrader]", ...args);
  }
}

const CARDTRADER_ORIGIN = "https://www.cardtrader.com";

/** Turn relative CardTrader paths (e.g. `/uploads/blueprints/...`) into absolute URLs. */
export function normalizeCardtraderAssetUrl(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  if (/^https?:\/\//i.test(t)) return t;
  if (t.startsWith("//")) return `https:${t}`;
  if (t.startsWith("/")) return `${CARDTRADER_ORIGIN}${t}`;
  return t;
}

/** Card listing pages use a back placeholder (`/assets/fallbacks/.../show.png`) before the real scan in `/uploads/blueprints/...`. */
function isUndesirableCardImageUrl(url: string): boolean {
  const u = url.toLowerCase();
  return (
    /\/assets\/fallbacks\//i.test(u) ||
    /card_uploader\/show\.png/i.test(u) ||
    /\/assets\/.*\/show\.png$/i.test(u) ||
    (/show\.png$/i.test(u) && !/\/uploads\//i.test(u))
  );
}

function scoreCardImageCandidate(url: string): number {
  if (!url.trim()) return -9999;
  const n = normalizeCardtraderAssetUrl(url);
  if (!n || isUndesirableCardImageUrl(n)) return -1000;
  const u = n.toLowerCase();
  if (/\/uploads\/blueprints\//i.test(u)) return 100;
  if (/\/uploads\//i.test(u)) return 70;
  if (/\.(jpe?g|webp)(\?|$)/i.test(u)) return 25;
  if (/\.png(\?|$)/i.test(u)) return 15;
  return 5;
}

/** Prefer blueprint card art over hub fallbacks when multiple <img> exist (e.g. back + front flipper). */
export function pickBestCardImageUrl(candidates: string[]): string {
  const normalized = [...new Set(candidates.map(normalizeCardtraderAssetUrl).filter(Boolean))];
  if (normalized.length === 0) return "";
  const sorted = [...normalized].sort((a, b) => scoreCardImageCandidate(b) - scoreCardImageCandidate(a));
  const best = sorted.find((u) => scoreCardImageCandidate(u) > 0);
  return best ?? sorted[0] ?? "";
}

function looksLikeImageUrl(u: string): boolean {
  const n = normalizeCardtraderAssetUrl(u);
  if (!n) return false;
  return /\.(png|jpe?g|webp|gif|svg)(\?|$)/i.test(n) || /\/uploads\//i.test(n) || /\/images?\//i.test(n);
}

function looksLikeCardProductUrl(u: string): boolean {
  const n = normalizeCardtraderAssetUrl(u);
  if (!/cardtrader\.com/i.test(n)) return false;
  if (/cardtrader\.com\/en\/pokemon\/?$/i.test(n)) return false;
  return /\/(cards|products|sell)\//i.test(n);
}

/** All plausible card / listing URLs (absolute or site-relative). */
function gatherCardProductUrls(section: string): string[] {
  const out: string[] = [];
  for (const m of section.matchAll(
    /https:\/\/(?:www\.)?cardtrader\.com[^"'()\s]*\/cards\/[^"'()\s]*/gi,
  )) {
    out.push(m[0]);
  }
  for (const m of section.matchAll(/href=["'](\/(?:en\/)?cards\/[^"']+)["']/gi)) {
    out.push(normalizeCardtraderAssetUrl(m[1]));
  }
  for (const m of section.matchAll(/href=["'](\/cards\/[^"']+)["']/gi)) {
    out.push(normalizeCardtraderAssetUrl(m[1]));
  }
  return [...new Set(out)].filter((u) => looksLikeCardProductUrl(u));
}

/**
 * Strip Jina/markdown/HTML junk before the real card title (e.g. ".jpg) Gloom …", "](url.png) …").
 */
export function sanitizeCardHighlightName(raw: string): string {
  let s = raw.trim();
  if (!s) return "";
  // Raw HTML slices (path 3) often include tags before the visible title
  s = s.replace(/<[^>]+>/g, " ");
  // Markdown images ![alt](url) — may repeat or nest badly in Jina output
  for (let i = 0; i < 6; i++) {
    const next = s.replace(/!\[[^\]]*\]\([^)]*\)\s*/g, "");
    if (next === s) break;
    s = next;
  }
  // Trailing link close + URL in parens
  s = s.replace(/\]\([^)]*\)/g, "");
  // ".jpg)" / ".png)" (ASCII or fullwidth dot before extension)
  for (let i = 0; i < 6; i++) {
    const before = s;
    s = s.replace(
      /^[\s"'`«»\[\]()]*[\.\uFF0E](?:png|jpe?g|webp|gif)\)\s*/i,
      "",
    );
    s = s.replace(/^\.(?:png|jpe?g|webp|gif)\)\s*/i, "");
    s = s.replace(/^[\s"'`«»\[\]]*\.(?:png|jpe?g|webp)\s+/i, "");
    if (s === before) break;
  }
  // Leftover "url.jpg)" without leading dot (broken markdown)
  s = s.replace(/^[\s"'`«»\[\]]*(?:[a-z0-9_-]+\.)+(?:png|jpe?g|webp|gif)\)\s*/i, "");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

/** Markdown images + HTML img src (relative or absolute). */
function gatherImageCandidates(section: string): string[] {
  const out: string[] = [];
  for (const m of section.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) {
    out.push(m[1].trim());
  }
  for (const m of section.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi)) {
    out.push(m[1].trim());
  }
  return out;
}

function buildResult(
  imageUrl: string,
  rawLabel: string,
  cardUrl: string,
  fallbackName: string,
): CardTraderBestSeller {
  const beforePrice = rawLabel.split(/\s+Starting from:/i)[0]?.trim() || fallbackName;
  const nameFromLabel = sanitizeCardHighlightName(beforePrice);
  const priceMatch = rawLabel.match(/Starting from:\s*\$([\d.]+)/i);
  return {
    name: nameFromLabel || "Featured card",
    imageUrl: imageUrl.trim(),
    cardUrl: cardUrl.trim(),
    fromPrice: priceMatch?.[1] ?? "",
  };
}

/** Extract markdown section after a “Best sellers” heading. */
export function extractBestSellersSection(text: string): string | null {
  const m = text.match(/##\s*Best\s+sellers[^\n]*\n([\s\S]*?)(?=\n##\s+|\n#\s[^\n#]|$)/i);
  if (m?.[1]?.trim()) return m[1].trim();

  const m2 = text.match(
    /(?:^|\n)#{1,3}\s*Best\s+sellers[^\n]*\n([\s\S]*?)(?=\n#{1,3}\s|\n##\s|$)/i,
  );
  if (m2?.[1]?.trim()) return m2[1].trim();

  const idx = text.toLowerCase().indexOf("best seller");
  if (idx >= 0) {
    const slice = text.slice(idx, idx + 12000);
    return slice;
  }
  return null;
}

/**
 * Parse Jina / page text for first best-seller card row (image + listing link).
 * Card pages often ship two &lt;img&gt;: `/assets/fallbacks/.../show.png` (back) and
 * `/uploads/blueprints/...jpg` (front) — we always prefer the blueprint scan.
 */
export function parseCardTraderBestSellerFromText(fullText: string): CardTraderBestSeller | null {
  const section = extractBestSellersSection(fullText) ?? fullText.slice(0, 24_000);
  dbg("section length", section.length);

  let result: CardTraderBestSeller | null = null;

  // 1) Classic: [![...](img)](card) — allow relative image or card URLs
  const mdWrapped = section.match(/\[!\[[^\]]*\]\(([^)]+)\)\s*([\s\S]*?)\]\(([^)]+)\)/i);
  if (mdWrapped) {
    const cardUrl = normalizeCardtraderAssetUrl(mdWrapped[3]);
    if (looksLikeCardProductUrl(cardUrl)) {
      dbg("match: md wrapped image+card");
      result = buildResult(mdWrapped[1], mdWrapped[2], cardUrl, "Best seller");
    }
  }

  // 2) Image markdown + card URL line
  if (!result) {
    const mdImg = section.match(/!\[[^\]]*\]\(([^)]+)\)/);
    const mdLink = section.match(
      /(https:\/\/(?:www\.)?cardtrader\.com\/[^\s\)]*\/cards\/[^\s\)]*|\/(?:en\/)?cards\/[^\s\)]*)/i,
    );
    if (mdImg?.[1] && mdLink?.[1]) {
      const cardUrl = normalizeCardtraderAssetUrl(mdLink[1]);
      if (looksLikeImageUrl(mdImg[1]) && looksLikeCardProductUrl(cardUrl)) {
        dbg("match: md image + card url");
        result = buildResult(mdImg[1], section.slice(0, 800), cardUrl, "Best seller");
      }
    }
  }

  // 3) HTML: card link (absolute or /en/cards/…) — image chosen later from all <img>
  if (!result) {
    const hrefAbs = section.match(
      /href=["'](https:\/\/(?:www\.)?cardtrader\.com[^"']*\/(?:en\/)?cards\/[^"']*)["']/i,
    );
    const hrefRel = section.match(/href=["'](\/(?:en\/)?cards\/[^"']+)["']/i);
    const cardUrl = normalizeCardtraderAssetUrl(hrefAbs?.[1] ?? hrefRel?.[1] ?? "");
    if (cardUrl && looksLikeCardProductUrl(cardUrl)) {
      dbg("match: html card href");
      result = buildResult("", section.slice(0, 500), cardUrl, "Best seller");
    }
  }

  // 4) First listing URL in section + loose https images (for hub lists)
  if (!result) {
    const cardUrls = gatherCardProductUrls(section);
    if (cardUrls[0]) {
      dbg("match: gather card urls");
      result = buildResult("", section.slice(0, 500), cardUrls[0], "Best seller");
    }
  }

  // Prefer real card scan over `/assets/fallbacks/.../show.png` (listing flipper: back then front)
  const looseHttpsImages = [
    ...section.matchAll(/https:\/\/[^\s\)"']+\.(?:png|jpe?g|webp|gif)(?:\?[^\s\)"']*)?/gi),
  ].map((m) => m[0]);
  /** Relative uploads paths in HTML (must become absolute for Next/Image). */
  const relativeUploadImages = [
    ...section.matchAll(
      /(?:src|data-src)=["'](\/uploads\/[^"']+\.(?:png|jpe?g|webp|gif)(?:\?[^"']*)?)["']/gi,
    ),
  ].map((m) => m[1]);
  const allImageCandidates = [
    ...gatherImageCandidates(section),
    ...relativeUploadImages,
    ...looseHttpsImages,
  ];
  const bestImage = pickBestCardImageUrl(allImageCandidates);

  if (result && bestImage) {
    const cur = result.imageUrl ? normalizeCardtraderAssetUrl(result.imageUrl) : "";
    if (!cur || scoreCardImageCandidate(bestImage) > scoreCardImageCandidate(cur)) {
      result = { ...result, imageUrl: bestImage };
    }
  } else if (result && !result.imageUrl && bestImage) {
    result = { ...result, imageUrl: bestImage };
  }

  if (!result) dbg("no match");
  if (result) {
    result = {
      ...result,
      name: sanitizeCardHighlightName(result.name),
      imageUrl: normalizeCardtraderAssetUrl(result.imageUrl),
      cardUrl: normalizeCardtraderAssetUrl(result.cardUrl),
    };
  }
  return result;
}

async function fetchJinaMarkdown(): Promise<string | null> {
  const jinaUrl = `${JINA_PREFIX}${CARDTRADER_POKEMON_HUB}`;
  // Outer `unstable_cache` owns TTL; avoid a second fetch cache layer.
  const res = await fetch(jinaUrl, {
    cache: "no-store",
    headers: { "user-agent": "Mozilla/5.0 hypemeter" },
    signal: AbortSignal.timeout(18_000),
  });
  if (!res?.ok) {
    dbg("jina http", res?.status);
    return null;
  }
  return res.text();
}

const fetchCardTraderPokemonBestSellerCached = unstable_cache(
  async (dayKey: string): Promise<CardTraderBestSeller | null> => {
    void dayKey;
    try {
      const text = await fetchJinaMarkdown();
      if (!text) return null;
      const parsed = parseCardTraderBestSellerFromText(text);
      if (parsed?.imageUrl && process.env.DEBUG_CARDTRADER === "1") {
        dbg("parsed imageUrl host", new URL(parsed.imageUrl).hostname, "day", dayKey);
      }
      return parsed;
    } catch (e) {
      dbg("fetch error", e);
      return null;
    }
  },
  ["cardtrader-pokemon-best-seller-v2"],
  { revalidate: CARD_TRADER_HIGHLIGHT_CACHE_SEC },
);

/** Parsed best-seller row; Jina fetch at most once per **calendar day** (Europe/Rome), then Data Cache. */
export async function fetchCardTraderPokemonBestSeller(): Promise<CardTraderBestSeller | null> {
  return fetchCardTraderPokemonBestSellerCached(cardHighlightCalendarDayKey());
}

/** Raw Jina body for debug API (do not log full text in production). */
export async function fetchCardTraderJinaRaw(): Promise<{ ok: boolean; status: number; text: string }> {
  const jinaUrl = `${JINA_PREFIX}${CARDTRADER_POKEMON_HUB}`;
  try {
    const res = await fetch(jinaUrl, {
      next: { revalidate: 0 },
      headers: { "user-agent": "Mozilla/5.0 hypemeter-debug" },
      signal: AbortSignal.timeout(18_000),
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text };
  } catch {
    return { ok: false, status: 0, text: "" };
  }
}
