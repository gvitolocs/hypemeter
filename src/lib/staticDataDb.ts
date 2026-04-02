import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import staticCpiYoYByYear from "@/data/staticCpiYoYByYear.json";

const BACKTRACK_BASELINE: Record<number, number> = {
  2005: 43,
  2006: 61,
  2007: 55,
  2008: 49,
  2009: 52,
  2010: 68,
  2011: 59,
  2012: 57,
  2013: 50,
  2014: 54,
  2015: 58,
  2016: 96,
  2017: 75,
  2018: 66,
  2019: 70,
  2020: 73,
  2021: 79,
  2022: 72,
  2023: 76,
  2024: 82,
  2025: 69,
};

type DbKind = "immutable" | "daily" | "runtime";

const dbSingleton: Partial<Record<DbKind, Database.Database>> = {};

function resolveDbPath(kind: DbKind): string {
  const kindEnv =
    kind === "immutable"
      ? process.env.HYPEMETER_SQLITE_IMMUTABLE_PATH?.trim()
      : kind === "daily"
        ? process.env.HYPEMETER_SQLITE_DAILY_PATH?.trim()
        : process.env.HYPEMETER_SQLITE_RUNTIME_PATH?.trim();
  if (kindEnv) return kindEnv;

  const baseDir = process.env.HYPEMETER_SQLITE_DIR?.trim();
  if (baseDir) {
    return path.join(baseDir, `hypemeter-${kind}.db`);
  }
  if (process.env.VERCEL === "1") return `/tmp/hypemeter-${kind}.db`;
  return path.join(process.cwd(), ".data", `hypemeter-${kind}.db`);
}

function ensureParentDir(filePath: string) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function ensureSchemaAndSeedImmutable(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS backtrack_baseline (
      year INTEGER PRIMARY KEY,
      score REAL NOT NULL
    );
    CREATE TABLE IF NOT EXISTS cpi_yoy_yearly (
      year INTEGER PRIMARY KEY,
      yoy REAL NOT NULL
    );
    CREATE TABLE IF NOT EXISTS stooq_yearly_close (
      symbol TEXT NOT NULL,
      year INTEGER NOT NULL,
      close REAL NOT NULL,
      PRIMARY KEY (symbol, year)
    );
    CREATE TABLE IF NOT EXISTS stooq_monthly_close (
      symbol TEXT NOT NULL,
      ym TEXT NOT NULL,
      close REAL NOT NULL,
      PRIMARY KEY (symbol, ym)
    );
  `);

  const baselineCount =
    (db.prepare("SELECT COUNT(1) as c FROM backtrack_baseline").get() as { c: number }).c ?? 0;
  if (baselineCount === 0) {
    const insert = db.prepare("INSERT INTO backtrack_baseline (year, score) VALUES (?, ?)");
    const tx = db.transaction(() => {
      for (const [y, v] of Object.entries(BACKTRACK_BASELINE)) {
        insert.run(Number(y), v);
      }
    });
    tx();
  }

  const cpiCount = (db.prepare("SELECT COUNT(1) as c FROM cpi_yoy_yearly").get() as { c: number }).c ?? 0;
  if (cpiCount === 0) {
    const insert = db.prepare("INSERT INTO cpi_yoy_yearly (year, yoy) VALUES (?, ?)");
    const tx = db.transaction(() => {
      for (const [y, v] of Object.entries(staticCpiYoYByYear as Record<string, number>)) {
        insert.run(Number(y), v);
      }
    });
    tx();
  }
}

function ensureSchemaDaily(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS pokemon_day_bundle (
      day_key TEXT PRIMARY KEY,
      payload_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS pokemon_catalog_name (
      name TEXT PRIMARY KEY,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS pokemon_catalog_alias (
      alias TEXT PRIMARY KEY,
      canonical_name TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS pokemon_profile (
      lookup_key TEXT PRIMARY KEY,
      pokemon_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      image TEXT,
      types_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_pokemon_profile_pokemon_id ON pokemon_profile(pokemon_id);
  `);
}

