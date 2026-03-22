"use client";

import { useMemo, useState } from "react";
import type { MarketHighlightKey, MarketYearlyOverlay } from "@/lib/marketBacktrack";
import { MARKET_CHART } from "@/lib/marketChartColors";

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

const MARKET_COLORS = {
  sp500: MARKET_CHART.sp500.rgba,
  btc: MARKET_CHART.btc.rgba,
  nintendo: MARKET_CHART.nintendo.rgba,
} as const;

/** Solid fills for tooltip text (match thin lines). */
const MARKET_TOOLTIP_FILLS: Record<MarketHighlightKey, string> = {
  sp500: MARKET_CHART.sp500.hex,
  btc: MARKET_CHART.btc.hex,
  nintendo: MARKET_CHART.nintendo.hex,
};

const MARKET_SHORT_LABEL: Record<MarketHighlightKey, string> = {
  sp500: "S&P",
  btc: "BTC",
  nintendo: "NT",
};

export default function HypeBacktrackingChart({
  history,
  events = [],
  marketOverlay = null,
  highlightSeries = null,
}: Props) {
  // SVG dimensions and drawing paddings for stable scaling across breakpoints.
  const chartWidth = 940;
  /** Taller plot area so the chart column matches Market Sidecar height on large screens. */
  const chartHeight = 340;
  const padX = 20;
  const padY = 18;
  const safeWidth = chartWidth - padX * 2;
  const safeHeight = chartHeight - padY * 2;
  // Precompute render coordinates from score values (0-100) to SVG space.
  const points = useMemo(() => {
    return history.map((entry, idx) => {
      const x = padX + (idx / Math.max(history.length - 1, 1)) * safeWidth;
      const y = padY + ((100 - entry.score) / 100) * safeHeight;
      return { ...entry, x, y };
    });
  }, [history, safeHeight, safeWidth]);

  const hypePeakIndices = useMemo(() => topPeakIndices(history, 8), [history]);

  const marketLines = useMemo(() => {
    if (!marketOverlay || history.length === 0) return null;
    const n = history.length;
    const keys: Array<{ key: MarketHighlightKey; values: number[]; color: string }> = [
      { key: "sp500", values: marketOverlay.sp500, color: MARKET_COLORS.sp500 },
      { key: "btc", values: marketOverlay.btc, color: MARKET_COLORS.btc },
      { key: "nintendo", values: marketOverlay.nintendo, color: MARKET_COLORS.nintendo },
    ];
    return keys
      .map(({ key, values, color }) => {
        if (!values || values.length !== n) return null;
        const pts = values.map((score, idx) => {
          const x = padX + (idx / Math.max(n - 1, 1)) * safeWidth;
          const y = padY + ((100 - score) / 100) * safeHeight;
          return `${x},${y}`;
        });
        return { key, points: pts.join(" "), color };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row));
  }, [history.length, marketOverlay, padX, padY, safeHeight, safeWidth]);

  const polyline = points.map((point) => `${point.x},${point.y}`).join(" ");
  // Active point powers tooltip and stat cards; defaults to latest year.
  const [activeIndex, setActiveIndex] = useState(Math.max(points.length - 1, 0));
  const active = points[activeIndex] ?? null;
  const prev = activeIndex > 0 ? points[activeIndex - 1] : null;
  const delta = active && prev ? active.score - prev.score : 0;
  const avg =
    points.length > 0
      ? Math.round(points.reduce((sum, point) => sum + point.score, 0) / points.length)
      : 0;
  const max = points.length > 0 ? Math.max(...points.map((point) => point.score)) : 0;
  const min = points.length > 0 ? Math.min(...points.map((point) => point.score)) : 0;
  const activeEvents = active ? events.filter((event) => event.year === active.year) : [];
  const activeIsHypePeak = active ? hypePeakIndices.has(activeIndex) : false;

  const marketAtIndex = useMemo(() => {
    if (!marketOverlay || activeIndex < 0) return null;
    const sp = marketOverlay.sp500[activeIndex];
    const btc = marketOverlay.btc[activeIndex];
    const nt = marketOverlay.nintendo[activeIndex];
    if (sp === undefined || btc === undefined || nt === undefined) return null;
    if ([sp, btc, nt].some((v) => Number.isNaN(v))) return null;
    return { sp, btc, nt };
  }, [marketOverlay, activeIndex]);

  const marketTooltipOrder = useMemo((): MarketHighlightKey[] => {
    const all: MarketHighlightKey[] = ["sp500", "btc", "nintendo"];
    if (!highlightSeries) return all;
    return [highlightSeries, ...all.filter((k) => k !== highlightSeries)];
  }, [highlightSeries]);

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
        {[20, 40, 60, 80].map((tick) => {
          const y = 18 + ((100 - tick) / 100) * (chartHeight - 36);
          return (
            <line
              key={tick}
              x1="20"
              x2={chartWidth - 20}
              y1={y}
              y2={y}
              stroke="rgba(148, 163, 184, 0.2)"
              strokeDasharray="4 4"
            />
          );
        })}
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
          // Allow hover scrubbing across the full chart area, not just circles.
          onMouseMove={(event) => {
            if (points.length <= 1) return;
            const bounds = event.currentTarget.getBoundingClientRect();
            const ratio = (event.clientX - bounds.left) / bounds.width;
            const next = Math.round(Math.max(0, Math.min(1, ratio)) * (points.length - 1));
            setActiveIndex(next);
          }}
        />
        {points.map((point, idx) => {
          const isPeak = hypePeakIndices.has(idx);
          const isLastYear = point.year === points[points.length - 1]?.year;
          return (
            <g key={point.year}>
              <circle
                cx={point.x}
                cy={point.y}
                r={
                  activeIndex === idx ? 8 : isPeak ? 6.4 : point.year % 5 === 0 ? 5.2 : 3.4
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
              transform={`translate(${Math.min(active.x + 12, chartWidth - (marketAtIndex ? 218 : 175))}, ${Math.max(active.y - (marketAtIndex ? 76 : 52), 8)})`}
            >
              <rect
                x="0"
                y="0"
                width={marketAtIndex ? 206 : 165}
                height={marketAtIndex ? 68 : 44}
                rx="8"
                fill="rgba(15, 23, 42, 0.95)"
                stroke="rgba(148, 163, 184, 0.4)"
              />
              <text x="10" y="17" fill="#e2e8f0" fontSize="11" fontWeight="700">
                {active.year} • Hype {active.score}
              </text>
              {marketAtIndex ? (
                <text x="10" y="34" fontSize="10">
                  {marketTooltipOrder.map((key, i) => {
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
              ) : null}
              <text x="10" y={marketAtIndex ? 52 : 32} fill="#94a3b8" fontSize="10">
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
              <span className="text-[#fb7185]/90">NTDOY</span> (0–100 norm).
            </>
          ) : null}
        </p>
        <div className="shrink-0">
          {activeEvents.length > 0 ? (
            <div className="flex gap-1.5 overflow-x-auto whitespace-nowrap">
              {activeEvents.map((event) => (
                <span
                  key={`${event.year}-${event.label}`}
                  className="rounded-full border border-fuchsia-400/35 bg-fuchsia-500/10 px-2 py-0.5 text-[11px] text-fuchsia-200"
                >
                  {event.label}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
