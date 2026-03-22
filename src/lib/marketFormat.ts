export function formatUsd(value: number | null) {
  if (value === null || Number.isNaN(value)) {
    return "N/A";
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatGrowthPct(value: number | null) {
  if (value === null || Number.isNaN(value)) {
    return "N/A";
  }
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

/**
 * % change colors match `HypeBacktrackingChart` line fills (#34d399 / #fbbf24 / #fb7185).
 * Negative % keeps S&P green and BTC gold; only Nintendo uses rose (the “red” line).
 */
export function growthPctColorClass(
  value: number | null,
  positiveHue: "emerald" | "amber" | "rose" = "emerald",
): string {
  if (value === null || Number.isNaN(value)) {
    if (positiveHue === "amber") return "text-amber-400/85";
    if (positiveHue === "rose") return "text-rose-400/85";
    return "text-emerald-400/85";
  }
  if (value < 0) {
    if (positiveHue === "amber") return "text-amber-500";
    if (positiveHue === "rose") return "text-rose-400";
    return "text-emerald-500";
  }
  if (value > 0) {
    if (positiveHue === "amber") return "text-amber-400";
    if (positiveHue === "rose") return "text-rose-400";
    return "text-emerald-400";
  }
  return "text-slate-300";
}