function ensureSchemaRuntime(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS runtime_snapshot (
      key TEXT PRIMARY KEY,
      payload_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

function getDb(kind: DbKind): Database.Database {
  const existing = dbSingleton[kind];
  if (existing) return existing;
  const dbPath = resolveDbPath(kind);
  ensureParentDir(dbPath);
  const db = new Database(dbPath);
  if (kind === "immutable") ensureSchemaAndSeedImmutable(db);
  else if (kind === "daily") ensureSchemaDaily(db);
  else ensureSchemaRuntime(db);
  dbSingleton[kind] = db;
  return db;
}

/** Test helper: closes current singleton so tests can switch DB path safely. */
export function resetStaticDataDbForTests(): void {
  for (const key of ["immutable", "daily", "runtime"] as const) {
    const db = dbSingleton[key];
    if (!db) continue;
    try {
      db.close();
    } catch {
      /* ignore */
    }
  }
  dbSingleton.immutable = undefined;
  dbSingleton.daily = undefined;
  dbSingleton.runtime = undefined;
}

export function readBacktrackBaselineFromDb(): Map<number, number> {
  const db = getDb("immutable");
  const rows = db
    .prepare("SELECT year, score FROM backtrack_baseline ORDER BY year ASC")
    .all() as Array<{ year: number; score: number }>;
  const out = new Map<number, number>();
  for (const row of rows) out.set(row.year, row.score);
  return out;
}

export function readStaticCpiYoYFromDb(): Map<number, number> {
  const db = getDb("immutable");
  const rows = db
    .prepare("SELECT year, yoy FROM cpi_yoy_yearly ORDER BY year ASC")
    .all() as Array<{ year: number; yoy: number }>;
  const out = new Map<number, number>();
  for (const row of rows) out.set(row.year, row.yoy);
  return out;
}

export function readStooqYearlyCloseFromDb(symbol: string): Map<number, number> {
  const db = getDb("immutable");
  const rows = db
    .prepare("SELECT year, close FROM stooq_yearly_close WHERE symbol = ? ORDER BY year ASC")
    .all(symbol) as Array<{ year: number; close: number }>;
  const out = new Map<number, number>();
  for (const row of rows) out.set(row.year, row.close);
  return out;
}

export function upsertStooqYearlyClose(symbol: string, yearly: Map<number, number>) {
  if (yearly.size === 0) return;
  const db = getDb("immutable");
  const stmt = db.prepare(`
    INSERT INTO stooq_yearly_close (symbol, year, close)
    VALUES (?, ?, ?)
    ON CONFLICT(symbol, year) DO UPDATE SET close = excluded.close
  `);
  const tx = db.transaction(() => {
    for (const [year, close] of yearly) stmt.run(symbol, year, close);
  });
  tx();
}

export function readStooqMonthlyCloseFromDb(symbol: string): Map<string, number> {
  const db = getDb("immutable");
  const rows = db
    .prepare("SELECT ym, close FROM stooq_monthly_close WHERE symbol = ? ORDER BY ym ASC")
    .all(symbol) as Array<{ ym: string; close: number }>;
  const out = new Map<string, number>();
  for (const row of rows) out.set(row.ym, row.close);
  return out;
}

export function upsertStooqMonthlyClose(symbol: string, monthly: Map<string, number>) {
  if (monthly.size === 0) return;
  const db = getDb("immutable");
  const stmt = db.prepare(`
    INSERT INTO stooq_monthly_close (symbol, ym, close)
    VALUES (?, ?, ?)
    ON CONFLICT(symbol, ym) DO UPDATE SET close = excluded.close
  `);
  const tx = db.transaction(() => {
    for (const [ym, close] of monthly) stmt.run(symbol, ym, close);
  });
  tx();
}

export function readPokemonDayBundleFromDb<T>(dayKey: string): T | null {
  const db = getDb("daily");
  const row = db
    .prepare("SELECT payload_json FROM pokemon_day_bundle WHERE day_key = ?")
    .get(dayKey) as { payload_json: string } | undefined;
  if (!row?.payload_json) return null;
  try {
    return JSON.parse(row.payload_json) as T;
  } catch {
    return null;
  }
}

export function upsertPokemonDayBundleToDb(dayKey: string, payload: unknown) {
  const db = getDb("daily");
  db.prepare(`
    INSERT INTO pokemon_day_bundle (day_key, payload_json, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(day_key) DO UPDATE SET
      payload_json = excluded.payload_json,
      updated_at = excluded.updated_at
  `).run(dayKey, JSON.stringify(payload), new Date().toISOString());
}

export function readPokemonCatalogSnapshotFromDb():
  | { names: string[]; aliases: Array<[alias: string, canonical: string]> }
  | null {
  const db = getDb("daily");
  const names = db
    .prepare("SELECT name FROM pokemon_catalog_name ORDER BY name ASC")
    .all() as Array<{ name: string }>;
  if (names.length === 0) return null;
  const aliases = db
    .prepare("SELECT alias, canonical_name FROM pokemon_catalog_alias ORDER BY alias ASC")
    .all() as Array<{ alias: string; canonical_name: string }>;
  return {
    names: names.map((row) => row.name),
    aliases: aliases.map((row) => [row.alias, row.canonical_name]),
  };
}

export function replacePokemonCatalogSnapshotInDb(args: {
  names: string[];
  aliases: Array<[alias: string, canonical: string]>;
}) {
  const db = getDb("daily");
  const now = new Date().toISOString();
  const insertName = db.prepare(`
    INSERT INTO pokemon_catalog_name (name, updated_at)
    VALUES (?, ?)
  `);
  const insertAlias = db.prepare(`
    INSERT INTO pokemon_catalog_alias (alias, canonical_name, updated_at)
    VALUES (?, ?, ?)
  `);
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM pokemon_catalog_name").run();
    db.prepare("DELETE FROM pokemon_catalog_alias").run();
    for (const name of args.names) insertName.run(name, now);
    for (const [alias, canonical] of args.aliases) insertAlias.run(alias, canonical, now);
  });
  tx();
}

