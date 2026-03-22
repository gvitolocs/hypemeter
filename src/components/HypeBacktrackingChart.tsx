"use client";

import { useCallback, useMemo, useState } from "react";
import { useMatchMedia } from "@/hooks/useMatchMedia";
import type { MarketHighlightKey, MarketYearlyOverlay } from "@/lib/marketBacktrack";
import { MARKET_CHART } from "@/lib/marketChartColors";

/** Same breakpoint as chart slice in BacktrackMarketSection — mobile-only chart tweaks. */
const MOBILE_CHART_ENHANCE_MQ = "(max-width: 767px)";

type YScaleParams = { mode: "full" } | { mode: "zoom"; yMin: number; yMax: number };

function collectScoresForYRange(history: YearScore[], marketOverlay: MarketYearlyOverlay | null): number[] {
  const values = history.map((h) => h.score);
  if (!marketOverlay || history.length === 0) return values;
  const n = history.length;
  for (const key of ["sp500", "btc", "nintendo", "inflation"] as const) {
    const arr = marketOverlay[key];
    if (!arr || arr.length !== n) continue;
    for (let i = 0; i < n; i++) {
      const v = arr[i];
      if (typeof v === "number" && !Number.isNaN(v)) values.push(v);
    }
  }
  return values;
}

function computeMobileYScale(values: number[]): { yMin: number; yMax: number } {
  if (values.length === 0) return { yMin: 0, yMax: 100 };
  let vmin = Math.min(...values);
  let vmax = Math.max(...values);
  const spread = vmax - vmin;
  const pad = spread < 1e-9 ? 10 : Math.max(spread * 0.12, 5);
  let yMin = Math.max(0, vmin - pad);
  let yMax = Math.min(100, vmax + pad);
  if (yMax - yMin < 18) {
    const mid = (yMin + yMax) / 2;
    yMin = Math.max(0, mid - 12);
    yMax = Math.min(100, mid + 12);
  }
  return { yMin, yMax };
}

type YearScore = {
  year: number;
  score: number;
};

type YearEventSignal = {
  year: number;
  label: string;
  intensity: number;
};

type Props = {
  history: YearScore[];
  events?: YearEventSignal[];
  /** Normalized 0–100 yearly series (same length as `history`). */
  marketOverlay?: MarketYearlyOverlay | null;
  highlightSeries?: MarketHighlightKey | null;
};

function zoneForScore(score: number) {
  if (score >= 90) return "mania";
  if (score >= 75) return "frenzy";
  if (score >= 60) return "hype";
  if (score >= 45) return "warm";
  if (score >= 25) return "calm";
  return "dead";
}

/** Strict local maxima on the hype score (same series as the cyan streamline). */
function localPeakIndices(history: YearScore[]): number[] {
  if (history.length === 0) return [];
  if (history.length === 1) return [0];
  const out: number[] = [];
  for (let i = 0; i < history.length; i++) {
    const s = history[i].score;
    const left = i === 0 ? -Infinity : history[i - 1].score;
    const right = i === history.length - 1 ? -Infinity : history[i + 1].score;
    if (s > left && s > right) out.push(i);
  }
  return out;
}

/** Keep the strongest peaks so markers stay readable. */
function topPeakIndices(history: YearScore[], maxMarkers: number): Set<number> {
  const peaks = localPeakIndices(history);
  const sorted = [...peaks].sort((a, b) => history[b].score - history[a].score);
  return new Set(sorted.slice(0, maxMarkers));
}

