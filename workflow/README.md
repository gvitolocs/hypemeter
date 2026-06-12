# Hypemeter Workflow

This folder documents the operational workflow for the Hypemeter / Pokoin News project.

Production aliases:

- `https://monmeter.vercel.app`
- `https://news.pokoin.com`

Vercel project:

- Project name: `hypemeter`
- Project id: `prj_9jmcAzaxpINm5D3d6ifvQauhPIRC`
- Team id: `team_WIppHrH49qzR3JDOj6AynDiC`

## Daily Development

Use the project root as the working directory:

```bash
cd /Users/giuseppe/mnt/nespc-projects/hypemeter
```

Useful checks:

```bash
node node_modules/vitest/vitest.mjs run src/lib/homePageRuntimeFreshness.test.ts src/lib/pokemonSpotlightCopy.test.ts src/lib/homePageArticleBootstrap.test.ts
node node_modules/typescript/bin/tsc --noEmit --pretty false
```

Note: this SMB-backed checkout can generate AppleDouble `._*` files and mode-only diffs. Remove generated `._*` files before staging, and stage only intentional paths.

## Homepage Data Workflow

The homepage is dynamic and snapshot-first:

1. `GET /` reads `home_page_payload_v1` from the runtime SQLite snapshot.
2. The snapshot is trusted only while it is inside `HOME_PAGE_DATA_CACHE_TTL_SEC`.
3. If the snapshot is stale or missing, the page runs a bounded Google News bootstrap so visible headlines stay current.
4. The page schedules a full refresh after the response to warm market, social, card, Pokemon and graph data for that same function instance.
5. Runtime SQLite lives under Vercel serverless `/tmp`, so it is a warm local cache, not shared durable storage across functions.

The public context endpoint is useful for checking whether live news can be fetched:

```bash
curl -sS https://monmeter.vercel.app/api/poko-news-context
```

The homepage and the context endpoint can briefly show different hype scores because they may run in different serverless instances. Current headlines on the homepage are the main freshness signal.

## Dashboard Function Map

Use this map when checking whether the dashboard is actually live. Each row names the user-facing function, the code/data owner, and the freshness signal to verify.

| Dashboard function | What it does | Data owner / route | Freshness check |
| --- | --- | --- | --- |
| Reload button | Invalidates home and market cache tags, refreshes the runtime homepage snapshot, then rerenders the page. | `src/app/api/revalidate-home/route.ts` | `POST /api/revalidate-home` returns `ok:true` with a current `at` timestamp. |
| Next update countdown | Shows the next expected homepage refresh window. | `HomeNextUpdateCountdown` + `HYPEMETER_DATA_REVALIDATE_SEC` | Timer should hydrate on the client and not show a stale server value. |
| Card Highlight | Shows the current Pokoin marketplace card spotlight. | `HomeCardHighlightAsync`, `fetchCardTraderPokemonBestSeller` | Card title/image should change when Pokoin bestseller data changes. |
| Pokemon Highlight | Picks a Pokemon from current headlines and links to the source article. | `HomePokemonHighlightAsync`, Pokemon RSS/catalog/PokeAPI helpers | Copy should mention the linked article, not generic cache-refresh text. |
| Current Hype gauge | Shows the composite 0-100 Pokemon hype score and risk label. | `summarizeHype()` in `src/app/page.tsx` | Score should move when current headline, social, market and catalyst inputs move. |
| Momentum/Breadth/Conviction cards | Explains the current trend, coverage breadth and confidence. | `summarizeHype()` indicators | Values should align with the current headline set and social pulse. |
| Live Event Signals | Extracts high-signal tags such as reveals, releases, supply stress and TCG momentum. | `LIVE_EVENT_SIGNAL_PATTERNS` in `src/app/page.tsx` | Pills should reflect current headline language. |
| Community Hype / Market Heat / Signal Quality | Splits the composite into community pressure, market pressure and source quality. | `summarizeHype()` component scores | Scores should not be static when article volume/source diversity changes. |
| 1 Month / 1 Year / 5 Year Sentiment | Displays short, medium and long horizon sentiment windows. | `buildSentimentWindows()` in `src/app/page.tsx` | Window scores should derive from current score plus stored daily history. |
| Top Pokemon Articles Today | Renders ranked Google News items. | `fetchNewsItems()`, `/api/poko-news-context` | Article dates should be from today or the last active news cycle. |
| Social Pulse | Estimates Google Search, Reddit, YouTube, Facebook, Threads and Pokemon official activity. | `fetchSocialTrafficSnapshot()` | Platform current/previous counts should be non-zero or derived from current news fallback. |
| Daily Stats Calendar | Shows day-level headline count, source count, event hits and pressure hits. | `DayStatsCalendar`, `/api/day-stats` | Selecting recent days should show headlines from that date. |
| Hype Backtracking | Charts yearly Pokemon hype plus market overlays from 2005 to now. | `BacktrackMarketSection`, `fetchMarketYearlyOverlay()` | Latest year should be the current calendar year. |
| Market Sidecar | Shows live S&P 500, Bitcoin, Nintendo and CPI context next to the backtracking chart. It hydrates from `/api/market-snapshot` on mount and every 10 minutes. | `MarketSidecarAside`, `fetchMarketSnapshot()`, `/api/market-snapshot` | Hydrated browser view should show current `updatedAt`; production must not show `cached fallback`. |
| 6 Composite Components | Shows the weighted model inputs behind the gauge. | `summarizeHype()` `components` array | Weights should match the displayed model-weight copy. |

## Market Sidecar Workflow

The Market Sidecar is separate from the news snapshot because quotes should update faster than headlines:

