/**
 * Yearly closes from **Stooq** daily history → normalized 0–100 series for the hype chart overlay.
 *
 * **CPI YoY (inflation line):** baseline years from `src/data/staticCpiYoYByYear.json` (regenerate yearly:
 * `node scripts/generate-static-cpi-yojson.mjs`). For live years on the chart only, gap-fill order is
 * (1) FRED API when env `FRED_API_KEY` is set → (2) World Bank → (3) FRED `fredgraph.csv` tail parse.
 */

import { timedAsync } from "@/lib/serverTiming";
import {
  readStaticCpiYoYFromDb,
  readStooqMonthlyCloseFromDb,
  readStooqYearlyCloseFromDb,
  readRuntimeSnapshotFromDb,
  upsertRuntimeSnapshotToDb,
  upsertStooqMonthlyClose,
  upsertStooqYearlyClose,
} from "@/lib/staticDataDb";

export type MarketHighlightKey = "sp500" | "btc" | "nintendo" | "inflation";

export type MarketYearlyOverlay = {
  sp500: number[];
  btc: number[];
  nintendo: number[];
  /** US CPI YoY % (FRED CPIAUCSL: last month in year vs same month prior year). */
  inflationYoY: number[];
  /** Same inflation series min–max normalized to 0–100 (thin line on chart). */
  inflation: number[];
  /** Optional higher-resolution recent window (used by mobile chart). */
  monthly?: {
    labels: string[];
    sp500: number[];
    btc: number[];
    nintendo: number[];
    inflationYoY: number[];
    inflation: number[];
  };
};

type YearlyCloseMap = Map<number, number>;
type MonthlyCloseMap = Map<string, number>;
type YahooChartResponse = {
  chart?: {
    result?: Array<{
      timestamp?: number[];
      indicators?: { quote?: Array<{ close?: Array<number | null> }> };
    }>;
  };
};

const STOOQ_HIST_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** Bound slow upstreams so Vercel serverless (often ~10s on Hobby) doesn’t hang on one fetch. */
const HIST_FETCH_TIMEOUT_MS = 18_000;
const FRED_API_TIMEOUT_MS = 12_000;
const WB_INFLATION_TIMEOUT_MS = 10_000;

/**
 * Durable yearly fallback shape so overlays stay informative during upstream outages on cold starts.
 * Source: Yahoo monthly chart API yearly closes (captured 2026-04-02 UTC).
 */
const STATIC_YEARLY_CLOSES_SP500: Record<number, number> = {
  2005: 1248.29,
  2006: 1418.3,
  2007: 1468.36,
  2008: 903.25,
  2009: 1115.1,
  2010: 1257.64,
  2011: 1257.6,
  2012: 1426.19,
  2013: 1848.36,
  2014: 2058.9,
  2015: 2043.94,
  2016: 2238.83,
  2017: 2673.61,
  2018: 2506.85,
  2019: 3230.78,
  2020: 3756.07,
  2021: 4766.18,
  2022: 3839.5,
  2023: 4769.83,
  2024: 5881.63,
  2025: 6845.5,
  2026: 6527.49,
};
const STATIC_YEARLY_CLOSES_BTC: Record<number, number> = {
  2014: 320.193,
  2015: 430.567,
  2016: 963.743,
  2017: 14156.4,
  2018: 3742.7,
  2019: 7193.599,
  2020: 29001.721,
  2021: 46306.445,
  2022: 16547.496,
  2023: 42265.188,
  2024: 93429.203,
  2025: 87508.828,
  2026: 66389.406,
};
const STATIC_YEARLY_CLOSES_NINTENDO: Record<number, number> = {
  2005: 3.05,
  2006: 6.5,
  2007: 14.81,
  2008: 9.55,
  2009: 5.964,
  2010: 7.266,
  2011: 3.388,
  2012: 2.662,
  2013: 3.336,
  2014: 2.59,
  2015: 3.452,
  2016: 5.19,
  2017: 9.014,
  2018: 6.62,
  2019: 9.98,
  2020: 16.104,
  2021: 11.674,
  2022: 10.42,
  2023: 12.99,
  2024: 14.63,
  2025: 16.86,
  2026: 13.77,
};

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

