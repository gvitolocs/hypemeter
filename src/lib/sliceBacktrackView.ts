import type { MarketYearlyOverlay } from "@/lib/marketBacktrack";

type YearScore = { year: number; score: number };
type YearEventSignal = { year: number; label: string; intensity: number };

/** Last `n` years of history + aligned market overlay slices + events in that window. */
export function sliceBacktrackView(
  history: YearScore[],
  marketOverlay: MarketYearlyOverlay,
  events: YearEventSignal[],
  lastNYears: number,
): {
  history: YearScore[];
  marketOverlay: MarketYearlyOverlay;
  events: YearEventSignal[];
} {
  if (history.length <= lastNYears) {
    return { history, marketOverlay, events };
  }
  const slicedHistory = history.slice(-lastNYears);
  const startIdx = history.length - lastNYears;
  const slice = (arr: number[]) => arr.slice(startIdx, startIdx + lastNYears);
  const visibleYears = new Set(slicedHistory.map((h) => h.year));
  return {
    history: slicedHistory,
    marketOverlay: {
      sp500: slice(marketOverlay.sp500),
      btc: slice(marketOverlay.btc),
      nintendo: slice(marketOverlay.nintendo),
      inflationYoY: slice(marketOverlay.inflationYoY),
      inflation: slice(marketOverlay.inflation),
    },
    events: events.filter((e) => visibleYears.has(e.year)),
  };
}
