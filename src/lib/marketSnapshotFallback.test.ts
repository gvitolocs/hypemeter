import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyMarketSnapshotFallback, MARKET_SNAPSHOT_PAGE_FALLBACK } from "@/lib/marketSnapshotFallback";

describe("applyMarketSnapshotFallback", () => {
  beforeEach(() => {
    delete process.env.DISABLE_MARKET_SNAPSHOT_FALLBACK;
  });

  afterEach(() => {
    delete process.env.DISABLE_MARKET_SNAPSHOT_FALLBACK;
  });

  it("fills null fields from page fallback", () => {
    const out = applyMarketSnapshotFallback({
      sp500: null,
      bitcoin: 70000,
      nintendo: null,
      nintendoPreviousClose: null,
      sp500GrowthPct: null,
      bitcoinGrowthPct: -0.18,
      nintendoGrowthPct: null,
      updatedAt: "Mar 22, 2026, 3:00 PM",
    });
    expect(out.sp500).toBe(MARKET_SNAPSHOT_PAGE_FALLBACK.sp500);
    expect(out.bitcoin).toBe(70000);
    expect(out.nintendo).toBe(MARKET_SNAPSHOT_PAGE_FALLBACK.nintendo);
    expect(out.updatedAt).toBe("Mar 22, 2026, 3:00 PM");
  });

  it("respects DISABLE_MARKET_SNAPSHOT_FALLBACK=1", () => {
    process.env.DISABLE_MARKET_SNAPSHOT_FALLBACK = "1";
    const out = applyMarketSnapshotFallback({
      sp500: null,
      bitcoin: null,
      nintendo: null,
      nintendoPreviousClose: null,
      sp500GrowthPct: null,
      bitcoinGrowthPct: null,
      nintendoGrowthPct: null,
      updatedAt: null,
    });
    expect(out.sp500).toBeNull();
    delete process.env.DISABLE_MARKET_SNAPSHOT_FALLBACK;
  });
});