/** Last trading close per `YYYY-MM` from Stooq daily CSV (Date + Close). */
export function parseStooqDailyHistoryToMonthlyLastClose(csv: string): MonthlyCloseMap {
  const map: MonthlyCloseMap = new Map();
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
  const lastByMonth = new Map<string, { dateStr: string; close: number }>();
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    const dateStr = cols[dateIdx]?.trim();
    const rawClose = cols[closeIdx]?.trim().replace(/^"|"$/g, "") ?? "";
    const close = Number(rawClose);
    if (!dateStr || Number.isNaN(close)) continue;
    const d = new Date(`${dateStr}T12:00:00Z`);
    if (Number.isNaN(d.getTime())) continue;
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const prev = lastByMonth.get(key);
    if (!prev || dateStr > prev.dateStr) {
      lastByMonth.set(key, { dateStr, close });
    }
  }
  for (const [k, v] of lastByMonth) map.set(k, v.close);
  return map;
}

/** `primary` wins on year collision (e.g. `ntdoy.us` over plain `ntdoy`). */
function mergeYearlyMaps(primary: YearlyCloseMap, secondary: YearlyCloseMap): YearlyCloseMap {
  const out = new Map<number, number>(secondary);
  for (const [y, c] of primary) out.set(y, c);
  return out;
}

/** `primary` wins on month collision. */
function mergeMonthlyMaps(primary: MonthlyCloseMap, secondary: MonthlyCloseMap): MonthlyCloseMap {
  const out = new Map<string, number>(secondary);
  for (const [ym, c] of primary) out.set(ym, c);
  return out;
}

/** Build yearly closes from a `YYYY-MM -> close` map (last month in year wins). */
function yearlyFromMonthly(monthly: MonthlyCloseMap): YearlyCloseMap {
  const out: YearlyCloseMap = new Map();
  const byYearLatest = new Map<number, { ym: string; close: number }>();
  for (const [ym, close] of monthly) {
    const year = Number(ym.slice(0, 4));
    if (Number.isNaN(year)) continue;
    const prev = byYearLatest.get(year);
    if (!prev || ym > prev.ym) byYearLatest.set(year, { ym, close });
  }
  for (const [year, row] of byYearLatest) out.set(year, row.close);
  return out;
}

function parseYahooMonthlyCloses(payload: YahooChartResponse): MonthlyCloseMap {
  const out: MonthlyCloseMap = new Map();
  const result = payload.chart?.result?.[0];
  const stamps = result?.timestamp ?? [];
  const closes = result?.indicators?.quote?.[0]?.close ?? [];
  if (stamps.length === 0 || closes.length === 0) return out;

  const monthLast = new Map<string, { ts: number; close: number }>();
  const n = Math.min(stamps.length, closes.length);
  for (let i = 0; i < n; i++) {
    const ts = Number(stamps[i]);
    const close = Number(closes[i]);
    if (!Number.isFinite(ts) || !Number.isFinite(close)) continue;
    const d = new Date(ts * 1000);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const prev = monthLast.get(key);
    if (!prev || ts > prev.ts) monthLast.set(key, { ts, close });
  }
  for (const [ym, row] of monthLast) out.set(ym, row.close);
  return out;
}

