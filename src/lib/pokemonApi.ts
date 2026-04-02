import "server-only";

import {
  readPokemonCatalogSnapshotFromDb,
  readPokemonProfileFromDb,
  replacePokemonCatalogSnapshotInDb,
  upsertPokemonProfileToDb,
} from "@/lib/staticDataDb";

const POKEAPI_LIST_URL = "https://pokeapi.co/api/v2/pokemon?limit=2000";
const POKEAPI_POKEMON_URL = "https://pokeapi.co/api/v2/pokemon/";
type CatalogSnapshot = {
  names: string[];
  aliases: Array<[alias: string, canonical: string]>;
};

type AliasPattern = {
  alias: string;
  canonical: string;
  regex: RegExp;
};

export type PokemonProfile = {
  id: number;
  name: string;
  image: string | null;
  types: string[];
};

const EXTRA_ALIASES: Record<string, string[]> = {
  "mr-mime": ["mr mime", "mrmime"],
  "mime-jr": ["mime jr", "mimejr"],
  "mr-rime": ["mr rime", "mrrime"],
  "type-null": ["type null"],
  "ho-oh": ["ho oh"],
  "porygon-z": ["porygon z"],
  "jangmo-o": ["jangmo o"],
  "hakamo-o": ["hakamo o"],
  "kommo-o": ["kommo o"],
  "nidoran-f": ["nidoran female", "nidoran f"],
  "nidoran-m": ["nidoran male", "nidoran m"],
};

let memoNames: string[] | null = null;
let memoAliasPatterns: AliasPattern[] | null = null;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function titleCase(value: string): string {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function normalizePokemonToken(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildAliasesForName(name: string): string[] {
  const out = new Set<string>();
  const normalizedSlug = normalizePokemonToken(name);
  if (normalizedSlug) out.add(normalizedSlug);
  const spaced = normalizePokemonToken(name.replace(/-/g, " "));
  if (spaced) out.add(spaced);
  const display = normalizePokemonToken(titleCase(name));
  if (display) out.add(display);
  for (const alias of EXTRA_ALIASES[name] ?? []) {
    const normalized = normalizePokemonToken(alias);
    if (normalized) out.add(normalized);
  }
  return Array.from(out);
}

function buildAliasPatterns(aliases: Array<[alias: string, canonical: string]>): AliasPattern[] {
  return aliases
    .filter(([alias]) => alias.length >= 3)
    .sort((a, b) => b[0].length - a[0].length)
    .map(([alias, canonical]) => ({
      alias,
      canonical,
      regex: new RegExp(`(^|\\s)${escapeRegex(alias)}(?=\\s|$)`, "g"),
    }));
}

function cacheCatalog(snapshot: CatalogSnapshot): string[] {
  memoNames = snapshot.names;
  memoAliasPatterns = buildAliasPatterns(snapshot.aliases);
  return snapshot.names;
}

function buildCatalogSnapshot(names: string[]): CatalogSnapshot {
  const canonical = names.map((n) => n.trim()).filter(Boolean);
  const aliases: Array<[string, string]> = [];
  for (const name of canonical) {
    for (const alias of buildAliasesForName(name)) aliases.push([alias, name]);
  }
  return { names: canonical, aliases };
}

export async function fetchPokemonNameCatalog(): Promise<string[]> {
  if (memoNames) return memoNames;

  const cached = readPokemonCatalogSnapshotFromDb();
  if (cached?.names?.length) {
    return cacheCatalog(cached);
  }

  try {
    const res = await fetch(POKEAPI_LIST_URL, {
      next: { revalidate: 24 * 60 * 60 },
      headers: { "user-agent": "Mozilla/5.0 hypemeter-pokemon-catalog" },
    });
    if (!res.ok) return [];
    const payload = (await res.json()) as { results?: Array<{ name?: string }> };
    const names = (payload.results ?? []).map((entry) => entry.name ?? "").filter(Boolean);
    const snapshot = buildCatalogSnapshot(names);
    replacePokemonCatalogSnapshotInDb(snapshot);
    return cacheCatalog(snapshot);
  } catch {
    return [];
  }
}

export function rankPokemonMatchesFromSources(
  sources: Array<{ text: string; weight: number }>,
  names: string[],
) {
  const scored = new Map<string, { score: number; firstIndex: number }>();

  const aliasPatterns =
    memoAliasPatterns && memoAliasPatterns.length > 0
      ? memoAliasPatterns
      : buildAliasPatterns(buildCatalogSnapshot(names).aliases);

  for (const source of sources) {
    const text = normalizePokemonToken(source.text);
    if (!text) continue;

    const perSourceHits = new Map<string, { hits: number; firstIndex: number }>();
    for (const pattern of aliasPatterns) {
      let hits = 0;
      let first = -1;
      let match = pattern.regex.exec(text);
      while (match) {
        hits += 1;
        if (first < 0) first = match.index;
        if (hits >= 5) break;
        match = pattern.regex.exec(text);
      }
      pattern.regex.lastIndex = 0;
      if (hits === 0) continue;

      const existing = perSourceHits.get(pattern.canonical);
      if (!existing || hits > existing.hits || (hits === existing.hits && first < existing.firstIndex)) {
        perSourceHits.set(pattern.canonical, { hits, firstIndex: first });
      }
    }

    for (const [name, hit] of perSourceHits) {
      const existing = scored.get(name) ?? { score: 0, firstIndex: hit.firstIndex };
      existing.score += hit.hits * source.weight;
      existing.firstIndex =
        existing.firstIndex < 0
          ? hit.firstIndex
          : hit.firstIndex < 0
            ? existing.firstIndex
            : Math.min(existing.firstIndex, hit.firstIndex);
      scored.set(name, existing);
    }
  }

  return Array.from(scored.entries())
    .map(([name, stats]) => ({ name, ...stats }))
    .sort((a, b) => b.score - a.score || a.firstIndex - b.firstIndex);
}

export async function fetchPokemonByIdentifier(identifier: string | number): Promise<PokemonProfile | null> {
  const cacheKey = String(identifier).toLowerCase();
  const cached = readPokemonProfileFromDb(cacheKey);
  if (cached?.id && cached.name) return cached;

  try {
    const res = await fetch(`${POKEAPI_POKEMON_URL}${identifier}`, {
      next: { revalidate: 24 * 60 * 60 },
      headers: { "user-agent": "Mozilla/5.0 hypemeter-pokemon-profile" },
    });
    if (!res.ok) return null;
    const payload = (await res.json()) as {
      id: number;
      name: string;
      sprites?: { other?: { "official-artwork"?: { front_default?: string | null } } };
      types?: Array<{ type?: { name?: string } }>;
    };
    const profile: PokemonProfile = {
      id: payload.id,
      name: titleCase(payload.name),
      image: payload.sprites?.other?.["official-artwork"]?.front_default ?? null,
      types: (payload.types ?? [])
        .map((entry) => entry.type?.name ?? "")
        .filter(Boolean)
        .map((name) => titleCase(name)),
    };
    upsertPokemonProfileToDb({
      keys: [cacheKey, String(profile.id), payload.name.toLowerCase(), profile.name.toLowerCase()],
      profile,
    });
    return profile;
  } catch {
    return null;
  }
}