1. `fetchMarketSnapshot()` tries Stooq CSV/line data first.
2. If Stooq returns HTML, a browser verification page, an empty body, or a non-CSV response, the parser returns null and the code falls through.
3. S&P 500 and Nintendo use Yahoo `query2` chart data as the live fallback. If Vercel is rate-limited by Yahoo, the same chart URL is retried through `https://r.jina.ai/http://...` and parsed from the text wrapper.
4. Bitcoin uses Stooq when available, then CoinGecko with `usd_24h_change`, then Binance.
5. `/api/market-snapshot` caches the quote snapshot for `MARKET_SIDECAR_REVALIDATE_SEC` (10 minutes).
6. Homepage refresh uses the shared `fetchMarketSnapshotHourly()` sidecar cache. Keep `HOME_TIMEOUT_MARKET_MS` high enough for Yahoo direct failure plus Jina retry, otherwise the server HTML can start as `N/A`.
7. `MarketSidecarAside` client-refreshes from `/api/market-snapshot` on mount and every 10 minutes, so the user-visible hydrated dashboard does not depend on the homepage function instance's `/tmp` SQLite snapshot.
8. The homepage must not merge stale cached fields into a partially fresh market row. If a live source only returns BTC, S&P and Nintendo should show `N/A` rather than old values.
9. The static `cached fallback` market numbers are not production data and must never be stored as current runtime data.

Clear market tests:

```bash
node node_modules/vitest/vitest.mjs run src/lib/fetchMarketSnapshot.test.ts src/lib/marketSnapshot.test.ts src/lib/marketSnapshotFallback.test.ts
curl -sS https://monmeter.vercel.app/api/market-snapshot
```

Expected production shape:

```json
{
  "sp500": 7394.3,
  "bitcoin": 63745,
  "nintendo": 11.23,
  "updatedAt": "Jun 12, 2026, ... UTC",
  "sp500Source": "yahoo",
  "bitcoinSource": "coingecko",
  "nintendoSource": "adr"
}
```

Exact prices change during the day; the important signals are non-null values, current `updatedAt`, real source labels, and no `cached fallback`.

## Cron And Manual Refresh

Vercel Hobby only allows daily cron jobs. `vercel.json` therefore keeps one daily warmup:

```json
{
  "path": "/api/cron/revalidate-home",
  "schedule": "0 0 * * *"
}
```

The cron route is `force-dynamic` and accepts Vercel cron requests. If `CRON_SECRET` is set in Vercel, Vercel sends it as:

```text
Authorization: Bearer <CRON_SECRET>
```

Manual refresh is available from the UI Reload button and through:

```bash
curl -X POST https://monmeter.vercel.app/api/revalidate-home
```

Manual refresh invalidates both `hypemeter-home` and `hypemeter-market-sidecar`. It can block on the full pipeline because it is explicit user action.

## Deployment

Production deploy:

```bash
vercel --prod --yes
```

After deploy, verify the alias moved to the new deployment:

```bash
curl -sS https://monmeter.vercel.app/ -o /tmp/monmeter.html
rg -o 'data-dpl-id="[^"]+"' /tmp/monmeter.html | head -1
```

Verify the old Pokemon spotlight blocker is gone:

```bash
rg -c "Daily spotlight is refreshing from cache" /tmp/monmeter.html || true
rg "today's Pokemon spotlight" /tmp/monmeter.html
```

Verify the homepage is receiving current news:

```bash
rg "Pitch Black|Champions|Guardian|Pokemon|Pokémon" /tmp/monmeter.html
```

Verify the Market Sidecar is not using stale fallback values:

```bash
curl -sS https://monmeter.vercel.app/api/market-snapshot
rg "cached fallback" /tmp/monmeter.html || true
```

For the user-visible sidecar, verify in a browser after hydration because server HTML can be older than the client API refresh.

Check the deployment in Vercel if needed:

```bash
vercel inspect monmeter.vercel.app
```

## GitHub Publishing

The working tree often contains unrelated local changes. Do not use `git add -A` unless the whole tree is intentionally in scope.

Preferred flow:

```bash
git status --short
git checkout -b codex/<short-description>
git add <explicit-file-list>
git diff --cached
git commit -m "<short description>"
git push -u origin codex/<short-description>
```

Open a draft PR after pushing unless the change is explicitly meant to land directly on `main`.

## Stale Data Checklist

When the user says the site is not updating:

1. Check the deployed id:

   ```bash
   curl -sS https://monmeter.vercel.app/ -o /tmp/monmeter.html
   rg -o 'data-dpl-id="[^"]+"' /tmp/monmeter.html | head -1
   ```

2. Check current visible headlines:

   ```bash
   rg "Top 10 Pokemon Articles Today|Pitch Black|Champions|Guardian" /tmp/monmeter.html
   ```

3. Check the context endpoint freshness:

   ```bash
   curl -sS https://monmeter.vercel.app/api/poko-news-context
   ```

4. Check market freshness separately:

   ```bash
   curl -sS https://monmeter.vercel.app/api/market-snapshot
   ```

   If S&P/Nintendo are null, check whether Stooq is returning HTML verification pages and whether both direct Yahoo `query2` and the Jina reader fallback are failing. The fallback path should still use Yahoo/Jina for S&P/Nintendo and CoinGecko/Binance for BTC.

5. Check runtime logs for cron, fetch and cache warnings:

   ```bash
   vercel logs monmeter.vercel.app
   ```

6. Remember that `/tmp` SQLite snapshots are per-function-instance warm caches, so durable cross-instance state requires an external data store.
