import {
  type BitcoinQuoteSource,
  type MarketSnapshot,
  type Sp500QuoteSource,
  type ParsedYahooQuote,
  computeBitcoinCoinGeckoFallbackPath,
  computeBitcoinStooqFallbackPath,
  computeSp500Metrics,
  jpyPairToUsdApprox,
  parseYahooChartLastTwoCloses,
  parseStooqDailyDlLastTwoCloses,
  parseStooqMetrics,
} from "@/lib/marketSnapshot";
import { timedAsync } from "@/lib/serverTiming";

/** No Yahoo quotes — `compute*` helpers still accept this shape with nulls. */
const NULL_QUOTE: ParsedYahooQuote = { price: null, growthPct: null, previousClose: null };

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const QUOTE_HEADERS = {
  "user-agent": BROWSER_UA,
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
} as const;

/** Exported for tests — `cache: "no-store"` for fresh Stooq lines. */
export const STOOQ_QUOTE_FETCH: RequestInit = {
  cache: "no-store",
  headers: { ...QUOTE_HEADERS },
};
export const COINGECKO_FETCH: RequestInit = {
  cache: "no-store",
  headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
};
const BINANCE_BTC_KLINES_URL =
  "https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=2";
const YAHOO_GSPC_CHART_URL =
  "https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?range=5d&interval=1d";
const YAHOO_NTDOY_CHART_URL =
  "https://query1.finance.yahoo.com/v8/finance/chart/NTDOY?range=5d&interval=1d";
const YAHOO_7974_TOKYO_CHART_URL =
  "https://query1.finance.yahoo.com/v8/finance/chart/7974.T?range=5d&interval=1d";

const STOOQ_SP500_URL = "https://stooq.com/q/l/?s=%5Espx&i=d";
const STOOQ_BTC_URL = "https://stooq.com/q/l/?s=btcusd&i=d";
const STOOQ_NTDY_URLS = [
  "https://stooq.com/q/l/?s=ntdoy.us&i=d",
  "https://stooq.com/q/l/?s=ntdoy&i=d",
] as const;
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

/** NTDOY ADR — try `ntdoy.us` daily then `ntdoy` (Stooq symbol naming varies). */
async function fetchNtdyStooqDailyLastTwo(): Promise<{
  price: number;
  previousClose: number;
  growthPct: number;
} | null> {
  for (const sym of ["ntdoy.us", "ntdoy"] as const) {
    try {
      const res = await fetch(buildStooqDailyUrl(sym), STOOQ_QUOTE_FETCH);
      if (!res.ok) continue;
      const two = parseStooqDailyDlLastTwoCloses(await res.text());
      if (!two) continue;
      return {
        price: two.last,
        previousClose: two.prev,
        growthPct: ((two.last - two.prev) / two.prev) * 100,
      };
    } catch {
      /* next symbol */
    }
  }
  return null;
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

async function fetchYahooDailyLastTwoByChartUrl(url: string): Promise<{
  price: number;
  previousClose: number;
  growthPct: number;
} | null> {
  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: { ...QUOTE_HEADERS },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as unknown;
    const two = parseYahooChartLastTwoCloses(json);
    if (!(two.last && two.prev && two.last > 0 && two.prev > 0)) return null;
    return {
      price: two.last,
      previousClose: two.prev,
      growthPct: ((two.last - two.prev) / two.prev) * 100,
    };
  } catch {
    return null;
  }
}

async function fetchNintendoTokyoUsdFromStooq7974(): Promise<{
  price: number;
  previousClose: number;
  growthPct: number;
  changeAbsJpy: number;
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
    return { price, previousClose, growthPct, changeAbsJpy: two.last - two.prev };
  } catch {
    return null;
  }
}

