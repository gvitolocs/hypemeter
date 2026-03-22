"use client";

import { useState } from "react";
import HypeBacktrackingChart from "@/components/HypeBacktrackingChart";
import { formatGrowthPct, formatUsd, growthPctColorClass } from "@/lib/marketFormat";
import type { MarketHighlightKey, MarketYearlyOverlay } from "@/lib/marketBacktrack";
import {
  BINANCE_BTC_USDT,
  COINGECKO_BTC,
  STOOQ_QUOTE_BTCUSD,
  STOOQ_QUOTE_SPX,
  YAHOO_QUOTE_7974T,
  YAHOO_QUOTE_BTC,
  YAHOO_QUOTE_NTDY,
  YAHOO_QUOTE_SP500,
} from "@/lib/yahooQuotes";

type YearScore = { year: number; score: number };
type YearEventSignal = { year: number; label: string; intensity: number };

type MarketSnap = {
  sp500: number | null;
  bitcoin: number | null;
  nintendo: number | null;
  nintendoPreviousClose: number | null;
  sp500GrowthPct: number | null;
  bitcoinGrowthPct: number | null;
  nintendoGrowthPct: number | null;
  updatedAt: string | null;
  nintendoSource: "adr" | "tokyo" | null;
  sp500Source: "yahoo-daily" | "yahoo" | "stooq" | "yahoo-chart" | "stooq-daily" | null;
  bitcoinSource:
    | "yahoo-daily"
    | "yahoo"
    | "stooq"
    | "stooq-daily"
    | "coingecko"
    | "yahoo-chart"
    | "binance"
    | null;
};

type Props = {
  history: YearScore[];
  events: YearEventSignal[];
  marketOverlay: MarketYearlyOverlay;
  market: MarketSnap;
  /** First 7 chars of VERCEL_GIT_COMMIT_SHA — confirms which build is live. */
  deploymentSha?: string | null;
};

const SP500_SOURCE_NOTE: Record<NonNullable<MarketSnap["sp500Source"]>, string> = {
  "yahoo-daily": "Yahoo 1d daily",
  yahoo: "Yahoo quote",
  stooq: "Stooq",
  "yahoo-chart": "Yahoo chart (1d)",
  "stooq-daily": "Stooq daily",
};

const BTC_SOURCE_NOTE: Record<NonNullable<MarketSnap["bitcoinSource"]>, string> = {
  "yahoo-daily": "Yahoo 1d daily",
  yahoo: "Yahoo quote",
  stooq: "Stooq",
  "stooq-daily": "Stooq daily",
  coingecko: "CoinGecko",
  "yahoo-chart": "Yahoo chart (1d)",
  binance: "Binance (1d)",
};

