import { describe, expect, it } from "vitest";
import { pokemonSpotlightCopy } from "@/lib/pokemonSpotlightCopy";

describe("pokemonSpotlightCopy", () => {
  it("uses a matched article title first", () => {
    expect(
      pokemonSpotlightCopy({
        pokemon: { name: "Samurott", types: ["Water"] },
        article: { title: "Samurott gets a showcase", summary: "Fallback summary" },
      }),
    ).toBe("Samurott gets a showcase");
  });

  it("does not show a cache-refresh blocker for a resolved Pokemon without an article", () => {
    expect(
      pokemonSpotlightCopy({
        pokemon: { name: "Samurott", types: ["Water"] },
        article: null,
      }),
    ).toBe(
      "Samurott is today's Pokemon spotlight (Water), selected by the daily rotation while same-Pokemon headlines are quiet.",
    );
  });

  it("keeps a warmup message only when no Pokemon is available", () => {
    expect(pokemonSpotlightCopy({ pokemon: null, article: null })).toBe(
      "Daily spotlight is warming up. Try Reload in a few seconds.",
    );
  });
});
