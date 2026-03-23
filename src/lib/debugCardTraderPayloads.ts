/**
 * Shared payloads for `/debug` and `/api/debug/*` (same JSON, no duplicate logic).
 */

import { cardHighlightCalendarDayKey } from "@/lib/cardHighlightCalendarDay";
import {
  extractBestSellersSection,
  fetchCardTraderJinaRaw,
  fetchCardTraderPokemonBestSeller,
  parseCardTraderBestSellerFromText,
} from "@/lib/fetchCardTraderBestSeller";
import {
  fetchCardTraderImageBytesUncached,
  isAllowedCardTraderImageUrl,
} from "@/lib/cardHighlightImageCache";
import { imageBytesLookLikeRaster } from "@/lib/cardHighlightImageVerify";

export async function getCardHighlightImageDebugPayload() {
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

  return {
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
      "Image proxy cache: day key (Europe/Rome) + URL; TTL 15m + cron revalidation.",
      "GET /api/card-highlight-image returns X-Card-Highlight-Day and X-Card-Image-Host when OK.",
      "If upstream fails with HTTP 403, CardTrader may block datacenter IPs.",
    ],
  } as const;
}

export async function getCardTraderJinaDebugPayload() {
  const raw = await fetchCardTraderJinaRaw();
  const section = raw.text ? extractBestSellersSection(raw.text) : null;
  const parsed = raw.text ? parseCardTraderBestSellerFromText(raw.text) : null;

  const preview = section?.slice(0, 2500) ?? raw.text.slice(0, 2500) ?? "";

  return {
    jinaOk: raw.ok,
    jinaStatus: raw.status,
    textLength: raw.text.length,
    sectionLength: section?.length ?? 0,
    sectionPreview: preview,
    parsed,
    hints: [
      "Set DEBUG_CARDTRADER=1 on the server to log [cardtrader] lines in function logs.",
      "If parsed is null, sectionPreview shows what Jina returned — adjust parsing in fetchCardTraderBestSeller.ts.",
    ],
  } as const;
}
