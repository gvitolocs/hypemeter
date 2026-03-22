import { unstable_cache } from "next/cache";
import { CARD_TRADER_HIGHLIGHT_CACHE_SEC } from "@/lib/homePageCacheConfig";
import { imageBytesLookLikeRaster } from "@/lib/cardHighlightImageVerify";

/** Only fetch images from CardTrader hosts (avoid open proxy). */
export function isAllowedCardTraderImageUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    return /\.cardtrader\.com$/i.test(u.hostname) || u.hostname === "cardtrader.com";
  } catch {
    return false;
  }
}

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Referer: "https://www.cardtrader.com/en/pokemon",
  Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
} as const;

/**
 * Uncached upstream fetch (for probes). Throws on network/HTTP failure so callers don't cache bad state.
 */
export async function fetchCardTraderImageBytesUncached(imageUrl: string): Promise<{
  body: Buffer;
  contentType: string;
}> {
  const trimmed = imageUrl.trim();
  if (!trimmed || !isAllowedCardTraderImageUrl(trimmed)) {
    throw new Error("card_highlight_image: URL not allowed or empty");
  }

  const res = await fetch(trimmed, {
    cache: "no-store",
    headers: { ...BROWSER_HEADERS },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    throw new Error(`card_highlight_image: upstream HTTP ${res.status}`);
  }
  const ab = await res.arrayBuffer();
  const body = Buffer.from(ab);
  if (body.length < 32) {
    throw new Error("card_highlight_image: body too small");
  }
  if (!imageBytesLookLikeRaster(body)) {
    throw new Error(
      "card_highlight_image: response is not a known image format (likely HTML/error from upstream)",
    );
  }
  let contentType =
    res.headers.get("content-type")?.split(";")[0]?.trim() ?? "image/jpeg";
  if (contentType.includes("text/html")) {
    throw new Error("card_highlight_image: upstream returned HTML (blocked or wrong URL)");
  }
  if (!contentType.startsWith("image/")) {
    if (contentType === "application/octet-stream" || contentType === "binary/octet-stream") {
      contentType = "image/jpeg";
    }
  }
  return { body, contentType };
}

/**
 * Cached bytes per **calendar day** + URL — same file until Europe/Rome midnight.
 */
export const getCachedCardHighlightImage = unstable_cache(
  async (imageUrl: string, dayKey: string) => {
    void dayKey;
    return fetchCardTraderImageBytesUncached(imageUrl);
  },
  ["card-highlight-image-bytes-v2"],
  { revalidate: CARD_TRADER_HIGHLIGHT_CACHE_SEC },
);
