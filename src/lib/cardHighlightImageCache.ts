import { unstable_cache } from "next/cache";
import { CARD_TRADER_HIGHLIGHT_CACHE_SEC } from "@/lib/homePageCacheConfig";

/** Only fetch images from CardTrader CDNs (avoid open proxy). */
function isAllowedCardTraderImageUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    return /\.cardtrader\.com$/i.test(u.hostname) || u.hostname === "cardtrader.com";
  } catch {
    return false;
  }
}

/**
 * Server-side fetch + Next Data Cache: same image URL is not re-fetched from CardTrader
 * on every page view (TTL matches {@link CARD_TRADER_HIGHLIGHT_CACHE_SEC}).
 */
export const getCachedCardHighlightImage = unstable_cache(
  async (imageUrl: string) => {
    const trimmed = imageUrl.trim();
    if (!trimmed || !isAllowedCardTraderImageUrl(trimmed)) return null;

    const res = await fetch(trimmed, {
      cache: "no-store",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; HypeMeter/1.0; +https://monmeter.vercel.app)",
        Referer: "https://www.cardtrader.com/",
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const ab = await res.arrayBuffer();
    const body = Buffer.from(ab);
    const contentType =
      res.headers.get("content-type")?.split(";")[0]?.trim() ?? "image/jpeg";
    return { body, contentType };
  },
  ["card-highlight-image-bytes"],
  { revalidate: CARD_TRADER_HIGHLIGHT_CACHE_SEC },
);
