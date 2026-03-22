"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DayStatsResponse } from "@/lib/dayCalendarTypes";
import {
  DAY_CALENDAR_STORAGE_KEY,
  emptyPersisted,
  loadDayCalendarPersisted,
  mergeDayPayload,
  saveDayCalendarPersisted,
  type DayCalendarPersisted,
} from "@/lib/dayCalendarCache";

export type { DayStatsResponse };

type Props = {
  initialData?: DayStatsResponse;
  initialDate?: string;
};

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function isoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addMonths(date: Date, amount: number) {
  const copy = new Date(date);
  copy.setDate(1);
  copy.setMonth(copy.getMonth() + amount);
  return copy;
}

/** ISO dates in the visible month that fall inside [minDate, now]. */
function isoDatesInMonthWindow(visibleMonth: Date, minDate: Date, now: Date): string[] {
  const last = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0);
  const out: string[] = [];
  for (let d = 1; d <= last.getDate(); d++) {
    const date = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), d);
    if (date < startOfLocalDay(minDate)) continue;
    if (date > now) continue;
    out.push(isoDate(date));
  }
  return out;
}

/** Heatmap: higher dayScore → warmer / brighter. */
function heatmapClasses(score: number | undefined, selected: boolean): string {
  const base =
    score === undefined
      ? "bg-slate-800/95 text-slate-500"
      : score < 22
        ? "bg-slate-900 text-slate-500"
        : score < 38
          ? "bg-slate-800 text-slate-400"
          : score < 52
            ? "bg-slate-700/90 text-slate-300"
            : score < 64
              ? "bg-cyan-950/55 text-cyan-400/95"
              : score < 76
                ? "bg-cyan-900/40 text-cyan-200"
                : score < 88
                  ? "bg-emerald-900/35 text-emerald-200"
                  : "bg-fuchsia-900/45 text-fuchsia-100";

  const ring = selected ? "ring-2 ring-cyan-400 ring-offset-2 ring-offset-slate-950 z-[1]" : "";
  return `${base} ${ring}`;
}

