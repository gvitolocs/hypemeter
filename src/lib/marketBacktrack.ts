/**
 * Yearly Yahoo Finance monthly closes → normalized 0–100 series for the hype chart overlay.
 */

import staticCpiYoYByYear from "@/data/staticCpiYoYByYear.json";

const YAHOO_CHART_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export type MarketHighlightKey = "sp500" | "btc" | "nintendo" | "inflation";

export type MarketYearlyOverlay = {
  sp500: number[];
  btc: number[];
  nintendo: number[];
  /** US CPI YoY % (FRED CPIAUCSL: last month in year vs same month prior year). */
  inflationYoY: number[];
  /** Same inflation series min–max normalized to 0–100 (thin line on chart). */
  inflation: number[];
};

type YearlyCloseMap = Map<number, number>;

const STOOQ_HIST_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** Last trading close per calendar year from Stooq daily CSV (header must include Date + Close). */
export function parseStooqDailyHistoryToYearlyLastClose(csv: string): YearlyCloseMap {
  const map: YearlyCloseMap = new Map();
  const lines = csv
    .trim()
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return map;
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  let dateIdx = header.indexOf("date");
  const closeIdx = header.indexOf("close");
  if (closeIdx < 0) return map;
  if (dateIdx < 0) dateIdx = 0;
  const lastByYear = new Map<number, { dateStr: string; close: number }>();
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    const dateStr = cols[dateIdx]?.trim();
    const rawClose = cols[closeIdx]?.trim().replace(/^"|"$/g, "") ?? "";
    const close = Number(rawClose);
    if (!dateStr || Number.isNaN(close)) continue;
    const y = new Date(dateStr).getFullYear();
    if (Number.isNaN(y)) continue;
    const prev = lastByYear.get(y);
    if (!prev || dateStr > prev.dateStr) {
      lastByYear.set(y, { dateStr, close });
    }
  }
  for (const [year, v] of lastByYear) map.set(year, v.close);
  return map;
}

/** Stooq fills gaps when Yahoo v8 monthly is empty or incomplete. Yahoo values win on year collisions. */
function mergeYearlyMaps(yahoo: YearlyCloseMap, stooq: YearlyCloseMap): YearlyCloseMap {
  const out = new Map<number, number>(stooq);
  for (const [y, c] of yahoo) out.set(y, c);
  return out;
}

type CpiMonthRow = { y: number; m: number; t: number; cpi: number };

/**
 * FRED `fredgraph.csv` for CPIAUCSL (monthly index). Used to build YoY % by calendar year.
 * Exported for unit tests.
 */
export function parseFredCpiCsvToMonthlyRows(csv: string): CpiMonthRow[] {
  const lines = csv
    .trim()
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];
  const out: CpiMonthRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    const dateStr = cols[0]?.trim();
    const rawVal = cols[1]?.trim();
    if (!dateStr || rawVal === undefined || rawVal === "") continue;
    if (!/^\d{4}-\d{2}-\d{2}/.test(dateStr)) continue;
    // FRED CSV sometimes leaves a month blank; API uses "." — never treat as 0 (Number("") === 0 in JS).
    if (rawVal === ".") continue;
    const cpi = Number(rawVal);
    if (Number.isNaN(cpi) || cpi <= 0) continue;
    const d = new Date(dateStr + "T12:00:00Z");
    if (Number.isNaN(d.getTime())) continue;
    out.push({ y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, t: d.getTime(), cpi });
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}

/**
 * For each calendar year, YoY % = (CPI at last available month in Y) / (CPI at same month in Y−1) − 1.
 * Matches how “current” inflation is read when December isn’t published yet (e.g. uses Nov vs Nov).
 */
export function buildCpiYoYPercentByYearFromMonthlyRows(monthly: CpiMonthRow[]): Map<number, number> {
  const map = new Map<number, number>();
  if (monthly.length === 0) return map;
  const byYearMonth = new Map<string, number>();
  for (const p of monthly) {
    byYearMonth.set(`${p.y}-${String(p.m).padStart(2, "0")}`, p.cpi);
  }
  const years = [...new Set(monthly.map((p) => p.y))].sort((a, b) => a - b);
  for (const y of years) {
    let cpiNow: number | null = null;
    let lastM = 0;
    for (let m = 12; m >= 1; m--) {
      const v = byYearMonth.get(`${y}-${String(m).padStart(2, "0")}`);
      if (v !== undefined) {
        cpiNow = v;
        lastM = m;
        break;
      }
    }
    if (cpiNow === null || lastM === 0) continue;
    const cpiPrev = byYearMonth.get(`${y - 1}-${String(lastM).padStart(2, "0")}`);
    if (cpiPrev === undefined || cpiPrev === 0) continue;
    map.set(y, (cpiNow / cpiPrev - 1) * 100);
  }
  return map;
}

