/**
 * Yearly closes from **Stooq** daily history → normalized 0–100 series for the hype chart overlay.
 *
 * **CPI YoY (inflation line):** baseline years from `src/data/staticCpiYoYByYear.json` (regenerate yearly:
 * `node scripts/generate-static-cpi-yojson.mjs`). For live years on the chart only, gap-fill order is
 * (1) FRED API when env `FRED_API_KEY` is set → (2) World Bank → (3) FRED `fredgraph.csv` tail parse.
 */

import staticCpiYoYByYear from "@/data/staticCpiYoYByYear.json";
import { timedAsync } from "@/lib/serverTiming";

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

/** Bound slow upstreams so Vercel serverless (often ~10s on Hobby) doesn’t hang on one fetch. */
const HIST_FETCH_TIMEOUT_MS = 18_000;
const FRED_API_TIMEOUT_MS = 12_000;
const WB_INFLATION_TIMEOUT_MS = 10_000;

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

/** `primary` wins on year collision (e.g. `ntdoy.us` over plain `ntdoy`). */
function mergeYearlyMaps(primary: YearlyCloseMap, secondary: YearlyCloseMap): YearlyCloseMap {
  const out = new Map<number, number>(secondary);
  for (const [y, c] of primary) out.set(y, c);
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

/** Only years drawn on the hype chart — avoids carrying unused YoY keys in the overlay map. */
function loadStaticCpiForChartYears(chartYears: number[]): Map<number, number> {
  const full = loadStaticCpiYoYMap();
  const m = new Map<number, number>();
  for (const y of chartYears) {
    const v = full.get(y);
    if (v !== undefined) m.set(y, v);
  }
  return m;
}

/**
 * Live YoY for years in `liveYears` (subset of {cy−1, cy}) — minimal monthly window for YoY math.
 * ~3 calendar years of CPI months (cy−2 → cy) is enough for Dec-vs-prior-Dec style YoY on cy−1 and cy.
 * @see https://fred.stlouisfed.org/docs/api/fred/series_observations.html
 */
async function fetchFredLiveYoYFromApi(cy: number, liveYears: number[]): Promise<Map<number, number>> {
  const key = process.env.FRED_API_KEY?.trim();
  if (!key || liveYears.length === 0) return new Map();
  try {
    const url = new URL("https://api.stlouisfed.org/fred/series/observations");
    url.searchParams.set("series_id", "CPIAUCSL");
    url.searchParams.set("api_key", key);
    url.searchParams.set("file_type", "json");
    url.searchParams.set("observation_start", `${cy - 2}-01-01`);
    url.searchParams.set("sort_order", "asc");
    /** ~4 years of months — enough for YoY on cy−1/cy without pulling decades. */
    url.searchParams.set("limit", "52");
    const res = await fetch(url.toString(), {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(FRED_API_TIMEOUT_MS),
    });
    if (!res.ok) return new Map();
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
    const full = buildCpiYoYPercentByYearFromMonthlyRows(monthly);
    const out = new Map<number, number>();
    for (const y of liveYears) {
      const v = full.get(y);
      if (v !== undefined) out.set(y, v);
    }
    return out;
  } catch {
    return new Map();
  }
}

/**
 * World Bank annual inflation % (USA) — small JSON, often reachable when FRED is slow/blocked.
 * May lag vs monthly CPI; fills gaps after FRED API, before the heavy FRED CSV fetch.
 * @see https://data.worldbank.org/indicator/FP.CPI.TOTL.ZG?locations=US
 */
async function fetchWorldBankInflationYoYForYears(liveYears: number[]): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  if (liveYears.length === 0) return map;
  const minY = Math.min(...liveYears);
  const maxY = Math.max(...liveYears);
  try {
    const url = `https://api.worldbank.org/v2/country/USA/indicator/FP.CPI.TOTL.ZG?format=json&per_page=20&date=${minY - 1}:${maxY}`;
    const res = await fetch(url, {
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(WB_INFLATION_TIMEOUT_MS),
    });
    if (!res.ok) return map;
    const json = (await res.json()) as unknown;
    if (!Array.isArray(json) || json.length < 2) return map;
    const rows = json[1] as Array<{ date?: string; value?: number | null }>;
    for (const row of rows) {
      const raw = row.date;
      const y = raw ? parseInt(String(raw).slice(0, 4), 10) : NaN;
      const rawV = row.value;
      const v =
        rawV == null
          ? NaN
          : typeof rawV === "number"
            ? rawV
            : Number(String(rawV).trim());
      if (Number.isNaN(y) || Number.isNaN(v)) continue;
      if (liveYears.includes(y)) map.set(y, v);
    }
  } catch {
    // ignore
  }
  return map;
}