async function fetchNintendoTokyoUsdFromYahooChart(): Promise<{
  price: number;
  previousClose: number;
  growthPct: number;
  changeAbsJpy: number;
} | null> {
  try {
    const res = await fetch(YAHOO_7974_TOKYO_CHART_URL, {
      cache: "no-store",
      headers: { ...QUOTE_HEADERS },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as unknown;
    const two = parseYahooChartLastTwoCloses(json);
    if (!(two.last && two.prev && two.last > 0 && two.prev > 0)) return null;
    const rate = await fetchUsdJpyFromStooq();
    if (!(rate && rate > 0)) return null;
    const price = jpyPairToUsdApprox(two.last, rate);
    const previousClose = jpyPairToUsdApprox(two.prev, rate);
    if (price === null || previousClose === null) return null;
    return {
      price,
      previousClose,
      growthPct: ((two.last - two.prev) / two.prev) * 100,
      changeAbsJpy: two.last - two.prev,
    };
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

/** From open→close session % derive absolute delta using close as anchor. */
function absChangeFromSessionPct(close: number | null, growthPct: number | null): number | null {
  if (close === null || growthPct === null) return null;
  const g = growthPct / 100;
  if (!Number.isFinite(g) || g <= -0.9999) return null;
  return close - close / (1 + g);
}

function withinRelativeDiff(a: number, b: number, maxRatio: number): boolean {
  if (!(a > 0) || !(b > 0)) return false;
  return Math.abs(a - b) / b <= maxRatio;
}

/** Stooq ^spx daily last-two → intraday line → retry daily. */
async function resolveSp500Metrics(spx: {
  close: number | null;
  growthPct: number | null;
}): Promise<{
  sp500: number | null;
  sp500GrowthPct: number | null;
  sp500Source: Sp500QuoteSource | null;
}> {
  const stooqDaily = await fetchSp500StooqDailyLastTwo();
  let { sp500, sp500GrowthPct } = computeSp500Metrics(NULL_QUOTE, spx);
  let sp500Source: Sp500QuoteSource | null = spx.close !== null ? "stooq" : null;

  // Prefer live line (`q/l`) only when consistent with daily close; else trust daily.
  if (stooqDaily) {
    const livePrice = spx.close;
    const liveSane =
      livePrice !== null && (!stooqDaily.price || withinRelativeDiff(livePrice, stooqDaily.price, 0.08));
    if (liveSane && stooqDaily.previousClose && livePrice !== null) {
      sp500 = livePrice;
      sp500GrowthPct = ((livePrice - stooqDaily.previousClose) / stooqDaily.previousClose) * 100;
      sp500Source = "stooq";
    } else {
      sp500 = stooqDaily.price;
      sp500GrowthPct = stooqDaily.growthPct;
      sp500Source = "stooq-daily";
    }
  }

  if (sp500Incomplete(sp500, sp500GrowthPct) && stooqDaily) {
    sp500 = stooqDaily.price;
    sp500GrowthPct = stooqDaily.growthPct;
    sp500Source = "stooq-daily";
  }

  if (sp500Incomplete(sp500, sp500GrowthPct)) {
    const yahoo = await fetchYahooDailyLastTwoByChartUrl(YAHOO_GSPC_CHART_URL);
    if (yahoo) {
      sp500 = yahoo.price;
      sp500GrowthPct = yahoo.growthPct;
      sp500Source = "yahoo";
    }
  }

  return { sp500, sp500GrowthPct, sp500Source };
}

/** Stooq daily → merge line → CoinGecko → Binance. */
async function resolveBitcoinMetrics(
  btcStooq: { close: number | null; growthPct: number | null },
  options: { mode: "stooq" | "coingecko"; coingeckoUsd?: number | null },
): Promise<{
  bitcoin: number | null;
  bitcoinGrowthPct: number | null;
  bitcoinSource: BitcoinQuoteSource | null;
}> {
  const stooqBtcDaily = await fetchBitcoinStooqDailyLastTwo();

  let bitcoin: number | null;
  let bitcoinGrowthPct: number | null;
  if (options.mode === "stooq") {
    const r = computeBitcoinStooqFallbackPath(NULL_QUOTE, btcStooq);
    bitcoin = r.bitcoin;
    bitcoinGrowthPct = r.bitcoinGrowthPct;
  } else {
    const r = computeBitcoinCoinGeckoFallbackPath(NULL_QUOTE, options.coingeckoUsd);
    bitcoin = r.bitcoin;
    bitcoinGrowthPct = r.bitcoinGrowthPct;
  }

  let bitcoinSource: BitcoinQuoteSource | null =
    options.mode === "stooq" && btcStooq.close !== null
      ? "stooq"
      : options.mode === "coingecko" && bitcoin !== null
        ? "coingecko"
        : null;

  // Prefer live line (`q/l`) only when consistent with daily close; else trust daily.
  if (stooqBtcDaily) {
    const livePrice = btcStooq.close;
    const liveSane =
      livePrice !== null &&
      (!stooqBtcDaily.price || withinRelativeDiff(livePrice, stooqBtcDaily.price, 0.2));
    if (liveSane && stooqBtcDaily.previousClose && livePrice !== null) {
      bitcoin = livePrice;
      bitcoinGrowthPct = ((livePrice - stooqBtcDaily.previousClose) / stooqBtcDaily.previousClose) * 100;
      bitcoinSource = "stooq";
    } else {
      bitcoin = stooqBtcDaily.price;
      bitcoinGrowthPct = stooqBtcDaily.growthPct;
      bitcoinSource = "stooq-daily";
    }
  }

  if (btcIncomplete(bitcoin, bitcoinGrowthPct) && stooqBtcDaily) {
    bitcoin = stooqBtcDaily.price;
    bitcoinGrowthPct = stooqBtcDaily.growthPct;
    bitcoinSource = "stooq-daily";
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

/** Stooq NTDOY daily → intraday line → Tokyo 7974.jp (JPY→USD). */
async function resolveNintendoMetrics(): Promise<{
  nintendo: number | null;
  nintendoGrowthPct: number | null;
  nintendoPreviousClose: number | null;
  nintendoChangeAbs: number | null;
  nintendoChangeCurrency: "JPY" | "USD" | null;
  nintendoSource: "adr" | "tokyo" | null;
}> {
  const adrDaily = await fetchNtdyStooqDailyLastTwo();
  if (
    adrDaily &&
    adrDaily.price !== null &&
    adrDaily.previousClose !== null &&
    adrDaily.growthPct !== null
  ) {
    return {
      nintendo: adrDaily.price,
      nintendoGrowthPct: adrDaily.growthPct,
      nintendoPreviousClose: adrDaily.previousClose,
      nintendoChangeAbs: adrDaily.price - adrDaily.previousClose,
      nintendoChangeCurrency: "USD",
      nintendoSource: "adr",
    };
  }

  let nintendo: number | null = null;
  let nintendoGrowthPct: number | null = null;
  let nintendoPreviousClose: number | null = null;
  let nintendoChangeAbs: number | null = null;
  let nintendoChangeCurrency: "JPY" | "USD" | null = null;
  let nintendoSource: "adr" | "tokyo" | null = null;

  const ntd = await fetchStooqNtdyMetrics();
  if (ntd.close !== null) {
    nintendo = ntd.close;
    nintendoGrowthPct = ntd.growthPct;
    nintendoChangeAbs = absChangeFromSessionPct(ntd.close, ntd.growthPct);
    nintendoChangeCurrency = nintendoChangeAbs !== null ? "USD" : null;
    nintendoSource = "adr";
  }

  if (nintendoIncomplete({ nintendo, nintendoGrowthPct, nintendoPreviousClose })) {
    const adrYahoo = await fetchYahooDailyLastTwoByChartUrl(YAHOO_NTDOY_CHART_URL);
    if (adrYahoo) {
      nintendo = adrYahoo.price;
      nintendoPreviousClose = adrYahoo.previousClose;
      nintendoGrowthPct = adrYahoo.growthPct;
      nintendoChangeAbs = adrYahoo.price - adrYahoo.previousClose;
      nintendoChangeCurrency = "USD";
      nintendoSource = "adr";
    }
  }

  if (nintendoIncomplete({ nintendo, nintendoGrowthPct, nintendoPreviousClose })) {
    const tokyo = await fetchNintendoTokyoUsdFromStooq7974();
    if (tokyo) {
      nintendo = tokyo.price;
      nintendoPreviousClose = tokyo.previousClose;
      nintendoGrowthPct = tokyo.growthPct;
      nintendoChangeAbs = tokyo.changeAbsJpy;
      nintendoChangeCurrency = "JPY";
      nintendoSource = "tokyo";
    }
  }

  if (nintendoIncomplete({ nintendo, nintendoGrowthPct, nintendoPreviousClose })) {
    const tokyoYahoo = await fetchNintendoTokyoUsdFromYahooChart();
    if (tokyoYahoo) {
      nintendo = tokyoYahoo.price;
      nintendoPreviousClose = tokyoYahoo.previousClose;
      nintendoGrowthPct = tokyoYahoo.growthPct;
      nintendoChangeAbs = tokyoYahoo.changeAbsJpy;
      nintendoChangeCurrency = "JPY";
      nintendoSource = "tokyo";
    }
  }

  return {
    nintendo,
    nintendoGrowthPct,
    nintendoPreviousClose,
    nintendoChangeAbs,
    nintendoChangeCurrency,
    nintendoSource,
  };
}

/**
 * Live S&P 500 + BTC + Nintendo — **Stooq** (daily + intraday), **CoinGecko**, **Binance** (BTC fallback).
 */
export async function fetchMarketSnapshot(): Promise<MarketSnapshot> {
  const fallback: MarketSnapshot = {
    sp500: null,
    bitcoin: null,
    nintendo: null,
    nintendoPreviousClose: null,
    nintendoChangeAbs: null,
    nintendoChangeCurrency: null,
    sp500GrowthPct: null,
    bitcoinGrowthPct: null,
    nintendoGrowthPct: null,
    updatedAt: null,
    nintendoSource: null,
    sp500Source: null,
    bitcoinSource: null,
  };

  const stamp = () =>
    `${new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
      timeZone: "UTC",
    }).format(new Date())} UTC`;

  try {
    const [spRes, btcRes] = await Promise.all([
      fetch(STOOQ_SP500_URL, STOOQ_QUOTE_FETCH),
      fetch(STOOQ_BTC_URL, STOOQ_QUOTE_FETCH),
    ]);
    const spx = spRes.ok ? parseStooqMetrics(await spRes.text()) : { close: null, growthPct: null };
    const btc = btcRes.ok ? parseStooqMetrics(await btcRes.text()) : { close: null, growthPct: null };
    const [spResolved, btcResolved, nintendoResolved] = await Promise.all([
      timedAsync("market:resolveSp500", () => resolveSp500Metrics(spx)),
      timedAsync("market:resolveBitcoin", () => resolveBitcoinMetrics(btc, { mode: "stooq" })),
      timedAsync("market:resolveNintendo", () => resolveNintendoMetrics()),
    ]);
    if (spResolved.sp500 !== null && btcResolved.bitcoin !== null) {
      return {
        sp500: spResolved.sp500,
        bitcoin: btcResolved.bitcoin,
        nintendo: nintendoResolved.nintendo,
        nintendoPreviousClose: nintendoResolved.nintendoPreviousClose,
        nintendoChangeAbs: nintendoResolved.nintendoChangeAbs,
        nintendoChangeCurrency: nintendoResolved.nintendoChangeCurrency,
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
    /* fallback below */
  }

  try {
    const [spRes, btcStooqRes, cgRes] = await Promise.all([
      fetch(STOOQ_SP500_URL, STOOQ_QUOTE_FETCH),
      fetch(STOOQ_BTC_URL, STOOQ_QUOTE_FETCH),
      fetch(COINGECKO_BTC_URL, COINGECKO_FETCH),
    ]);
    const spText = spRes.ok ? await spRes.text() : "";
    const btcData = cgRes.ok
      ? ((await cgRes.json()) as { bitcoin?: { usd?: number } })
      : {};
    const spx = parseStooqMetrics(spText);
    const btcStooq = btcStooqRes.ok ? parseStooqMetrics(await btcStooqRes.text()) : { close: null, growthPct: null };
    const [spResolved, btcResolved, nintendoResolved] = await Promise.all([
      timedAsync("market:resolveSp500", () => resolveSp500Metrics(spx)),
      timedAsync("market:resolveBitcoin", () =>
        resolveBitcoinMetrics(btcStooq, {
          mode: "coingecko",
          coingeckoUsd: btcData.bitcoin?.usd,
        }),
      ),
      timedAsync("market:resolveNintendo", () => resolveNintendoMetrics()),
    ]);
    if (spResolved.sp500 !== null && btcResolved.bitcoin !== null) {
      return {
        sp500: spResolved.sp500,
        bitcoin: btcResolved.bitcoin,
        nintendo: nintendoResolved.nintendo,
        nintendoPreviousClose: nintendoResolved.nintendoPreviousClose,
        nintendoChangeAbs: nintendoResolved.nintendoChangeAbs,
        nintendoChangeCurrency: nintendoResolved.nintendoChangeCurrency,
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
    /* final fallback below */
  }

  return fallback;
}
