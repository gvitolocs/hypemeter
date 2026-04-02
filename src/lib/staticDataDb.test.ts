import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  readBacktrackBaselineFromDb,
  readPokemonCatalogSnapshotFromDb,
  readPokemonDayBundleFromDb,
  readPokemonProfileFromDb,
  readRuntimeSnapshotFromDb,
  readStaticCpiYoYFromDb,
  readStooqMonthlyCloseFromDb,
  readStooqYearlyCloseFromDb,
  replacePokemonCatalogSnapshotInDb,
  resetStaticDataDbForTests,
  upsertPokemonDayBundleToDb,
  upsertPokemonProfileToDb,
  upsertRuntimeSnapshotToDb,
  upsertStooqMonthlyClose,
  upsertStooqYearlyClose,
} from "@/lib/staticDataDb";

function freshDbDir() {
  return path.join(os.tmpdir(), `hypemeter-static-${Date.now()}-${Math.random().toString(36).slice(2)}`);
}

function withFreshDbDir() {
  const dir = freshDbDir();
  fs.mkdirSync(dir, { recursive: true });
  process.env.HYPEMETER_SQLITE_DIR = dir;
  resetStaticDataDbForTests();
  return dir;
}

afterEach(() => {
  const dir = process.env.HYPEMETER_SQLITE_DIR;
  resetStaticDataDbForTests();
  if (dir) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
  delete process.env.HYPEMETER_SQLITE_DIR;
});

describe("staticDataDb", () => {
  it("seeds immutable baseline and CPI yearly data", () => {
    withFreshDbDir();
    const baseline = readBacktrackBaselineFromDb();
    const cpi = readStaticCpiYoYFromDb();

    expect(baseline.get(2005)).toBe(43);
    expect(baseline.get(2016)).toBe(96);
    expect(baseline.get(2025)).toBe(69);
    expect(baseline.size).toBeGreaterThanOrEqual(20);

    expect(cpi.size).toBeGreaterThan(10);
    expect(cpi.has(2010)).toBe(true);
    expect(Number.isFinite(cpi.get(2010) ?? NaN)).toBe(true);
  });

  it("upserts and reads Stooq yearly closes per symbol", () => {
    withFreshDbDir();
    upsertStooqYearlyClose(
      "^spx",
      new Map([
        [2022, 3839.5],
        [2023, 4769.8],
      ]),
    );
    upsertStooqYearlyClose("^spx", new Map([[2023, 4770.1]]));

    const rows = readStooqYearlyCloseFromDb("^spx");
    expect(rows.get(2022)).toBe(3839.5);
    expect(rows.get(2023)).toBe(4770.1);
    expect(rows.size).toBe(2);
  });

  it("upserts and reads Stooq monthly closes per symbol", () => {
    withFreshDbDir();
    upsertStooqMonthlyClose(
      "btcusd",
      new Map([
        ["2025-11", 98200],
        ["2025-12", 100450],
      ]),
    );
    upsertStooqMonthlyClose("btcusd", new Map([["2025-12", 100500]]));

    const rows = readStooqMonthlyCloseFromDb("btcusd");
    expect(rows.get("2025-11")).toBe(98200);
    expect(rows.get("2025-12")).toBe(100500);
    expect(rows.size).toBe(2);
  });

  it("stores daily pokemon bundle in dedicated daily DB", () => {
    const dir = withFreshDbDir();
    upsertPokemonDayBundleToDb("2026-04-02", {
      pokemon: { id: 25, name: "Pikachu" },
      winnerSlug: "pikachu",
      article: { title: "Pika news", link: "https://example.com" },
    });
    const row = readPokemonDayBundleFromDb<{
      pokemon: { id: number; name: string };
      winnerSlug: string;
    }>("2026-04-02");
    expect(row?.pokemon.name).toBe("Pikachu");
    expect(row?.winnerSlug).toBe("pikachu");
    expect(fs.existsSync(path.join(dir, "hypemeter-daily.db"))).toBe(true);
  });

  it("stores runtime snapshots in dedicated runtime DB", () => {
    const dir = withFreshDbDir();
    upsertRuntimeSnapshotToDb("market_snapshot", { sp500: 5100.1, bitcoin: 70000.5 });
    const snap = readRuntimeSnapshotFromDb<{ sp500: number; bitcoin: number }>("market_snapshot");
    expect(snap?.sp500).toBe(5100.1);
    expect(snap?.bitcoin).toBe(70000.5);
    expect(fs.existsSync(path.join(dir, "hypemeter-runtime.db"))).toBe(true);
  });

  it("stores pokemon catalog and profiles in SQL tables", () => {
    const dir = withFreshDbDir();
    replacePokemonCatalogSnapshotInDb({
      names: ["pikachu", "mr-mime"],
      aliases: [
        ["pikachu", "pikachu"],
        ["mr mime", "mr-mime"],
      ],
    });
    upsertPokemonProfileToDb({
      keys: ["pikachu", "25"],
      profile: { id: 25, name: "Pikachu", image: "https://img/pika.png", types: ["Electric"] },
    });

    const catalog = readPokemonCatalogSnapshotFromDb();
    const bySlug = readPokemonProfileFromDb("pikachu");
    const byId = readPokemonProfileFromDb(25);

    expect(catalog?.names).toContain("pikachu");
    expect(catalog?.aliases).toContainEqual(["mr mime", "mr-mime"]);
    expect(bySlug?.name).toBe("Pikachu");
    expect(byId?.id).toBe(25);
    expect(fs.existsSync(path.join(dir, "hypemeter-daily.db"))).toBe(true);
  });
});
