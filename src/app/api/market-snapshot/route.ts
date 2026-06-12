import {
  MARKET_SIDECAR_REVALIDATE_SEC,
  fetchMarketSnapshotHourly,
} from "@/lib/marketSnapshotHourlyCache";

export const runtime = "nodejs";

/**
 * JSON quotes for the Market Sidecar. Cached briefly on the CDN + Next (`fetchMarketSnapshotHourly`).
 */
export async function GET() {
  const snapshot = await fetchMarketSnapshotHourly();
  const body = JSON.stringify(snapshot);
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": `public, s-maxage=${MARKET_SIDECAR_REVALIDATE_SEC}, stale-while-revalidate=${MARKET_SIDECAR_REVALIDATE_SEC}`,
    },
  });
}
