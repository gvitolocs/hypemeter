import type { MarketSnapshot } from "@/lib/marketSnapshot";

/**
 * Last-known-good snapshot (aligned with [monmeter](https://monmeter.vercel.app/) delayed-style display).
 * Used only to **fill null fields** when Yahoo/Stooq time out or rate-limit (429).
 * Bump numbers occasionally or set `DISABLE_MARKET_SNAPSHOT_FALLBACK=1` to show raw nulls.
 *
 * @see docs/MARKET_DATA.md
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
};

function stampNow(): string {
  return new Date().toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/**
 * Fills any null numeric fields from {@link MARKET_SNAPSHOT_PAGE_FALLBACK}.
 * Preserves live values when present. Sets `updatedAt` if it was null.
 */
export function applyMarketSnapshotFallback(snapshot: MarketSnapshot): MarketSnapshot {
  if (process.env.DISABLE_MARKET_SNAPSHOT_FALLBACK === "1") {
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
    updatedAt: snapshot.updatedAt ?? stampNow(),
  };
}
