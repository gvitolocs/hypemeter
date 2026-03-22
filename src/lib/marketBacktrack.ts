/**
 * Yearly Yahoo Finance monthly closes → normalized 0–100 series for the hype chart overlay.
 */

const YAHOO_CHART_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export type MarketHighlightKey = "sp500" | "btc" | "nintendo" | "inflation";

export type MarketYearlyOverlay = {
  sp500: number[];
  btc: number[];
  nintendo: number[];
  /** US CPI annual inflation % (World Bank FP.CPI.TOTL.ZG), aligned to chart years. */
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

/** World Bank: US annual CPI inflation % (consumer prices, YoY). */
async function fetchWorldBankUsInflationYoYByYear(): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  try {
    const url =
      "https://api.worldbank.org/v2/country/USA/indicator/FP.CPI.TOTL.ZG?format=json&per_page=500&date=1960:2040";
    const res = await fetch(url, {
      next: { revalidate: 86400 },
      headers: { "user-agent": STOOQ_HIST_UA },
    });
    if (!res.ok) return map;
    const json = (await res.json()) as unknown;
    if (!Array.isArray(json) || json.length < 2) return map;
    const rows = json[1] as Array<{ date?: string; value?: number | null }>;
    for (const row of rows) {
      const raw = row.date;
      const y = raw ? parseInt(String(raw).slice(0, 4), 10) : NaN;
      const v = row.value;
      if (!Number.isNaN(y) && v != null && typeof v === "number" && !Number.isNaN(v)) {
        map.set(y, v);
      }
    }
  } catch {
    // ignore
  }
  return map;
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
    fetchWorldBankUsInflationYoYByYear(),
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
