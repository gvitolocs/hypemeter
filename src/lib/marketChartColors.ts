/**
 * Thin market overlay strokes + tooltip/sidecar — same hex as SVG `stroke` / `fill`.
 * (Avoid generic `text-red-*` / `text-rose-*` for “down” — lines keep asset hue.)
 */
export const MARKET_CHART = {
  sp500: {
    hex: "#34d399",
    rgba: "rgba(52, 211, 153, 0.85)",
  },
  btc: {
    hex: "#fbbf24",
    rgba: "rgba(251, 191, 36, 0.85)",
  },
  nintendo: {
    hex: "#fb7185",
    rgba: "rgba(251, 113, 133, 0.85)",
  },
  /** US CPI inflation (annual % YoY) — thin line on chart. */
  inflation: {
    hex: "#818cf8",
    rgba: "rgba(129, 140, 248, 0.85)",
  },
} as const;
