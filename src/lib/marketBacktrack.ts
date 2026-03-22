/**
 * Yearly Yahoo Finance monthly closes → normalized 0–100 series for the hype chart overlay.
 */

const YAHOO_CHART_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const yahooChartHeaders = (symbol: string) => ({
  "user-agent": YAHOO_CHART_UA,
  Referer: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/`,
  Origin: "https://finance.yahoo.com",
});

export type MarketHighlightKey = "sp500" | "btc" | "nintendo";

export type MarketYearlyOverlay = {
  sp500: number[];
  btc: number[];
  nintendo: number[];
};

type YearlyCloseMap = Map<number, number>;

async function fetchYahooYearlyCloses(symbol: string): Promise<YearlyCloseMap> {
  const map: YearlyCloseMap = new Map();
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1mo&range=max`;
    const res = await fetch(url, {
      next: { revalidate: 3600 },
      headers: yahooChartHeaders(symbol),
    });
    if (!res.ok) return map;
    const json = (await res.json()) as {
      chart?: {
        result?: Array<{
          timestamp?: number[];
          indicators?: { quote?: Array<{ close?: Array<number | null> }> };
        }>;
      };
    };
    const result = json.chart?.result?.[0];
    const ts = result?.timestamp;
    const closes = result?.indicators?.quote?.[0]?.close;
    if (!ts?.length || !closes?.length) return map;

    const byYear = new Map<number, { t: number; c: number }>();
    for (let i = 0; i < ts.length; i++) {
      const c = closes[i];
      if (c == null || Number.isNaN(Number(c))) continue;
      const y = new Date(ts[i] * 1000).getFullYear();
      const prev = byYear.get(y);
      if (!prev || ts[i] > prev.t) byYear.set(y, { t: ts[i], c: Number(c) });
    }
    for (const [y, v] of byYear) map.set(y, v.c);
  } catch {
    // leave empty
  }
  return map;
}

/** Pre-first datapoint = first known close (flat line), then forward-fill. No data → null (skip drawing). */
function alignYearSeries(years: number[], yearly: YearlyCloseMap): number[] | null {
  const raw = years.map((y) => yearly.get(y) ?? null);
  const firstIdx = raw.findIndex((v) => v != null);
  if (firstIdx === -1) return null;
  const firstVal = raw[firstIdx]!;
  let last = firstVal;
  return raw.map((v, i) => {
    if (v != null) last = v;
    return i < firstIdx ? firstVal : last;
  });
}

function normalizeTo100(values: number[]): number[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return values.map((v) => ((v - min) / span) * 100);
}

/** Parallel fetch + per-asset normalization (same Y scale as hype 0–100). */
export async function fetchMarketYearlyOverlay(years: number[]): Promise<MarketYearlyOverlay> {
  if (years.length === 0) {
    return { sp500: [], btc: [], nintendo: [] };
  }
  const [spMap, btcMap, ntMap] = await Promise.all([
    fetchYahooYearlyCloses("^GSPC"),
    fetchYahooYearlyCloses("BTC-USD"),
    fetchYahooYearlyCloses("NTDOY"),
  ]);
  const spAligned = alignYearSeries(years, spMap);
  const btcAligned = alignYearSeries(years, btcMap);
  const ntAligned = alignYearSeries(years, ntMap);
  return {
    sp500: spAligned === null ? [] : normalizeTo100(spAligned),
    btc: btcAligned === null ? [] : normalizeTo100(btcAligned),
    nintendo: ntAligned === null ? [] : normalizeTo100(ntAligned),
  };
}
