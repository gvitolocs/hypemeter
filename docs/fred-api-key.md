# FRED / CPI inflation data

Past years use **`src/data/staticCpiYoYByYear.json`** (regenerate yearly: `node scripts/generate-static-cpi-yojson.mjs`).

Only the **current calendar year** is fetched live:

- **With** [`FRED_API_KEY`](https://fred.stlouisfed.org/docs/api/api_key.html): [series/observations](https://fred.stlouisfed.org/docs/api/fred/series_observations.html) with a **narrow** `observation_start` (~2 years of monthly rows).
- **Without** a key: one request to the public [`fredgraph.csv`](https://fred.stlouisfed.org/series/CPIAUCSL) — only the current year’s YoY is read from the parsed series (the rest still comes from the static JSON).
