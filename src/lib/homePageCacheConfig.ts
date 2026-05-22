/**
 * Single TTL for home page + Card Highlight (best seller + image bytes) so data stays in sync.
 * Cron or external schedulers can call `/api/cron/revalidate-home` on this cadence to warm cache.
 */
export const HYPEMETER_DATA_REVALIDATE_SEC = 90 * 60;

/** Stale threshold for the homepage runtime snapshot (seconds). */
export const HOME_PAGE_DATA_CACHE_TTL_SEC = HYPEMETER_DATA_REVALIDATE_SEC;

/** Card Highlight should follow Pokoin marketplace activity more closely than the full news payload. */
export const CARD_TRADER_HIGHLIGHT_CACHE_SEC = 15 * 60;

/** Shared tag for manual/cron invalidation of home-related Next Data Cache entries. */
export const HYPEMETER_CACHE_TAG_HOME = "hypemeter-home";

/**
 * Budget for `resolvePokemonOfDayBundleCached` (RSS + catalog + PokeAPI). Sub-second
 * timeouts almost always lose the race on cold serverless, leaving the highlight empty
 * until a later refresh; 12s matches other cold home fetches.
 */
export const HOME_POKEMON_RESOLVE_BUDGET_MS = 12_000;