type PokemonProfileRecord = {
  id: number;
  name: string;
  image: string | null;
  types: string[];
};

export function readPokemonProfileFromDb(identifier: string | number): PokemonProfileRecord | null {
  const db = getDb("daily");
  const idStr = String(identifier).trim().toLowerCase();
  const isNumericId = /^\d+$/.test(idStr);
  const row = isNumericId
    ? (db
        .prepare("SELECT pokemon_id, name, image, types_json FROM pokemon_profile WHERE pokemon_id = ? LIMIT 1")
        .get(Number(idStr)) as
        | { pokemon_id: number; name: string; image: string | null; types_json: string }
        | undefined)
    : (db
        .prepare("SELECT pokemon_id, name, image, types_json FROM pokemon_profile WHERE lookup_key = ?")
        .get(idStr) as { pokemon_id: number; name: string; image: string | null; types_json: string } | undefined);
  if (!row) return null;
  try {
    const types = JSON.parse(row.types_json) as unknown;
    if (!Array.isArray(types)) return null;
    return {
      id: row.pokemon_id,
      name: row.name,
      image: row.image ?? null,
      types: types.filter((t): t is string => typeof t === "string"),
    };
  } catch {
    return null;
  }
}

export function upsertPokemonProfileToDb(args: {
  keys: string[];
  profile: PokemonProfileRecord;
}) {
  const db = getDb("daily");
  const now = new Date().toISOString();
  const uniqueKeys = Array.from(
    new Set(
      args.keys
        .map((k) => k.trim().toLowerCase())
        .filter(Boolean),
    ),
  );
  if (uniqueKeys.length === 0) return;
  const stmt = db.prepare(`
    INSERT INTO pokemon_profile (lookup_key, pokemon_id, name, image, types_json, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(lookup_key) DO UPDATE SET
      pokemon_id = excluded.pokemon_id,
      name = excluded.name,
      image = excluded.image,
      types_json = excluded.types_json,
      updated_at = excluded.updated_at
  `);
  const tx = db.transaction(() => {
    for (const key of uniqueKeys) {
      stmt.run(
        key,
        args.profile.id,
        args.profile.name,
        args.profile.image,
        JSON.stringify(args.profile.types),
        now,
      );
    }
  });
  tx();
}

export function readRuntimeSnapshotFromDb<T>(key: string): T | null {
  const db = getDb("runtime");
  const row = db
    .prepare("SELECT payload_json FROM runtime_snapshot WHERE key = ?")
    .get(key) as { payload_json: string } | undefined;
  if (!row?.payload_json) return null;
  try {
    return JSON.parse(row.payload_json) as T;
  } catch {
    return null;
  }
}

export function upsertRuntimeSnapshotToDb(key: string, payload: unknown) {
  const db = getDb("runtime");
  db.prepare(`
    INSERT INTO runtime_snapshot (key, payload_json, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      payload_json = excluded.payload_json,
      updated_at = excluded.updated_at
  `).run(key, JSON.stringify(payload), new Date().toISOString());
}
