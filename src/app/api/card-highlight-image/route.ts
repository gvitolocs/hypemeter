import { fetchCardTraderPokemonBestSeller } from "@/lib/fetchCardTraderBestSeller";
import { getCachedCardHighlightImage } from "@/lib/cardHighlightImageCache";
import { CARD_TRADER_HIGHLIGHT_CACHE_SEC } from "@/lib/homePageCacheConfig";

export const runtime = "nodejs";

/**
 * Proxies the current Card Highlight scan from CardTrader with long cache headers.
 * Avoids browser hotlink failures; bytes are cached server-side (see getCachedCardHighlightImage).
 */
export async function GET() {
  const seller = await fetchCardTraderPokemonBestSeller();
  if (!seller?.imageUrl?.trim()) {
    return new Response(null, { status: 404 });
  }

  const data = await getCachedCardHighlightImage(seller.imageUrl);
  if (!data) {
    return new Response(null, { status: 502 });
  }

  return new Response(data.body, {
    headers: {
      "Content-Type": data.contentType,
      "Cache-Control": `public, max-age=${CARD_TRADER_HIGHLIGHT_CACHE_SEC}, s-maxage=${CARD_TRADER_HIGHLIGHT_CACHE_SEC}, stale-while-revalidate=${Math.floor(CARD_TRADER_HIGHLIGHT_CACHE_SEC / 2)}`,
    },
  });
}
