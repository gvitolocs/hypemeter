/**
 * Legacy Yahoo-shaped quote parsing (kept for unit tests) + Stooq CSV helpers for the Market Sidecar.
 * Live fetches use Stooq first, with Yahoo/CoinGecko/Binance fallbacks — see `fetchMarketSnapshot.ts`.
 */

/** Where S&P numbers came from (sidecar transparency). */
export type Sp500QuoteSource = "stooq" | "stooq-daily" | "yahoo";

/** Where BTC numbers came from. */
export type BitcoinQuoteSource = "stooq" | "stooq-daily" | "coingecko" | "binance";

export type MarketSnapshot = {
  sp500: number | null;
  bitcoin: number | null;
  /** Nintendo Co. — USD (ADR) or USD approx from Tokyo JPY ÷ USDJPY. */
  nintendo: number | null;
  /** Prior session close (USD), when available — Stooq line or daily CSV. */
  nintendoPreviousClose: number | null;
  /** Absolute day change for Nintendo in native quote currency (JPY for Tokyo, USD for ADR). */
  nintendoChangeAbs: number | null;
  /** Currency for `nintendoChangeAbs`. */
  nintendoChangeCurrency: "JPY" | "USD" | null;
  sp500GrowthPct: number | null;
  bitcoinGrowthPct: number | null;
  nintendoGrowthPct: number | null;
  updatedAt: string | null;
  /**
   * `adr` = Stooq NTDOY (US OTC). `tokyo` = Stooq 7974.jp (JPY) → USD via USDJPY.
   */
  nintendoSource: "adr" | "tokyo" | null;
  sp500Source: Sp500QuoteSource | null;
  bitcoinSource: BitcoinQuoteSource | null;
};

export type YahooFinanceQuoteBundle = {
  quoteResponse?: {
    result?: Array<{
      symbol?: string;
      regularMarketPrice?: number;
      regularMarketChangePercent?: number;
      regularMarketPreviousClose?: number;
      postMarketPrice?: number;
      preMarketPrice?: number;
      /** OTC / thin names — Yahoo often omits regularMarketPrice but sets bid/ask. */
      bid?: number;
      ask?: number;
    }>;
  };
};

export type ParsedYahooQuote = {
  price: number | null;
  growthPct: number | null;
  previousClose: number | null;
};

export function findYahooQuoteEntry(data: YahooFinanceQuoteBundle, symbol: string) {
  const want = symbol.toUpperCase();
  return data.quoteResponse?.result?.find((e) => e.symbol?.toUpperCase() === want);
}

/**
 * Aligns with Yahoo Finance quote page: last price, previous close, % change.
 * Do not use previous close as the last price (that inflated “level” vs the site).
 */
export function parseYahooSymbol(
  data: YahooFinanceQuoteBundle,
  symbol: string,
): ParsedYahooQuote {
  const entry = findYahooQuoteEntry(data, symbol);
  const prevClose = entry?.regularMarketPreviousClose;
  const bidAskMid =
    entry?.bid != null &&
    entry?.ask != null &&
    !Number.isNaN(Number(entry.bid)) &&
    !Number.isNaN(Number(entry.ask)) &&
    Number(entry.bid) > 0 &&
    Number(entry.ask) > 0
      ? (Number(entry.bid) + Number(entry.ask)) / 2
      : undefined;
  const rawPrice =
    entry?.regularMarketPrice ??
    entry?.postMarketPrice ??
    entry?.preMarketPrice ??
    bidAskMid ??
    entry?.bid ??
    entry?.ask ??
    undefined;
  const price =
    rawPrice !== undefined && rawPrice !== null && !Number.isNaN(Number(rawPrice))
      ? Number(rawPrice)
      : null;
  const previousClose =
    prevClose !== undefined && prevClose !== null && !Number.isNaN(Number(prevClose))
      ? Number(prevClose)
      : null;
  let growthPct =
    entry?.regularMarketChangePercent !== undefined &&
    entry?.regularMarketChangePercent !== null &&
    !Number.isNaN(Number(entry.regularMarketChangePercent))
      ? Number(entry.regularMarketChangePercent)
      : null;
  if (
    growthPct === null &&
    price !== null &&
    previousClose !== null &&
    previousClose > 0
  ) {
    growthPct = ((price - previousClose) / previousClose) * 100;
  }
  return {
    price,
    growthPct,
    previousClose,
  };
}

function growthPctForMergedPrice(
  mergedPrice: number,
  mergedPrev: number | null,
  source: ParsedYahooQuote,
): number | null {
  if (source.price === null || mergedPrice !== source.price) return null;
  if (source.growthPct !== null) return source.growthPct;
  if (mergedPrev !== null && mergedPrev > 0) {
    return ((mergedPrice - mergedPrev) / mergedPrev) * 100;
  }
  return null;
}

/**
 * Merges dedicated single-symbol v7 response with batch response.
 * Field-wise merge: dedicated price/prev win when set; otherwise batch fills gaps.
 * This avoids a bug where dedicated had only `previousClose` and hid batch `price`.
 */
