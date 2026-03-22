"use client";

import { useSyncExternalStore } from "react";

/**
 * SSR-safe `matchMedia` — server snapshot defaults to `false` (desktop layout).
 */
export function useMatchMedia(query: string): boolean {
  return useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === "undefined") return () => {};
      const mq = window.matchMedia(query);
      mq.addEventListener("change", onStoreChange);
      return () => mq.removeEventListener("change", onStoreChange);
    },
    () => (typeof window !== "undefined" ? window.matchMedia(query).matches : false),
    () => false,
  );
}
