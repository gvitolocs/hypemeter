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

Manual refresh can block on the full pipeline because it is explicit user action.

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

4. Check runtime logs for cron, fetch and cache warnings:

   ```bash
   vercel logs monmeter.vercel.app
   ```

5. Remember that `/tmp` SQLite snapshots are per-function-instance warm caches, so durable cross-instance state requires an external data store.
