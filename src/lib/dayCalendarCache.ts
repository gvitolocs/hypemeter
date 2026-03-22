/**
 * Client-side persistence for the daily event calendar: past days are treated as
 * frozen snapshots so scores don’t “move” on every visit; today stays live.
 */

import type { DayStatsResponse } from "@/lib/dayCalendarTypes";

export const DAY_CALENDAR_STORAGE_KEY = "hypemeter-day-calendar-v1";

export type DayCalendarPersisted = {
  v: 1;
  /** Quick heatmap lookup */
  scores: Record<string, number>;
  /** Full API payloads for past days only (optional; filled on fetch) */
  days: Record<string, DayStatsResponse>;
};

export function emptyPersisted(): DayCalendarPersisted {
  return { v: 1, scores: {}, days: {} };
}

export function loadDayCalendarPersisted(): DayCalendarPersisted {
  if (typeof window === "undefined") return emptyPersisted();
  try {
    const raw = window.localStorage.getItem(DAY_CALENDAR_STORAGE_KEY);
    if (!raw) return emptyPersisted();
    const parsed = JSON.parse(raw) as Partial<DayCalendarPersisted>;
    if (parsed?.v !== 1 || typeof parsed.scores !== "object" || parsed.scores === null) {
      return emptyPersisted();
    }
    return {
      v: 1,
      scores: { ...parsed.scores },
      days: typeof parsed.days === "object" && parsed.days !== null ? { ...parsed.days } : {},
    };
  } catch {
    return emptyPersisted();
  }
}

export function saveDayCalendarPersisted(data: DayCalendarPersisted): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DAY_CALENDAR_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // quota / private mode — ignore
  }
}

export function mergeDayPayload(
  prev: DayCalendarPersisted,
  date: string,
  payload: DayStatsResponse,
  freezePast: boolean,
): DayCalendarPersisted {
  const next: DayCalendarPersisted = {
    ...prev,
    scores: { ...prev.scores, [date]: payload.stats.dayScore },
  };
  if (freezePast) {
    next.days = { ...prev.days, [date]: payload };
  }
  return next;
}
