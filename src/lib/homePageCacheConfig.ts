/** How long the home data pipeline can be served from Next.js Data Cache (seconds). */
export const HOME_PAGE_DATA_CACHE_TTL_SEC = 15 * 60;

/** Card Highlight: Next `revalidate` cap; actual refresh is **per calendar day** (see `cardHighlightCalendarDayKey`). */
export const CARD_TRADER_HIGHLIGHT_CACHE_SEC = 24 * 60 * 60;
