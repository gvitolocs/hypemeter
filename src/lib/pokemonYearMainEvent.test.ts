import { describe, expect, it } from "vitest";
import { mainEventLabelForYear } from "./pokemonYearMainEvent";

describe("mainEventLabelForYear", () => {
  it("returns mapped label for known years", () => {
    expect(mainEventLabelForYear(2016)).toContain("GO");
    expect(mainEventLabelForYear(2024)).toContain("Pocket");
  });

  it("falls back to nearest anchor for unmapped years", () => {
    const s = mainEventLabelForYear(2017);
    expect(s.length).toBeGreaterThan(3);
  });
});
