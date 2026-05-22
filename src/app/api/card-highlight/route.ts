import { cardHighlightCalendarDayKey } from "@/lib/cardHighlightCalendarDay";
import {
  fetchCardTraderPokemonBestSeller,
  pokoinCardUrlFromCardTraderData,
} from "@/lib/fetchCardTraderBestSeller";
import { CARD_TRADER_HIGHLIGHT_CACHE_SEC } from "@/lib/homePageCacheConfig";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function absoluteUrl(request: Request, path: string): string {
  return new URL(path, request.url).toString();
}

export async function GET(request: Request) {
  const card = await fetchCardTraderPokemonBestSeller();

  if (!card) {
    return NextResponse.json(
      {
        card: null,
        source: "pokoin-hot-blueprints",
        dayKey: cardHighlightCalendarDayKey(),
      },
      {
        status: 404,
        headers: {
          "Cache-Control": "public, max-age=30, s-maxage=60, stale-while-revalidate=120",
        },
      },
    );
  }

  const imageProxyPath = `/api/card-highlight-image?url=${encodeURIComponent(card.imageUrl)}`;
  return NextResponse.json(
    {
      card: {
        ...card,
        pokoinUrl: pokoinCardUrlFromCardTraderData(card.cardUrl, card.imageUrl),
        imageProxyPath,
        imageProxyUrl: absoluteUrl(request, imageProxyPath),
      },
      source: "pokoin-hot-blueprints",
      dayKey: cardHighlightCalendarDayKey(),
    },
    {
      headers: {
        "Cache-Control": `public, max-age=60, s-maxage=${CARD_TRADER_HIGHLIGHT_CACHE_SEC}, stale-while-revalidate=${Math.floor(CARD_TRADER_HIGHLIGHT_CACHE_SEC / 2)}`,
      },
    },
  );
}
