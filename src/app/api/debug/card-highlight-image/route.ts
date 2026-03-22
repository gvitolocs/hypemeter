import { cardHighlightCalendarDayKey } from "@/lib/cardHighlightCalendarDay";
import { fetchCardTraderPokemonBestSeller } from "@/lib/fetchCardTraderBestSeller";
import {
  fetchCardTraderImageBytesUncached,
  isAllowedCardTraderImageUrl,
} from "@/lib/cardHighlightImageCache";
import { imageBytesLookLikeRaster } from "@/lib/cardHighlightImageVerify";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isDebugAllowed(): boolean {
  if (process.env.NODE_ENV === "development") return true;
  return process.env.ENABLE_DEBUG_CARDTRADER === "1";
}

/**
 * Diagnose Card Highlight image pipeline (seller parse + upstream fetch).
 * Set ENABLE_DEBUG_CARDTRADER=1 on Vercel or use local dev.
 */
export async function GET() {
  if (!isDebugAllowed()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const dayKey = cardHighlightCalendarDayKey();
  const seller = await fetchCardTraderPokemonBestSeller();
  const imageUrl = seller?.imageUrl?.trim() ?? "";
  const allowed = imageUrl ? isAllowedCardTraderImageUrl(imageUrl) : false;

  let imageHost = "";
  try {
    if (imageUrl) imageHost = new URL(imageUrl).hostname;
  } catch {
    /* ignore */
  }

  let upstream:
    | {
        ok: true;
        status: number;
        contentType: string;
        bytes: number;
        rasterMagicOk: boolean;
      }
    | { ok: false; error: string } = { ok: false, error: "no image URL" };

  if (imageUrl && allowed) {
    try {
      const data = await fetchCardTraderImageBytesUncached(imageUrl);
      upstream = {
        ok: true,
        status: 200,
        contentType: data.contentType,
        bytes: data.body.length,
        rasterMagicOk: imageBytesLookLikeRaster(data.body),
      };
    } catch (e) {
      upstream = { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  } else if (imageUrl && !allowed) {
    upstream = { ok: false, error: "imageUrl failed host allowlist" };
  }

  return NextResponse.json({
    calendarDayKey: dayKey,
    seller,
    imageUrl,
    imageHost,
    allowedHost: allowed,
    upstream,
    confirms: {
      httpsCardTraderHost: allowed,
      bytesLookLikeImage: upstream.ok ? upstream.rasterMagicOk : false,
    },
    hints: [
      "Cache is keyed by calendar day (Europe/Rome) + URL — same art until local midnight, then new Jina parse.",
      "GET /api/card-highlight-image returns X-Card-Highlight-Day and X-Card-Image-Host when OK.",
      "If upstream fails with HTTP 403, CardTrader may block datacenter IPs.",
    ],
  });
}
