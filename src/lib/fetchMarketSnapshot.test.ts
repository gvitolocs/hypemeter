import { afterEach, describe, expect, it, vi } from "vitest";
import { YAHOO_QUOTE_FETCH, fetchMarketSnapshot } from "./fetchMarketSnapshot";

const STOOQ_SP500 = "https://stooq.com/q/l/?s=%5Espx&i=d";
const STOOQ_BTC = "https://stooq.com/q/l/?s=btcusd&i=d";
/** Matches either Stooq Nintendo URL tried in fetchStooqNtdyMetrics. */
const isStooqNtdy = (url: string) => url.includes("stooq.com") && url.includes("ntdoy");
const YAHOO_BATCH =
  "https://query1.finance.yahoo.com/v7/finance/quote?symbols=%5EGSPC,BTC-USD,NTDOY";
const YAHOO_GSPC = "https://query1.finance.yahoo.com/v7/finance/quote?symbols=%5EGSPC";
const YAHOO_BTC = "https://query1.finance.yahoo.com/v7/finance/quote?symbols=BTC-USD";
const YAHOO_NTDY = "https://query1.finance.yahoo.com/v7/finance/quote?symbols=NTDOY";
const isStooqUsdjpy = (url: string) => url.includes("stooq.com") && url.includes("usdjpy");
const isStooq7974JpDaily = (url: string) => url.includes("stooq.com") && url.includes("7974.jp") && url.includes("/q/d/l/");
const COINGECKO_BTC = "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd";

const SAMPLE_STOOQ_LINE = (close: number, open: number) =>
  `Symbol,Date,Time,Open,High,Low,Close,Volume\n^SPX,2025-03-20,00:00:00,${open},${open},${close},${close},1`;

function textRes(body: string, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    async text() {
      return body;
    },
    async json() {
      return JSON.parse(body);
    },
  } as Response;
}

function jsonRes(data: unknown, ok = true): Response {
  const body = JSON.stringify(data);
  return textRes(body, ok);
}

/** Yahoo v8 chart — two daily closes [prevBar, lastBar] (matches parseYahooChartLastTwoCloses). */
function yahooChartClosesJson(closes: number[]) {
  return jsonRes({
    chart: {
      result: [{ indicators: { quote: [{ close: closes }] } }],
    },
  });
}

