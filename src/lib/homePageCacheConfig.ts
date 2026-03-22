/** How long the home data pipeline can be served from Next.js Data Cache (seconds). */
export const HOME_PAGE_DATA_CACHE_TTL_SEC = 15 * 60;

/** Card Highlight (Jina + CardTrader): refresh at most once per day; image proxy uses same TTL. */
export const CARD_TRADER_HIGHLIGHT_CACHE_SEC = 24 * 60 * 60;
