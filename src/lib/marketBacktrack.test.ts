import { describe, expect, it } from "vitest";
import {
  alignYearSeries,
  normalizeTo100,
  parseStooqDailyHistoryToYearlyLastClose,
  seriesHasVariance,
} from "@/lib/marketBacktrack";

describe("marketBacktrack", () => {
  it("alignYearSeries uses placeholder when no Yahoo data (still drawable overlays)", () => {
    const years = [2020, 2021, 2022];
    const empty = new Map<number, number>();
    expect(alignYearSeries(years, empty)).toEqual([50, 50, 50]);
  });

  it("alignYearSeries forward-fills from first known close", () => {
    const years = [2020, 2021, 2022];
    const m = new Map<number, number>([
      [2020, 100],
      [2021, 110],
      [2022, 120],
    ]);
    expect(alignYearSeries(years, m)).toEqual([100, 110, 120]);
  });

  it("normalizeTo100 maps constant series to mid-chart (50), with optional bias", () => {
    expect(normalizeTo100([5, 5, 5])).toEqual([50, 50, 50]);
    expect(normalizeTo100([5, 5, 5], { degenerateBias: 0.5 })).toEqual([50.5, 50.5, 50.5]);
  });

  it("normalizeTo100 maps min→0 and max→100", () => {
    expect(normalizeTo100([10, 20])).toEqual([0, 100]);
  });

  it("seriesHasVariance detects flat series", () => {
    expect(seriesHasVariance([50, 50, 50])).toBe(false);
    expect(seriesHasVariance([50, 51, 50])).toBe(true);
  });

  it("parseStooqDailyHistoryToYearlyLastClose keeps last close per year", () => {
    const csv = `Date,Open,High,Low,Close,Volume
2019-06-01,1,1,1,10,1
2019-12-30,1,1,1,20,1
2020-06-01,1,1,1,30,1`;
    const m = parseStooqDailyHistoryToYearlyLastClose(csv);
    expect(m.get(2019)).toBe(20);
    expect(m.get(2020)).toBe(30);
  });
});