describe("fetchMarketSnapshot (integration, mocked fetch)", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("path 1: Yahoo v7 dedicated + batch yields finance.yahoo-aligned S&P and BTC (Stooq present but secondary)", async () => {
    const gspcYahoo = {
      quoteResponse: {
        result: [
          {
            symbol: "^GSPC",
            regularMarketPrice: 6506.48,
            regularMarketPreviousClose: 6606.49,
            regularMarketChangePercent: -1.5134,
          },
        ],
      },
    };
    const btcYahoo = {
      quoteResponse: {
        result: [
          {
            symbol: "BTC-USD",
            regularMarketPrice: 68805.84,
            regularMarketPreviousClose: 70723.26,
            regularMarketChangePercent: -2.71,
          },
        ],
      },
    };
    const ntdyYahoo = {
      quoteResponse: {
        result: [
          {
            symbol: "NTDOY",
            regularMarketPrice: 14.5,
            regularMarketPreviousClose: 14.2,
            regularMarketChangePercent: 2.1,
          },
        ],
      },
    };

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : (input as Request).url;

      if (url.includes("/v8/finance/chart/")) {
        if (url.includes("%5EGSPC")) return yahooChartClosesJson([6606.49, 6506.48]);
        if (url.includes("BTC-USD")) return yahooChartClosesJson([70723.26, 68805.84]);
        if (url.includes("NTDOY")) return yahooChartClosesJson([14.2, 14.5]);
        return yahooChartClosesJson([]);
      }

      if (url.startsWith(STOOQ_SP500)) {
        return textRes(SAMPLE_STOOQ_LINE(9999, 10000));
      }
      if (url.startsWith(STOOQ_BTC)) {
        return textRes(SAMPLE_STOOQ_LINE(1, 2));
      }
      if (url === YAHOO_BATCH) {
        return jsonRes({
          quoteResponse: {
            result: [
              ...(gspcYahoo.quoteResponse?.result ?? []),
              ...(btcYahoo.quoteResponse?.result ?? []),
              ...(ntdyYahoo.quoteResponse?.result ?? []),
            ],
          },
        });
      }
      if (url === YAHOO_GSPC) return jsonRes(gspcYahoo);
      if (url === YAHOO_BTC) return jsonRes(btcYahoo);
      if (url === YAHOO_NTDY) return jsonRes(ntdyYahoo);

      throw new Error(`unexpected fetch in happy path: ${url}`);
    }) as typeof fetch;

    const snap = await fetchMarketSnapshot();

    expect(snap.sp500).toBe(6506.48);
    expect(snap.sp500GrowthPct).toBeCloseTo(-1.5134, 3);
    expect(snap.bitcoin).toBe(68805.84);
    expect(snap.bitcoinGrowthPct).toBeCloseTo(-2.71, 2);
    expect(snap.nintendo).toBe(14.5);
    expect(snap.nintendoPreviousClose).toBe(14.2);
    expect(snap.nintendoSource).toBe("adr");
    expect(snap.sp500Source).toBe("yahoo-daily");
    expect(snap.bitcoinSource).toBe("yahoo-daily");
    expect(snap.updatedAt).toMatch(/\d{4}/);
  });

  it("uses cache: no-store on Yahoo/Stooq/CoinGecko so quotes are not cached", async () => {
    const gspcYahoo = {
      quoteResponse: {
        result: [
          {
            symbol: "^GSPC",
            regularMarketPrice: 100,
            regularMarketPreviousClose: 99,
            regularMarketChangePercent: 1,
          },
        ],
      },
    };
    const btcYahoo = {
      quoteResponse: {
        result: [
          {
            symbol: "BTC-USD",
            regularMarketPrice: 50000,
            regularMarketPreviousClose: 49000,
            regularMarketChangePercent: 2,
          },
        ],
      },
    };
    const ntdyYahoo = {
      quoteResponse: {
        result: [
          {
            symbol: "NTDOY",
            regularMarketPrice: 14,
            regularMarketPreviousClose: 13,
            regularMarketChangePercent: 2,
          },
        ],
      },
    };

    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.includes("/v8/finance/chart/")) {
        if (url.includes("%5EGSPC")) return yahooChartClosesJson([99, 100]);
        if (url.includes("BTC-USD")) return yahooChartClosesJson([49000, 50000]);
        if (url.includes("NTDOY")) return yahooChartClosesJson([13, 14]);
        return yahooChartClosesJson([]);
      }
      if (url.startsWith(STOOQ_SP500) || url.startsWith(STOOQ_BTC)) {
        return textRes(SAMPLE_STOOQ_LINE(1, 2));
      }
      if (url === YAHOO_BATCH) {
        return jsonRes({
          quoteResponse: {
            result: [
              ...(gspcYahoo.quoteResponse?.result ?? []),
              ...(btcYahoo.quoteResponse?.result ?? []),
              ...(ntdyYahoo.quoteResponse?.result ?? []),
            ],
          },
        });
      }
      if (url === YAHOO_GSPC) return jsonRes(gspcYahoo);
      if (url === YAHOO_BTC) return jsonRes(btcYahoo);
      if (url === YAHOO_NTDY) return jsonRes(ntdyYahoo);
      throw new Error(`unexpected: ${url}`);
    }) as typeof fetch;

    globalThis.fetch = fetchSpy as typeof fetch;
    await fetchMarketSnapshot();

    const yahooCalls = fetchSpy.mock.calls.filter((c) =>
      String(c[0]).includes("finance.yahoo.com"),
    );
    const ua = (YAHOO_QUOTE_FETCH.headers as Record<string, string>)["user-agent"];
    for (const [, init] of yahooCalls) {
      expect(init?.cache).toBe("no-store");
      expect((init?.headers as Record<string, string>)?.["user-agent"]).toBe(ua);
    }

    const stooqCalls = fetchSpy.mock.calls.filter((c) => String(c[0]).includes("stooq.com"));
    for (const [, init] of stooqCalls) {
      expect(init?.cache).toBe("no-store");
      expect((init?.headers as Record<string, string>)?.["user-agent"]).toBe(ua);
    }
  });

  it("path 1: when Yahoo is empty, Stooq CSV fills S&P and BTC levels (session % for Stooq)", async () => {
    const emptyYahoo = { quoteResponse: { result: [] as unknown[] } };
    const spxClose = 6506.48;
    const spxOpen = 6594.66;
    const btcClose = 68800;
    const btcOpen = 70000;

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : (input as Request).url;

      if (url.includes("/v8/finance/chart/")) {
        return yahooChartClosesJson([]);
      }
      if (url.includes("q/d/l") && url.includes("%5Espx")) {
        return textRes(`Date,Open,High,Low,Close,Volume
2025-03-18,1,1,1,6606.49,1
2025-03-19,1,1,1,${spxClose},1`);
      }
      if (url.includes("q/d/l") && url.includes("btcusd")) {
        return textRes(`Date,Open,High,Low,Close,Volume
2025-03-18,1,1,1,70000,1
2025-03-19,1,1,1,${btcClose},1`);
      }

      if (url.startsWith(STOOQ_SP500)) {
        return textRes(SAMPLE_STOOQ_LINE(spxClose, spxOpen));
      }
      if (url.startsWith(STOOQ_BTC)) {
        return textRes(
          `Symbol,Date,Time,Open,High,Low,Close,Volume\nbtcusd,2025-03-20,00:00:00,${btcOpen},${btcOpen},${btcClose},${btcClose},1`,
        );
      }
      if (url === YAHOO_BATCH || url === YAHOO_GSPC || url === YAHOO_BTC) {
        return jsonRes(emptyYahoo);
      }
      if (url === YAHOO_NTDY) {
        return jsonRes({
          quoteResponse: {
            result: [
              {
                symbol: "NTDOY",
                regularMarketPrice: 10,
                regularMarketPreviousClose: 9.9,
                regularMarketChangePercent: 1,
              },
            ],
          },
        });
      }

      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch;

    const snap = await fetchMarketSnapshot();
    expect(snap.sp500).toBe(spxClose);
    expect(snap.sp500GrowthPct).toBeCloseTo(((spxClose - 6606.49) / 6606.49) * 100, 4);
    expect(snap.sp500Source).toBe("stooq-daily");
    expect(snap.bitcoin).toBe(btcClose);
    expect(snap.bitcoinGrowthPct).toBeCloseTo(((btcClose - 70000) / 70000) * 100, 4);
    expect(snap.bitcoinSource).toBe("stooq-daily");
  });

  it("path 2: after path 1 throws, CoinGecko + Yahoo still produce a snapshot", async () => {
    const gspcYahoo = {
      quoteResponse: {
        result: [
          {
            symbol: "^GSPC",
            regularMarketPrice: 6506.48,
            regularMarketPreviousClose: 6606.49,
            regularMarketChangePercent: -1.51,
          },
        ],
      },
    };
    const btcYahoo = {
      quoteResponse: {
        result: [
          {
            symbol: "BTC-USD",
            regularMarketPrice: 68800,
            regularMarketPreviousClose: 70000,
            regularMarketChangePercent: -1.7,
          },
        ],
      },
    };
    const ntdyYahoo = {
      quoteResponse: {
        result: [
          {
            symbol: "NTDOY",
            regularMarketPrice: 14,
            regularMarketPreviousClose: 13.9,
            regularMarketChangePercent: 0.5,
          },
        ],
      },
    };

    let call = 0;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      call += 1;
      const url = typeof input === "string" ? input : (input as Request).url;

      // First Promise.all (6 requests) — force failure so path 1 never returns.
      if (call <= 6) {
        throw new Error("simulated network failure (path 1)");
      }

      if (url.includes("/v8/finance/chart/")) {
        if (url.includes("%5EGSPC")) return yahooChartClosesJson([6606.49, 6506.48]);
        if (url.includes("BTC-USD")) return yahooChartClosesJson([70000, 68800]);
        if (url.includes("NTDOY")) return yahooChartClosesJson([13.9, 14]);
        return yahooChartClosesJson([]);
      }
      if (url.startsWith(STOOQ_SP500)) {
        return textRes(SAMPLE_STOOQ_LINE(111, 112));
      }
      if (url.startsWith(STOOQ_BTC)) {
        return textRes(SAMPLE_STOOQ_LINE(1, 2));
      }
      if (url.startsWith(COINGECKO_BTC)) {
        return jsonRes({ bitcoin: { usd: 68000 } });
      }
      if (url === YAHOO_BATCH) {
        return jsonRes({
          quoteResponse: {
            result: [
              ...(gspcYahoo.quoteResponse?.result ?? []),
              ...(btcYahoo.quoteResponse?.result ?? []),
              ...(ntdyYahoo.quoteResponse?.result ?? []),
            ],
          },
        });
      }
      if (url === YAHOO_GSPC) return jsonRes(gspcYahoo);
      if (url === YAHOO_BTC) return jsonRes(btcYahoo);
      if (url === YAHOO_NTDY) return jsonRes(ntdyYahoo);

      throw new Error(`unexpected fetch (path 2): ${url} call=${call}`);
    }) as typeof fetch;

    const snap = await fetchMarketSnapshot();
    expect(snap.sp500).toBe(6506.48);
    expect(snap.bitcoin).toBe(68800);
    expect(snap.bitcoinGrowthPct).toBeCloseTo(((68800 - 70000) / 70000) * 100, 4);
    expect(snap.sp500Source).toBe("yahoo-daily");
    expect(snap.bitcoinSource).toBe("yahoo-daily");
  });

  it("returns full null fallback when both paths fail to produce sp500+bitcoin", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("total failure");
    }) as typeof fetch;

    const snap = await fetchMarketSnapshot();
    expect(snap.sp500).toBeNull();
    expect(snap.bitcoin).toBeNull();
    expect(snap.updatedAt).toBeNull();
    expect(snap.sp500Source).toBeNull();
    expect(snap.bitcoinSource).toBeNull();
  });

  it("path 1: incomplete Nintendo triggers Stooq NTDY fetch then optional chart", async () => {
    const gspcYahoo = {
      quoteResponse: {
        result: [
          {
            symbol: "^GSPC",
            regularMarketPrice: 100,
            regularMarketPreviousClose: 99,
            regularMarketChangePercent: 1,
          },
        ],
      },
    };
    const btcYahoo = {
      quoteResponse: {
        result: [
          {
            symbol: "BTC-USD",
            regularMarketPrice: 50000,
            regularMarketPreviousClose: 49000,
            regularMarketChangePercent: 2,
          },
        ],
      },
    };

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : (input as Request).url;

      if (url.includes("/v8/finance/chart/")) {
        if (url.includes("%5EGSPC")) return yahooChartClosesJson([99, 100]);
        if (url.includes("BTC-USD")) return yahooChartClosesJson([49000, 50000]);
        if (url.includes("NTDOY")) {
          if (url.includes("range=14d")) return yahooChartClosesJson([]);
          return yahooChartClosesJson([13.5, 14.0, 14.2]);
        }
        return yahooChartClosesJson([]);
      }

      if (url.startsWith(STOOQ_SP500) || url.startsWith(STOOQ_BTC)) {
        return textRes(SAMPLE_STOOQ_LINE(1, 2));
      }
      if (url === YAHOO_BATCH) {
        return jsonRes({
          quoteResponse: {
            result: [
              ...(gspcYahoo.quoteResponse?.result ?? []),
              ...(btcYahoo.quoteResponse?.result ?? []),
            ],
          },
        });
      }
      if (url === YAHOO_GSPC) return jsonRes(gspcYahoo);
      if (url === YAHOO_BTC) return jsonRes(btcYahoo);
      if (url === YAHOO_NTDY) {
        return jsonRes({ quoteResponse: { result: [] } });
      }

      throw new Error(`unexpected: ${url}`);
    }) as typeof fetch;

    const snap = await fetchMarketSnapshot();
    expect(snap.sp500).toBe(100);
    expect(snap.bitcoin).toBe(50000);
    expect(snap.sp500Source).toBe("yahoo-daily");
    expect(snap.bitcoinSource).toBe("yahoo-daily");
    expect(snap.nintendo).toBeCloseTo(14.2, 4);
    expect(snap.nintendoPreviousClose).toBeCloseTo(14, 4);
    expect(snap.nintendoSource).toBe("adr");
  });

  it("path 1: Tokyo Yahoo 7974.T + Stooq USDJPY when NTDOY quote and ADR Stooq are empty", async () => {
    const gspcYahoo = {
      quoteResponse: {
        result: [
          {
            symbol: "^GSPC",
            regularMarketPrice: 100,
            regularMarketPreviousClose: 99,
            regularMarketChangePercent: 1,
          },
        ],
      },
    };
    const btcYahoo = {
      quoteResponse: {
        result: [
          {
            symbol: "BTC-USD",
            regularMarketPrice: 50000,
            regularMarketPreviousClose: 49000,
            regularMarketChangePercent: 2,
          },
        ],
      },
    };

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : (input as Request).url;

      if (url.includes("/v8/finance/chart/")) {
        if (url.includes("%5EGSPC")) return yahooChartClosesJson([99, 100]);
        if (url.includes("BTC-USD")) return yahooChartClosesJson([49000, 50000]);
        if (url.includes("NTDOY")) return yahooChartClosesJson([]);
        if (url.includes("7974.T")) return yahooChartClosesJson([10000, 10200]);
        return yahooChartClosesJson([]);
      }

      if (url.startsWith(STOOQ_SP500) || url.startsWith(STOOQ_BTC)) {
        return textRes(SAMPLE_STOOQ_LINE(1, 2));
      }
      if (url === YAHOO_BATCH) {
        return jsonRes({
          quoteResponse: {
            result: [
              ...(gspcYahoo.quoteResponse?.result ?? []),
              ...(btcYahoo.quoteResponse?.result ?? []),
            ],
          },
        });
      }
      if (url === YAHOO_GSPC) return jsonRes(gspcYahoo);
      if (url === YAHOO_BTC) return jsonRes(btcYahoo);
      if (url === YAHOO_NTDY) {
        return jsonRes({ quoteResponse: { result: [] } });
      }
      if (isStooqNtdy(url)) {
        return textRes("x");
      }
      if (isStooqUsdjpy(url)) {
        return textRes(
          "Symbol,Date,Time,Open,High,Low,Close,Volume\nUSDJPY,2025-03-20,00:00:00,149,151,148,150,1",
        );
      }
      if (isStooq7974JpDaily(url)) {
        return textRes("Date,Open,High,Low,Close,Volume\n2025-03-18,1,1,1,1,1\n2025-03-19,1,1,1,1,1");
      }

      throw new Error(`unexpected Tokyo test fetch: ${url}`);
    }) as typeof fetch;

    const snap = await fetchMarketSnapshot();
    expect(snap.nintendoSource).toBe("tokyo");
    expect(snap.nintendo).toBeCloseTo(10200 / 150, 6);
    expect(snap.nintendoPreviousClose).toBeCloseTo(10000 / 150, 6);
  });
});
