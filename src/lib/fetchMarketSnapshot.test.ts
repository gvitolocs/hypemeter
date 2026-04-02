import { afterEach, describe, expect, it, vi } from "vitest";
import { STOOQ_QUOTE_FETCH, fetchMarketSnapshot } from "./fetchMarketSnapshot";

const STOOQ_SP500 = "https://stooq.com/q/l/?s=%5Espx&i=d";
const STOOQ_BTC = "https://stooq.com/q/l/?s=btcusd&i=d";
const isStooqNtdy = (url: string) => url.includes("stooq.com") && url.includes("ntdoy");
const isStooqUsdjpy = (url: string) => url.includes("stooq.com") && url.includes("usdjpy");
const isStooq7974JpDaily = (url: string) =>
  url.includes("stooq.com") && url.includes("7974.jp") && url.includes("/q/d/l/");
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

describe("fetchMarketSnapshot (integration, mocked fetch — Stooq-first)", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("path 1: Stooq daily CSV last-two fills S&P, BTC, NTDOY ADR", async () => {
    const spxClose = 6506.48;
    const spxPrev = 6606.49;
    const btcClose = 68800;
    const btcPrev = 70000;
    const ntClose = 14.5;
    const ntPrev = 14.2;

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : (input as Request).url;

      if (url.includes("q/d/l") && url.includes("%5Espx")) {
        return textRes(`Date,Open,High,Low,Close,Volume
2025-03-18,1,1,1,${spxPrev},1
2025-03-19,1,1,1,${spxClose},1`);
      }
      if (url.includes("q/d/l") && url.includes("btcusd")) {
        return textRes(`Date,Open,High,Low,Close,Volume
2025-03-18,1,1,1,${btcPrev},1
2025-03-19,1,1,1,${btcClose},1`);
      }
      if (url.includes("q/d/l") && url.includes("ntdoy.us")) {
        return textRes(`Date,Open,High,Low,Close,Volume
2025-03-18,1,1,1,${ntPrev},1
2025-03-19,1,1,1,${ntClose},1`);
      }
      if (url.startsWith(STOOQ_SP500)) {
        return textRes(SAMPLE_STOOQ_LINE(9999, 10000));
      }
      if (url.startsWith(STOOQ_BTC)) {
        return textRes(SAMPLE_STOOQ_LINE(1, 2));
      }

      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch;

    const snap = await fetchMarketSnapshot();

    expect(snap.sp500).toBe(spxClose);
    expect(snap.sp500GrowthPct).toBeCloseTo(((spxClose - spxPrev) / spxPrev) * 100, 4);
    expect(snap.bitcoin).toBe(btcClose);
    expect(snap.bitcoinGrowthPct).toBeCloseTo(((btcClose - btcPrev) / btcPrev) * 100, 4);
    expect(snap.nintendo).toBe(ntClose);
    expect(snap.nintendoPreviousClose).toBe(ntPrev);
    expect(snap.nintendoSource).toBe("adr");
    expect(snap.sp500Source).toBe("stooq-daily");
    expect(snap.bitcoinSource).toBe("stooq-daily");
    expect(snap.updatedAt).toMatch(/\d{4}/);
  });

  it("uses cache: no-store on Stooq fetches", async () => {
    const daily = `Date,Open,High,Low,Close,Volume
2025-03-18,1,1,1,100,1
2025-03-19,1,1,1,101,1`;

    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.includes("q/d/l") && (url.includes("%5Espx") || url.includes("btcusd") || url.includes("ntdoy"))) {
        return textRes(daily);
      }
      if (url.startsWith(STOOQ_SP500) || url.startsWith(STOOQ_BTC)) {
        return textRes(SAMPLE_STOOQ_LINE(1, 2));
      }
      throw new Error(`unexpected: ${url}`);
    }) as typeof fetch;

    globalThis.fetch = fetchSpy;
    await fetchMarketSnapshot();

    const ua = (STOOQ_QUOTE_FETCH.headers as Record<string, string>)["user-agent"];
    const stooqCalls = fetchSpy.mock.calls.filter((c) => String(c[0]).includes("stooq.com"));
    for (const [, init] of stooqCalls) {
      expect(init?.cache).toBe("no-store");
      expect((init?.headers as Record<string, string>)?.["user-agent"]).toBe(ua);
    }
  });

  it("path 2: when path 1 throws, CoinGecko + Stooq still produce a snapshot", async () => {
    let call = 0;
    const spxClose = 6500;
    const spxPrev = 6600;
    const btcClose = 68000;
    const btcPrev = 69000;

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      call += 1;
      const url = typeof input === "string" ? input : (input as Request).url;

      if (call <= 2) {
        throw new Error("simulated path-1 failure");
      }

      if (url.includes("q/d/l") && url.includes("%5Espx")) {
        return textRes(`Date,Open,High,Low,Close,Volume
2025-03-18,1,1,1,${spxPrev},1
2025-03-19,1,1,1,${spxClose},1`);
      }
      if (url.includes("q/d/l") && url.includes("btcusd")) {
        return textRes(`Date,Open,High,Low,Close,Volume
2025-03-18,1,1,1,${btcPrev},1
2025-03-19,1,1,1,${btcClose},1`);
      }
      if (url.includes("q/d/l") && url.includes("ntdoy.us")) {
        return textRes(`Date,Open,High,Low,Close,Volume
2025-03-18,1,1,1,14,1
2025-03-19,1,1,1,14.5,1`);
      }
      if (url.startsWith(STOOQ_SP500) || url.startsWith(STOOQ_BTC)) {
        return textRes(SAMPLE_STOOQ_LINE(1, 2));
      }
      if (url.startsWith(COINGECKO_BTC)) {
        return jsonRes({ bitcoin: { usd: 68000 } });
      }

      throw new Error(`unexpected path-2 fetch: ${url} call=${call}`);
    }) as typeof fetch;

    const snap = await fetchMarketSnapshot();
    expect(snap.sp500).toBe(spxClose);
    expect(snap.bitcoin).toBe(btcClose);
    expect(snap.sp500Source).toBe("stooq-daily");
    expect(snap.bitcoinSource).toBe("stooq-daily");
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

  it("Tokyo: Stooq 7974.jp daily + USDJPY when NTDOY ADR daily and lines are empty", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : (input as Request).url;

      if (url.includes("q/d/l") && url.includes("%5Espx")) {
        return textRes(`Date,Open,High,Low,Close,Volume
2025-03-18,1,1,1,99,1
2025-03-19,1,1,1,100,1`);
      }
      if (url.includes("q/d/l") && url.includes("btcusd")) {
        return textRes(`Date,Open,High,Low,Close,Volume
2025-03-18,1,1,1,49000,1
2025-03-19,1,1,1,50000,1`);
      }
      if (url.includes("q/d/l") && url.includes("ntdoy.us")) {
        return textRes("");
      }
      if (url.includes("q/d/l") && url.includes("ntdoy") && !url.includes("ntdoy.us")) {
        return textRes("");
      }
      if (url.startsWith(STOOQ_SP500) || url.startsWith(STOOQ_BTC)) {
        return textRes("");
      }
      if (isStooqNtdy(url)) {
        return textRes("");
      }
      if (isStooqUsdjpy(url)) {
        return textRes(
          "Symbol,Date,Time,Open,High,Low,Close,Volume\nUSDJPY,2025-03-20,00:00:00,149,151,148,150,1",
        );
      }
      if (isStooq7974JpDaily(url)) {
        return textRes(`Date,Open,High,Low,Close,Volume
2025-03-18,1,1,1,10000,1
2025-03-19,1,1,1,10200,1`);
      }

      throw new Error(`unexpected Tokyo test fetch: ${url}`);
    }) as typeof fetch;

    const snap = await fetchMarketSnapshot();
    expect(snap.nintendoSource).toBe("tokyo");
    expect(snap.nintendo).toBeCloseTo(10200 / 150, 6);
    expect(snap.nintendoPreviousClose).toBeCloseTo(10000 / 150, 6);
  });

  it("ADR line fallback derives absolute change when daily previous-close path is unavailable", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : (input as Request).url;

      if (url.includes("q/d/l") && url.includes("%5Espx")) {
        return textRes(`Date,Open,High,Low,Close,Volume
2025-03-18,1,1,1,99,1
2025-03-19,1,1,1,100,1`);
      }
      if (url.includes("q/d/l") && url.includes("btcusd")) {
        return textRes(`Date,Open,High,Low,Close,Volume
2025-03-18,1,1,1,49000,1
2025-03-19,1,1,1,50000,1`);
      }
      if (url.includes("q/d/l") && (url.includes("ntdoy.us") || url.includes("ntdoy"))) {
        return textRes("");
      }
      if (url.startsWith(STOOQ_SP500) || url.startsWith(STOOQ_BTC)) {
        return textRes("");
      }
      if (url.includes("q/l/?s=ntdoy.us")) {
        return textRes("NTDOY.US,20260401,215900,14.00,14.44,14.2,14.22,244159,");
      }
      if (url.includes("q/d/l") && url.includes("7974.jp")) {
        return textRes("");
      }
      if (url.includes("q/l/?s=usdjpy")) {
        return textRes("");
      }
      throw new Error(`unexpected ADR fallback fetch: ${url}`);
    }) as typeof fetch;

    const snap = await fetchMarketSnapshot();
    expect(snap.nintendoSource).toBe("adr");
    expect(snap.nintendo).toBe(14.22);
    expect(snap.nintendoPreviousClose).toBeNull();
    expect(snap.nintendoChangeCurrency).toBe("USD");
    expect(snap.nintendoChangeAbs).not.toBeNull();
  });

  it("uses Yahoo chart fallback for S&P500 and Nintendo when Stooq daily paths are empty", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : (input as Request).url;

      if (url.includes("query1.finance.yahoo.com/v8/finance/chart/") && url.includes("GSPC")) {
        return jsonRes({
          chart: {
            result: [
              {
                indicators: { quote: [{ close: [6500, 6571.1] }] },
              },
            ],
          },
        });
      }
      if (url.includes("query1.finance.yahoo.com/v8/finance/chart/NTDOY")) {
        return jsonRes({
          chart: {
            result: [
              {
                indicators: { quote: [{ close: [14.44, 14.22] }] },
              },
            ],
          },
        });
      }
      if (url.includes("q/d/l") && (url.includes("%5Espx") || url.includes("btcusd") || url.includes("ntdoy"))) {
        return textRes("");
      }
      if (url.startsWith(STOOQ_SP500)) {
        return textRes("");
      }
      if (url.startsWith(STOOQ_BTC)) {
        return textRes("BTCUSD,20260402,171032,49000,50000,48000,50000,,");
      }
      if (url.includes("q/l/?s=ntdoy.us")) {
        return textRes("");
      }
      if (url.includes("q/d/l") && url.includes("7974.jp")) {
        return textRes("");
      }
      if (url.includes("q/l/?s=usdjpy")) {
        return textRes("");
      }
      throw new Error(`unexpected yahoo fallback fetch: ${url}`);
    }) as typeof fetch;

    const snap = await fetchMarketSnapshot();
    expect(snap.sp500).toBe(6571.1);
    expect(snap.sp500Source).toBe("yahoo");
    expect(snap.nintendo).toBe(14.22);
    expect(snap.nintendoPreviousClose).toBe(14.44);
    expect(snap.nintendoSource).toBe("adr");
  });
});
