import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyMarketSnapshotFallback, MARKET_SNAPSHOT_PAGE_FALLBACK } from "@/lib/marketSnapshotFallback";

describe("applyMarketSnapshotFallback", () => {
  beforeEach(() => {
    delete process.env.DISABLE_MARKET_SNAPSHOT_FALLBACK;
    delete process.env.MARKET_SNAPSHOT_STATIC_FALLBACK;
  });

  afterEach(() => {
    delete process.env.DISABLE_MARKET_SNAPSHOT_FALLBACK;
    delete process.env.MARKET_SNAPSHOT_STATIC_FALLBACK;
  });

  it("fills null fields from page fallback when MARKET_SNAPSHOT_STATIC_FALLBACK=1", () => {
    process.env.MARKET_SNAPSHOT_STATIC_FALLBACK = "1";
    const out = applyMarketSnapshotFallback({
      sp500: null,
      bitcoin: 70000,
      nintendo: null,
      nintendoPreviousClose: null,
      sp500GrowthPct: null,
      bitcoinGrowthPct: -0.18,
      nintendoGrowthPct: null,
      nintendoSource: null,
      sp500Source: null,
      bitcoinSource: null,
      updatedAt: "Mar 22, 2026, 3:00 PM",
    });
    expect(out.sp500).toBe(MARKET_SNAPSHOT_PAGE_FALLBACK.sp500);
    expect(out.bitcoin).toBe(70000);
    expect(out.nintendo).toBe(MARKET_SNAPSHOT_PAGE_FALLBACK.nintendo);
    expect(out.updatedAt).toBe("Mar 22, 2026, 3:00 PM");
  });

  it("respects DISABLE_MARKET_SNAPSHOT_FALLBACK=1", () => {
    process.env.DISABLE_MARKET_SNAPSHOT_FALLBACK = "1";
    process.env.MARKET_SNAPSHOT_STATIC_FALLBACK = "1";
    const out = applyMarketSnapshotFallback({
      sp500: null,
      bitcoin: null,
      nintendo: null,
      nintendoPreviousClose: null,
      sp500GrowthPct: null,
      bitcoinGrowthPct: null,
      nintendoGrowthPct: null,
      nintendoSource: null,
      sp500Source: null,
      bitcoinSource: null,
      updatedAt: null,
    });
    expect(out.sp500).toBeNull();
    delete process.env.DISABLE_MARKET_SNAPSHOT_FALLBACK;
  });

  it("by default does not inject static demo numbers", () => {
    const out = applyMarketSnapshotFallback({
      sp500: null,
      bitcoin: null,
      nintendo: null,
      nintendoPreviousClose: null,
      sp500GrowthPct: null,
      bitcoinGrowthPct: null,
      nintendoGrowthPct: null,
      nintendoSource: null,
      sp500Source: null,
      bitcoinSource: null,
      updatedAt: null,
    });
    expect(out.sp500).toBeNull();
    expect(out.bitcoin).toBeNull();
  });

  it("never applies static fill on Vercel (VERCEL=1) even if MARKET_SNAPSHOT_STATIC_FALLBACK=1", () => {
    const prevVercel = process.env.VERCEL;
    process.env.MARKET_SNAPSHOT_STATIC_FALLBACK = "1";
    process.env.VERCEL = "1";
    const out = applyMarketSnapshotFallback({
      sp500: null,
      bitcoin: null,
      nintendo: null,
      nintendoPreviousClose: null,
      sp500GrowthPct: null,
      bitcoinGrowthPct: null,
      nintendoGrowthPct: null,
      nintendoSource: null,
      sp500Source: null,
      bitcoinSource: null,
      updatedAt: null,
    });
    expect(out.sp500).toBeNull();
    if (prevVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = prevVercel;
  });

  it("never applies static fill when NODE_ENV=production (local next start)", () => {
    const prevNode = process.env.NODE_ENV;
    process.env.MARKET_SNAPSHOT_STATIC_FALLBACK = "1";
    process.env.NODE_ENV = "production";
    const out = applyMarketSnapshotFallback({
      sp500: null,
      bitcoin: null,
      nintendo: null,
      nintendoPreviousClose: null,
      sp500GrowthPct: null,
      bitcoinGrowthPct: null,
      nintendoGrowthPct: null,
      nintendoSource: null,
      sp500Source: null,
      bitcoinSource: null,
      updatedAt: null,
    });
    expect(out.sp500).toBeNull();
    process.env.NODE_ENV = prevNode;
  });
});
