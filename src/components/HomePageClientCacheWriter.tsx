"use client";

import { useEffect } from "react";
import { HOME_PAGE_DATA_CACHE_TTL_SEC } from "@/lib/homePageCacheConfig";

const STORAGE_KEY = "hypemeter-home-browser-buffer-v1";

export type HomeBrowserBufferPayload = {
  score: number;
  updatedAt: string;
  /** Unix ms when the server finished computing this snapshot (stable while server cache hits). */
  computedAt: number;
};

/**
 * Persists the last successful home snapshot in localStorage so devtools / future features
 * can inspect freshness. Server-side `unstable_cache` is what avoids refetching upstreams
 * on every reload; this buffer is metadata + a light client mirror.
 */
export function HomePageClientCacheWriter({ payload }: { payload: HomeBrowserBufferPayload }) {
  useEffect(() => {
    try {
      const record = {
        ...payload,
        savedAtClient: Date.now(),
        serverCacheTtlSec: HOME_PAGE_DATA_CACHE_TTL_SEC,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
    } catch {
      /* quota / private mode */
    }
  }, [payload]);

  return null;
}
