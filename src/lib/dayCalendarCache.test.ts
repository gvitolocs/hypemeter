import { describe, expect, it } from "vitest";
import { emptyPersisted, mergeDayPayload } from "./dayCalendarCache";
import type { DayStatsResponse } from "./dayCalendarTypes";

function mockPayload(date: string, dayScore: number): DayStatsResponse {
  return {
    date,
    stats: {
      headlineCount: 1,
      uniqueSources: 1,
      eventHits: 0,
      pressureHits: 0,
      sentiment: 50,
      dayScore,
    },
    headlines: [],
  };
}

describe("dayCalendarCache", () => {
  it("mergeDayPayload stores score and freezes past day payload", () => {
    const prev = emptyPersisted();
    const p = mockPayload("2024-06-15", 77);
    const next = mergeDayPayload(prev, "2024-06-15", p, true);
    expect(next.scores["2024-06-15"]).toBe(77);
    expect(next.days["2024-06-15"]?.stats.dayScore).toBe(77);
  });

  it("mergeDayPayload does not freeze today full payload (scores still updated)", () => {
    const prev = emptyPersisted();
    const p = mockPayload("2026-03-22", 42);
    const next = mergeDayPayload(prev, "2026-03-22", p, false);
    expect(next.scores["2026-03-22"]).toBe(42);
    expect(next.days["2026-03-22"]).toBeUndefined();
  });
});
