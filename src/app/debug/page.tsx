import { loadHomePageDataUncached } from "@/app/page";
import { runWithTimingCollector } from "@/lib/serverTiming";
import type { Metadata } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";

/** Must read env at request time on Vercel (not at build). */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Debug · Monmeter",
  robots: { index: false, follow: false },
};

function isDebugTimingEnabled(): boolean {
  if (process.env.NODE_ENV === "development") return true;
  return process.env.ENABLE_DEBUG_TIMING_PAGE === "1";
}

async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

async function fetchDebugJson(path: string): Promise<{ status: number; text: string }> {
  try {
    const origin = await requestOrigin();
    const res = await fetch(`${origin}${path}`, {
      cache: "no-store",
      next: { revalidate: 0 },
    });
    const text = await res.text();
    return { status: res.status, text };
  } catch (e) {
    return { status: 0, text: e instanceof Error ? e.message : String(e) };
  }
}

function prettyJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

export default async function DebugPage() {
  const [cardHighlight, cardTrader] = await Promise.all([
    fetchDebugJson("/api/debug/card-highlight-image"),
    fetchDebugJson("/api/debug/card-trader"),
  ]);

  let timingBlock: ReactNode = null;
  if (isDebugTimingEnabled()) {
    const { spans, totalMs } = await runWithTimingCollector(() => loadHomePageDataUncached());
    const maxMs = Math.max(1, ...spans.map((s) => s.ms));
    timingBlock = (
      <>
        <h2 className="mt-10 text-lg font-semibold text-cyan-300">SSR timing (full home pipeline)</h2>
        <p className="mt-1 text-sm text-slate-400">
          This request total: <span className="font-mono text-slate-200">{totalMs}ms</span>. Same as{" "}
          <code className="rounded bg-slate-800 px-1">loadHomePageDataUncached</code>.
        </p>
        <div className="mt-4 overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-slate-900/80 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2">Step</th>
                <th className="px-3 py-2">ms</th>
                <th className="min-w-[8rem] px-3 py-2">share</th>
              </tr>
            </thead>
            <tbody>
              {spans.map((row, index) => (
                <tr key={`${index}-${row.label}`} className="border-b border-white/5 hover:bg-slate-900/40">
                  <td className="px-3 py-2 font-mono text-xs text-slate-200">{row.label}</td>
                  <td className="px-3 py-2 font-mono tabular-nums text-cyan-300">{row.ms}</td>
                  <td className="px-3 py-2">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                      <div
                        className="h-full rounded-full bg-cyan-500/70"
                        style={{ width: `${(row.ms / maxMs) * 100}%` }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Heavy on production — use sparingly. Disable by removing{" "}
          <code className="rounded bg-slate-800 px-1">ENABLE_DEBUG_TIMING_PAGE</code>.
        </p>
      </>
    );
  } else {
    timingBlock = (
      <section className="mt-10 rounded-xl border border-white/10 bg-slate-900/40 p-4">
        <h2 className="text-lg font-semibold text-slate-400">SSR timing</h2>
        <p className="mt-2 text-sm text-slate-500">
          Set <code className="rounded bg-slate-800 px-1">ENABLE_DEBUG_TIMING_PAGE=1</code> on Vercel to show
          the full timing table here (runs one home pipeline per page load). In dev it is always enabled.
        </p>
      </section>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100 md:px-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-2xl font-bold text-cyan-300">Debug · Monmeter</h1>
        <p className="mt-2 text-sm text-slate-400">
          Internal diagnostics. JSON below comes from the same API routes as{" "}
          <code className="rounded bg-slate-800 px-1">npm run debug:card</code>. On production, enable{" "}
          <code className="rounded bg-slate-800 px-1">ENABLE_DEBUG_CARDTRADER=1</code> for full payloads.
        </p>

        {cardHighlight.status === 404 && cardTrader.status === 404 ? (
          <div className="mt-6 rounded-xl border border-amber-500/40 bg-amber-950/40 px-4 py-3 text-sm text-amber-100/95">
            <p className="font-medium text-amber-200">Debug APIs disabled in production</p>
            <p className="mt-2 text-amber-100/85">
              Vercel → your project → <strong>Settings</strong> → <strong>Environment Variables</strong>: add{" "}
              <code className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-xs">ENABLE_DEBUG_CARDTRADER</code>{" "}
              = <code className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-xs">1</code> for{" "}
              <strong>Production</strong>, then redeploy. The sections below will return full JSON (Jina + seller +
              image) instead of HTTP 404.
            </p>
          </div>
        ) : null}

        <section className="mt-8">
          <h2 className="text-lg font-semibold text-amber-200/95">
            Card highlight image <span className="text-xs font-normal text-slate-500">(HTTP {cardHighlight.status})</span>
          </h2>
          <pre className="mt-2 max-h-[min(70vh,32rem)] overflow-auto rounded-xl border border-white/10 bg-slate-900/90 p-3 text-xs leading-relaxed text-slate-200">
            {prettyJson(cardHighlight.text)}
          </pre>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold text-amber-200/95">
            CardTrader + Jina <span className="text-xs font-normal text-slate-500">(HTTP {cardTrader.status})</span>
          </h2>
          <pre className="mt-2 max-h-[min(70vh,32rem)] overflow-auto rounded-xl border border-white/10 bg-slate-900/90 p-3 text-xs leading-relaxed text-slate-200">
            {prettyJson(cardTrader.text)}
          </pre>
        </section>

        {timingBlock}
      </div>
    </main>
  );
}
