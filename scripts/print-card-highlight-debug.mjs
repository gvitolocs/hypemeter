#!/usr/bin/env node
/**
 * Fetches GET /api/debug/card-highlight-image and prints JSON + writes last-card-debug.json (gitignored).
 * Usage:
 *   npm run debug:card
 *   SITE_URL=https://tuodominio.vercel.app npm run debug:card
 *   node scripts/print-card-highlight-debug.mjs http://localhost:3000
 *
 * Production needs ENABLE_DEBUG_CARDTRADER=1 on Vercel for this endpoint to return 200.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const outFile = path.join(root, "last-card-debug.json");

const base =
  process.argv[2]?.trim() ||
  process.env.SITE_URL?.trim() ||
  process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
  "http://localhost:3000";

const url = `${base.replace(/\/$/, "")}/api/debug/card-highlight-image`;

async function main() {
  console.error(`[debug:card] GET ${url}\n`);
  const res = await fetch(url, { headers: { accept: "application/json" } });
  const text = await res.text();
  let pretty = text;
  try {
    pretty = JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    /* raw */
  }
  console.log(pretty);
  writeFileSync(outFile, pretty + "\n", "utf8");
  console.error(`\n[debug:card] written ${path.relative(root, outFile)} (paste in chat or @ file in Cursor)`);
  if (!res.ok) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
