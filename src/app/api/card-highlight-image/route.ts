import { cardHighlightCalendarDayKey } from "@/lib/cardHighlightCalendarDay";
import { fetchCardTraderPokemonBestSeller } from "@/lib/fetchCardTraderBestSeller";
import { getCachedCardHighlightImage } from "@/lib/cardHighlightImageCache";
import { CARD_TRADER_HIGHLIGHT_CACHE_SEC } from "@/lib/homePageCacheConfig";

export const runtime = "nodejs";

/**
 * Proxies the current Card Highlight scan from CardTrader with long cache headers.
 * Avoids browser hotlink failures; bytes are cached server-side (see getCachedCardHighlightImage).
 */
export async function GET() {
  const dayKey = cardHighlightCalendarDayKey();
  const seller = await fetchCardTraderPokemonBestSeller();
  if (!seller?.imageUrl?.trim()) {
    return new Response(null, { status: 404 });
  }

  let imageHost = "";
  try {
    imageHost = new URL(seller.imageUrl).hostname;
  } catch {
    /* ignore */
  }

  try {
    const data = await getCachedCardHighlightImage(seller.imageUrl, dayKey);
    return new Response(new Uint8Array(data.body), {
      headers: {
        "Content-Type": data.contentType,
        "Cache-Control": `public, max-age=${CARD_TRADER_HIGHLIGHT_CACHE_SEC}, s-maxage=${CARD_TRADER_HIGHLIGHT_CACHE_SEC}, stale-while-revalidate=${Math.floor(CARD_TRADER_HIGHLIGHT_CACHE_SEC / 2)}`,
        "X-Card-Highlight-Day": dayKey,
        "X-Card-Image-Host": imageHost,
        "X-Card-Image-Source": "cardtrader-https",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    if (process.env.NODE_ENV === "development" || process.env.ENABLE_DEBUG_CARDTRADER === "1") {
      return new Response(
        JSON.stringify({
          error: "card_highlight_image",
          message: msg,
          imageUrl: seller.imageUrl,
          calendarDayKey: dayKey,
        }),
        {
          status: 502,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
    return new Response(null, { status: 502 });
  }
}
