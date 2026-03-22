import { describe, expect, it } from "vitest";
import { sliceBacktrackView } from "./sliceBacktrackView";

describe("sliceBacktrackView", () => {
  it("returns last N years and aligned overlay slices", () => {
    const history = [
      { year: 2005, score: 1 },
      { year: 2006, score: 2 },
      { year: 2007, score: 3 },
      { year: 2008, score: 4 },
    ];
    const marketOverlay = {
      sp500: [10, 20, 30, 40],
      btc: [1, 2, 3, 4],
      nintendo: [5, 5, 5, 5],
    };
    const events = [
      { year: 2005, label: "a", intensity: 1 },
      { year: 2007, label: "b", intensity: 2 },
    ];
    const out = sliceBacktrackView(history, marketOverlay, events, 2);
    expect(out.history).toEqual([
      { year: 2007, score: 3 },
      { year: 2008, score: 4 },
    ]);
    expect(out.marketOverlay).toEqual({
      sp500: [30, 40],
      btc: [3, 4],
      nintendo: [5, 5],
    });
    expect(out.events).toEqual([{ year: 2007, label: "b", intensity: 2 }]);
  });

  it("no-ops when series is shorter than N", () => {
    const history = [{ year: 2024, score: 50 }];
    const marketOverlay = { sp500: [1], btc: [2], nintendo: [3] };
    const out = sliceBacktrackView(history, marketOverlay, [], 3);
    expect(out.history).toEqual(history);
    expect(out.marketOverlay).toEqual(marketOverlay);
  });
});
