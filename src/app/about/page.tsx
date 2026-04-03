import type { Metadata } from "next";
import Link from "next/link";
import profilePhoto from "../../../106628254.jpeg";

export const metadata: Metadata = {
  title: "About",
  description:
    "About Monmeter: visual story, Pokemon gallery, creator profile, and how the hype engine works.",
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
  const pokemonGallery = [
    {
      name: "Flareon",
      image: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/136.png",
    },
    {
      name: "Eevee",
      image: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/133.png",
    },
    {
      name: "Espeon",
      image: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/196.png",
    },
    {
      name: "Pikachu",
      image: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/25.png",
    },
  ];

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-4 py-10 text-slate-100 md:px-8">
      <div className="mx-auto w-full max-w-5xl">
        <div className="mb-4">
          <Link
            href="/"
            className="inline-flex items-center rounded-xl border border-cyan-400/35 bg-slate-900/80 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-cyan-300 transition hover:border-cyan-300/70 hover:bg-slate-800/80"
          >
            Back to homepage
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-[1.3fr_1fr]">
          <section className="rounded-3xl border border-white/10 bg-slate-900/70 p-6 shadow-2xl shadow-cyan-950/30">
            <p className="text-sm font-semibold tracking-[0.08em] text-fuchsia-300">MONMETER</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight md:text-4xl">Pokemon Hype, made readable.</h1>
            <p className="mt-3 text-sm leading-7 text-slate-200">
              Monmeter tracks daily Pokemon momentum with a signal mix built from news activity, social/search pulse,
              and market context. Fast refreshes, clear score components, and visible source logic.
            </p>
            <div className="mt-5 flex flex-wrap gap-2 text-xs">
              {["Live Hype", "Market Sidecar", "Backtracking", "Daily Stats", "About"].map((item) => (
                <span key={item} className="rounded-full border border-white/10 bg-slate-800 px-2.5 py-1 text-slate-200">
                  {item}
                </span>
              ))}
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {pokemonGallery.map((pokemon) => (
                <div
                  key={pokemon.name}
                  className="rounded-2xl border border-white/10 bg-slate-800/70 p-2 text-center"
                >
                  <img
                    src={pokemon.image}
                    alt={pokemon.name}
                    loading="lazy"
                    className="mx-auto h-20 w-20 object-contain sm:h-24 sm:w-24"
                  />
                  <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-300">
                    {pokemon.name}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-slate-900/70 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300">Creator</p>
            <div className="mt-3 overflow-hidden rounded-2xl border border-white/10 bg-slate-800/70 p-3">
              <a
                href="https://www.linkedin.com/in/gvitolocs/"
                target="_blank"
                rel="noreferrer"
                className="mx-auto block w-fit rounded-xl border border-white/10 bg-slate-700/40 p-1 transition hover:border-cyan-300/60"
                title="Open LinkedIn profile"
              >
                <img
                  src={profilePhoto.src}
                  alt="Giuseppe Vitolo"
                  className="h-28 w-28 rounded-lg object-contain sm:h-32 sm:w-32"
                />
              </a>
              <p className="mt-3 text-base font-bold">Giuseppe Vitolo</p>
              <p className="text-xs text-slate-400">@gvitolocs</p>
            </div>
            <div className="mt-4 space-y-2 text-sm">
              <a
                className="block rounded-xl border border-white/10 bg-slate-800/80 px-3 py-2 text-cyan-300 hover:bg-slate-700/80"
                href="mailto:gvitolocs@gmail.com"
              >
                Email: gvitolocs@gmail.com
              </a>
              <a
                className="block rounded-xl border border-white/10 bg-slate-800/80 px-3 py-2 text-cyan-300 hover:bg-slate-700/80"
                href="https://www.linkedin.com/in/gvitolocs/"
              >
                LinkedIn
              </a>
              <a
                className="block rounded-xl border border-white/10 bg-slate-800/80 px-3 py-2 text-cyan-300 hover:bg-slate-700/80"
                href="https://x.com/gvitolocs"
              >
                X / Twitter
              </a>
              <a
                className="block rounded-xl border border-white/10 bg-slate-800/80 px-3 py-2 text-cyan-300 hover:bg-slate-700/80"
                href="https://github.com/gvitolocs"
              >
                GitHub
              </a>
            </div>
          </section>
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
          <h2 className="text-xl font-black tracking-tight md:text-2xl">How the score works</h2>
          <p className="mt-3 text-sm leading-7 text-slate-200">
            The main hype score is a weighted blend. Each component updates independently with fallback logic to avoid
            empty states when an upstream source is slow.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-slate-800/70 p-3">
              <p className="text-xs uppercase tracking-[0.12em] text-fuchsia-300">Input</p>
              <p className="mt-1 text-sm text-slate-200">News, social pulse, search deltas, and market snapshots.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-800/70 p-3">
              <p className="text-xs uppercase tracking-[0.12em] text-fuchsia-300">Engine</p>
              <p className="mt-1 text-sm text-slate-200">Normalized signals, bounded scoring, anti-flat adjustments.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-800/70 p-3">
              <p className="text-xs uppercase tracking-[0.12em] text-fuchsia-300">Output</p>
              <p className="mt-1 text-sm text-slate-200">Gauge, component cards, historical backtracking, daily stats.</p>
            </div>
          </div>
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

      </div>
    </main>
  );
}
