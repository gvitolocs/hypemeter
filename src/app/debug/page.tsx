import { runWithTimingCollector } from "@/lib/serverTiming";
import { loadHomePageDataUncached } from "@/app/page";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

/** Must read `ENABLE_DEBUG_TIMING_PAGE` at request time on Vercel (not at build). */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "SSR timing (debug)",
  robots: { index: false, follow: false },
};

function isDebugTimingEnabled(): boolean {
  if (process.env.NODE_ENV === "development") return true;
  return process.env.ENABLE_DEBUG_TIMING_PAGE === "1";
}

export default async function DebugTimingPage() {
  if (!isDebugTimingEnabled()) {
    notFound();
  }

  const { spans, totalMs } = await runWithTimingCollector(() => loadHomePageDataUncached());
  const maxMs = Math.max(1, ...spans.map((s) => s.ms));

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100 md:px-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-xl font-bold text-cyan-300">SSR timing (same pipeline as home)</h1>
        <p className="mt-2 text-sm text-slate-400">
          Wall time for this request: <span className="font-mono text-slate-200">{totalMs}ms</span>. Rows come
          from <code className="rounded bg-slate-800 px-1">timedAsync</code> /{" "}
          <code className="rounded bg-slate-800 px-1">logTimingTotal</code> (nested libs included).
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Disabled in production unless you set{" "}
          <code className="rounded bg-slate-800 px-1">ENABLE_DEBUG_TIMING_PAGE=1</code> on Vercel. Dev always
          works.
        </p>

        <div className="mt-6 overflow-x-auto rounded-xl border border-white/10">
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

        <p className="mt-6 text-xs text-slate-500">
          Opening this page runs one full <code className="rounded bg-slate-800 px-1">loadHomePageDataUncached()</code>{" "}
          (same as <code className="rounded bg-slate-800 px-1">/</code>). Use sparingly on production.
        </p>
      </div>
    </main>
  );
}