function loadStaticCpiYoYMap(): Map<number, number> {
  const m = new Map<number, number>();
  for (const [k, v] of Object.entries(staticCpiYoYByYear as Record<string, number>)) {
    m.set(Number(k), v);
  }
  return m;
}

/**
 * Live YoY for the **current calendar year** only — small FRED API payload (`observation_start` = Jan two years ago).
 * @see https://fred.stlouisfed.org/docs/api/fred/series_observations.html
 */
async function fetchFredCurrentYearYoYFromApi(cy: number): Promise<number | null> {
  const key = process.env.FRED_API_KEY?.trim();
  if (!key) return null;
  try {
    const url = new URL("https://api.stlouisfed.org/fred/series/observations");
    url.searchParams.set("series_id", "CPIAUCSL");
    url.searchParams.set("api_key", key);
    url.searchParams.set("file_type", "json");
    url.searchParams.set("observation_start", `${cy - 2}-01-01`);
    url.searchParams.set("sort_order", "asc");
    url.searchParams.set("limit", "120");
    const res = await fetch(url.toString(), {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      observations?: Array<{ date?: string; value?: string }>;
    };
    const monthly: CpiMonthRow[] = [];
    for (const o of json.observations ?? []) {
      const dateStr = o.date?.trim();
      const rawVal = o.value?.trim();
      if (!dateStr || !rawVal || rawVal === ".") continue;
      const cpi = Number(rawVal);
      if (Number.isNaN(cpi) || cpi <= 0) continue;
      const d = new Date(dateStr + "T12:00:00Z");
      if (Number.isNaN(d.getTime())) continue;
      monthly.push({
        y: d.getUTCFullYear(),
        m: d.getUTCMonth() + 1,
        t: d.getTime(),
        cpi,
      });
    }
    monthly.sort((a, b) => a.t - b.t);
    const map = buildCpiYoYPercentByYearFromMonthlyRows(monthly);
    return map.get(cy) ?? null;
  } catch {
    return null;
  }
}

/** Fallback: full graph CSV (only `cy` YoY is read — rest comes from static JSON). */
async function fetchFredCurrentYearYoYFromGraphCsv(cy: number): Promise<number | null> {
  try {
    const res = await fetch("https://fred.stlouisfed.org/graph/fredgraph.csv?id=CPIAUCSL", {
      next: { revalidate: 3600 },
      headers: { "user-agent": STOOQ_HIST_UA },
    });
    if (!res.ok) return null;
    const rows = parseFredCpiCsvToMonthlyRows(await res.text());
    const map = buildCpiYoYPercentByYearFromMonthlyRows(rows);
    return map.get(cy) ?? null;
  } catch {
    return null;
  }
}

/** Past years from `staticCpiYoYByYear.json`; current year from FRED (API first, then CSV). */
async function fetchFredCpiYoYByYear(): Promise<Map<number, number>> {
  const base = loadStaticCpiYoYMap();
  const cy = new Date().getUTCFullYear();
  let yoy = await fetchFredCurrentYearYoYFromApi(cy);
  if (yoy === null) {
    yoy = await fetchFredCurrentYearYoYFromGraphCsv(cy);
  }
  if (yoy !== null) base.set(cy, yoy);
  return base;
}

async function fetchStooqYearlyClosesBySymbol(stooqSymbol: string): Promise<YearlyCloseMap> {
  try {
    const d1 = "20050101";
    const d2 = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(stooqSymbol)}&d1=${d1}&d2=${d2}&i=d`;
    const res = await fetch(url, {
      next: { revalidate: 86400 },
      headers: { "user-agent": STOOQ_HIST_UA },
    });
    if (!res.ok) return new Map();
    return parseStooqDailyHistoryToYearlyLastClose(await res.text());
  } catch {
    return new Map();
  }
}

/** Exported for tests — Yahoo monthly closes, last bar per calendar year. */
export async function fetchYahooYearlyCloses(symbol: string): Promise<YearlyCloseMap> {
  const map: YearlyCloseMap = new Map();
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1mo&range=max`;
    // Monthly historical series — not intraday; cache aggressively (aligns with “delayed” quote pages).
    const res = await fetch(url, {
      next: { revalidate: 86400 },
      headers: { "user-agent": YAHOO_CHART_UA },
    });
    if (!res.ok) return map;
    const json = (await res.json()) as {
      chart?: {
        error?: { description?: string };
        result?: Array<{
          timestamp?: number[];
          indicators?: {
            quote?: Array<{ close?: Array<number | null> }>;
            adjclose?: Array<{ adjclose?: Array<number | null> }>;
          };
        }>;
      };
    };
    if (json.chart?.error) return map;
    const result = json.chart?.result?.[0];
    const ts = result?.timestamp;
    const quote = result?.indicators?.quote?.[0];
    const closeArr = quote?.close;
    const adjArr = result?.indicators?.adjclose?.[0]?.adjclose;
    if (!ts?.length) return map;

    const byYear = new Map<number, { t: number; c: number }>();
    for (let i = 0; i < ts.length; i++) {
      const raw = closeArr?.[i] ?? adjArr?.[i] ?? null;
      if (raw == null || Number.isNaN(Number(raw))) continue;
      const c = Number(raw);
      const y = new Date(ts[i] * 1000).getFullYear();
      const prev = byYear.get(y);
      if (!prev || ts[i] > prev.t) byYear.set(y, { t: ts[i], c });
    }
    for (const [y, v] of byYear) map.set(y, v.c);
  } catch {
    // leave empty
  }
  return map;
}

