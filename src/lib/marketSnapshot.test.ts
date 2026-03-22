import { describe, expect, it } from "vitest";
import {
  computeBitcoinCoinGeckoFallbackPath,
  computeBitcoinStooqFallbackPath,
  computeSp500Metrics,
  findYahooQuoteEntry,
  jpyPairToUsdApprox,
  mergeYahooQuotes,
  parseStooqDailyDlLastTwoCloses,
  parseStooqMetrics,
  parseYahooChartLastTwoCloses,
  parseYahooSymbol,
  type YahooFinanceQuoteBundle,
} from "./marketSnapshot";

/** Minimal v7 bundle for ^GSPC / BTC-USD / NTDOY (shape matches Yahoo quote API). */
function quoteResult(
  symbol: string,
  fields: {
    regularMarketPrice?: number;
    regularMarketPreviousClose?: number;
    regularMarketChangePercent?: number;
    postMarketPrice?: number;
    preMarketPrice?: number;
  },
): YahooFinanceQuoteBundle {
  return {
    quoteResponse: {
      result: [{ symbol, ...fields }],
    },
  };
}

describe("parseYahooSymbol", () => {
  it("uses regularMarketPrice and regularMarketChangePercent like finance.yahoo.com", () => {
    const bundle = quoteResult("^GSPC", {
      regularMarketPrice: 6506.48,
      regularMarketPreviousClose: 6606.49,
      regularMarketChangePercent: -1.5134,
    });
    const p = parseYahooSymbol(bundle, "^GSPC");
    expect(p.price).toBe(6506.48);
    expect(p.previousClose).toBe(6606.49);
    expect(p.growthPct).toBeCloseTo(-1.5134, 4);
  });

  it("falls back to postMarketPrice then preMarketPrice when regular is absent", () => {
    const post = quoteResult("BTC-USD", {
      postMarketPrice: 68801.12,
      regularMarketPreviousClose: 70000,
    });
    expect(parseYahooSymbol(post, "BTC-USD").price).toBe(68801.12);
  });

  it("computes % from price vs previous close when changePercent is missing", () => {
    const bundle = quoteResult("^GSPC", {
      regularMarketPrice: 100,
      regularMarketPreviousClose: 200,
    });
    const p = parseYahooSymbol(bundle, "^GSPC");
    expect(p.growthPct).toBeCloseTo(-50, 6);
  });

  it("uses bid/ask mid when regularMarketPrice is missing (OTC)", () => {
    const bundle: YahooFinanceQuoteBundle = {
      quoteResponse: {
        result: [
          {
            symbol: "NTDOY",
            bid: 14.1,
            ask: 14.3,
            regularMarketPreviousClose: 14.0,
            regularMarketChangePercent: 0.5,
          },
        ],
      },
    };
    const p = parseYahooSymbol(bundle, "NTDOY");
    expect(p.price).toBeCloseTo(14.2, 4);
    expect(p.previousClose).toBe(14.0);
  });

  it("matches symbols case-insensitively", () => {
    const bundle: YahooFinanceQuoteBundle = {
      quoteResponse: {
        result: [{ symbol: "^gspc", regularMarketPrice: 1, regularMarketPreviousClose: 1 }],
      },
    };
    expect(parseYahooSymbol(bundle, "^GSPC").price).toBe(1);
  });
});

describe("mergeYahooQuotes (dedicated + batch)", () => {
  it("fills price from batch when dedicated is empty (realistic server-side omission)", () => {
    const dedicated: YahooFinanceQuoteBundle = {};
    const batch = quoteResult("^GSPC", {
      regularMarketPrice: 6506.48,
      regularMarketPreviousClose: 6606.49,
      regularMarketChangePercent: -1.51,
    });
    const m = mergeYahooQuotes(dedicated, batch, "^GSPC");
    expect(m.price).toBe(6506.48);
    expect(m.growthPct).toBeCloseTo(-1.51, 2);
  });

  it("fills price from batch when dedicated only had previousClose (regression: old merge returned prev without price)", () => {
    const dedicated: YahooFinanceQuoteBundle = {
      quoteResponse: {
        result: [
          {
            symbol: "^GSPC",
            regularMarketPreviousClose: 6606.49,
          },
        ],
      },
    };
    const batch = quoteResult("^GSPC", {
      regularMarketPrice: 6506.48,
      regularMarketPreviousClose: 6606.49,
      regularMarketChangePercent: -1.51,
    });
    const m = mergeYahooQuotes(dedicated, batch, "^GSPC");
    expect(m.price).toBe(6506.48);
    expect(m.previousClose).toBe(6606.49);
    expect(m.growthPct).not.toBeNull();
  });

  it("prefers dedicated price when both feeds carry data", () => {
    const dedicated = quoteResult("^GSPC", {
      regularMarketPrice: 6500,
      regularMarketPreviousClose: 6600,
      regularMarketChangePercent: -1.5,
    });
    const batch = quoteResult("^GSPC", {
      regularMarketPrice: 9999,
      regularMarketPreviousClose: 1,
      regularMarketChangePercent: 5,
    });
    const m = mergeYahooQuotes(dedicated, batch, "^GSPC");
    expect(m.price).toBe(6500);
    expect(m.growthPct).toBeCloseTo(-1.5, 4);
  });
});