export default function DayStatsCalendar({ initialData, initialDate }: Props) {
  const now = startOfLocalDay(new Date());
  const minDate = new Date(now);
  minDate.setFullYear(minDate.getFullYear() - 5);

  const todayIso = isoDate(now);

  const [visibleMonth, setVisibleMonth] = useState(new Date(now.getFullYear(), now.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(initialDate ?? todayIso);
  const [data, setData] = useState<DayStatsResponse | null>(initialData ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [persisted, setPersisted] = useState<DayCalendarPersisted>(() => emptyPersisted());
  const [hydrated, setHydrated] = useState(false);
  const prefetchGen = useRef(0);

  useEffect(() => {
    setPersisted(loadDayCalendarPersisted());
    setHydrated(true);
  }, []);

  /** When changing month, reload from localStorage so heatmap shows frozen past data without refetch. */
  useEffect(() => {
    if (!hydrated) return;
    setPersisted(loadDayCalendarPersisted());
  }, [visibleMonth, hydrated]);

  /** Other tabs may write the same key; keep this tab in sync. */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStorage = (e: StorageEvent) => {
      if (e.key === DAY_CALENDAR_STORAGE_KEY) {
        setPersisted(loadDayCalendarPersisted());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const loadDay = useCallback(async (date: string) => {
    const cached = loadDayCalendarPersisted();
    if (date < todayIso && cached.days[date]) {
      setData(cached.days[date]);
      setLoading(false);
      setError(null);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/day-stats?date=${date}`, { cache: "no-store" });
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "Failed loading daily stats");
      }
      const payload = (await res.json()) as DayStatsResponse;
      if (!active) return;
      setData(payload);
      const freezePast = date < todayIso;
      setPersisted((prev) => {
        const merged = mergeDayPayload(prev, date, payload, freezePast);
        saveDayCalendarPersisted(merged);
        return merged;
      });
    } catch (err: unknown) {
      if (active) setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      if (active) setLoading(false);
    }
  }, [todayIso]);

  useEffect(() => {
    if (initialData && selectedDate === initialData.date) {
      setData(initialData);
      setLoading(false);
      setError(null);
      return;
    }
    void loadDay(selectedDate);
  }, [initialData, loadDay, selectedDate]);

  /**
   * Backfill month heatmap: fetch only days missing from localStorage.
   * Past-day scores are immutable — do not depend on `Date` object identity in deps (that retriggered every render).
   */
  useEffect(() => {
    if (!hydrated) return;

    const nowDay = startOfLocalDay(new Date());
    const min = new Date(nowDay);
    min.setFullYear(min.getFullYear() - 5);

    const dates = isoDatesInMonthWindow(visibleMonth, min, nowDay);
    const p = loadDayCalendarPersisted();
    if (dates.every((d) => p.scores[d] !== undefined)) return;

    const gen = ++prefetchGen.current;
    let cancelled = false;
    const concurrency = 2;

    (async () => {
      const attempted = new Set<string>();
      while (!cancelled && prefetchGen.current === gen) {
        const p2 = loadDayCalendarPersisted();
        const dates2 = isoDatesInMonthWindow(visibleMonth, min, nowDay);
        const missing = dates2.filter((d) => p2.scores[d] === undefined && !attempted.has(d));
        if (missing.length === 0) break;
        const slice = missing.slice(0, concurrency);
        for (const d of slice) attempted.add(d);
        await Promise.all(
          slice.map(async (date) => {
            try {
              const res = await fetch(`/api/day-stats?date=${date}`, { cache: "no-store" });
              if (!res.ok) return;
              const payload = (await res.json()) as DayStatsResponse;
              if (cancelled || prefetchGen.current !== gen) return;
              const freezePast = date < todayIso;
              setPersisted((prev) => {
                const merged = mergeDayPayload(prev, date, payload, freezePast);
                saveDayCalendarPersisted(merged);
                return merged;
              });
            } catch {
              /* ignore single-day failures */
            }
          }),
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hydrated, visibleMonth, todayIso]);

  /** Seed cache from initial home payload (today). */
  useEffect(() => {
    if (!initialData || !hydrated) return;
    const d = initialData.date;
    setPersisted((prev) => {
      if (prev.scores[d] !== undefined && prev.days[d]) return prev;
      const merged = mergeDayPayload(prev, d, initialData, d < todayIso);
      saveDayCalendarPersisted(merged);
      return merged;
    });
  }, [hydrated, initialData, todayIso]);

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
  const signalQuality = data
    ? (typeof data.stats.signalQuality === "number" ? data.stats.signalQuality : null)
    : null;
  const catalystIntensity = data
    ? Math.max(
        0,
        Math.min(
          100,
          Math.round(
            data.stats.eventHits * 10 +
              (data.stats.eventSignals?.reduce((sum, signal) => sum + signal.weight, 0) ?? 0) * 4,
          ),
        ),
      )
    : null;
  const catalystLabel =
    catalystIntensity === null
      ? "N/A"
      : catalystIntensity >= 75
        ? "Extreme"
        : catalystIntensity >= 55
          ? "High"
          : catalystIntensity >= 35
            ? "Moderate"
            : "Low";

  return (
    <section className="rounded-3xl border border-white/10 bg-slate-900 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-300">
            Daily Event Calendar (Last 5 Years)
          </h3>
          <p className="mt-1 text-xs text-slate-400">
            Past days are saved in your browser; numbers show day score intensity. Click for full detail.
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
              const score = persisted.scores[key];
              return (
                <button
                  type="button"
                  key={key}
                  disabled={!inMonth || outOfRange}
                  onClick={() => {
                    setSelectedDate(key);
                  }}
                  className={`flex min-h-[2.6rem] flex-col items-center justify-center rounded-md px-0.5 py-1 text-[10px] transition hover:brightness-110 ${heatmapClasses(score, selected)} ${
                    !inMonth || outOfRange ? "cursor-not-allowed opacity-30 hover:brightness-100" : ""
                  }`}
                >
                  <span className={`leading-none ${selected ? "font-bold" : "font-semibold"}`}>
                    {date.getDate()}
                  </span>
                  <span className="mt-0.5 font-mono text-[9px] leading-none tabular-nums opacity-95">
                    {outOfRange || !inMonth ? "" : score === undefined ? "·" : score}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[10px] text-slate-500">
            · = loading score. Scores persist locally; past days won&apos;t change after first load.
          </p>
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
                  <p className="text-base font-bold text-white">
                    {data.stats.headlineCount}
                    <span className="text-xs text-slate-400">/20</span>
                    {data.stats.headlineCount >= 20 ? (
                      <span className="ml-1 rounded bg-cyan-500/20 px-1.5 py-0.5 text-[10px] text-cyan-200">
                        MAX
                      </span>
                    ) : null}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-slate-900 p-2">
                  <p className="text-[10px] uppercase text-slate-500">Sources</p>
                  <p className="text-base font-bold text-white">{data.stats.uniqueSources}</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-slate-900 p-2">
                  <p className="text-[10px] uppercase text-slate-500">Signal Quality</p>
                  <p className="text-base font-bold text-white">{signalQuality ?? "N/A"}/100</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-slate-900 p-2">
                  <p className="text-[10px] uppercase text-slate-500">Catalyst Level</p>
                  <p className="text-base font-bold text-white">{catalystLabel}</p>
                </div>
              </div>

              <div className="mt-2 rounded-lg border border-white/10 bg-slate-900/70 p-2">
                <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">
                  Advanced Diagnostics
                </p>
                <p className="mt-1 text-xs text-slate-300">
                  Event hits: <span className="font-semibold">{data.stats.eventHits}</span> •
                  Pressure hits: <span className="font-semibold">{data.stats.pressureHits}</span>
                </p>
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
