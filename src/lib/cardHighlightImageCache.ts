import { unstable_cache } from "next/cache";
import {
  CARD_TRADER_HIGHLIGHT_CACHE_SEC,
  HYPEMETER_CACHE_TAG_HOME,
} from "@/lib/homePageCacheConfig";
import {
  imageBytesLookLikeRaster,
  looksLikeHtmlResponse,
} from "@/lib/cardHighlightImageVerify";

/** Trust server `Content-Type` for common raster images (AVIF may fail magic-byte heuristics). */
function isTrustedRasterContentType(raw: string): boolean {
  const base = raw.split(/[;]/)[0]?.trim().toLowerCase() ?? "";
  if (base === "image/svg+xml") return false;
  return /^image\/(jpeg|jpg|pjpeg|png|gif|webp|avif|x-png|bmp|tiff|heic|heif)$/i.test(base);
}

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
  if (looksLikeHtmlResponse(body)) {
    throw new Error("card_highlight_image: upstream returned HTML (blocked or wrong URL)");
  }

  const contentType =
    res.headers.get("content-type")?.split(";")[0]?.trim() ?? "application/octet-stream";
  if (contentType.includes("text/html")) {
    throw new Error("card_highlight_image: upstream returned HTML Content-Type");
  }

  if (isTrustedRasterContentType(contentType)) {
    return { body, contentType };
  }

  if (
    contentType === "application/octet-stream" ||
    contentType === "binary/octet-stream" ||
    !contentType.startsWith("image/")
  ) {
    if (imageBytesLookLikeRaster(body)) {
      return { body, contentType: contentType.startsWith("image/") ? contentType : "image/jpeg" };
    }
    throw new Error(
      "card_highlight_image: response is not a known image format (likely HTML/error from upstream)",
    );
  }

  if (contentType.startsWith("image/") && imageBytesLookLikeRaster(body)) {
    return { body, contentType };
  }

  throw new Error("card_highlight_image: unexpected Content-Type or not a raster image");
}

/**
 * Cached bytes per **dayKey** + URL (Europe/Rome date in the key) with 15m `revalidate`.
 * `unstable_cache` must receive a **structured-clone-serializable** payload; raw `Buffer`
 * can round-trip as empty — store base64 and decode in the public helper.
 */
const getCachedCardHighlightImageInner = unstable_cache(
  async (imageUrl: string, dayKey: string) => {
    void dayKey;
    const data = await fetchCardTraderImageBytesUncached(imageUrl);
    return {
      bodyB64: data.body.toString("base64"),
      contentType: data.contentType,
    };
  },
  ["card-highlight-image-bytes-v3"],
  { revalidate: CARD_TRADER_HIGHLIGHT_CACHE_SEC, tags: [HYPEMETER_CACHE_TAG_HOME] },
);

export async function getCachedCardHighlightImage(
  imageUrl: string,
  dayKey: string,
): Promise<{ body: Buffer; contentType: string }> {
  const row = await getCachedCardHighlightImageInner(imageUrl, dayKey);
  return {
    body: Buffer.from(row.bodyB64, "base64"),
    contentType: row.contentType,
  };
}
