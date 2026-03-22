"use client";

import { useMemo, useState } from "react";
import HypeBacktrackingChart from "@/components/HypeBacktrackingChart";
import { useMatchMedia } from "@/hooks/useMatchMedia";
import { sliceBacktrackView } from "@/lib/sliceBacktrackView";
import { formatGrowthPct, formatUsd, growthPctColorClass } from "@/lib/marketFormat";
import type { MarketHighlightKey, MarketYearlyOverlay } from "@/lib/marketBacktrack";
import {
  BINANCE_BTC_USDT,
  COINGECKO_BTC,
  STOOQ_QUOTE_7974_JP,
  STOOQ_QUOTE_BTCUSD,
  STOOQ_QUOTE_SPX,
  WORLD_BANK_US_CPI_INFLATION,
  YAHOO_QUOTE_BTC,
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

/** Below `md` the chart uses the last N years so the x-axis isn’t cramped on phones. */
const MOBILE_CHART_LAST_N_YEARS = 3;
const MOBILE_CHART_MQ = "(max-width: 767px)";

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
  const isMobileChart = useMatchMedia(MOBILE_CHART_MQ);
  const { history: chartHistory, marketOverlay: chartOverlay, events: chartEvents } = useMemo(
    () =>
      isMobileChart
        ? sliceBacktrackView(history, marketOverlay, events, MOBILE_CHART_LAST_N_YEARS)
        : { history, marketOverlay, events },
    [isMobileChart, history, marketOverlay, events],
  );

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

  const inflationSidecar = useMemo(() => {
    const y = marketOverlay.inflationYoY;
    if (!y.length) return { hasData: false as const, pct: null as number | null, year: null as number | null };
    const spread = Math.max(...y) - Math.min(...y);
    if (spread < 1e-6) return { hasData: false as const, pct: null, year: null };
    const pct = y[y.length - 1] ?? null;
    const year = history[history.length - 1]?.year ?? null;
    return { hasData: true as const, pct, year };
  }, [marketOverlay.inflationYoY, history]);

  return (
    <section className="rounded-3xl border border-white/10 bg-slate-900 p-6 hover-lift">
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <h3 className="min-w-0 shrink text-sm font-semibold uppercase tracking-[0.16em] text-slate-300">
          Hype Backtracking (2005 → now)
        </h3>
        <p className="shrink-0 text-right text-xs leading-snug text-slate-400 md:text-left">
          {isMobileChart && history.length > MOBILE_CHART_LAST_N_YEARS ? (
            <>
              {chartHistory[0]?.year}–{chartHistory[chartHistory.length - 1]?.year}
              <span className="text-slate-500"> · last {MOBILE_CHART_LAST_N_YEARS} yrs</span>
              <span className="mt-0.5 block text-[10px] text-slate-600 md:hidden">
                Full {history[0]?.year}–{history[history.length - 1]?.year} on wider screens
              </span>
            </>
          ) : (
            <>
              First year: {history[0]?.year} • Latest: {history[history.length - 1]?.year}
            </>
          )}
        </p>
      </div>
      <div className="mt-4 grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,16rem)] lg:items-stretch">
        <div className="min-w-0 self-stretch lg:min-h-0">
          <HypeBacktrackingChart
            history={chartHistory}
            events={chartEvents}
            marketOverlay={chartOverlay}
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
              href={STOOQ_QUOTE_7974_JP}
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
            <a
              href={WORLD_BANK_US_CPI_INFLATION}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex flex-col gap-1 rounded-xl border bg-slate-900/90 px-3 py-2.5 transition-colors hover:bg-slate-900 ${
                highlight === "inflation"
                  ? "border-indigo-400/70 ring-1 ring-indigo-400/30"
                  : "border-white/10 hover:border-indigo-400/45"
              }`}
              onMouseEnter={() => setHighlight("inflation")}
              onMouseLeave={() => setHighlight(null)}
            >
              <p className="text-[10px] uppercase tracking-[0.12em] text-slate-400">
                US CPI inflation{" "}
                <span className="font-normal normal-case text-slate-600">· World Bank annual</span>
              </p>
              <p
                className={`text-xl font-bold tabular-nums leading-tight sm:text-2xl ${growthPctColorClass(
                  inflationSidecar.hasData ? inflationSidecar.pct : null,
                  "inflation",
                )}`}
              >
                {inflationSidecar.hasData && inflationSidecar.pct !== null
                  ? formatGrowthPct(inflationSidecar.pct)
                  : "N/A"}
              </p>
              <p className="text-[11px] leading-snug text-slate-500">
                {inflationSidecar.hasData && inflationSidecar.year !== null
                  ? `Latest in chart: ${inflationSidecar.year} (YoY %)`
                  : "Annual CPI series (overlay)"}
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