async function fetchYahooMonthlyClosesBySymbol(yahooSymbol: string, rangeYears = 25): Promise<MonthlyCloseMap> {
  try {
    const years = Math.max(1, Math.min(25, Math.round(rangeYears)));
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=${years}y&interval=1mo&events=div%2Csplits`;
    const res = await fetch(url, {
      next: { revalidate: 86400 },
      headers: { "user-agent": STOOQ_HIST_UA },
      signal: AbortSignal.timeout(HIST_FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return new Map();
    const json = (await res.json()) as YahooChartResponse;
    return parseYahooMonthlyCloses(json);
  } catch {
    return new Map();
  }
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
  return readStaticCpiYoYFromDb();
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
  const cached = readStooqYearlyCloseFromDb(stooqSymbol);
  try {
    const d1 = "20050101";
    const d2 = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(stooqSymbol)}&d1=${d1}&d2=${d2}&i=d`;
    const res = await fetch(url, {
      next: { revalidate: 86400 },
      headers: { "user-agent": STOOQ_HIST_UA },
      signal: AbortSignal.timeout(HIST_FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return cached;
    const parsed = parseStooqDailyHistoryToYearlyLastClose(await res.text());
    const currentYear = new Date().getUTCFullYear();
    const immutable = new Map<number, number>();
    for (const [year, close] of parsed) {
      if (year < currentYear) immutable.set(year, close);
    }
    upsertStooqYearlyClose(stooqSymbol, immutable);
    // Merge cached + fresh (fresh wins for overlaps).
    const merged = new Map<number, number>(cached);
    for (const [year, close] of parsed) merged.set(year, close);
    return merged;
  } catch {
    return cached;
  }
}

async function fetchStooqYearlyClosesBySymbols(symbols: string[]): Promise<YearlyCloseMap> {
  const merged = new Map<number, number>();
  for (const s of symbols) {
    const m = await fetchStooqYearlyClosesBySymbol(s);
    for (const [y, c] of m) {
      if (!merged.has(y)) merged.set(y, c);
    }
  }
  return merged;
}

async function fetchStooqMonthlyClosesBySymbol(
  stooqSymbol: string,
  windowMonths = 30,
): Promise<MonthlyCloseMap> {
  const cached = readStooqMonthlyCloseFromDb(stooqSymbol);
  try {
    const d2 = new Date();
    const d1 = new Date(d2);
    d1.setUTCMonth(d1.getUTCMonth() - windowMonths);
    const fmt = (d: Date) =>
      `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
    const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(stooqSymbol)}&d1=${fmt(d1)}&d2=${fmt(d2)}&i=d`;
    const res = await fetch(url, {
      next: { revalidate: 86400 },
      headers: { "user-agent": STOOQ_HIST_UA },
      signal: AbortSignal.timeout(HIST_FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return cached;
    const parsed = parseStooqDailyHistoryToMonthlyLastClose(await res.text());
    const now = new Date();
    const currentYm = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    const immutable = new Map<string, number>();
    for (const [ym, close] of parsed) {
      if (ym < currentYm) immutable.set(ym, close);
    }
    upsertStooqMonthlyClose(stooqSymbol, immutable);
    const merged = new Map<string, number>(cached);
    for (const [ym, close] of parsed) merged.set(ym, close);
    return merged;
  } catch {
    return cached;
  }
}

async function fetchStooqMonthlyClosesBySymbols(
  symbols: string[],
  windowMonths = 30,
): Promise<MonthlyCloseMap> {
  const merged = new Map<string, number>();
  for (const s of symbols) {
    const m = await fetchStooqMonthlyClosesBySymbol(s, windowMonths);
    for (const [ym, c] of m) {
      if (!merged.has(ym)) merged.set(ym, c);
    }
  }
  return merged;
}

function buildRecentMonthLabels(count: number, now = new Date()): string[] {
  const out: string[] = [];
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0-based
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

function pickStaticYearlyFallbackMap(
  years: number[],
  staticByYear: Record<number, number>,
): YearlyCloseMap {
  const out: YearlyCloseMap = new Map();
  for (const year of years) {
    const close = staticByYear[year];
    if (typeof close === "number" && Number.isFinite(close)) out.set(year, close);
  }
  return out;
}

/**
 * Sparse maps (e.g. only year-end points) can have size>8 but still render almost flat on a 24M chart.
 * Require a minimum amount of coverage inside the actual recent window.
 */
function hasRecentMonthlyCoverage(
  monthly: MonthlyCloseMap,
  recentLabels: string[],
  minCoveredMonths = 10,
): boolean {
  if (recentLabels.length === 0) return monthly.size > 0;
  let covered = 0;
  for (const label of recentLabels) {
    if (monthly.has(label)) covered += 1;
  }
  return covered >= minCoveredMonths;
}

function alignMonthSeries(labels: string[], monthly: MonthlyCloseMap): number[] {
  const raw = labels.map((k) => monthly.get(k) ?? null);
  const firstIdx = raw.findIndex((v) => v != null);
  if (firstIdx === -1) return labels.map(() => 50);
  const firstVal = raw[firstIdx]!;
  let last = firstVal;
  return raw.map((v, i) => {
    if (v != null) last = v;
    return i < firstIdx ? firstVal : last;
  });
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

function mergeYearlyFromDbSymbols(symbols: string[]): YearlyCloseMap {
  let merged: YearlyCloseMap = new Map();
  for (const symbol of symbols) {
    merged = mergeYearlyMaps(readStooqYearlyCloseFromDb(symbol), merged);
  }
  return merged;
}

function mergeMonthlyFromDbSymbols(symbols: string[]): MonthlyCloseMap {
  let merged: MonthlyCloseMap = new Map();
  for (const symbol of symbols) {
    merged = mergeMonthlyMaps(readStooqMonthlyCloseFromDb(symbol), merged);
  }
  return merged;
}

function interpolateMonthlyFromYearlyNormalized(
  years: number[],
  yearlyNormalized: number[],
  labels: string[],
): number[] {
  if (labels.length === 0 || years.length === 0 || yearlyNormalized.length !== years.length) return [];
  const idxByYear = new Map<number, number>();
  years.forEach((y, idx) => idxByYear.set(y, idx));
  return labels.map((label) => {
    const y = Number(label.slice(0, 4));
    const m = Number(label.slice(5, 7));
    if (!Number.isFinite(y) || !Number.isFinite(m)) return 50;
    const idx = idxByYear.get(y);
    if (idx === undefined) return yearlyNormalized[yearlyNormalized.length - 1] ?? 50;
    const curr = yearlyNormalized[idx] ?? 50;
    const prev = idx > 0 ? (yearlyNormalized[idx - 1] ?? curr) : curr;
    const t = Math.max(1, Math.min(12, m)) / 12;
    return prev + (curr - prev) * t;
  });
}

/** DB-only overlay builder: no network calls, used for instant async-first first paint. */
export function buildMarketYearlyOverlayFromDb(years: number[]): MarketYearlyOverlay | null {
  if (years.length === 0) return null;

  let spYearly = mergeYearlyFromDbSymbols(["^spx", "spx", "spy.us"]);
  let btcYearly = mergeYearlyFromDbSymbols(["btcusd", "btcusd.v"]);
  let ntYearly = mergeYearlyFromDbSymbols(["ntdoy.us", "ntdoy", "7974.jp"]);
  const cpiYoYMap = loadStaticCpiForChartYears(years);

  let spAligned = alignYearSeries(years, spYearly);
  let btcAligned = alignYearSeries(years, btcYearly);
  let ntAligned = alignYearSeries(years, ntYearly);

  if (!seriesHasVariance(spAligned)) {
    spYearly = mergeYearlyMaps(pickStaticYearlyFallbackMap(years, STATIC_YEARLY_CLOSES_SP500), spYearly);
    spAligned = alignYearSeries(years, spYearly);
  }
  if (!seriesHasVariance(btcAligned)) {
    btcYearly = mergeYearlyMaps(pickStaticYearlyFallbackMap(years, STATIC_YEARLY_CLOSES_BTC), btcYearly);
    btcAligned = alignYearSeries(years, btcYearly);
  }
  if (!seriesHasVariance(ntAligned)) {
    ntYearly = mergeYearlyMaps(pickStaticYearlyFallbackMap(years, STATIC_YEARLY_CLOSES_NINTENDO), ntYearly);
    ntAligned = alignYearSeries(years, ntYearly);
  }

  const sp500 = normalizeTo100(spAligned, { degenerateBias: 0 });
  const btc = normalizeTo100(btcAligned, { degenerateBias: 0.55 });
  const nintendo = normalizeTo100(ntAligned, { degenerateBias: -0.55 });
  const inflationYoY = alignYearSeries(years, cpiYoYMap);
  const inflation = normalizeTo100(inflationYoY, { degenerateBias: 0.25 });

  const monthLabels = buildRecentMonthLabels(24);
  const spMonthlyMap = mergeMonthlyFromDbSymbols(["^spx", "spx", "spy.us"]);
  const btcMonthlyMap = mergeMonthlyFromDbSymbols(["btcusd", "btcusd.v"]);
  const ntMonthlyMap = mergeMonthlyFromDbSymbols(["ntdoy.us", "ntdoy", "7974.jp"]);

  const sp500Monthly = hasRecentMonthlyCoverage(spMonthlyMap, monthLabels)
    ? normalizeTo100(alignMonthSeries(monthLabels, spMonthlyMap), { degenerateBias: 0 })
    : interpolateMonthlyFromYearlyNormalized(years, sp500, monthLabels);
  const btcMonthly = hasRecentMonthlyCoverage(btcMonthlyMap, monthLabels)
    ? normalizeTo100(alignMonthSeries(monthLabels, btcMonthlyMap), { degenerateBias: 0.55 })
    : interpolateMonthlyFromYearlyNormalized(years, btc, monthLabels);
  const nintendoMonthly = hasRecentMonthlyCoverage(ntMonthlyMap, monthLabels)
    ? normalizeTo100(alignMonthSeries(monthLabels, ntMonthlyMap), { degenerateBias: -0.55 })
    : interpolateMonthlyFromYearlyNormalized(years, nintendo, monthLabels);
  const monthlyInflationYoY = monthLabels.map((label) => cpiYoYMap.get(Number(label.slice(0, 4))) ?? 0);
  const monthlyInflation = normalizeTo100(monthlyInflationYoY, { degenerateBias: 0.25 });

  return {
    sp500,
    btc,
    nintendo,
    inflationYoY,
    inflation,
    monthly: {
      labels: monthLabels,
      sp500: sp500Monthly,
      btc: btcMonthly,
      nintendo: nintendoMonthly,
      inflationYoY: monthlyInflationYoY,
      inflation: monthlyInflation,
    },
  };
}

const lastGoodOverlayByYears = new Map<string, MarketYearlyOverlay>();

function yearsKey(years: number[]): string {
  return years.join(",");
}

function overlayHasCoreVariance(overlay: MarketYearlyOverlay): boolean {
  return (
    seriesHasVariance(overlay.sp500) ||
    seriesHasVariance(overlay.btc) ||
    seriesHasVariance(overlay.nintendo)
  );
}

/** Parallel fetch + per-asset normalization (same Y scale as hype 0–100). */
export async function fetchMarketYearlyOverlay(years: number[]): Promise<MarketYearlyOverlay> {
  if (years.length === 0) {
    return { sp500: [], btc: [], nintendo: [], inflationYoY: [], inflation: [], monthly: undefined };
  }
  const key = yearsKey(years);
  const previousGood =
    lastGoodOverlayByYears.get(key) ??
    readRuntimeSnapshotFromDb<MarketYearlyOverlay>(`overlay_years_${key}`);
  const [spS, btcS, ntUs, ntPlain, cpiYoYMap, spM, btcM, ntUsM, ntPlainM] = await Promise.all([
    timedAsync("overlay:stooq:sp500", () => fetchStooqYearlyClosesBySymbols(["^spx", "spx", "spy.us"])),
    timedAsync("overlay:stooq:btc", () => fetchStooqYearlyClosesBySymbols(["btcusd", "btcusd.v"])),
    timedAsync("overlay:stooqNtdyUs", () => fetchStooqYearlyClosesBySymbol("ntdoy.us")),
    timedAsync("overlay:stooqNtdy", () => fetchStooqYearlyClosesBySymbol("ntdoy")),
    timedAsync("overlay:cpiYoY(fred+wb+csv)", () => fetchFredCpiYoYByYear(years)),
    timedAsync("overlay:monthly:sp500", () => fetchStooqMonthlyClosesBySymbols(["^spx", "spx", "spy.us"])),
    timedAsync("overlay:monthly:btc", () => fetchStooqMonthlyClosesBySymbols(["btcusd", "btcusd.v"])),
    timedAsync("overlay:monthly:ntUs", () => fetchStooqMonthlyClosesBySymbol("ntdoy.us")),
    timedAsync("overlay:monthly:nt", () => fetchStooqMonthlyClosesBySymbol("ntdoy")),
  ]);
  let spMap = spS;
  let btcMap = btcS;
  let ntMap = mergeYearlyMaps(ntUs, ntPlain);
  let spMonthly = spM;
  let btcMonthly = btcM;
  let ntMonthly = mergeMonthlyMaps(ntUsM, ntPlainM);
  const monthLabels = buildRecentMonthLabels(24);

  // Stooq can occasionally return empty bodies; Yahoo chart API is a robust fallback source.
  if (spMap.size === 0 || !hasRecentMonthlyCoverage(spMonthly, monthLabels)) {
    const spYahoo = await timedAsync("overlay:yahoo:sp500", () => fetchYahooMonthlyClosesBySymbol("^GSPC"));
    if (spYahoo.size > 0) {
      spMonthly = mergeMonthlyMaps(spYahoo, spMonthly);
      spMap = mergeYearlyMaps(yearlyFromMonthly(spYahoo), spMap);
    }
  }
  if (btcMap.size === 0 || !hasRecentMonthlyCoverage(btcMonthly, monthLabels)) {
    const btcYahoo = await timedAsync("overlay:yahoo:btc", () => fetchYahooMonthlyClosesBySymbol("BTC-USD"));
    if (btcYahoo.size > 0) {
      btcMonthly = mergeMonthlyMaps(btcYahoo, btcMonthly);
      btcMap = mergeYearlyMaps(yearlyFromMonthly(btcYahoo), btcMap);
    }
  }
  if (ntMap.size === 0 || !hasRecentMonthlyCoverage(ntMonthly, monthLabels)) {
    const ntYahooUsd = await timedAsync("overlay:yahoo:nintendoUsd", () =>
      fetchYahooMonthlyClosesBySymbol("NTDOY"),
    );
    if (ntYahooUsd.size > 0) {
      ntMonthly = mergeMonthlyMaps(ntYahooUsd, ntMonthly);
      ntMap = mergeYearlyMaps(yearlyFromMonthly(ntYahooUsd), ntMap);
    }
  }

  let spAligned = alignYearSeries(years, spMap);
  let btcAligned = alignYearSeries(years, btcMap);
  let ntAligned = alignYearSeries(years, ntMap);
  /** NTDOY OTC can be sparse; Tokyo Stooq listing restores shape (single source, JPY→chart). */
  if (!seriesHasVariance(ntAligned)) {
    const [stooqTokyo, yahooTokyo] = await Promise.all([
      timedAsync("overlay:stooq7974.jp", () => fetchStooqYearlyClosesBySymbol("7974.jp")),
      timedAsync("overlay:yahoo7974.T", () => fetchYahooMonthlyClosesBySymbol("7974.T")),
    ]);
    const fromYahooTokyo = yearlyFromMonthly(yahooTokyo);
    ntMap = mergeYearlyMaps(fromYahooTokyo, stooqTokyo);
    ntMonthly = mergeMonthlyMaps(yahooTokyo, ntMonthly);
    ntAligned = alignYearSeries(years, ntMap);
  }

  // Final durable fallback for cold starts when all live sources fail.
  if (!seriesHasVariance(spAligned)) {
    spMap = mergeYearlyMaps(pickStaticYearlyFallbackMap(years, STATIC_YEARLY_CLOSES_SP500), spMap);
    spAligned = alignYearSeries(years, spMap);
  }
  if (!seriesHasVariance(btcAligned)) {
    btcMap = mergeYearlyMaps(pickStaticYearlyFallbackMap(years, STATIC_YEARLY_CLOSES_BTC), btcMap);
    btcAligned = alignYearSeries(years, btcMap);
  }
  if (!seriesHasVariance(ntAligned)) {
    ntMap = mergeYearlyMaps(pickStaticYearlyFallbackMap(years, STATIC_YEARLY_CLOSES_NINTENDO), ntMap);
    ntAligned = alignYearSeries(years, ntMap);
  }
  const inflationYoY = alignYearSeries(years, cpiYoYMap);
  const spMonthlyAligned = alignMonthSeries(monthLabels, spMonthly);
  const btcMonthlyAligned = alignMonthSeries(monthLabels, btcMonthly);
  const ntMonthlyAligned = alignMonthSeries(monthLabels, ntMonthly);
  const monthlyInflationYoY = monthLabels.map((label) => {
    const y = Number(label.slice(0, 4));
    const v = cpiYoYMap.get(y);
    return v ?? 0;
  });
  let overlay: MarketYearlyOverlay = {
    sp500: normalizeTo100(spAligned, { degenerateBias: 0 }),
    btc: normalizeTo100(btcAligned, { degenerateBias: 0.55 }),
    nintendo: normalizeTo100(ntAligned, { degenerateBias: -0.55 }),
    inflationYoY,
    inflation: normalizeTo100(inflationYoY, { degenerateBias: 0.25 }),
    monthly: {
      labels: monthLabels,
      sp500: normalizeTo100(spMonthlyAligned, { degenerateBias: 0 }),
      btc: normalizeTo100(btcMonthlyAligned, { degenerateBias: 0.55 }),
      nintendo: normalizeTo100(ntMonthlyAligned, { degenerateBias: -0.55 }),
      inflationYoY: monthlyInflationYoY,
      inflation: normalizeTo100(monthlyInflationYoY, { degenerateBias: 0.25 }),
    },
  };

  // If one upstream source fails and collapses to a flat neutral line, keep prior valid shape.
  if (previousGood) {
    if (!seriesHasVariance(spAligned)) overlay.sp500 = previousGood.sp500;
    if (!seriesHasVariance(btcAligned)) overlay.btc = previousGood.btc;
    if (!seriesHasVariance(ntAligned)) overlay.nintendo = previousGood.nintendo;
    if (overlay.monthly && previousGood.monthly) {
      if (!seriesHasVariance(spMonthlyAligned)) overlay.monthly.sp500 = previousGood.monthly.sp500;
      if (!seriesHasVariance(btcMonthlyAligned)) overlay.monthly.btc = previousGood.monthly.btc;
      if (!seriesHasVariance(ntMonthlyAligned)) overlay.monthly.nintendo = previousGood.monthly.nintendo;
    }
  }

  if (overlayHasCoreVariance(overlay)) {
    lastGoodOverlayByYears.set(key, overlay);
    upsertRuntimeSnapshotToDb(`overlay_years_${key}`, overlay);
  } else if (previousGood) {
    overlay = previousGood;
  }

  return overlay;
}