describe("parseStooqMetrics", () => {
  it("parses Stooq daily CSV (header row + data) and uses session open→close for growth (not Yahoo %)", () => {
    const csv =
      "Symbol,Date,Time,Open,High,Low,Close,Volume\n" +
      "^SPX,2025-03-20,00:00:00,6594.66,6594.66,6473.52,6506.48,1";
    const s = parseStooqMetrics(csv);
    expect(s.close).toBe(6506.48);
    const expectedSessionPct = ((6506.48 - 6594.66) / 6594.66) * 100;
    expect(s.growthPct).toBeCloseTo(expectedSessionPct, 4);
  });

  it("supports single-line CSV without header (legacy / tests)", () => {
    const csv = "^SPX,2025-03-20,00:00:00,100,100,99,99.5,1";
    const s = parseStooqMetrics(csv);
    expect(s.close).toBe(99.5);
    expect(s.growthPct).toBeCloseTo(-0.5, 6);
  });

  it("returns nulls for malformed rows", () => {
    expect(parseStooqMetrics("bad").close).toBeNull();
  });
});

describe("parseYahooChartLastTwoCloses", () => {
  it("skips null closes and returns last two numeric values", () => {
    const json = {
      chart: {
        result: [
          {
            indicators: {
              quote: [{ close: [10, null, 20, 21] }],
            },
          },
        ],
      },
    };
    const { last, prev } = parseYahooChartLastTwoCloses(json);
    expect(last).toBe(21);
    expect(prev).toBe(20);
  });
});

describe("computeSp500Metrics / computeBitcoin*", () => {
  it("uses Yahoo growth when Yahoo supplies S&P price", () => {
    const yahoo = { price: 6506.48, growthPct: -1.51, previousClose: 6606.49 };
    const spx = { close: 9999, growthPct: 5 };
    const out = computeSp500Metrics(yahoo, spx);
    expect(out.sp500).toBe(6506.48);
    expect(out.sp500GrowthPct).toBe(-1.51);
  });

  it("falls back to Stooq for S&P when Yahoo has no price", () => {
    const yahoo = { price: null, growthPct: null, previousClose: null };
    const spx = { close: 6506.48, growthPct: -2.5 };
    const out = computeSp500Metrics(yahoo, spx);
    expect(out.sp500).toBe(6506.48);
    expect(out.sp500GrowthPct).toBe(-2.5);
  });

  it("Stooq BTC path: Yahoo beats Stooq for level and %", () => {
    const yahoo = { price: 68800, growthPct: -2.7, previousClose: 70000 };
    const stooq = { close: 1, growthPct: 99 };
    const out = computeBitcoinStooqFallbackPath(yahoo, stooq);
    expect(out.bitcoin).toBe(68800);
    expect(out.bitcoinGrowthPct).toBe(-2.7);
  });

  it("CoinGecko path: keeps price from CG but drops % when Yahoo missing", () => {
    const yahoo = { price: null, growthPct: null, previousClose: null };
    const out = computeBitcoinCoinGeckoFallbackPath(yahoo, 69000);
    expect(out.bitcoin).toBe(69000);
    expect(out.bitcoinGrowthPct).toBeNull();
  });
});

describe("parseStooqDailyDlLastTwoCloses", () => {
  it("reads last two closes from Stooq daily CSV", () => {
    const csv = `Date,Open,High,Low,Close,Volume
2026-03-17,100,101,99,100.5,1
2026-03-18,101,103,100,102.0,2`;
    const out = parseStooqDailyDlLastTwoCloses(csv);
    expect(out).toEqual({ last: 102, prev: 100.5 });
  });
});

describe("jpyPairToUsdApprox", () => {
  it("divides JPY by USDJPY (yen per USD)", () => {
    expect(jpyPairToUsdApprox(15922.5, 150.15)).toBeCloseTo(106.04, 2);
  });
});

describe("findYahooQuoteEntry", () => {
  it("finds BTC-USD in a multi-symbol batch", () => {
    const bundle: YahooFinanceQuoteBundle = {
      quoteResponse: {
        result: [
          { symbol: "^GSPC", regularMarketPrice: 1 },
          { symbol: "BTC-USD", regularMarketPrice: 2 },
        ],
      },
    };
    expect(findYahooQuoteEntry(bundle, "BTC-USD")?.regularMarketPrice).toBe(2);
  });
});
