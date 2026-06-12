import { HOME_PAGE_DATA_CACHE_TTL_SEC } from "@/lib/homePageCacheConfig";

export function isHomePageRuntimeSnapshotFresh(updatedAtMs: number, nowMs = Date.now()): boolean {
  if (!Number.isFinite(updatedAtMs) || updatedAtMs <= 0) return false;
  return nowMs - updatedAtMs < HOME_PAGE_DATA_CACHE_TTL_SEC * 1000;
}
