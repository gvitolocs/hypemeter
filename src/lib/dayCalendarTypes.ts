/** Shared with `/api/day-stats`, `DayStatsCalendar`, and `dayCalendarCache`. */
export type DayStatsResponse = {
  date: string;
  stats: {
    headlineCount: number;
    uniqueSources: number;
    eventHits: number;
    pressureHits: number;
    sentiment: number;
    dayScore: number;
    signalQuality?: number;
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
