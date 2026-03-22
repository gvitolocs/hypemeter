import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchMarketYearlyOverlay } from "@/lib/marketBacktrack";

/**
 * Integration-style tests: mock global fetch with Yahoo Finance v8 chart JSON shapes.
 * Ensures overlay arrays always match history length (client chart expects length === n).
 */

function jsonRes(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/** Minimal v8 chart payload: monthly timestamps + closes (one bar per year for tests). */
function yahooV8MonthlyChart(
  closes: number[],
  startYear: number,
): {
  chart: {
    result: Array<{
      timestamp: number[];
      indicators: { quote: Array<{ close: Array<number | null> }> };
    }>;
  };
} {
  const timestamp = closes.map((_, i) => {
    const d = new Date(Date.UTC(startYear + i, 6, 15));
    return Math.floor(d.getTime() / 1000);
  });
  return {
    chart: {
      result: [
        {
          timestamp,
          indicators: {
            quote: [{ close: closes.map((c) => c) }],
          },
        },
      ],
    },
  };
}

describe("fetchMarketYearlyOverlay (mocked Yahoo v8 chart API)", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns three series with same length as years[] when Yahoo returns monthly data", async () => {
    const years: number[] = [];
    for (let y = 2005; y <= 2026; y += 1) years.push(y);
    const n = years.length;

    const gspcCloses = years.map((_, i) => 1000 + i * 50);
    const btcCloses = years.map((_, i) => 100 + i * 10);
    const ntdyCloses = years.map((_, i) => 10 + i * 0.2);

    const wbInflation = years.map((y) => ({
      date: String(y),
      value: 2 + (y % 7) * 0.15,
    }));

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("%5EGSPC") && url.includes("interval=1mo")) {
        return jsonRes(yahooV8MonthlyChart(gspcCloses, 2005));
      }
      if (url.includes("BTC-USD") && url.includes("interval=1mo")) {
        return jsonRes(yahooV8MonthlyChart(btcCloses, 2005));
      }
      if (url.includes("NTDOY") && url.includes("interval=1mo")) {
        return jsonRes(yahooV8MonthlyChart(ntdyCloses, 2005));
      }
      if (url.includes("worldbank.org") && url.includes("FP.CPI.TOTL.ZG")) {
        return jsonRes([{}, wbInflation]);
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;

    const overlay = await fetchMarketYearlyOverlay(years);

    expect(overlay.sp500.length).toBe(n);
    expect(overlay.btc.length).toBe(n);
    expect(overlay.nintendo.length).toBe(n);
    expect(overlay.inflation.length).toBe(n);
    expect(overlay.inflationYoY.length).toBe(n);
    expect(overlay.sp500.every((v) => typeof v === "number" && !Number.isNaN(v))).toBe(true);
    expect(overlay.btc.every((v) => typeof v === "number" && !Number.isNaN(v))).toBe(true);
    expect(overlay.nintendo.every((v) => typeof v === "number" && !Number.isNaN(v))).toBe(true);
    expect(overlay.inflation.every((v) => typeof v === "number" && !Number.isNaN(v))).toBe(true);
  });

  it("still returns length-matched placeholder series when Yahoo returns empty (flat mid-chart)", async () => {
    const years = [2020, 2021, 2022];
    const n = years.length;

    globalThis.fetch = vi.fn(async () => new Response("{}", { status: 200 })) as typeof fetch;

    const overlay = await fetchMarketYearlyOverlay(years);

    expect(overlay.sp500.length).toBe(n);
    expect(overlay.btc.length).toBe(n);
    expect(overlay.nintendo.length).toBe(n);
    expect(overlay.inflation.length).toBe(n);
    expect(overlay.inflationYoY.length).toBe(n);
  });
});
