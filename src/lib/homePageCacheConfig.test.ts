import { describe, expect, it } from "vitest";
import {
  CARD_TRADER_HIGHLIGHT_CACHE_SEC,
  HOME_PAGE_DATA_CACHE_TTL_SEC,
  HOME_POKEMON_RESOLVE_BUDGET_MS,
  HYPEMETER_DATA_REVALIDATE_SEC,
} from "./homePageCacheConfig";

describe("homePageCacheConfig", () => {
  it("gives Pokemon-of-day resolver enough time for cold RSS + PokeAPI on serverless", () => {
    expect(HOME_POKEMON_RESOLVE_BUDGET_MS).toBeGreaterThanOrEqual(10_000);
  });

  it("refreshes home-tagged data on a 90-minute cadence", () => {
    expect(HYPEMETER_DATA_REVALIDATE_SEC).toBe(90 * 60);
  });

  it("keeps home snapshot on the global refresh cadence", () => {
    expect(HOME_PAGE_DATA_CACHE_TTL_SEC).toBe(HYPEMETER_DATA_REVALIDATE_SEC);
  });

  it("refreshes Card Highlight more frequently than the full homepage payload", () => {
    expect(CARD_TRADER_HIGHLIGHT_CACHE_SEC).toBe(15 * 60);
    expect(CARD_TRADER_HIGHLIGHT_CACHE_SEC).toBeLessThan(HYPEMETER_DATA_REVALIDATE_SEC);
  });
});
