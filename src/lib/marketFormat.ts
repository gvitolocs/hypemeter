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

/** Tailwind classes: negative ≠ green (sidecar %). */
export function growthPctColorClass(
  pct: number | null,
  options: { up: string; down: string } = { up: "text-emerald-400", down: "text-rose-400" },
): string {
  if (pct === null || Number.isNaN(pct)) return "text-slate-400";
  if (pct > 0) return options.up;
  if (pct < 0) return options.down;
  return "text-slate-300";
}
