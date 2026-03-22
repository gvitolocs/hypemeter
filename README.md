# Pokemon Hype Meter

Gen Z / Alpha style Pokemon sentiment dashboard inspired by CNN Fear & Greed.

The app calculates a live 0-100 hype score using seven equal-weight indicators from current Pokemon news headlines.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Build for production

```bash
npm run lint
npm run build
npm run start
```

## Data source

- Live Pokemon headlines from Google News RSS:
  `https://news.google.com/rss/search?q=Pokemon&hl=en-US&gl=US&ceid=US:en`
- The page uses server-side fetch + revalidation every 30 minutes.

### Market sidecar & backtrack overlays (S&P / BTC / NTDOY)

- **Sidecar** (live quote % and levels): Yahoo Finance v7 `quote` API first, with Stooq / CoinGecko / Yahoo chart fallbacks (`src/lib/fetchMarketSnapshot.ts`). Cached ~5–15 minutes per fetch options.
- **Thin lines on the hype chart**: Yahoo Finance **v8 chart** monthly closes (`interval=1mo`, `range=max`), normalized 0–100 per asset (`src/lib/marketBacktrack.ts`). This is **historical**, not the 1D intraday chart on Yahoo — expect different numbers than the big quote header. **ISR cache: 24h** (`revalidate: 86400`) so delayed / monthly data is reused and stable.
- **Why lines were hard to see before**: the cyan hype line was drawn **on top** of the thin overlays and hid them. The chart now draws **hype first, then S&P / BTC / NTDOY on top**.

### Tests

- **Unit tests** use **mock HTTP** responses — they do **not** call Yahoo live (`src/lib/marketSnapshot.test.ts`, `fetchMarketSnapshot.test.ts`, `marketBacktrack*.test.ts`).
- `marketBacktrack.fetch.test.ts` mocks Yahoo **v8 chart** JSON and checks that overlay arrays match the year axis length.

### Yahoo limits & fallbacks (details)

See **[docs/MARKET_DATA.md](./docs/MARKET_DATA.md)** — rate limits, `DISABLE_MARKET_SNAPSHOT_FALLBACK`, Stooq merge for backtrack overlays.

## Recommended hosting

For this stack, use **Vercel** first:

- Built by the Next.js team, best compatibility
- Global CDN and automatic HTTPS
- Fast deploy from GitHub in minutes
- Reliable for public consumer traffic

### Deploy on Vercel

1. Push this repo to GitHub
2. Import the repo in Vercel
3. Framework detected as Next.js automatically
4. Click deploy

Optional backup choices: Cloudflare Pages (good) or Netlify (good), but Vercel is usually the most reliable for modern Next.js features.
