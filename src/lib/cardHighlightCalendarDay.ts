/**
 * Card Highlight: server cache is partitioned by **calendar day** in `Europe/Rome`
 * so the same card + image are reused until Italian midnight, then Jina/CardTrader are fetched again.
 */
export function cardHighlightCalendarDayKey(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