/** Fuchsia footer pill when this year has no curated timeline label — still “something of note” per year. */
function deriveFallbackYearSpotlight(
  idx: number,
  history: YearScore[],
  localPeakSet: Set<number>,
): string {
  const h = history[idx];
  if (!h) return "—";
  const prev = idx > 0 ? history[idx - 1] : null;
  const zone = zoneForScore(h.score);
  const scores = history.map((x) => x.score);
  const seriesMax = Math.max(...scores);
  const seriesMin = Math.min(...scores);

  if (localPeakSet.has(idx)) {
    return `Hype peak · ${zone}`;
  }
  if (prev && Math.abs(h.score - prev.score) >= 14) {
    const d = h.score - prev.score;
    return d >= 0 ? `Strong upswing +${d}` : `Pullback ${d}`;
  }
  if (history.length > 1 && h.score === seriesMax) return `Window high · ${zone}`;
  if (history.length > 1 && h.score === seriesMin) return `Window low · ${zone}`;
  return `${zone} · hype ${h.score}`;
}

const MARKET_COLORS = {
  sp500: MARKET_CHART.sp500.rgba,
  btc: MARKET_CHART.btc.rgba,
  nintendo: MARKET_CHART.nintendo.rgba,
  inflation: MARKET_CHART.inflation.rgba,
} as const;

/** Solid fills for tooltip text (match thin lines). */
const MARKET_TOOLTIP_FILLS: Record<MarketHighlightKey, string> = {
  sp500: MARKET_CHART.sp500.hex,
  btc: MARKET_CHART.btc.hex,
  nintendo: MARKET_CHART.nintendo.hex,
  inflation: MARKET_CHART.inflation.hex,
};

const MARKET_SHORT_LABEL: Record<MarketHighlightKey, string> = {
  sp500: "S&P",
  btc: "BTC",
  nintendo: "NT",
  inflation: "CPI",
};

/** Tooltip first row: normalized overlays (not CPI — shown as YoY % on second row). */
const NORM_TOOLTIP_KEYS: MarketHighlightKey[] = ["sp500", "btc", "nintendo"];

