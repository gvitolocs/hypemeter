import {
  type MarketSnapshot,
  type YahooFinanceQuoteBundle,
  computeBitcoinCoinGeckoFallbackPath,
  computeBitcoinStooqFallbackPath,
  computeSp500Metrics,
  mergeYahooQuotes,
  parseStooqMetrics,
  parseYahooChartLastTwoCloses,
} from "@/lib/marketSnapshot";
import { applyMarketSnapshotFallback } from "@/lib/marketSnapshotFallback";

const MARKET_QUOTES_URL =
  "https://query1.finance.yahoo.com/v7/finance/quote?symbols=%5EGSPC,BTC-USD,NTDOY";
/** Dedicated quotes (same v7 feed as Yahoo Finance quote pages — batch can omit fields). */
const YAHOO_QUOTE_GSPC_ONLY =
  "https://query1.finance.yahoo.com/v7/finance/quote?symbols=%5EGSPC";
const YAHOO_QUOTE_BTC_ONLY =
  "https://query1.finance.yahoo.com/v7/finance/quote?symbols=BTC-USD";
const YAHOO_QUOTE_NTDY_ONLY =
  "https://query1.finance.yahoo.com/v7/finance/quote?symbols=NTDOY";
/** Browser-like UA avoids empty quoteResponse for some Yahoo symbols. */
const YAHOO_FINANCE_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/**
 * Bypass Next.js Data Cache for market quotes. `next: { revalidate: N }` was caching Yahoo/Stooq
 * responses for minutes → sidecar showed stale prices vs finance.yahoo.com.
 */
/** Exported for tests — must stay `cache: "no-store"` so quotes match Yahoo Finance. */
export const YAHOO_QUOTE_FETCH: RequestInit = {
  cache: "no-store",
  headers: { "user-agent": YAHOO_FINANCE_UA },
};
export const STOOQ_QUOTE_FETCH: RequestInit = {
  cache: "no-store",
  headers: { "user-agent": YAHOO_FINANCE_UA },
};
export const COINGECKO_FETCH: RequestInit = { cache: "no-store" };
const STOOQ_SP500_URL = "https://stooq.com/q/l/?s=%5Espx&i=d";
const STOOQ_BTC_URL = "https://stooq.com/q/l/?s=btcusd&i=d";
/** Stooq line for Nintendo ADR — try US suffix then plain symbol (Stooq naming varies). */
const STOOQ_NTDY_URLS = [
  "https://stooq.com/q/l/?s=ntdoy.us&i=d",
  "https://stooq.com/q/l/?s=ntdoy&i=d",
] as const;
const YAHOO_CHART_NTDY_URL =
  "https://query1.finance.yahoo.com/v8/finance/chart/NTDOY?interval=1d&range=1y";
const COINGECKO_BTC_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd";

async function fetchStooqNtdyMetrics(): Promise<{ close: number | null; growthPct: number | null }> {
  for (const url of STOOQ_NTDY_URLS) {
    try {
      const r = await fetch(url, STOOQ_QUOTE_FETCH);
      if (!r.ok) continue;
      const m = parseStooqMetrics(await r.text());
      if (m.close !== null) return m;
    } catch {
      /* try next */
    }
  }
  return { close: null, growthPct: null };
}

async function fetchNintendoFromYahooChart(): Promise<{
  price: number | null;
  previousClose: number | null;
  growthPct: number | null;
}> {
  try {
    const res = await fetch(YAHOO_CHART_NTDY_URL, YAHOO_QUOTE_FETCH);
    if (!res.ok) return { price: null, previousClose: null, growthPct: null };
    const json = await res.json();
    const { last, prev } = parseYahooChartLastTwoCloses(json);
    if (last === null) return { price: null, previousClose: null, growthPct: null };
    const growthPct =
      prev !== null && prev > 0 ? ((last - prev) / prev) * 100 : null;
    return { price: last, previousClose: prev, growthPct };
  } catch {
    return { price: null, previousClose: null, growthPct: null };
  }
}