/**
 * Parse only the last ~8 years of monthly rows (+ header). The public `fredgraph.csv` is huge;
 * we only need enough months to compute YoY for the last 1–2 calendar years on the chart.
 * Exported for tests.
 */
export function parseFredCpiCsvToMonthlyRowsFromTail(csv: string, maxDataRows = 96): CpiMonthRow[] {
  const lines = csv
    .trim()
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];
  const header = lines[0];
  const dataLines = lines.slice(Math.max(1, lines.length - maxDataRows));
  return parseFredCpiCsvToMonthlyRows([header, ...dataLines].join("\n"));
}

/** FRED graph CSV — last resort; parse tail only; timeout so SSR never hangs. */
async function fetchFredLiveYoYFromGraphCsv(liveYears: number[]): Promise<Map<number, number>> {
  if (liveYears.length === 0) return new Map();
  try {
    const res = await fetch("https://fred.stlouisfed.org/graph/fredgraph.csv?id=CPIAUCSL", {
      next: { revalidate: 3600 },
      headers: { "user-agent": STOOQ_HIST_UA },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return new Map();
    const rows = parseFredCpiCsvToMonthlyRowsFromTail(await res.text());
    const full = buildCpiYoYPercentByYearFromMonthlyRows(rows);
    const out = new Map<number, number>();
    for (const y of liveYears) {
      const v = full.get(y);
      if (v !== undefined) out.set(y, v);
    }
    return out;
  } catch {
    return new Map();
  }
}

/** Add values from `fill` only for `years` keys missing in `primary` (FRED API/CSV wins on overlap). */
function mergeGapFill(
  primary: Map<number, number>,
  fill: Map<number, number>,
  years: number[],
): Map<number, number> {
  const out = new Map(primary);
  for (const y of years) {
    if (!out.has(y) && fill.has(y)) out.set(y, fill.get(y)!);
  }
  return out;
}

/**
 * CPI YoY for the **chart x-axis years** only: static JSON for past years, live refresh only for
 * `cy−1`/`cy` when those years appear on the chart (otherwise skip network entirely).
 */
async function fetchFredCpiYoYByYear(chartYears: number[]): Promise<Map<number, number>> {
  const cy = new Date().getUTCFullYear();
  const base = loadStaticCpiForChartYears(chartYears);

  const liveYears = [cy - 1, cy].filter((y) => chartYears.includes(y));
  if (liveYears.length === 0) {
    return base;
  }

  let live = await timedAsync("cpi:fredApi", () => fetchFredLiveYoYFromApi(cy, liveYears));
  if (liveYears.some((y) => !live.has(y))) {
    live = mergeGapFill(
      live,
      await timedAsync("cpi:worldBank", () => fetchWorldBankInflationYoYForYears(liveYears)),
      liveYears,
    );
  }
  if (liveYears.some((y) => !live.has(y))) {
    live = mergeGapFill(
      live,
      await timedAsync("cpi:fredGraphCsv", () => fetchFredLiveYoYFromGraphCsv(liveYears)),
      liveYears,
    );
  }

  for (const [y, v] of live) base.set(y, v);
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
      signal: AbortSignal.timeout(HIST_FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return new Map();
    return parseStooqDailyHistoryToYearlyLastClose(await res.text());
  } catch {
    return new Map();
  }
}

/**
 * Pre-first datapoint = first known close (flat line), then forward-fill.
 * If Stooq returns nothing, we still emit a flat placeholder so the chart always draws
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
  const [spS, btcS, ntUs, ntPlain, cpiYoYMap] = await Promise.all([
    timedAsync("overlay:stooq^spx", () => fetchStooqYearlyClosesBySymbol("^spx")),
    timedAsync("overlay:stooqbtcusd", () => fetchStooqYearlyClosesBySymbol("btcusd")),
    timedAsync("overlay:stooqNtdyUs", () => fetchStooqYearlyClosesBySymbol("ntdoy.us")),
    timedAsync("overlay:stooqNtdy", () => fetchStooqYearlyClosesBySymbol("ntdoy")),
    timedAsync("overlay:cpiYoY(fred+wb+csv)", () => fetchFredCpiYoYByYear(years)),
  ]);
  const spMap = spS;
  const btcMap = btcS;
  const ntMap = mergeYearlyMaps(ntUs, ntPlain);
  const spAligned = alignYearSeries(years, spMap);
  const btcAligned = alignYearSeries(years, btcMap);
  let ntAligned = alignYearSeries(years, ntMap);
  /** NTDOY OTC can be sparse; Tokyo Stooq listing restores shape (single source, JPY→chart). */
  if (!seriesHasVariance(ntAligned)) {
    const stooqTokyo = await timedAsync("overlay:stooq7974.jp", () =>
      fetchStooqYearlyClosesBySymbol("7974.jp"),
    );
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
