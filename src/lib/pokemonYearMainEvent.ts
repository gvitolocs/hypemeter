/**
 * One-line “main Pokémon beat” for a calendar year (search/trend context).
 * Used in HypeBacktrackingChart fuchsia spotlight when there is no curated timeline row.
 * Keep in sync with `timelineEventSignals` in `page.tsx` where years overlap.
 */
const YEAR_MAIN_EVENT: Partial<Record<number, string>> = {
  2005: "4th gen build-up",
  2006: "Diamond & Pearl era",
  2007: "Battle Revolution / DPP",
  2008: "Platinum / competitive scene",
  2009: "HeartGold & SoulSilver",
  2010: "HGSS + competitive upswing",
  2011: "Black & White launch",
  2012: "B2W2 / Worlds",
  2013: "X/Y 3D transition",
  2014: "Omega Ruby / Alpha Sapphire",
  2015: "ORAS / competitive",
  2016: "Pokémon GO global shock",
  2017: "Ultra Sun & Moon / GO",
  2018: "Let’s Go / Switch era",
  2019: "Sword & Shield reset",
  2020: "COVID / DLC / competitive",
  2021: "Pandemic TCG mania",
  2022: "Scarlet & Violet launch",
  2023: "SV DLC / Worlds",
  2024: "Pocket + new cycle",
  2025: "Direct / Presents volatility",
  2026: "Franchise roadmap",
};

export function mainEventLabelForYear(year: number): string {
  const direct = YEAR_MAIN_EVENT[year];
  if (direct) return direct;
  const years = Object.keys(YEAR_MAIN_EVENT)
    .map(Number)
    .sort((a, b) => a - b);
  if (years.length === 0) return `Pokémon year ${year}`;
  let nearest = years[0];
  let bestDist = Math.abs(year - nearest);
  for (const y of years) {
    const d = Math.abs(year - y);
    if (d < bestDist) {
      bestDist = d;
      nearest = y;
    }
  }
  const label = YEAR_MAIN_EVENT[nearest] ?? "Pokémon cycle";
  return nearest === year ? label : `${label} (${year})`;
}