/**
 * Pre-first datapoint = first known close (flat line), then forward-fill.
 * If Yahoo returns nothing, we still emit a flat placeholder so the chart always draws
 * three colored overlays (they sit near mid-chart, not collapsed at 0).
 */
export function alignYearSeries(years: number[], yearly: YearlyCloseMap): number[] {
  const raw = years.map((y) => yearly.get(y) ?? null);
  const firstIdx = raw.findIndex((v) => v != null);
  if (firstIdx === -1) return years.map(() => 50);
  const firstVal = raw[firstIdx]!;
  let last = firstVal;
  return raw.map((v, i) => {
    if (v != null) last = v;
    return i < firstIdx ? firstVal : last;
  });
}

export type NormalizeTo100Options = {
  /**
   * When min === max, nudge the flat line slightly so S&P / BTC / NTDOY don’t paint as one stroke.
   * Typical: 0, ~0.5, ~-0.5 on the 0–100 scale.
   */
  degenerateBias?: number;
};

/** True if aligned series has more than one distinct value (before normalization). */
export function seriesHasVariance(values: number[]): boolean {
  if (values.length < 2) return false;
  const min = Math.min(...values);
  const max = Math.max(...values);
  return max - min > 1e-9;
}

/** Min–max normalize to 0–100. Constant series → mid-chart (~50), not 0 (bottom). */
export function normalizeTo100(values: number[], options?: NormalizeTo100Options): number[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const bias = options?.degenerateBias ?? 0;
  if (max === min) {
    const mid = Math.min(100, Math.max(0, 50 + bias));
    return values.map(() => mid);
  }
  return values.map((v) => ((v - min) / (max - min)) * 100);
}

/** Parallel fetch + per-asset normalization (same Y scale as hype 0–100). */
export async function fetchMarketYearlyOverlay(years: number[]): Promise<MarketYearlyOverlay> {
  if (years.length === 0) {
    return { sp500: [], btc: [], nintendo: [], inflationYoY: [], inflation: [] };
  }
  const [spY, btcY, ntY, spS, btcS, cpiYoYMap] = await Promise.all([
    fetchYahooYearlyCloses("^GSPC"),
    fetchYahooYearlyCloses("BTC-USD"),
    fetchYahooYearlyCloses("NTDOY"),
    fetchStooqYearlyClosesBySymbol("^spx"),
    fetchStooqYearlyClosesBySymbol("btcusd"),
    fetchFredCpiYoYByYear(),
  ]);
  const spMap = mergeYearlyMaps(spY, spS);
  const btcMap = mergeYearlyMaps(btcY, btcS);
  /** NTDOY only from Yahoo — Stooq OTC symbols (ntdoy.us, …) often return no rows. */
  const ntMap = mergeYearlyMaps(ntY, new Map());
  const spAligned = alignYearSeries(years, spMap);
  const btcAligned = alignYearSeries(years, btcMap);
  let ntAligned = alignYearSeries(years, ntMap);
  /**
   * NTDOY ADR can be empty/flat after Yahoo (blocked IP, sparse OTC). Tokyo listings restore shape.
   * Use one source at a time (no mixing USD ADR with JPY in the same raw series).
   */
  if (!seriesHasVariance(ntAligned)) {
    const jpMap = await fetchYahooYearlyCloses("7974.T");
    ntAligned = alignYearSeries(years, jpMap);
  }
  if (!seriesHasVariance(ntAligned)) {
    const stooqTokyo = await fetchStooqYearlyClosesBySymbol("7974.jp");
    ntAligned = alignYearSeries(years, stooqTokyo);
  }
  const inflationYoY = alignYearSeries(years, cpiYoYMap);
  return {
    sp500: normalizeTo100(spAligned, { degenerateBias: 0 }),
    btc: normalizeTo100(btcAligned, { degenerateBias: 0.55 }),
    nintendo: normalizeTo100(ntAligned, { degenerateBias: -0.55 }),
    inflationYoY,
    inflation: normalizeTo100(inflationYoY, { degenerateBias: 0.25 }),
  };
}
