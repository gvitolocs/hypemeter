# Home page data cache (15 min)

The expensive `loadHomePageDataUncached()` pipeline is wrapped with Next.js **`unstable_cache`** as **`loadHomePageData`**, with **`revalidate: 900`** (15 minutes).

- **First request** after deploy / expiry: runs all upstream fetches (RSS, market, social, overlay, …).
- **Subsequent requests** within 15 minutes: served from the **Data Cache** (no duplicate upstream work), until TTL expires.

`noStore()` was removed from that path so the cache can apply.

### Browser buffer

`HomePageClientCacheWriter` saves a small snapshot (`score`, `updatedAt`, `computedAt`) to **`localStorage`** (`hypemeter-home-browser-buffer-v1`) for debugging / future client logic. It does **not** replace server caching.

### Debug

`/debug` uses **`loadHomePageDataUncached()`** so timings always reflect a **full** uncached run.

### Config

`src/lib/homePageCacheConfig.ts` → `HOME_PAGE_DATA_CACHE_TTL_SEC`.
