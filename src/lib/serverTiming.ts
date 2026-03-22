/**
 * Server-only timing: trace **steps inside one** route/serverless invocation (not separate Vercel functions).
 * Labels map to `timedAsync` blocks in `page.tsx` / market libs → check the same Function’s runtime logs.
 *
 * - Set `DEBUG_PAGE_TIMING=1` (Vercel env) to log **every** section duration.
 * - Slow sections (default ≥ `warnMs`, default 10s) always log as `console.warn` so they show in production logs.
 * - `runWithTimingCollector` (used by `/debug`) collects the same labels for an HTML table (no extra logging).
 * - Build wall time: `scripts/build-with-timing.mjs` prints `[build] … finished in …ms` in deploy logs.
 */

import { AsyncLocalStorage } from "node:async_hooks";

const DEFAULT_WARN_MS = 10_000;

export type TimingSpan = { label: string; ms: number };

type TimingStore = { spans: TimingSpan[] };

const timingCollector = new AsyncLocalStorage<TimingStore>();

function shouldLogAll(): boolean {
  return process.env.DEBUG_PAGE_TIMING === "1" || process.env.NODE_ENV === "development";
}

function pushSpan(label: string, ms: number): void {
  const store = timingCollector.getStore();
  if (store) {
    store.spans.push({ label, ms });
  }
}

/**
 * Runs the same async work as a route but records every `timedAsync` / `logTimingTotal` span for `/debug`.
 */
export async function runWithTimingCollector<T>(fn: () => Promise<T>): Promise<{
  result: T;
  spans: TimingSpan[];
  totalMs: number;
}> {
  const spans: TimingSpan[] = [];
  const wallStart = performance.now();
  const result = await timingCollector.run({ spans }, fn);
  return {
    result,
    spans: [...spans],
    totalMs: Math.round(performance.now() - wallStart),
  };
}

/**
 * Runs `fn`, measures wall time, logs if slow or if debug is on.
 */
export async function timedAsync<T>(
  label: string,
  fn: () => Promise<T>,
  options?: { warnMs?: number },
): Promise<T> {
  const warnMs = options?.warnMs ?? DEFAULT_WARN_MS;
  const t0 = performance.now();
  try {
    return await fn();
  } finally {
    const ms = performance.now() - t0;
    const rounded = Math.round(ms);
    pushSpan(label, rounded);
    const line = `${label} ${rounded}ms`;
    if (ms >= warnMs) {
      console.warn(line);
    } else if (shouldLogAll()) {
      console.log(line);
    }
  }
}

/**
 * Same as `timedAsync` but returns `{ result, ms }` for aggregating (e.g. total row).
 */
export async function timedAsyncWithMs<T>(label: string, fn: () => Promise<T>): Promise<{ result: T; ms: number }> {
  const t0 = performance.now();
  const result = await fn();
  const ms = performance.now() - t0;
  const rounded = Math.round(ms);
  pushSpan(label, rounded);
  const line = `${label} ${rounded}ms`;
  if (ms >= DEFAULT_WARN_MS) {
    console.warn(line);
  } else if (shouldLogAll()) {
    console.log(line);
  }
  return { result, ms: rounded };
}

/** Call once at end of a route handler for end-to-end wall time. */
export function logTimingTotal(label: string, elapsedMs: number, warnMs: number = DEFAULT_WARN_MS): void {
  const rounded = Math.round(elapsedMs);
  pushSpan(label, rounded);
  const line = `${label} ${rounded}ms`;
  if (elapsedMs >= warnMs) {
    console.warn(line);
  } else if (shouldLogAll()) {
    console.log(line);
  }
}
