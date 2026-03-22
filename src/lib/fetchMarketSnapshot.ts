import {
  type BitcoinQuoteSource,
  type MarketSnapshot,
  type Sp500QuoteSource,
  type YahooFinanceQuoteBundle,
  type ParsedYahooQuote,
  computeBitcoinCoinGeckoFallbackPath,
  computeBitcoinStooqFallbackPath,
  computeSp500Metrics,
  jpyPairToUsdApprox,
  mergeYahooQuotes,
  parseStooqDailyDlLastTwoCloses,
  parseStooqMetrics,
  parseYahooChartLastTwoCloses,
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

/**
 * Bypass Next.js Data Cache for market quotes. `next: { revalidate: N }` was caching Yahoo/Stooq
 * responses for minutes → sidecar showed stale prices vs finance.yahoo.com.
 */
const QUOTE_HEADERS = {
  "user-agent": YAHOO_FINANCE_UA,
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
} as const;

/** Exported for tests — must stay `cache: "no-store"` so quotes match Yahoo Finance. */
export const YAHOO_QUOTE_FETCH: RequestInit = {
  cache: "no-store",
  headers: { ...QUOTE_HEADERS },
};
export const STOOQ_QUOTE_FETCH: RequestInit = {
  cache: "no-store",
  headers: { ...QUOTE_HEADERS },
};
export const COINGECKO_FETCH: RequestInit = {
  cache: "no-store",
  headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
};
/** Public REST — last 2 daily candles (close = index 4). */
const BINANCE_BTC_KLINES_URL =
  "https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=2";

const STOOQ_SP500_URL = "https://stooq.com/q/l/?s=%5Espx&i=d";
const STOOQ_BTC_URL = "https://stooq.com/q/l/?s=btcusd&i=d";
/** Stooq line for Nintendo ADR — try US suffix then plain symbol (Stooq naming varies). */
const STOOQ_NTDY_URLS = [
  "https://stooq.com/q/l/?s=ntdoy.us&i=d",
  "https://stooq.com/q/l/?s=ntdoy&i=d",
] as const;
/**
 * Yahoo Finance v8 daily candles — same interval as the Yahoo quote page (1d bars, prev close = prior bar).
 * Short range first (fast), then 1y if not enough bars (illiquid names).
 */
export function yahooChartDailyUrl(
  symbol: string,
  range: "14d" | "30d" | "1y" = "14d",
): string {
  return `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${range}`;
}
/** Stooq spot USD/JPY (JPY per 1 USD) for converting Tokyo listings to USD. */
const STOOQ_USDJPY_L = "https://stooq.com/q/l/?s=usdjpy&i=d";
const COINGECKO_BTC_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd";

function buildStooqDailyUrl(symbol: string): string {
  const d2 = new Date();
  const d1 = new Date();
  d1.setFullYear(d1.getFullYear() - 1);
  const fmt = (d: Date) =>
    `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `https://stooq.com/q/d/l/?s=${encodeURIComponent(symbol)}&i=d&d1=${fmt(d1)}&d2=${fmt(d2)}`;
}

function buildStooqSpxDailyUrl(): string {
  return buildStooqDailyUrl("^spx");
}

function buildStooq7974JpDailyUrl(): string {
  return buildStooqDailyUrl("7974.jp");
}

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

async function fetchUsdJpyFromStooq(): Promise<number | null> {
  try {
    const res = await fetch(STOOQ_USDJPY_L, STOOQ_QUOTE_FETCH);
    if (!res.ok) return null;
    const m = parseStooqMetrics(await res.text());
    return m.close;
  } catch {
    return null;
  }
}

async function fetchYahooChartLastTwoMetrics(chartUrl: string): Promise<{
  price: number | null;
  previousClose: number | null;
  growthPct: number | null;
}> {
  try {
    const res = await fetch(chartUrl, YAHOO_QUOTE_FETCH);
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

async function fetchSp500StooqDailyLastTwo(): Promise<{
  price: number;
  previousClose: number;
  growthPct: number;
} | null> {
  try {
    const res = await fetch(buildStooqSpxDailyUrl(), STOOQ_QUOTE_FETCH);
    if (!res.ok) return null;
    const two = parseStooqDailyDlLastTwoCloses(await res.text());
    if (!two) return null;
    return {
      price: two.last,
      previousClose: two.prev,
      growthPct: ((two.last - two.prev) / two.prev) * 100,
    };
  } catch {
    return null;
  }
}

async function fetchBitcoinStooqDailyLastTwo(): Promise<{
  price: number;
  previousClose: number;
  growthPct: number;
} | null> {
  try {
    const res = await fetch(buildStooqDailyUrl("btcusd"), STOOQ_QUOTE_FETCH);
    if (!res.ok) return null;
    const two = parseStooqDailyDlLastTwoCloses(await res.text());
    if (!two) return null;
    return {
      price: two.last,
      previousClose: two.prev,
      growthPct: ((two.last - two.prev) / two.prev) * 100,
    };
  } catch {
    return null;
  }
}

async function fetchYahooDailyTwoCloses(symbol: string): Promise<{
  price: number | null;
  previousClose: number | null;
  growthPct: number | null;
}> {
  let m = await fetchYahooChartLastTwoMetrics(yahooChartDailyUrl(symbol, "14d"));
  if (m.price !== null && m.growthPct !== null) return m;
  m = await fetchYahooChartLastTwoMetrics(yahooChartDailyUrl(symbol, "1y"));
  return m;
}

async function fetchBitcoinBinanceDailyLastTwo(): Promise<{
  price: number;
  previousClose: number;
  growthPct: number;
} | null> {
  try {
    const res = await fetch(BINANCE_BTC_KLINES_URL, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as unknown;
    if (!Array.isArray(data) || data.length < 2) return null;
    const rowPrev = data[data.length - 2] as unknown;
    const rowLast = data[data.length - 1] as unknown;
    if (!Array.isArray(rowPrev) || !Array.isArray(rowLast)) return null;
    const prev = Number(rowPrev[4]);
    const last = Number(rowLast[4]);
    if (Number.isNaN(prev) || Number.isNaN(last) || prev <= 0) return null;
    return {
      price: last,
      previousClose: prev,
      growthPct: ((last - prev) / prev) * 100,
    };
  } catch {
    return null;
  }
}

/** Yahoo 7974.T daily chart (JPY) → USD via Stooq USDJPY. */
async function fetchNintendoTokyoUsdFromYahoo7974T(): Promise<{
  price: number;
  previousClose: number;
  growthPct: number;
} | null> {
  const chart = await fetchYahooDailyTwoCloses("7974.T");
  if (chart.price === null || chart.previousClose === null) return null;
  const rate = await fetchUsdJpyFromStooq();
  if (rate === null || !(rate > 0)) return null;
  const price = jpyPairToUsdApprox(chart.price, rate);
  const previousClose = jpyPairToUsdApprox(chart.previousClose, rate);
  if (price === null || previousClose === null) return null;
  const growthPct =
    chart.growthPct ??
    (chart.previousClose > 0
      ? ((chart.price - chart.previousClose) / chart.previousClose) * 100
      : 0);
  return { price, previousClose, growthPct };
}

/** Stooq 7974.jp last two daily closes (JPY) → USD via Stooq USDJPY. */
async function fetchNintendoTokyoUsdFromStooq7974(): Promise<{
  price: number;
  previousClose: number;
  growthPct: number;
} | null> {
  try {
    const res = await fetch(buildStooq7974JpDailyUrl(), STOOQ_QUOTE_FETCH);
    if (!res.ok) return null;
    const two = parseStooqDailyDlLastTwoCloses(await res.text());
    if (!two) return null;
    const rate = await fetchUsdJpyFromStooq();
    if (rate === null || !(rate > 0)) return null;
    const price = jpyPairToUsdApprox(two.last, rate);
    const previousClose = jpyPairToUsdApprox(two.prev, rate);
    if (price === null || previousClose === null) return null;
    const growthPct = ((two.last - two.prev) / two.prev) * 100;
    return { price, previousClose, growthPct };
  } catch {
    return null;
  }
}

function nintendoIncomplete(args: {
  nintendo: number | null;
  nintendoGrowthPct: number | null;
  nintendoPreviousClose: number | null;
}) {
  return (
    args.nintendo === null ||
    args.nintendoGrowthPct === null ||
    args.nintendoPreviousClose === null
  );
}

function sp500Incomplete(sp500: number | null, sp500GrowthPct: number | null) {
  return sp500 === null || sp500GrowthPct === null;
}

function btcIncomplete(bitcoin: number | null, bitcoinGrowthPct: number | null) {
  return bitcoin === null || bitcoinGrowthPct === null;
}

/**
 * 1) Yahoo v8 **daily** candles (1d interval — last close vs previous close, like finance.yahoo.com)
 * 2) Stooq ^spx daily CSV (last 2 sessions)
 * 3) Yahoo v7 quote + Stooq intraday line → Yahoo 1y daily chart → Stooq daily again if still incomplete
 */
async function resolveSp500Metrics(
  yahooGs: ParsedYahooQuote,
  spx: { close: number | null; growthPct: number | null },
): Promise<{
  sp500: number | null;
  sp500GrowthPct: number | null;
  sp500Source: Sp500QuoteSource | null;
}> {
  const yahooDaily = await fetchYahooDailyTwoCloses("^GSPC");
  if (yahooDaily.price !== null && yahooDaily.growthPct !== null) {
    return {
      sp500: yahooDaily.price,
      sp500GrowthPct: yahooDaily.growthPct,
      sp500Source: "yahoo-daily",
    };
  }

  const stooqDailyFirst = await fetchSp500StooqDailyLastTwo();
  if (stooqDailyFirst) {
    return {
      sp500: stooqDailyFirst.price,
      sp500GrowthPct: stooqDailyFirst.growthPct,
      sp500Source: "stooq-daily",
    };
  }

  let { sp500, sp500GrowthPct } = computeSp500Metrics(yahooGs, spx);
  let sp500Source: Sp500QuoteSource | null = yahooGs.price !== null ? "yahoo" : spx.close !== null ? "stooq" : null;

  if (sp500Incomplete(sp500, sp500GrowthPct)) {
    const chart = await fetchYahooChartLastTwoMetrics(yahooChartDailyUrl("^GSPC", "1y"));
    if (chart.price !== null) {
      if (sp500 === null) sp500 = chart.price;
      if (sp500GrowthPct === null && chart.growthPct !== null) sp500GrowthPct = chart.growthPct;
      sp500Source = "yahoo-chart";
    }
  }
  if (sp500Incomplete(sp500, sp500GrowthPct)) {
    const st = await fetchSp500StooqDailyLastTwo();
    if (st) {
      sp500 = st.price;
      sp500GrowthPct = st.growthPct;
      sp500Source = "stooq-daily";
    }
  }

  return { sp500, sp500GrowthPct, sp500Source };
}

/**
 * 1) Yahoo v8 daily BTC-USD → 2) Stooq btcusd daily CSV → 3) quote/CoinGecko → chart → Binance.
 */
async function resolveBitcoinMetrics(
  yahooBtc: ParsedYahooQuote,
  btcStooq: { close: number | null; growthPct: number | null },
  options: { mode: "stooq" | "coingecko"; coingeckoUsd?: number | null },
): Promise<{
  bitcoin: number | null;
  bitcoinGrowthPct: number | null;
  bitcoinSource: BitcoinQuoteSource | null;
}> {
  const yahooDaily = await fetchYahooDailyTwoCloses("BTC-USD");
  if (yahooDaily.price !== null && yahooDaily.growthPct !== null) {
    return {
      bitcoin: yahooDaily.price,
      bitcoinGrowthPct: yahooDaily.growthPct,
      bitcoinSource: "yahoo-daily",
    };
  }

  const stooqBtcDaily = await fetchBitcoinStooqDailyLastTwo();
  if (stooqBtcDaily) {
    return {
      bitcoin: stooqBtcDaily.price,
      bitcoinGrowthPct: stooqBtcDaily.growthPct,
      bitcoinSource: "stooq-daily",
    };
  }

  let bitcoin: number | null;
  let bitcoinGrowthPct: number | null;
  if (options.mode === "stooq") {
    const r = computeBitcoinStooqFallbackPath(yahooBtc, btcStooq);
    bitcoin = r.bitcoin;
    bitcoinGrowthPct = r.bitcoinGrowthPct;
  } else {
    const r = computeBitcoinCoinGeckoFallbackPath(yahooBtc, options.coingeckoUsd);
    bitcoin = r.bitcoin;
    bitcoinGrowthPct = r.bitcoinGrowthPct;
  }

  let bitcoinSource: BitcoinQuoteSource | null = yahooBtc.price !== null
    ? "yahoo"
    : options.mode === "stooq" && btcStooq.close !== null
      ? "stooq"
      : options.mode === "coingecko" && bitcoin !== null
        ? "coingecko"
        : null;

  if (btcIncomplete(bitcoin, bitcoinGrowthPct)) {
    const chart = await fetchYahooChartLastTwoMetrics(yahooChartDailyUrl("BTC-USD", "1y"));
    if (chart.price !== null) {
      if (bitcoin === null) bitcoin = chart.price;
      if (bitcoinGrowthPct === null && chart.growthPct !== null) bitcoinGrowthPct = chart.growthPct;
      bitcoinSource = "yahoo-chart";
    }
  }
  if (btcIncomplete(bitcoin, bitcoinGrowthPct)) {
    const bn = await fetchBitcoinBinanceDailyLastTwo();
    if (bn) {
      bitcoin = bn.price;
      bitcoinGrowthPct = bn.growthPct;
      bitcoinSource = "binance";
    }
  }

  return { bitcoin, bitcoinGrowthPct, bitcoinSource };
}

/**
 * Yahoo NTDOY **daily** → Stooq ADR line → Yahoo NTDOY 1d (14d/1y) → Tokyo 7974.T → Stooq 7974.jp.
 * Tokyo paths avoid N/A when US OTC is thin.
 */
async function resolveNintendoMetrics(yahooNtdy: ParsedYahooQuote): Promise<{
  nintendo: number | null;
  nintendoGrowthPct: number | null;
  nintendoPreviousClose: number | null;
  nintendoSource: "adr" | "tokyo" | null;
}> {
  const adrDaily = await fetchYahooDailyTwoCloses("NTDOY");
  if (
    adrDaily.price !== null &&
    adrDaily.previousClose !== null &&
    adrDaily.growthPct !== null
  ) {
    return {
      nintendo: adrDaily.price,
      nintendoGrowthPct: adrDaily.growthPct,
      nintendoPreviousClose: adrDaily.previousClose,
      nintendoSource: "adr",
    };
  }

  let nintendo = yahooNtdy.price;
  let nintendoGrowthPct = yahooNtdy.growthPct;
  let nintendoPreviousClose = yahooNtdy.previousClose;
  let nintendoSource: "adr" | "tokyo" | null = yahooNtdy.price !== null ? "adr" : null;

  if (nintendo === null) {
    const ntd = await fetchStooqNtdyMetrics();
    if (ntd.close !== null) {
      nintendo = ntd.close;
      nintendoGrowthPct = ntd.growthPct;
      nintendoSource = "adr";
    }
  }

  if (nintendoIncomplete({ nintendo, nintendoGrowthPct, nintendoPreviousClose })) {
    const chart = await fetchYahooChartLastTwoMetrics(yahooChartDailyUrl("NTDOY", "1y"));
    if (chart.price !== null) {
      if (nintendo === null) nintendo = chart.price;
      if (nintendoPreviousClose === null) nintendoPreviousClose = chart.previousClose;
      if (nintendoGrowthPct === null && chart.growthPct !== null) nintendoGrowthPct = chart.growthPct;
      nintendoSource = "adr";
    }
  }

  if (nintendoIncomplete({ nintendo, nintendoGrowthPct, nintendoPreviousClose })) {
    const tokyo = await fetchNintendoTokyoUsdFromYahoo7974T();
    if (tokyo) {
      nintendo = tokyo.price;
      nintendoPreviousClose = tokyo.previousClose;
      nintendoGrowthPct = tokyo.growthPct;
      nintendoSource = "tokyo";
    }
  }

  if (nintendoIncomplete({ nintendo, nintendoGrowthPct, nintendoPreviousClose })) {
    const tokyo = await fetchNintendoTokyoUsdFromStooq7974();
    if (tokyo) {
      nintendo = tokyo.price;
      nintendoPreviousClose = tokyo.previousClose;
      nintendoGrowthPct = tokyo.growthPct;
      nintendoSource = "tokyo";
    }
  }

  return { nintendo, nintendoGrowthPct, nintendoPreviousClose, nintendoSource };
}

/**
 * Live S&P 500 + BTC + Nintendo.
 * **Primary:** Yahoo Finance v8 **daily** candles (`interval=1d`, last vs previous session close — same basis as finance.yahoo.com).
 * **Then:** Stooq daily CSV, Yahoo v7 quote, longer-range chart, Binance (BTC), CoinGecko, Tokyo listings.
 */
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
    nintendoSource: null,
    sp500Source: null,
    bitcoinSource: null,
  };

  /** Includes seconds so you can confirm each request is a fresh render (not stale HTML). */
  const stamp = () =>
    new Date().toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "medium",
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
    const spResolved = await resolveSp500Metrics(yahooGs, spx);
    const btcResolved = await resolveBitcoinMetrics(yahooBtc, btc, { mode: "stooq" });
    const nintendoResolved = await resolveNintendoMetrics(yahooNtdy);
    if (spResolved.sp500 !== null && btcResolved.bitcoin !== null) {
      return {
        sp500: spResolved.sp500,
        bitcoin: btcResolved.bitcoin,
        nintendo: nintendoResolved.nintendo,
        nintendoPreviousClose: nintendoResolved.nintendoPreviousClose,
        sp500GrowthPct: spResolved.sp500GrowthPct,
        bitcoinGrowthPct: btcResolved.bitcoinGrowthPct,
        nintendoGrowthPct: nintendoResolved.nintendoGrowthPct,
        nintendoSource: nintendoResolved.nintendoSource,
        sp500Source: spResolved.sp500Source,
        bitcoinSource: btcResolved.bitcoinSource,
        updatedAt: stamp(),
      };
    }
  } catch {
    // fallback below
  }

  try {
    const [spRes, btcStooqRes, cgRes, yahooBatchRes, gsRes, btcDedRes, ntdyRes] = await Promise.all([
      fetch(STOOQ_SP500_URL, STOOQ_QUOTE_FETCH),
      fetch(STOOQ_BTC_URL, STOOQ_QUOTE_FETCH),
      fetch(COINGECKO_BTC_URL, COINGECKO_FETCH),
      fetch(MARKET_QUOTES_URL, YAHOO_QUOTE_FETCH),
      fetch(YAHOO_QUOTE_GSPC_ONLY, YAHOO_QUOTE_FETCH),
      fetch(YAHOO_QUOTE_BTC_ONLY, YAHOO_QUOTE_FETCH),
      fetch(YAHOO_QUOTE_NTDY_ONLY, YAHOO_QUOTE_FETCH),
    ]);
    const spText = spRes.ok ? await spRes.text() : "";
    const btcData = cgRes.ok
      ? ((await cgRes.json()) as { bitcoin?: { usd?: number } })
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
    const btcStooq = btcStooqRes.ok ? parseStooqMetrics(await btcStooqRes.text()) : { close: null, growthPct: null };
    const spResolved = await resolveSp500Metrics(yahooGs, spx);
    const btcResolved = await resolveBitcoinMetrics(yahooBtc, btcStooq, {
      mode: "coingecko",
      coingeckoUsd: btcData.bitcoin?.usd,
    });
    const nintendoResolved = await resolveNintendoMetrics(yahooNtdy);
    if (spResolved.sp500 !== null && btcResolved.bitcoin !== null) {
      return {
        sp500: spResolved.sp500,
        bitcoin: btcResolved.bitcoin,
        nintendo: nintendoResolved.nintendo,
        nintendoPreviousClose: nintendoResolved.nintendoPreviousClose,
        sp500GrowthPct: spResolved.sp500GrowthPct,
        bitcoinGrowthPct: btcResolved.bitcoinGrowthPct,
        nintendoGrowthPct: nintendoResolved.nintendoGrowthPct,
        nintendoSource: nintendoResolved.nintendoSource,
        sp500Source: spResolved.sp500Source,
        bitcoinSource: btcResolved.bitcoinSource,
        updatedAt: stamp(),
      };
    }
  } catch {
    // final fallback below
  }

  return fallback;
}
