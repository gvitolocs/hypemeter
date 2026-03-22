export const YAHOO_QUOTE_SP500 = "https://finance.yahoo.com/quote/%5EGSPC";
export const YAHOO_QUOTE_BTC = "https://finance.yahoo.com/quote/BTC-USD";
export const YAHOO_QUOTE_NTDY = "https://finance.yahoo.com/quote/NTDOY";
/** Tokyo listing — used when sidecar fills from 7974.T / Stooq JPY series. */
export const YAHOO_QUOTE_7974T = "https://finance.yahoo.com/quote/7974.T";
/** Stooq S&P 500 — when sidecar uses Stooq daily last-two-closes. */
export const STOOQ_QUOTE_SPX = "https://stooq.com/q/?s=%5Espx";
/** Stooq BTC/USD — when sidecar uses Stooq line. */
export const STOOQ_QUOTE_BTCUSD = "https://stooq.com/q/?s=btcusd";
/** Stooq Tokyo listing — Nintendo (opens when clicking the sidecar box). */
export const STOOQ_QUOTE_7974_JP = "https://stooq.com/q/?s=7974.jp";
/** Binance spot — when sidecar uses Binance klines fallback. */
export const BINANCE_BTC_USDT = "https://www.binance.com/en/trade/BTC_USDT";
/** CoinGecko — when price comes from CG simple/price. */
export const COINGECKO_BTC = "https://www.coingecko.com/en/coins/bitcoin";