export default function BacktrackMarketSection({
  history,
  events,
  marketOverlay,
  market,
  deploymentSha,
}: Props) {
  const [highlight, setHighlight] = useState<MarketHighlightKey | null>(null);

  const sp500Href =
    market.sp500Source === "stooq-daily" || market.sp500Source === "stooq"
      ? STOOQ_QUOTE_SPX
      : YAHOO_QUOTE_SP500;
  const btcHref =
    market.bitcoinSource === "binance"
      ? BINANCE_BTC_USDT
      : market.bitcoinSource === "coingecko"
        ? COINGECKO_BTC
        : market.bitcoinSource === "stooq" || market.bitcoinSource === "stooq-daily"
          ? STOOQ_QUOTE_BTCUSD
          : YAHOO_QUOTE_BTC;

  return (
    <section className="rounded-3xl border border-white/10 bg-slate-900 p-6 hover-lift">
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <h3 className="min-w-0 shrink text-sm font-semibold uppercase tracking-[0.16em] text-slate-300">
          Hype Backtracking (2005 → now)
        </h3>
        <p className="shrink-0 text-xs text-slate-400">
          First year: {history[0]?.year} • Latest: {history[history.length - 1]?.year}
        </p>
      </div>
      <div className="mt-4 grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,16rem)] lg:items-stretch">
        <div className="min-w-0 self-stretch lg:min-h-0">
          <HypeBacktrackingChart
            history={history}
            events={events}
            marketOverlay={marketOverlay}
            highlightSeries={highlight}
          />
        </div>
        <aside className="relative w-full min-w-0 max-w-full overflow-hidden rounded-2xl border border-white/10 bg-slate-950 p-3 hover-lift sm:p-4 lg:w-auto lg:max-w-none lg:shrink-0">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Market Sidecar</p>

          <div className="mt-3 space-y-2">
            <a
              href={sp500Href}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex flex-col gap-1 rounded-xl border bg-slate-900/90 px-3 py-2.5 transition-colors hover:bg-slate-900 ${
                highlight === "sp500"
                  ? "border-emerald-400/70 ring-1 ring-emerald-400/30"
                  : "border-white/10 hover:border-emerald-400/45"
              }`}
              onMouseEnter={() => setHighlight("sp500")}
              onMouseLeave={() => setHighlight(null)}
            >
              <p className="text-[10px] uppercase tracking-[0.12em] text-slate-400">
                S&P 500
                {market.sp500Source ? (
                  <span className="font-normal normal-case text-slate-600">
                    {" "}
                    · {SP500_SOURCE_NOTE[market.sp500Source]}
                  </span>
                ) : null}
              </p>
              <p
                className={`text-xl font-bold tabular-nums leading-tight sm:text-2xl ${growthPctColorClass(market.sp500GrowthPct, "sp500")}`}
              >
                {formatGrowthPct(market.sp500GrowthPct)}
              </p>
              <p className="text-[11px] leading-snug text-slate-500">
                level: {formatUsd(market.sp500)}
              </p>
            </a>
            <a
              href={btcHref}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex flex-col gap-1 rounded-xl border bg-slate-900/90 px-3 py-2.5 transition-colors hover:bg-slate-900 ${
                highlight === "btc"
                  ? "border-amber-400/70 ring-1 ring-amber-400/30"
                  : "border-white/10 hover:border-amber-400/45"
              }`}
              onMouseEnter={() => setHighlight("btc")}
              onMouseLeave={() => setHighlight(null)}
            >
              <p className="text-[10px] uppercase tracking-[0.12em] text-slate-400">
                Bitcoin
                {market.bitcoinSource ? (
                  <span className="font-normal normal-case text-slate-600">
                    {" "}
                    · {BTC_SOURCE_NOTE[market.bitcoinSource]}
                  </span>
                ) : null}
              </p>
              <p
                className={`text-xl font-bold tabular-nums leading-tight sm:text-2xl ${growthPctColorClass(market.bitcoinGrowthPct, "btc")}`}
              >
                {formatGrowthPct(market.bitcoinGrowthPct)}
              </p>
              <p className="text-[11px] leading-snug text-slate-500">
                level: {formatUsd(market.bitcoin)}
              </p>
            </a>
            <a
              href={market.nintendoSource === "tokyo" ? YAHOO_QUOTE_7974T : YAHOO_QUOTE_NTDY}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex flex-col gap-1 rounded-xl border bg-slate-900/90 px-3 py-2.5 transition-colors hover:bg-slate-900 ${
                highlight === "nintendo"
                  ? "border-rose-400/70 ring-1 ring-rose-400/30"
                  : "border-white/10 hover:border-rose-400/45"
              }`}
              onMouseEnter={() => setHighlight("nintendo")}
              onMouseLeave={() => setHighlight(null)}
            >
              <p className="text-[10px] uppercase tracking-[0.12em] text-slate-400">
                {market.nintendoSource === "tokyo"
                  ? "Nintendo (Tokyo · USD est.)"
                  : "Nintendo (NTDOY)"}
              </p>
              <p
                className={`text-xl font-bold tabular-nums leading-tight sm:text-2xl ${growthPctColorClass(market.nintendoGrowthPct, "nintendo")}`}
              >
                {formatGrowthPct(market.nintendoGrowthPct)}
              </p>
              <p className="text-[11px] leading-snug text-slate-500">
                level: {formatUsd(market.nintendo)}
                {market.nintendoPreviousClose !== null ? (
                  <span className="text-slate-500">
                    {" "}
                    · prev {formatUsd(market.nintendoPreviousClose)}
                  </span>
                ) : null}
              </p>
            </a>
          </div>

          <p className="mt-2 text-[10px] leading-tight text-slate-600">
            {market.updatedAt ?? "—"} · {deploymentSha ?? "local"}
          </p>
        </aside>
      </div>
    </section>
  );
}
