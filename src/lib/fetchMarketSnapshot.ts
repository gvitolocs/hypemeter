import {
  type MarketSnapshot,
  type YahooFinanceQuoteBundle,
  computeBitcoinCoinGeckoFallbackPath,
  computeBitcoinStooqFallbackPath,
  computeSp500Metrics,
  mergeParsedYahooQuotes,
  mergeYahooQuotes,
  parseStooqMetrics,
  parseYahooChartLastTwoCloses,
  parseYahooChartMetaQuote,
  type ParsedYahooQuote,
} from "@/lib/marketSnapshot";

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
      const r = await fetch(url, { next: { revalidate: 900 } });
      if (!r.ok) continue;
      const m = parseStooqMetrics(await r.text());
      if (m.close !== null) return m;
    } catch {
      /* try next */
    }
  }
  return { close: null, growthPct: null };
}

const YAHOO_ORIGIN = "https://finance.yahoo.com";

const yahooBrowserHeaders = () => ({
  "user-agent": YAHOO_FINANCE_UA,
  Referer: `${YAHOO_ORIGIN}/`,
  Origin: YAHOO_ORIGIN,
});

/** When v7 quote is empty (serverless), v8 chart meta/candles usually still match finance.yahoo.com. */
async function fetchYahooV8ChartQuote(symbol: string): Promise<ParsedYahooQuote | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
  try {
    const res = await fetch(url, {
      next: { revalidate: 120 },
      headers: {
        ...yahooBrowserHeaders(),
        Referer: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/`,
      },
    });
    if (!res.ok) return null;
    const json = await res.json();
    const fromMeta = parseYahooChartMetaQuote(json);
    if (fromMeta.price !== null) return fromMeta;
    const { last, prev } = parseYahooChartLastTwoCloses(json);
    if (last === null) return null;
    const growthPct =
      prev !== null && prev > 0 ? ((last - prev) / prev) * 100 : null;
    return { price: last, previousClose: prev, growthPct };
  } catch {
    return null;
  }
}

async function enrichYahooFromV8IfNeeded(
  merged: ParsedYahooQuote,
  symbol: string,
): Promise<ParsedYahooQuote> {
  if (merged.price !== null) return merged;
  const v8 = await fetchYahooV8ChartQuote(symbol);
  return v8 ? mergeParsedYahooQuotes(merged, v8) : merged;
}

async function fetchNintendoFromYahooChart(): Promise<{
  price: number | null;
  previousClose: number | null;
  growthPct: number | null;
}> {
  try {
    const res = await fetch(YAHOO_CHART_NTDY_URL, {
      next: { revalidate: 900 },
      headers: {
        ...yahooBrowserHeaders(),
        Referer: "https://finance.yahoo.com/quote/NTDOY/",
      },
    });
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
      fetch(STOOQ_SP500_URL, { next: { revalidate: 900 } }),
      fetch(STOOQ_BTC_URL, { next: { revalidate: 900 } }),
      fetch(MARKET_QUOTES_URL, {
        next: { revalidate: 300 },
        headers: yahooBrowserHeaders(),
      }),
      fetch(YAHOO_QUOTE_GSPC_ONLY, {
        next: { revalidate: 300 },
        headers: yahooBrowserHeaders(),
      }),
      fetch(YAHOO_QUOTE_BTC_ONLY, {
        next: { revalidate: 300 },
        headers: yahooBrowserHeaders(),
      }),
      fetch(YAHOO_QUOTE_NTDY_ONLY, {
        next: { revalidate: 300 },
        headers: yahooBrowserHeaders(),
      }),
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
    const [yahooGsEn, yahooBtcEn, yahooNtdyEn] = await Promise.all([
      enrichYahooFromV8IfNeeded(yahooGs, "^GSPC"),
      enrichYahooFromV8IfNeeded(yahooBtc, "BTC-USD"),
      enrichYahooFromV8IfNeeded(yahooNtdy, "NTDOY"),
    ]);
    const { sp500, sp500GrowthPct } = computeSp500Metrics(yahooGsEn, spx);
    const { bitcoin, bitcoinGrowthPct } = computeBitcoinStooqFallbackPath(yahooBtcEn, btc);
    let nintendo = yahooNtdyEn.price;
    let nintendoGrowthPct = yahooNtdyEn.growthPct;
    let nintendoPreviousClose = yahooNtdyEn.previousClose;
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
      return {
        sp500,
        bitcoin,
        nintendo,
        nintendoPreviousClose,
        sp500GrowthPct,
        bitcoinGrowthPct,
        nintendoGrowthPct,
        updatedAt: stamp(),
      };
    }
  } catch {
    // fallback below
  }

  try {
    const [spRes, btcRes, yahooBatchRes, gsRes, btcDedRes, ntdyRes] = await Promise.all([
      fetch(STOOQ_SP500_URL, { next: { revalidate: 900 } }),
      fetch(COINGECKO_BTC_URL, { next: { revalidate: 300 } }),
      fetch(MARKET_QUOTES_URL, {
        next: { revalidate: 300 },
        headers: yahooBrowserHeaders(),
      }),
      fetch(YAHOO_QUOTE_GSPC_ONLY, {
        next: { revalidate: 300 },
        headers: yahooBrowserHeaders(),
      }),
      fetch(YAHOO_QUOTE_BTC_ONLY, {
        next: { revalidate: 300 },
        headers: yahooBrowserHeaders(),
      }),
      fetch(YAHOO_QUOTE_NTDY_ONLY, {
        next: { revalidate: 300 },
        headers: yahooBrowserHeaders(),
      }),
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
    const [yahooGsEn, yahooBtcEn, yahooNtdyEn] = await Promise.all([
      enrichYahooFromV8IfNeeded(yahooGs, "^GSPC"),
      enrichYahooFromV8IfNeeded(yahooBtc, "BTC-USD"),
      enrichYahooFromV8IfNeeded(yahooNtdy, "NTDOY"),
    ]);
    const spx = parseStooqMetrics(spText);
    const { sp500, sp500GrowthPct } = computeSp500Metrics(yahooGsEn, spx);
    const { bitcoin, bitcoinGrowthPct } = computeBitcoinCoinGeckoFallbackPath(
      yahooBtcEn,
      btcData.bitcoin?.usd,
    );
    let nintendo = yahooNtdyEn.price;
    let nintendoGrowthPct = yahooNtdyEn.growthPct;
    let nintendoPreviousClose = yahooNtdyEn.previousClose;
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
      return {
        sp500,
        bitcoin,
        nintendo,
        nintendoPreviousClose,
        sp500GrowthPct,
        bitcoinGrowthPct,
        nintendoGrowthPct,
        updatedAt: stamp(),
      };
    }
  } catch {
    // final fallback below
  }

  return fallback;
}
