"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type DayStatsResponse = {
  date: string;
  stats: {
    headlineCount: number;
    uniqueSources: number;
    eventHits: number;
    pressureHits: number;
    sentiment: number;
    dayScore: number;
    eventSignals?: Array<{
      label: string;
      group: string;
      weight: number;
    }>;
  };
  headlines: Array<{
    title: string;
    link: string;
    source: string;
    pubDate: string;
  }>;
};

type Props = {
  initialData?: DayStatsResponse;
  initialDate?: string;
};

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Standard yyyy-mm-dd format expected by the day-stats API.
function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

// Month navigation helper anchored to first day to avoid overflow quirks.
function addMonths(date: Date, amount: number) {
  const copy = new Date(date);
  copy.setDate(1);
  copy.setMonth(copy.getMonth() + amount);
  return copy;
}

export default function DayStatsCalendar({ initialData, initialDate }: Props) {
  // Calendar is intentionally restricted to the last 5 years.
  const now = new Date();
  const minDate = new Date(now);
  minDate.setFullYear(minDate.getFullYear() - 5);

  const [visibleMonth, setVisibleMonth] = useState(new Date(now.getFullYear(), now.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(initialDate ?? isoDate(now));
  const [data, setData] = useState<DayStatsResponse | null>(initialData ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch selected-day stats; keeps UI robust with loading/error state transitions.
  const loadDay = useCallback(async (date: string) => {
    let active = true;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/day-stats?date=${date}`);
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "Failed loading daily stats");
      }
      const payload = (await res.json()) as DayStatsResponse;
      if (active) setData(payload);
    } catch (err: unknown) {
      if (active) setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      if (active) setLoading(false);
    }
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    // Keep today's preload (matching homepage hype model) without immediate refetch.
    if (initialData && selectedDate === initialData.date) {
      setData(initialData);
      setLoading(false);
      setError(null);
      return;
    }
    void loadDay(selectedDate);
  }, [initialData, loadDay, selectedDate]);

  // Build a complete month grid (including leading/trailing days for alignment).
  const daysGrid = useMemo(() => {
    const firstDay = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
    const lastDay = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0);
    const startOffset = (firstDay.getDay() + 6) % 7;
    const totalCells = Math.ceil((startOffset + lastDay.getDate()) / 7) * 7;
    return Array.from({ length: totalCells }, (_, idx) => {
      const date = new Date(firstDay);
      date.setDate(idx - startOffset + 1);
      return date;
    });
  }, [visibleMonth]);

  const canPrev = visibleMonth > new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  const canNext = visibleMonth < new Date(now.getFullYear(), now.getMonth(), 1);

  return (
    <section className="rounded-3xl border border-white/10 bg-slate-900 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-300">
            Daily Event Calendar (Last 5 Years)
          </h3>
          <p className="mt-1 text-xs text-slate-400">
            Click a day to compute live Pokemon event stats for that date.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_1.4fr]">
        <div className="rounded-2xl border border-white/10 bg-slate-950 p-4">
          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              className="rounded-md border border-white/10 px-2 py-1 text-xs text-slate-300 disabled:opacity-40"
              disabled={!canPrev}
              onClick={() => setVisibleMonth((prev) => addMonths(prev, -1))}
            >
              Prev
            </button>
            <p className="text-sm font-semibold text-slate-200">
              {visibleMonth.toLocaleString("en-US", { month: "long", year: "numeric" })}
            </p>
            <button
              type="button"
              className="rounded-md border border-white/10 px-2 py-1 text-xs text-slate-300 disabled:opacity-40"
              disabled={!canNext}
              onClick={() => setVisibleMonth((prev) => addMonths(prev, 1))}
            >
              Next
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-[11px] uppercase tracking-[0.08em] text-slate-500">
            {DAY_NAMES.map((name) => (
              <div key={name}>{name}</div>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {daysGrid.map((date) => {
              const key = isoDate(date);
              const inMonth = date.getMonth() === visibleMonth.getMonth();
              const outOfRange = date < minDate || date > now;
              const selected = key === selectedDate;
              return (
                <button
                  type="button"
                  key={key}
                  disabled={!inMonth || outOfRange}
                  onClick={() => {
                    setSelectedDate(key);
                  }}
                  className={`h-8 rounded-md text-xs transition ${
                    selected
                      ? "bg-cyan-500/80 text-slate-950 font-bold"
                      : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                  } ${(!inMonth || outOfRange) ? "opacity-30 cursor-not-allowed" : ""}`}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-950 p-4">
          <p className="text-xs uppercase tracking-[0.14em] text-slate-400">Selected Day</p>
          <p className="mt-1 text-lg font-semibold text-cyan-300">{selectedDate}</p>

          {loading ? <p className="mt-3 text-sm text-slate-400">Computing live stats...</p> : null}
          {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}

          {data ? (
            <>
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                <div className="rounded-lg border border-white/10 bg-slate-900 p-2">
                  <p className="text-[10px] uppercase text-slate-500">Day Score</p>
                  <p className="text-base font-bold text-white">{data.stats.dayScore}/100</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-slate-900 p-2">
                  <p className="text-[10px] uppercase text-slate-500">Sentiment</p>
                  <p className="text-base font-bold text-white">{data.stats.sentiment}/100</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-slate-900 p-2">
                  <p className="text-[10px] uppercase text-slate-500">Headlines</p>
                  <p className="text-base font-bold text-white">{data.stats.headlineCount}</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-slate-900 p-2">
                  <p className="text-[10px] uppercase text-slate-500">Sources</p>
                  <p className="text-base font-bold text-white">{data.stats.uniqueSources}</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-slate-900 p-2">
                  <p className="text-[10px] uppercase text-slate-500">Event Hits</p>
                  <p className="text-base font-bold text-white">{data.stats.eventHits}</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-slate-900 p-2">
                  <p className="text-[10px] uppercase text-slate-500">Pressure Hits</p>
                  <p className="text-base font-bold text-white">{data.stats.pressureHits}</p>
                </div>
              </div>

              {data.stats.eventSignals && data.stats.eventSignals.length > 0 ? (
                <div className="mt-3 rounded-lg border border-white/10 bg-slate-900 p-2">
                  <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">
                    Event Signals
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {data.stats.eventSignals.map((signal) => (
                      <span
                        key={`${signal.group}-${signal.label}`}
                        className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-2 py-0.5 text-[11px] text-cyan-200"
                        title={`Weight ${signal.weight.toFixed(1)} • ${signal.group}`}
                      >
                        {signal.label}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="mt-4 max-h-48 space-y-2 overflow-y-auto pr-1">
                {data.headlines.map((headline) => (
                  <a
                    key={`${headline.link}-${headline.pubDate}`}
                    href={headline.link}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded-lg border border-white/10 bg-slate-900 p-2"
                  >
                    <p className="text-sm font-medium text-cyan-300">{headline.title}</p>
                    <p className="mt-1 text-[11px] text-slate-500">{headline.source}</p>
                  </a>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}

