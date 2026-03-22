import type { MarketSnapshot } from "@/lib/marketSnapshot";

/**
 * **Not used by `fetchMarketSnapshot`** — only for unit tests of `applyMarketSnapshotFallback`.
 * Demo constants below were once merged into the sidecar and looked like “frozen” Yahoo quotes.
 */
export const MARKET_SNAPSHOT_PAGE_FALLBACK: MarketSnapshot = {
  sp500: 6506.48,
  bitcoin: 70076.5,
  nintendo: 14.7,
  nintendoPreviousClose: 15.2,
  sp500GrowthPct: -1.34,
  /** Slightly positive so the BTC card isn’t the same “red” as S&P when fallback fills all fields. */
  bitcoinGrowthPct: 0.12,
  nintendoGrowthPct: -3.29,
  updatedAt: null,
  nintendoSource: "adr",
  sp500Source: "yahoo-daily",
  bitcoinSource: "yahoo-daily",
};

function stampNow(): string {
  return new Date().toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/** Any Vercel deploy or production Node — demo constants must never mask failed Yahoo fetches. */
function isProductionContext(): boolean {
  return (
    process.env.VERCEL === "1" ||
    process.env.NODE_ENV === "production"
  );
}

/**
 * Fills any null numeric fields from {@link MARKET_SNAPSHOT_PAGE_FALLBACK} (non-production only).
 * Preserves live values when present. Sets `updatedAt` if it was null.
 */
export function applyMarketSnapshotFallback(snapshot: MarketSnapshot): MarketSnapshot {
  if (process.env.DISABLE_MARKET_SNAPSHOT_FALLBACK === "1") {
    return snapshot;
  }
  if (isProductionContext()) {
    return snapshot;
  }
  if (process.env.MARKET_SNAPSHOT_STATIC_FALLBACK !== "1") {
    return snapshot;
  }
  const f = MARKET_SNAPSHOT_PAGE_FALLBACK;
  return {
    sp500: snapshot.sp500 ?? f.sp500,
    bitcoin: snapshot.bitcoin ?? f.bitcoin,
    nintendo: snapshot.nintendo ?? f.nintendo,
    nintendoPreviousClose: snapshot.nintendoPreviousClose ?? f.nintendoPreviousClose,
    sp500GrowthPct: snapshot.sp500GrowthPct ?? f.sp500GrowthPct,
    bitcoinGrowthPct: snapshot.bitcoinGrowthPct ?? f.bitcoinGrowthPct,
    nintendoGrowthPct: snapshot.nintendoGrowthPct ?? f.nintendoGrowthPct,
    nintendoSource: snapshot.nintendoSource ?? f.nintendoSource,
    sp500Source: snapshot.sp500Source ?? f.sp500Source,
    bitcoinSource: snapshot.bitcoinSource ?? f.bitcoinSource,
    updatedAt: snapshot.updatedAt ?? stampNow(),
  };
}
