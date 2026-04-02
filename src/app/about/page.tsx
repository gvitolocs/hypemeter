import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About",
  description:
    "About Monmeter: how the Pokemon hype score is built, where data comes from, and how caching/updates work.",
  alternates: {
    canonical: "/about",
  },
};

function SectionList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300">{title}</p>
      <ul className="mt-3 space-y-1.5 text-sm text-slate-200">
        {items.map((item) => (
          <li key={item}>* {item}</li>
        ))}
      </ul>
    </div>
  );
}

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-4 py-10 text-slate-100 md:px-8">
      <div className="mx-auto w-full max-w-5xl">
        <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-6 shadow-2xl shadow-cyan-950/30">
          <p className="text-sm font-semibold tracking-[0.08em] text-fuchsia-300">MONMETER</p>
          <p className="mt-2 text-xs text-slate-400">Pokemon Fear &amp; Greed Remix</p>
          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Sections</p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            {["Live Hype", "Market Sidecar", "Backtracking", "Daily Stats", "About"].map((item) => (
              <span key={item} className="rounded-full border border-white/10 bg-slate-800 px-2.5 py-1 text-slate-200">
                {item}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <SectionList
            title="Signals"
            items={["Search Interest", "Market Momentum", "Availability Pressure", "Release/Event Catalyst"]}
          />
          <SectionList title="Community Layer" items={["Community Sentiment", "Product Stress / Queue", "Signal Quality"]} />
          <SectionList title="Market Data" items={["S&P 500", "Bitcoin", "Nintendo", "Inflation (CPI YoY)"]} />
          <SectionList title="Platform" items={["15-minute server cache", "Manual reload", "UTC timestamps", "Daily Pokemon highlight"]} />
        </div>

        <section className="mt-6 rounded-3xl border border-white/10 bg-slate-900/70 p-6">
          <h1 className="text-2xl font-black tracking-tight md:text-3xl">About Monmeter</h1>
          <p className="mt-4 text-sm leading-7 text-slate-200">
            Monmeter is a live dashboard that tracks Pokemon hype using a blended score built from news activity,
            social/search momentum, and market context. The goal is to make the daily sentiment around Pokemon easier
            to read at a glance while keeping the underlying signals transparent.
          </p>
          <p className="mt-3 text-sm leading-7 text-slate-200">
            The score is updated from a server-side cached pipeline and is complemented by detailed components,
            historical backtracking, day-level calendar stats, and direct source links for verification.
          </p>

          <h2 className="mt-7 text-lg font-bold">Contact:</h2>
          <p className="mt-2 text-sm text-slate-200">Giuseppe Vitolo (gvitolocs)</p>
          <p className="mt-2 text-sm text-slate-200">
            LinkedIn:{" "}
            <a className="text-cyan-300 hover:underline" href="https://www.linkedin.com/in/gvitolocs/">
              https://www.linkedin.com/in/gvitolocs/
            </a>
          </p>
          <p className="mt-1 text-sm text-slate-200">
            X:{" "}
            <a className="text-cyan-300 hover:underline" href="https://x.com/gvitolocs">
              https://x.com/gvitolocs
            </a>
          </p>
        </section>

        <section className="mt-6 rounded-3xl border border-white/10 bg-slate-900/70 p-6">
          <h2 className="text-lg font-bold">Data Sources & Method</h2>
          <p className="mt-3 text-sm leading-7 text-slate-200">
            Monmeter aggregates public data from multiple providers and computes an internal composite score.
            External sources can be delayed, rate-limited, or temporarily unavailable, so fallback logic and caching
            are used to keep the page stable.
          </p>
          <p className="mt-4 text-sm text-slate-200">
            Main live and fallback sources include:
          </p>
          <ul className="mt-2 space-y-1.5 text-sm text-slate-200">
            <li>
              * Google News RSS, Reddit APIs, Pokemon official pages
            </li>
            <li>
              * Stooq, Yahoo Finance, CoinGecko, Binance
            </li>
            <li>* FRED and World Bank datasets (inflation overlays)</li>
            <li>* PokeAPI and CardTrader for Pokemon/card highlights</li>
          </ul>
          <p className="mt-3 text-sm leading-7 text-slate-200">
            This site is an independent project and is not affiliated with Nintendo, Game Freak, or The Pokemon
            Company.
          </p>
        </section>

        <section className="mt-6 rounded-3xl border border-white/10 bg-slate-900/70 p-6">
          <h2 className="text-lg font-bold">Privacy & Caching</h2>
          <p className="mt-3 text-sm text-slate-200">
            Monmeter does not require user accounts and does not ask for personal profile data.
          </p>
          <ul className="mt-3 space-y-2 text-sm leading-7 text-slate-200">
            <li>
              * Browser-side storage is used for performance (localStorage and lightweight cookies for cache hints).
            </li>
            <li>
              * Server-side caching refreshes data on a timed cycle and supports manual refresh via the reload control.
            </li>
            <li>
              * Third-party links and APIs have their own privacy/security policies.
            </li>
            <li>* This project is provided as-is, without guarantees of uninterrupted upstream availability.</li>
          </ul>
          <p className="mt-4 text-sm text-slate-400">Last updated: {new Date().toISOString().slice(0, 10)} (UTC)</p>
        </section>

        <div className="mt-6">
          <Link href="/" className="text-sm text-cyan-300 hover:underline">
            Back to homepage
          </Link>
        </div>
      </div>
    </main>
  );
}