// Fetch live S&P 500 + BTC + Nintendo ADR (NTDOY). Yahoo v7 quote first (matches Yahoo Finance pages); Stooq/CoinGecko fallback.
export async function fetchMarketSnapshot(): Promise<MarketSnapshot> {
  const fallback: MarketSnapshot = {
    sp500: null,
    bitcoin: null,
    nintendo: null,
    nintendoPreviousClose: null,
    sp500GrowthPct: null,
    bitcoinGrowthPct: null,
    nintendoGrowthPct: null,
    updatedAt: null,
  };

  const stamp = () =>
    new Date().toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    });

  try {
    const [spRes, btcRes, yahooBatchRes, gsRes, btcDedRes, ntdyRes] = await Promise.all([
      fetch(STOOQ_SP500_URL, STOOQ_QUOTE_FETCH),
      fetch(STOOQ_BTC_URL, STOOQ_QUOTE_FETCH),
      fetch(MARKET_QUOTES_URL, YAHOO_QUOTE_FETCH),
      fetch(YAHOO_QUOTE_GSPC_ONLY, YAHOO_QUOTE_FETCH),
      fetch(YAHOO_QUOTE_BTC_ONLY, YAHOO_QUOTE_FETCH),
      fetch(YAHOO_QUOTE_NTDY_ONLY, YAHOO_QUOTE_FETCH),
    ]);
    const spx = spRes.ok ? parseStooqMetrics(await spRes.text()) : { close: null, growthPct: null };
    const btc = btcRes.ok ? parseStooqMetrics(await btcRes.text()) : { close: null, growthPct: null };
    const yahooData = yahooBatchRes.ok
      ? ((await yahooBatchRes.json()) as YahooFinanceQuoteBundle)
      : {};
    const gsJson = gsRes.ok ? ((await gsRes.json()) as YahooFinanceQuoteBundle) : {};
    const btcJson = btcDedRes.ok ? ((await btcDedRes.json()) as YahooFinanceQuoteBundle) : {};
    const ntdyJson = ntdyRes.ok ? ((await ntdyRes.json()) as YahooFinanceQuoteBundle) : {};
    const yahooGs = mergeYahooQuotes(gsJson, yahooData, "^GSPC");
    const yahooBtc = mergeYahooQuotes(btcJson, yahooData, "BTC-USD");
    const yahooNtdy = mergeYahooQuotes(ntdyJson, yahooData, "NTDOY");
    const { sp500, sp500GrowthPct } = computeSp500Metrics(yahooGs, spx);
    const { bitcoin, bitcoinGrowthPct } = computeBitcoinStooqFallbackPath(yahooBtc, btc);
    let nintendo = yahooNtdy.price;
    let nintendoGrowthPct = yahooNtdy.growthPct;
    let nintendoPreviousClose = yahooNtdy.previousClose;
    if (nintendo === null) {
      const ntd = await fetchStooqNtdyMetrics();
      nintendo = ntd.close;
      nintendoGrowthPct = ntd.growthPct;
    }
    if (nintendo === null || nintendoGrowthPct === null || nintendoPreviousClose === null) {
      const chart = await fetchNintendoFromYahooChart();
      if (chart.price !== null) {
        if (nintendo === null) nintendo = chart.price;
        if (nintendoPreviousClose === null) nintendoPreviousClose = chart.previousClose;
        if (nintendoGrowthPct === null && chart.growthPct !== null) nintendoGrowthPct = chart.growthPct;
      }
    }
    if (sp500 !== null && bitcoin !== null) {
      return applyMarketSnapshotFallback({
        sp500,
        bitcoin,
        nintendo,
        nintendoPreviousClose,
        sp500GrowthPct,
        bitcoinGrowthPct,
        nintendoGrowthPct,
        updatedAt: stamp(),
      });
    }
  } catch {
    // fallback below
  }

  try {
    const [spRes, btcRes, yahooBatchRes, gsRes, btcDedRes, ntdyRes] = await Promise.all([
      fetch(STOOQ_SP500_URL, STOOQ_QUOTE_FETCH),
      fetch(COINGECKO_BTC_URL, COINGECKO_FETCH),
      fetch(MARKET_QUOTES_URL, YAHOO_QUOTE_FETCH),
      fetch(YAHOO_QUOTE_GSPC_ONLY, YAHOO_QUOTE_FETCH),
      fetch(YAHOO_QUOTE_BTC_ONLY, YAHOO_QUOTE_FETCH),
      fetch(YAHOO_QUOTE_NTDY_ONLY, YAHOO_QUOTE_FETCH),
    ]);
    const spText = spRes.ok ? await spRes.text() : "";
    const btcData = btcRes.ok
      ? ((await btcRes.json()) as { bitcoin?: { usd?: number } })
      : {};
    const yahooData = yahooBatchRes.ok
      ? ((await yahooBatchRes.json()) as YahooFinanceQuoteBundle)
      : {};
    const gsJson = gsRes.ok ? ((await gsRes.json()) as YahooFinanceQuoteBundle) : {};
    const btcJson = btcDedRes.ok ? ((await btcDedRes.json()) as YahooFinanceQuoteBundle) : {};
    const ntdyJson = ntdyRes.ok ? ((await ntdyRes.json()) as YahooFinanceQuoteBundle) : {};
    const yahooGs = mergeYahooQuotes(gsJson, yahooData, "^GSPC");
    const yahooBtc = mergeYahooQuotes(btcJson, yahooData, "BTC-USD");
    const yahooNtdy = mergeYahooQuotes(ntdyJson, yahooData, "NTDOY");
    const spx = parseStooqMetrics(spText);
    const { sp500, sp500GrowthPct } = computeSp500Metrics(yahooGs, spx);
    const { bitcoin, bitcoinGrowthPct } = computeBitcoinCoinGeckoFallbackPath(
      yahooBtc,
      btcData.bitcoin?.usd,
    );
    let nintendo = yahooNtdy.price;
    let nintendoGrowthPct = yahooNtdy.growthPct;
    let nintendoPreviousClose = yahooNtdy.previousClose;
    if (nintendo === null) {
      const ntd = await fetchStooqNtdyMetrics();
      nintendo = ntd.close;
      nintendoGrowthPct = ntd.growthPct;
    }
    if (nintendo === null || nintendoGrowthPct === null || nintendoPreviousClose === null) {
      const chart = await fetchNintendoFromYahooChart();
      if (chart.price !== null) {
        if (nintendo === null) nintendo = chart.price;
        if (nintendoPreviousClose === null) nintendoPreviousClose = chart.previousClose;
        if (nintendoGrowthPct === null && chart.growthPct !== null) nintendoGrowthPct = chart.growthPct;
      }
    }
    if (sp500 !== null && bitcoin !== null) {
      return applyMarketSnapshotFallback({
        sp500,
        bitcoin,
        nintendo,
        nintendoPreviousClose,
        sp500GrowthPct,
        bitcoinGrowthPct,
        nintendoGrowthPct,
        updatedAt: stamp(),
      });
    }
  } catch {
    // final fallback below
  }

  return applyMarketSnapshotFallback(fallback);
}