export default function HypeBacktrackingChart({
  history,
  events = [],
  marketOverlay = null,
  highlightSeries = null,
}: Props) {
  const isMobileChartEnhance = useMatchMedia(MOBILE_CHART_ENHANCE_MQ);
  // SVG dimensions and drawing paddings for stable scaling across breakpoints.
  const chartWidth = 940;
  /** Taller plot area so the chart column matches Market Sidecar height on large screens. */
  const chartHeight = 340;
  const padX = 20;
  const padY = 18;
  const safeWidth = chartWidth - padX * 2;
  const safeHeight = chartHeight - padY * 2;

  const yScaleParams: YScaleParams = useMemo(() => {
    if (!isMobileChartEnhance || history.length === 0) return { mode: "full" };
    const { yMin, yMax } = computeMobileYScale(collectScoresForYRange(history, marketOverlay));
    return { mode: "zoom", yMin, yMax };
  }, [isMobileChartEnhance, history, marketOverlay]);

  const scoreToY = useMemo(() => {
    return (score: number) => {
      if (yScaleParams.mode === "full") {
        return padY + ((100 - score) / 100) * safeHeight;
      }
      const { yMin, yMax } = yScaleParams;
      const span = Math.max(yMax - yMin, 1e-6);
      return padY + ((yMax - score) / span) * safeHeight;
    };
  }, [padY, safeHeight, yScaleParams]);

  const gridTicks = useMemo(() => {
    if (yScaleParams.mode === "full") return [20, 40, 60, 80] as number[];
    const { yMin, yMax } = yScaleParams;
    const steps = 4;
    return Array.from({ length: steps + 1 }, (_, i) => yMin + (i / steps) * (yMax - yMin));
  }, [yScaleParams]);

  // Precompute render coordinates from score values (0-100) to SVG space.
  const points = useMemo(() => {
    return history.map((entry, idx) => {
      const x = padX + (idx / Math.max(history.length - 1, 1)) * safeWidth;
      const y = scoreToY(entry.score);
      return { ...entry, x, y };
    });
  }, [history, padX, safeWidth, scoreToY]);

  const hypeAreaPathD = useMemo(() => {
    if (!isMobileChartEnhance || points.length === 0) return null;
    const bottom = padY + safeHeight;
    const pn = points[points.length - 1];
    const spine = points.map((p) => `${p.x} ${p.y}`).join(" L ");
    return `M ${points[0].x} ${bottom} L ${spine} L ${pn.x} ${bottom} Z`;
  }, [isMobileChartEnhance, padY, points, safeHeight]);

  const hypePeakIndices = useMemo(() => topPeakIndices(history, 8), [history]);
  const allLocalPeakSet = useMemo(() => new Set(localPeakIndices(history)), [history]);

  const marketLines = useMemo(() => {
    if (!marketOverlay || history.length === 0) return null;
    const n = history.length;
    const keys: Array<{ key: MarketHighlightKey; values: number[]; color: string }> = [
      { key: "sp500", values: marketOverlay.sp500, color: MARKET_COLORS.sp500 },
      { key: "btc", values: marketOverlay.btc, color: MARKET_COLORS.btc },
      { key: "nintendo", values: marketOverlay.nintendo, color: MARKET_COLORS.nintendo },
      { key: "inflation", values: marketOverlay.inflation, color: MARKET_COLORS.inflation },
    ];
    return keys
      .map(({ key, values, color }) => {
        if (!values || values.length !== n) return null;
        const pts = values.map((score, idx) => {
          const x = padX + (idx / Math.max(n - 1, 1)) * safeWidth;
          const y = scoreToY(score);
          return `${x},${y}`;
        });
        return { key, points: pts.join(" "), color };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row));
  }, [history.length, marketOverlay, padX, safeWidth, scoreToY]);

  const polyline = points.map((point) => `${point.x},${point.y}`).join(" ");
  // Active point powers tooltip and stat cards; defaults to latest year.
  const [activeIndex, setActiveIndex] = useState(Math.max(points.length - 1, 0));

  const scrubFromClientX = useCallback(
    (clientX: number, bounds: DOMRect) => {
      if (points.length <= 1) return;
      const ratio = (clientX - bounds.left) / bounds.width;
      const next = Math.round(Math.max(0, Math.min(1, ratio)) * (points.length - 1));
      setActiveIndex(next);
    },
    [points.length],
  );
  const active = points[activeIndex] ?? null;
  const prev = activeIndex > 0 ? points[activeIndex - 1] : null;
  const delta = active && prev ? active.score - prev.score : 0;
  const avg =
    points.length > 0
      ? Math.round(points.reduce((sum, point) => sum + point.score, 0) / points.length)
      : 0;
  const max = points.length > 0 ? Math.max(...points.map((point) => point.score)) : 0;
  const min = points.length > 0 ? Math.min(...points.map((point) => point.score)) : 0;
  const activeIsHypePeak = active ? hypePeakIndices.has(activeIndex) : false;

  const yearSpotlightPills = useMemo(() => {
    if (!active) return [];
    const curated = events.filter((e) => e.year === active.year);
    if (curated.length > 0) return curated.map((e) => e.label);
    return [deriveFallbackYearSpotlight(activeIndex, history, allLocalPeakSet)];
  }, [active, activeIndex, allLocalPeakSet, events, history]);

  const marketAtIndex = useMemo(() => {
    if (!marketOverlay || activeIndex < 0) return null;
    const sp = marketOverlay.sp500[activeIndex];
    const btc = marketOverlay.btc[activeIndex];
    const nt = marketOverlay.nintendo[activeIndex];
    const infN = marketOverlay.inflation[activeIndex];
    const infY = marketOverlay.inflationYoY[activeIndex];
    if (sp === undefined || btc === undefined || nt === undefined) return null;
    if ([sp, btc, nt].some((v) => Number.isNaN(v))) return null;
    const hasCpi =
      infN !== undefined &&
      infY !== undefined &&
      !Number.isNaN(infN) &&
      !Number.isNaN(infY);
    return { sp, btc, nt, infN, infY, hasCpi };
  }, [marketOverlay, activeIndex]);

  const marketTooltipOrder = useMemo((): MarketHighlightKey[] => {
    const all: MarketHighlightKey[] = ["sp500", "btc", "nintendo", "inflation"];
    if (!highlightSeries) return all;
    return [highlightSeries, ...all.filter((k) => k !== highlightSeries)];
  }, [highlightSeries]);

  /** S&P / BTC / NT row — same ordering as `marketTooltipOrder`, minus CPI. */
  const normTooltipOrder = useMemo((): MarketHighlightKey[] => {
    const filtered = marketTooltipOrder.filter((k) => NORM_TOOLTIP_KEYS.includes(k));
    return filtered.length > 0 ? filtered : [...NORM_TOOLTIP_KEYS];
  }, [marketTooltipOrder]);

  return (
    <div className="grid min-h-0 min-w-0 flex-1 grid-rows-[auto_minmax(0,1fr)_auto] rounded-2xl border border-white/10 bg-slate-950 px-3 pt-3 pb-2">
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="flex min-h-[4.75rem] flex-col justify-center rounded-lg border border-white/10 bg-slate-900 p-2">
          <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">selected</p>
          <p className="mt-1 min-h-[1.375rem] text-sm font-semibold tabular-nums leading-none text-cyan-300">
            {active ? `${active.year} • ${active.score}` : "N/A"}
          </p>
        </div>
        <div className="flex min-h-[4.75rem] flex-col justify-center rounded-lg border border-white/10 bg-slate-900 p-2">
          <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">delta</p>
          <p
            className={`mt-1 min-h-[1.375rem] text-sm font-semibold tabular-nums leading-none ${delta >= 0 ? "text-emerald-300" : "text-slate-300"}`}
          >
            {prev ? `${delta >= 0 ? "+" : ""}${delta}` : "N/A"}
          </p>
        </div>
        <div className="flex min-h-[4.75rem] flex-col justify-center rounded-lg border border-white/10 bg-slate-900 p-2">
          <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">avg</p>
          <p className="mt-1 min-h-[1.375rem] text-sm font-semibold tabular-nums leading-none text-slate-200">
            {avg}
          </p>
        </div>
        <div className="flex min-h-[4.75rem] flex-col justify-center rounded-lg border border-white/10 bg-slate-900 p-2">
          <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">range</p>
          <p className="mt-1 min-h-[1.375rem] text-sm font-semibold tabular-nums leading-none text-slate-200">
            {min} - {max}
          </p>
        </div>
      </div>

      <div className="relative min-h-[220px] w-full overflow-hidden sm:min-h-[260px] lg:min-h-[280px]">
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="h-full w-full"
          preserveAspectRatio="xMidYMid meet"
        >
        <defs>
          <linearGradient id="hypeAreaGradientMobile" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(34, 211, 238, 0.42)" />
            <stop offset="55%" stopColor="rgba(34, 211, 238, 0.12)" />
            <stop offset="100%" stopColor="rgba(34, 211, 238, 0.02)" />
          </linearGradient>
        </defs>
        {gridTicks.map((tick, tickIdx) => {
          const y = scoreToY(tick);
          return (
            <line
              key={`${tick}-${tickIdx}`}
              x1="20"
              x2={chartWidth - 20}
              y1={y}
              y2={y}
              stroke="rgba(148, 163, 184, 0.2)"
              strokeDasharray="4 4"
            />
          );
        })}
        {hypeAreaPathD ? (
          <path d={hypeAreaPathD} fill="url(#hypeAreaGradientMobile)" stroke="none" />
        ) : null}
        {/* Hype streamline first — thin market lines are drawn ON TOP so they stay visible */}
        <polyline
          fill="none"
          stroke="rgba(34, 211, 238, 0.95)"
          strokeWidth="4"
          strokeLinejoin="round"
          strokeLinecap="round"
          points={polyline}
        />
        {marketLines?.map((line) => {
          const dim = highlightSeries !== null && highlightSeries !== line.key;
          const strokeWidth = highlightSeries === line.key ? 2.8 : 1.65;
          const opacity = dim ? 0.22 : highlightSeries === line.key ? 1 : 0.78;
          return (
            <polyline
              key={line.key}
              fill="none"
              stroke={line.color}
              strokeWidth={strokeWidth}
              strokeOpacity={opacity}
              strokeLinejoin="round"
              strokeLinecap="round"
              points={line.points}
            />
          );
        })}
        <rect
          x={padX}
          y={padY}
          width={safeWidth}
          height={safeHeight}
          fill="transparent"
          className="touch-none"
          // Allow hover / touch scrubbing across the full chart area, not just circles.
          onMouseMove={(event) => {
            scrubFromClientX(event.clientX, event.currentTarget.getBoundingClientRect());
          }}
          onTouchStart={(event) => {
            const t = event.touches[0];
            if (!t) return;
            scrubFromClientX(t.clientX, event.currentTarget.getBoundingClientRect());
          }}
          onTouchMove={(event) => {
            const t = event.touches[0];
            if (!t) return;
            event.preventDefault();
            scrubFromClientX(t.clientX, event.currentTarget.getBoundingClientRect());
          }}
        />
        {points.map((point, idx) => {
          const isPeak = hypePeakIndices.has(idx);
          const isLastYear = point.year === points[points.length - 1]?.year;
          const m = isMobileChartEnhance ? 1.12 : 1;
          return (
            <g key={point.year}>
              <circle
                cx={point.x}
                cy={point.y}
                r={
                  (activeIndex === idx ? 8 : isPeak ? 6.4 : point.year % 5 === 0 ? 5.2 : 3.4) * m
                }
                fill={
                  activeIndex === idx
                    ? "#f8fafc"
                    : isPeak
                      ? "rgba(232, 121, 249, 0.95)"
                      : isLastYear
                        ? "#f472b6"
                        : "#22d3ee"
                }
                stroke={isPeak && activeIndex !== idx ? "rgba(244, 114, 182, 0.55)" : "none"}
                strokeWidth={isPeak && activeIndex !== idx ? 1.2 : 0}
                className="cursor-pointer"
                style={{ transition: "fill 120ms ease" }}
                onMouseEnter={() => setActiveIndex(idx)}
                onClick={() => setActiveIndex(idx)}
              />
            </g>
          );
        })}

        {active ? (
          <>
            <line
              x1={active.x}
              y1="18"
              x2={active.x}
              y2={chartHeight - 18}
              stroke="rgba(248, 250, 252, 0.35)"
              strokeDasharray="3 5"
            />
            <g
              transform={`translate(${Math.min(
                active.x + 12,
                chartWidth -
                  (marketAtIndex?.hasCpi ? 248 : marketAtIndex ? 206 : 165),
              )}, ${Math.max(
                active.y - (marketAtIndex?.hasCpi ? 86 : marketAtIndex ? 76 : 52),
                8,
              )})`}
            >
              <rect
                x="0"
                y="0"
                width={marketAtIndex?.hasCpi ? 248 : marketAtIndex ? 206 : 165}
                height={marketAtIndex?.hasCpi ? 86 : marketAtIndex ? 68 : 44}
                rx="8"
                fill="rgba(15, 23, 42, 0.95)"
                stroke="rgba(148, 163, 184, 0.4)"
              />
              <text x="10" y="17" fill="#e2e8f0" fontSize="11" fontWeight="700">
                {active.year} • Hype {active.score}
              </text>
              {marketAtIndex ? (
                <>
                  <text x="10" y="34" fontSize="10">
                    {normTooltipOrder.map((key, i) => {
                      const v =
                        key === "sp500"
                          ? marketAtIndex.sp
                          : key === "btc"
                            ? marketAtIndex.btc
                            : marketAtIndex.nt;
                      return (
                        <tspan key={key}>
                          {i > 0 ? (
                            <tspan fill="#64748b" fontWeight="400">
                              {" · "}
                            </tspan>
                          ) : null}
                          <tspan
                            fill={MARKET_TOOLTIP_FILLS[key]}
                            fontWeight={highlightSeries === key ? 700 : 600}
                          >
                            {MARKET_SHORT_LABEL[key]} {Math.round(v)}
                          </tspan>
                        </tspan>
                      );
                    })}
                    <tspan fill="#64748b" fontSize="9" fontWeight="400">
                      {" "}
                      (norm)
                    </tspan>
                  </text>
                  {marketAtIndex.hasCpi ? (
                    <text x="10" y="52" fontSize="10">
                      <tspan
                        fill={MARKET_TOOLTIP_FILLS.inflation}
                        fontWeight={highlightSeries === "inflation" ? 700 : 600}
                      >
                        CPI {marketAtIndex.infY.toFixed(1)}% YoY
                      </tspan>
                      <tspan fill="#64748b" fontSize="9" fontWeight="400">
                        {" "}
                        (US)
                      </tspan>
                    </text>
                  ) : null}
                </>
              ) : null}
              <text
                x="10"
                y={
                  marketAtIndex?.hasCpi ? 72 : marketAtIndex ? 52 : 32
                }
                fill="#94a3b8"
                fontSize="10"
              >
                {activeIsHypePeak ? "Peak · " : ""}Zone: {zoneForScore(active.score)}
              </text>
            </g>
          </>
        ) : null}
      </svg>
      </div>

      <div className="mt-2 flex shrink-0 flex-col gap-1.5 border-t border-white/5 pt-2">
        <div className="flex shrink-0 flex-nowrap items-center justify-between gap-2 overflow-x-auto text-[11px] tabular-nums text-slate-400">
          <span>{history[0]?.year}</span>
          <span>{history[Math.floor(history.length / 4)]?.year}</span>
          <span>{history[Math.floor(history.length / 2)]?.year}</span>
          <span>{history[Math.floor((history.length * 3) / 4)]?.year}</span>
          <span>{history[history.length - 1]?.year}</span>
        </div>
        <p className="shrink-0 text-[10px] leading-snug text-slate-500 sm:text-[11px]">
          <span className="text-slate-500/90">Scrub horizontally</span> to pick a year.{" "}
          <span className="text-fuchsia-300/90">Fuchsia</span> = hype peaks (cyan line).{" "}
          {marketLines && marketLines.length > 0 ? (
            <>
              Thin lines:{" "}
              <span className="text-[#34d399]/90">S&amp;P</span> /{" "}
              <span className="text-[#fbbf24]/90">BTC</span> /{" "}
              <span className="text-[#fb7185]/90">NTDOY</span> /{" "}
              <span className="text-[#818cf8]/90">CPI</span>{" "}
              <span className="text-slate-600">(S&amp;P/BTC/NT norm 0–100; CPI YoY % + norm)</span>.
            </>
          ) : null}
          {isMobileChartEnhance && yScaleParams.mode === "zoom" ? (
            <span className="mt-1 block text-[10px] text-slate-600 md:hidden">
              Vertical scale fits this window so moves read larger (still 0–100 data).
            </span>
          ) : null}
        </p>
        <div className="min-h-[1.75rem] shrink-0">
          {yearSpotlightPills.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 overflow-x-auto transition-opacity duration-150">
              {yearSpotlightPills.map((label, i) => (
                <span
                  key={`${active?.year}-spotlight-${i}-${label}`}
                  className="rounded-full border border-fuchsia-400/35 bg-fuchsia-500/10 px-2 py-0.5 text-[11px] text-fuchsia-200"
                >
                  {label}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