export function mergeYahooQuotes(
  dedicated: YahooFinanceQuoteBundle,
  batch: YahooFinanceQuoteBundle,
  symbol: string,
): ParsedYahooQuote {
  const a = parseYahooSymbol(dedicated, symbol);
  const b = parseYahooSymbol(batch, symbol);
  const price = a.price ?? b.price;
  const previousClose = a.previousClose ?? b.previousClose;

  let growthPct: number | null = null;
  if (price !== null) {
    const fromDedicated = growthPctForMergedPrice(price, previousClose, a);
    const fromBatch = growthPctForMergedPrice(price, previousClose, b);
    if (fromDedicated !== null) growthPct = fromDedicated;
    else if (fromBatch !== null) growthPct = fromBatch;
    else if (previousClose !== null && previousClose > 0) {
      growthPct = ((price - previousClose) / previousClose) * 100;
    }
  }

  return { price, growthPct, previousClose };
}

/** Stooq daily CSV: Symbol,Date,Time,Open,High,Low,Close,Volume — we use open (3) & close (6). */
export function parseStooqMetrics(csv: string): { close: number | null; growthPct: number | null } {
  const lines = csv
    .trim()
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return { close: null, growthPct: null };
  const headerish = lines[0].toLowerCase().startsWith("symbol");
  const line = (headerish && lines.length > 1 ? lines[1] : lines[0]) ?? "";
  const cols = line.split(",");
  if (cols.length < 7) return { close: null, growthPct: null };
  const open = Number(cols[3]);
  const close = Number(cols[6]);
  const validOpen = !Number.isNaN(open) && open > 0;
  const validClose = !Number.isNaN(close);
  const growthPct = validOpen && validClose ? ((close - open) / open) * 100 : null;
  return {
    close: validClose ? close : null,
    growthPct,
  };
}

/**
 * Stooq `q/d/l` daily history: header `Date,Open,High,Low,Close` (+ optional Volume).
 * Returns last two trading closes (JPY for 7974.jp, etc.).
 */
export function parseStooqDailyDlLastTwoCloses(csv: string): { last: number; prev: number } | null {
  const lines = csv
    .trim()
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return null;
  const dataLines = /^date,/i.test(lines[0] ?? "") ? lines.slice(1) : lines;
  if (dataLines.length < 2) return null;
  const parseClose = (line: string) => {
    const cols = line.split(",").map((c) => c.trim());
    if (cols.length < 5) return NaN;
    return Number(cols[4]);
  };
  const last = parseClose(dataLines[dataLines.length - 1] ?? "");
  const prev = parseClose(dataLines[dataLines.length - 2] ?? "");
  if (Number.isNaN(last) || Number.isNaN(prev) || last <= 0 || prev <= 0) return null;
  return { last, prev };
}

/** JPY equity ÷ USDJPY (JPY per 1 USD) → USD notional for display. */
export function jpyPairToUsdApprox(jpy: number, usdjpy: number): number | null {
  if (!(usdjpy > 0) || !Number.isFinite(jpy)) return null;
  return jpy / usdjpy;
}

/** Last two daily closes from Yahoo v8 chart (skips nulls — weekends/holidays). */
export function parseYahooChartLastTwoCloses(json: unknown): { last: number | null; prev: number | null } {
  const result = (json as { chart?: { result?: unknown[] } })?.chart?.result?.[0] as
    | {
        indicators?: { quote?: Array<{ close?: Array<number | null> }> };
      }
    | undefined;
  const raw = result?.indicators?.quote?.[0]?.close;
  const closes = Array.isArray(raw)
    ? raw.reduce<number[]>((acc, c) => {
        if (typeof c === "number" && !Number.isNaN(c)) acc.push(c);
        return acc;
      }, [])
    : [];
  if (closes.length === 0) return { last: null, prev: null };
  const last = closes[closes.length - 1] ?? null;
  const prev = closes.length >= 2 ? closes[closes.length - 2] ?? null : null;
  return { last, prev };
}

/** S&P: Yahoo price + % vs prev close when Yahoo supplies price; else Stooq session metrics. */
export function computeSp500Metrics(
  yahooGs: ParsedYahooQuote,
  spx: { close: number | null; growthPct: number | null },
): { sp500: number | null; sp500GrowthPct: number | null } {
  const sp500 = yahooGs.price ?? spx.close;
  const sp500GrowthPct =
    (yahooGs.price !== null ? yahooGs.growthPct : null) ?? spx.growthPct;
  return { sp500, sp500GrowthPct };
}

/** Path A (Stooq BTC daily): Yahoo first; Stooq BTC is session open→close (not Yahoo’s %). */
export function computeBitcoinStooqFallbackPath(
  yahooBtc: ParsedYahooQuote,
  btcStooq: { close: number | null; growthPct: number | null },
): { bitcoin: number | null; bitcoinGrowthPct: number | null } {
  const bitcoin = yahooBtc.price ?? btcStooq.close;
  const bitcoinGrowthPct =
    (yahooBtc.price !== null ? yahooBtc.growthPct : null) ?? btcStooq.growthPct;
  return { bitcoin, bitcoinGrowthPct };
}

/** Path B (CoinGecko): price when Yahoo missing; % only from Yahoo (same as finance.yahoo.com). */
export function computeBitcoinCoinGeckoFallbackPath(
  yahooBtc: ParsedYahooQuote,
  coingeckoUsd: number | null | undefined,
): { bitcoin: number | null; bitcoinGrowthPct: number | null } {
  const bitcoin = yahooBtc.price ?? coingeckoUsd ?? null;
  const bitcoinGrowthPct = yahooBtc.price !== null ? yahooBtc.growthPct : null;
  return { bitcoin, bitcoinGrowthPct };
}
