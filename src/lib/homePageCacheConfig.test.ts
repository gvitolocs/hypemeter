import { describe, expect, it } from "vitest";
import { HOME_POKEMON_RESOLVE_BUDGET_MS } from "./homePageCacheConfig";

describe("homePageCacheConfig", () => {
  it("gives Pokemon-of-day resolver enough time for cold RSS + PokeAPI on serverless", () => {
    expect(HOME_POKEMON_RESOLVE_BUDGET_MS).toBeGreaterThanOrEqual(10_000);
  });
});
