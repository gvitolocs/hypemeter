# Market data: Yahoo, fallbacks, backtrack overlays

## Yahoo Finance (unofficial)

The app uses the same **public JSON endpoints** the Yahoo Finance website loads (not a documented stable API):

| Use | Endpoint pattern |
|-----|------------------|
| Live quote (sidecar) | `GET /v7/finance/quote?symbols=...` |
| Historical chart (backtrack thin lines) | `GET /v8/finance/chart/{symbol}?interval=1mo&range=max` |
| NTDOY gap-fill | `GET /v8/finance/chart/NTDOY?interval=1d&range=1y` |

**Common issues**

- **429 Too Many Requests** — IP or edge rate limits; batching and caching help but are not guaranteed.
- **Empty `quoteResponse`** — use a **browser-like `User-Agent`** (we set one on server fetches).
- **OTC symbols (e.g. NTDOY)** — Yahoo may expose **bid/ask** instead of `regularMarketPrice`; we use mid-price when needed.

**Further reading (community)**

- Search Reddit / GitHub for *yahoo finance api v7 quote* or *yfinance* patterns; many wrappers document field quirks.
- Official Yahoo does not publish a supported public API for these JSON routes.

## Fallback snapshot (monmeter)

When live fetches return **null** for a field, we merge **`MARKET_SNAPSHOT_PAGE_FALLBACK`** from `src/lib/marketSnapshotFallback.ts` (numbers aligned with [monmeter.vercel.app](https://monmeter.vercel.app/) delayed-style display).

Disable merging (show real nulls / N/A):

```bash
DISABLE_MARKET_SNAPSHOT_FALLBACK=1
```

## Stooq (backtrack overlays)

For **yearly** series on the hype chart, we **merge** Yahoo monthly closes with **Stooq daily history** aggregated to **last close per calendar year** when Yahoo returns gaps. Stooq symbols used: `^spx`, `btcusd`, `ntdoy.us` (see `marketBacktrack.ts`).

Stooq is **not** real-time for the sidecar; it’s a backup for **historical** shape.

### NTDOY flat line (~49 on the chart)

If Yahoo/Stooq only yield **one** effective price (forward-filled across years), min=max normalization pins the pink line around **49–50**. In that case we rebuild the Nintendo overlay from Yahoo **`7974.T`** (Tokyo listing) so the line matches the **long-term shape** of Nintendo on Yahoo (“All” chart), while the sidecar can still show **NTDOY** USD quotes.

## Caching (Next.js `fetch`)

- Quote fetches: ~5–15 minutes `revalidate` (see `fetchMarketSnapshot.ts`).
- Monthly chart / Stooq history: **24h** `revalidate` where applied — historical data does not need sub-minute updates.
