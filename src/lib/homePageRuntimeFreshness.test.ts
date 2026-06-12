import { describe, expect, it } from "vitest";
import { HOME_PAGE_DATA_CACHE_TTL_SEC } from "@/lib/homePageCacheConfig";
import { isHomePageRuntimeSnapshotFresh } from "@/lib/homePageRuntimeFreshness";

describe("homePageRuntimeFreshness", () => {
  it("treats snapshots inside the home TTL as fresh", () => {
    const now = 10_000_000;
    const updatedAt = now - HOME_PAGE_DATA_CACHE_TTL_SEC * 1000 + 1;
    expect(isHomePageRuntimeSnapshotFresh(updatedAt, now)).toBe(true);
  });

  it("treats snapshots at or beyond the home TTL as stale", () => {
    const now = 10_000_000;
    const updatedAt = now - HOME_PAGE_DATA_CACHE_TTL_SEC * 1000;
    expect(isHomePageRuntimeSnapshotFresh(updatedAt, now)).toBe(false);
  });

  it("rejects invalid snapshot timestamps", () => {
    expect(isHomePageRuntimeSnapshotFresh(0, 1_800_000)).toBe(false);
    expect(isHomePageRuntimeSnapshotFresh(Number.NaN, 1_800_000)).toBe(false);
  });
});
