import { cardHighlightCalendarDayKey } from "@/lib/cardHighlightCalendarDay";
import { fetchCardTraderPokemonBestSeller } from "@/lib/fetchCardTraderBestSeller";
import {
  getCachedCardHighlightImage,
  isAllowedCardTraderImageUrl,
} from "@/lib/cardHighlightImageCache";
import { CARD_TRADER_HIGHLIGHT_CACHE_SEC } from "@/lib/homePageCacheConfig";

export const runtime = "nodejs";

/**
 * Proxies the Card Highlight scan from CardTrader with long cache headers.
 * **Use `?url=`** with the same `imageUrl` as the SSR payload — otherwise this route would
 * call `fetchCardTraderPokemonBestSeller()` again and the bytes could belong to a different
 * snapshot than the name/link on the page (home cache vs API cache desync).
 */
export async function GET(request: Request) {
  const dayKey = cardHighlightCalendarDayKey();
  const raw = new URL(request.url).searchParams.get("url");

  let imageUrl = "";

  if (raw !== null && raw !== "") {
    try {
      imageUrl = decodeURIComponent(raw).trim();
    } catch {
      return new Response(null, { status: 400 });
    }
    if (!imageUrl || !isAllowedCardTraderImageUrl(imageUrl)) {
      return new Response(null, { status: 404 });
    }
  } else {
    const seller = await fetchCardTraderPokemonBestSeller();
    imageUrl = seller?.imageUrl?.trim() ?? "";
    if (!imageUrl) {
      return new Response(null, { status: 404 });
    }
  }

  let imageHost = "";
  try {
    imageHost = new URL(imageUrl).hostname;
  } catch {
    /* ignore */
  }

  try {
    const data = await getCachedCardHighlightImage(imageUrl, dayKey);
    return new Response(new Uint8Array(data.body), {
      headers: {
        "Content-Type": data.contentType,
        "Cache-Control": `public, max-age=${CARD_TRADER_HIGHLIGHT_CACHE_SEC}, s-maxage=${CARD_TRADER_HIGHLIGHT_CACHE_SEC}, stale-while-revalidate=${Math.floor(CARD_TRADER_HIGHLIGHT_CACHE_SEC / 2)}`,
        "X-Card-Highlight-Day": dayKey,
        "X-Card-Image-Host": imageHost,
        "X-Card-Image-Source": raw ? "query-url" : "seller-fetch",
      },
    });
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[card-highlight-image] proxy failed, redirecting to origin:", err);
    }
    if (isAllowedCardTraderImageUrl(imageUrl)) {
      return Response.redirect(imageUrl, 302);
    }
    return new Response(null, { status: 502 });
  }
}
