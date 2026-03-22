"use client";

import { useMemo, useState } from "react";

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
};

function zoneForScore(score: number) {
  if (score >= 90) return "mania";
  if (score >= 75) return "frenzy";
  if (score >= 60) return "hype";
  if (score >= 45) return "warm";
  if (score >= 25) return "calm";
  return "dead";
}

export default function HypeBacktrackingChart({ history, events = [] }: Props) {
  // SVG dimensions and drawing paddings for stable scaling across breakpoints.
  const chartWidth = 940;
  const chartHeight = 250;
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

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950 p-3">
      <div className="mb-3 grid gap-2 sm:grid-cols-4">
        <div className="rounded-lg border border-white/10 bg-slate-900 p-2">
          <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">selected</p>
          <p className="text-sm font-semibold text-cyan-300">
            {active ? `${active.year} • ${active.score}` : "N/A"}
          </p>
        </div>
        <div className="rounded-lg border border-white/10 bg-slate-900 p-2">
          <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">delta</p>
          <p className={`text-sm font-semibold ${delta >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
            {prev ? `${delta >= 0 ? "+" : ""}${delta}` : "N/A"}
          </p>
        </div>
        <div className="rounded-lg border border-white/10 bg-slate-900 p-2">
          <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">avg</p>
          <p className="text-sm font-semibold text-slate-200">{avg}</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-slate-900 p-2">
          <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">range</p>
          <p className="text-sm font-semibold text-slate-200">
            {min} - {max}
          </p>
        </div>
      </div>

      <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full">
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
        <polyline
          fill="none"
          stroke="rgba(34, 211, 238, 0.9)"
          strokeWidth="4"
          points={polyline}
        />
        {events
          .map((event) => {
            const idx = points.findIndex((point) => point.year === event.year);
            return idx === -1 ? null : { ...event, point: points[idx] };
          })
          .filter((entry): entry is YearEventSignal & { point: (typeof points)[number] } => Boolean(entry))
          .map((entry) => (
            <g key={`${entry.year}-${entry.label}`}>
              <line
                x1={entry.point.x}
                y1={entry.point.y - 3}
                x2={entry.point.x}
                y2={24}
                stroke="rgba(244, 114, 182, 0.38)"
                strokeDasharray="2 4"
              />
              <circle
                cx={entry.point.x}
                cy={24}
                r={2.8 + entry.intensity / 42}
                fill="rgba(244, 114, 182, 0.9)"
                className="cursor-pointer"
                onMouseEnter={() => setActiveIndex(points.findIndex((point) => point.year === entry.year))}
                onClick={() => setActiveIndex(points.findIndex((point) => point.year === entry.year))}
              />
            </g>
          ))}
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
        {points.map((point, idx) => (
          <g key={point.year}>
            <circle
              cx={point.x}
              cy={point.y}
              r={activeIndex === idx ? 8 : point.year % 5 === 0 ? 5.2 : 3.4}
              fill={
                activeIndex === idx
                  ? "#f8fafc"
                  : point.year === points[points.length - 1]?.year
                    ? "#f472b6"
                    : "#22d3ee"
              }
              className="cursor-pointer transition-all duration-150"
              onMouseEnter={() => setActiveIndex(idx)}
              onClick={() => setActiveIndex(idx)}
            />
          </g>
        ))}

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
            <g transform={`translate(${Math.min(active.x + 12, chartWidth - 175)}, ${Math.max(active.y - 52, 16)})`}>
              <rect
                x="0"
                y="0"
                width="165"
                height="44"
                rx="8"
                fill="rgba(15, 23, 42, 0.95)"
                stroke="rgba(148, 163, 184, 0.4)"
              />
              <text x="10" y="17" fill="#e2e8f0" fontSize="11" fontWeight="700">
                {active.year} • Score {active.score}
              </text>
              <text x="10" y="32" fill="#94a3b8" fontSize="10">
                Zone: {zoneForScore(active.score)}
              </text>
            </g>
          </>
        ) : null}
      </svg>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
        <span>{history[0]?.year}</span>
        <span>{history[Math.floor(history.length / 4)]?.year}</span>
        <span>{history[Math.floor(history.length / 2)]?.year}</span>
        <span>{history[Math.floor((history.length * 3) / 4)]?.year}</span>
        <span>{history[history.length - 1]?.year}</span>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">
        Hover across the chart to inspect each year.
      </p>
      {activeEvents.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
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
  );
}
