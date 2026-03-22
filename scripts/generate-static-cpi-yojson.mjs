/**
 * One-off: fetch FRED CPIAUCSL CSV and write YoY % per year (2005→last complete year) to src/data.
 * Run: node scripts/generate-static-cpi-yojson.mjs
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

function parseFredCpiCsvToMonthlyRows(csv) {
  const lines = csv
    .trim()
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    const dateStr = cols[0]?.trim();
    const rawVal = cols[1]?.trim();
    if (!dateStr || rawVal === undefined || rawVal === "") continue;
    if (!/^\d{4}-\d{2}-\d{2}/.test(dateStr)) continue;
    if (rawVal === ".") continue;
    const cpi = Number(rawVal);
    if (Number.isNaN(cpi) || cpi <= 0) continue;
    const d = new Date(dateStr + "T12:00:00Z");
    if (Number.isNaN(d.getTime())) continue;
    out.push({ y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, t: d.getTime(), cpi });
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}

function buildCpiYoYPercentByYearFromMonthlyRows(monthly) {
  const map = new Map();
  if (monthly.length === 0) return map;
  const byYearMonth = new Map();
  for (const p of monthly) {
    byYearMonth.set(`${p.y}-${String(p.m).padStart(2, "0")}`, p.cpi);
  }
  const years = [...new Set(monthly.map((p) => p.y))].sort((a, b) => a - b);
  for (const y of years) {
    let cpiNow = null;
    let lastM = 0;
    for (let m = 12; m >= 1; m--) {
      const v = byYearMonth.get(`${y}-${String(m).padStart(2, "0")}`);
      if (v !== undefined) {
        cpiNow = v;
        lastM = m;
        break;
      }
    }
    if (cpiNow === null || lastM === 0) continue;
    const cpiPrev = byYearMonth.get(`${y - 1}-${String(lastM).padStart(2, "0")}`);
    if (cpiPrev === undefined || cpiPrev === 0) continue;
    map.set(y, (cpiNow / cpiPrev - 1) * 100);
  }
  return map;
}

const url = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=CPIAUCSL";
const res = await fetch(url, {
  headers: {
    "user-agent":
      "Mozilla/5.0 (compatible; hypemeter-static-generator/1.0)",
  },
});
if (!res.ok) {
  console.error("FRED CSV failed:", res.status);
  process.exit(1);
}
const text = await res.text();
const rows = parseFredCpiCsvToMonthlyRows(text);
const full = buildCpiYoYPercentByYearFromMonthlyRows(rows);

const cy = new Date().getUTCFullYear();
const lastComplete = cy - 1;
const out = {};
for (let y = 2005; y <= lastComplete; y++) {
  const v = full.get(y);
  if (v !== undefined) out[String(y)] = Math.round(v * 1000) / 1000;
}

const dest = join(__dirname, "../src/data/staticCpiYoYByYear.json");
writeFileSync(dest, JSON.stringify(out, null, 2) + "\n", "utf8");
console.log("Wrote", dest, Object.keys(out).length, "years (2005–" + lastComplete + ")");
