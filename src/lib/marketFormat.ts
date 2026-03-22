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
 * % change colors: up = asset hue; down = distinct hue per card (not the same rose for all three).
 * N/A keeps that asset’s tint (not flat grey).
 */
export function growthPctColorClass(
  value: number | null,
  positiveHue: "emerald" | "amber" | "rose" = "emerald",
): string {
  if (value === null || Number.isNaN(value)) {
    if (positiveHue === "amber") return "text-amber-300/85";
    if (positiveHue === "rose") return "text-rose-300/85";
    return "text-emerald-400/85";
  }
  if (value < 0) {
    if (positiveHue === "amber") return "text-orange-400";
    if (positiveHue === "rose") return "text-fuchsia-400";
    return "text-red-400";
  }
  if (value > 0) {
    if (positiveHue === "amber") return "text-amber-300";
    if (positiveHue === "rose") return "text-rose-300";
    return "text-emerald-400";
  }
  return "text-slate-300";
}
