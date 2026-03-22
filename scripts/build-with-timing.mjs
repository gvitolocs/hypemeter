#!/usr/bin/env node
/**
 * Wraps `next build` so Vercel (and local) build logs show wall-clock timing.
 * Slow *page load* in the browser is SSR/runtime — use DEBUG_PAGE_TIMING=1 (see `src/lib/serverTiming.ts`).
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const nextBin = path.join(root, "node_modules", ".bin", "next");

const t0 = Date.now();
const sha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local";
console.log(
  `[build] start ${new Date().toISOString()} VERCEL=${process.env.VERCEL ?? "0"} SHA=${sha}`,
);

const result = spawnSync(nextBin, ["build"], {
  stdio: "inherit",
  env: process.env,
  cwd: root,
});

const ms = Date.now() - t0;
console.log(
  `[build] next build finished in ${ms}ms (${(ms / 1000).toFixed(1)}s) exit=${result.status ?? 0}`,
);
process.exit(result.status === null ? 1 : result.status);
