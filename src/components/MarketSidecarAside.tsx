"use client";

import { useEffect, useMemo, useState } from "react";
import type { MarketHighlightKey, MarketYearlyOverlay } from "@/lib/marketBacktrack";
import { formatGrowthPct, formatSignedChange, formatUsd, growthPctColorClass } from "@/lib/marketFormat";
import {
  BINANCE_BTC_USDT,
  COINGECKO_BTC,
  STOOQ_QUOTE_7974_JP,
  STOOQ_QUOTE_BTCUSD,
  STOOQ_QUOTE_SPX,
  FRED_CPIAUCSL_SERIES,
} from "@/lib/yahooQuotes";

type YearScore = { year: number; score: number };

type MarketSnap = {
  sp500: number | null;
  bitcoin: number | null;
  nintendo: number | null;
  nintendoPreviousClose: number | null;
  nintendoChangeAbs: number | null;
  nintendoChangeCurrency: "JPY" | "USD" | null;
  sp500GrowthPct: number | null;
  bitcoinGrowthPct: number | null;
  nintendoGrowthPct: number | null;
  updatedAt: string | null;
  nintendoSource: "adr" | "tokyo" | null;
  sp500Source: "stooq" | "stooq-daily" | "yahoo" | null;
  bitcoinSource: "stooq" | "stooq-daily" | "coingecko" | "binance" | null;
};

const SP500_SOURCE_NOTE: Record<NonNullable<MarketSnap["sp500Source"]>, string> = {
  stooq: "Stooq",
  "stooq-daily": "Stooq daily",
  yahoo: "Yahoo",
};

const BTC_SOURCE_NOTE: Record<NonNullable<MarketSnap["bitcoinSource"]>, string> = {
  stooq: "Stooq",
  "stooq-daily": "Stooq daily",
  coingecko: "CoinGecko",
  binance: "Binance (1d)",
};

const MARKET_CLIENT_REFRESH_MS = 10 * 60 * 1000;

function hasMeaningfulMarketSnapshot(snapshot: MarketSnap): boolean {
  return (
    snapshot.sp500 !== null ||
    snapshot.bitcoin !== null ||
    snapshot.nintendo !== null ||
    snapshot.sp500GrowthPct !== null ||
    snapshot.bitcoinGrowthPct !== null ||
    snapshot.nintendoGrowthPct !== null
  );
}

type Props = {
  initialMarket: MarketSnap;
  marketOverlay: MarketYearlyOverlay;
  history: YearScore[];
  deploymentSha?: string | null;
  highlight: MarketHighlightKey | null;
  setHighlight: (k: MarketHighlightKey | null) => void;
};

export function MarketSidecarAside({
  initialMarket,
  marketOverlay,
  history,
  deploymentSha,
  highlight,
  setHighlight,
}: Props) {
  const [market, setMarket] = useState(initialMarket);

  useEffect(() => {
    let ignore = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let controller: AbortController | null = null;

    async function refreshMarket() {
      controller?.abort();
      controller = new AbortController();
      try {
        const response = await fetch(`/api/market-snapshot?client=${Date.now()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) return;
        const next = (await response.json()) as MarketSnap;
        if (!ignore && hasMeaningfulMarketSnapshot(next)) {
          setMarket(next);
        }
      } catch {
        /* keep server-rendered snapshot */
      } finally {
        if (!ignore) {
          timeoutId = setTimeout(refreshMarket, MARKET_CLIENT_REFRESH_MS);
        }
      }
    }

    void refreshMarket();

    return () => {
      ignore = true;
      controller?.abort();
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  const sp500Href = STOOQ_QUOTE_SPX;
  const btcHref =
    market.bitcoinSource === "binance"
      ? BINANCE_BTC_USDT
      : market.bitcoinSource === "coingecko"
        ? COINGECKO_BTC
        : STOOQ_QUOTE_BTCUSD;

  const inflationSidecar = useMemo(() => {
    const y = marketOverlay.inflationYoY;
    if (!y.length) return { hasData: false as const, pct: null as number | null, year: null as number | null };
    const spread = Math.max(...y) - Math.min(...y);
    if (spread < 1e-6) return { hasData: false as const, pct: null, year: null };
    const pct = y[y.length - 1] ?? null;
    const lastIdx = y.length - 1;
    const year =
      lastIdx >= 0 && history[lastIdx]?.year !== undefined
        ? history[lastIdx]!.year
        : (history[history.length - 1]?.year ?? null);
    return { hasData: true as const, pct, year };
  }, [marketOverlay.inflationYoY, history]);

  const nintendoChangeDisplay = formatSignedChange(market.nintendoChangeAbs, market.nintendoChangeCurrency);

  return (
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
          <p className="text-[11px] leading-snug text-slate-500">level: {formatUsd(market.sp500)}</p>
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
          <p className="text-[11px] leading-snug text-slate-500">level: {formatUsd(market.bitcoin)}</p>
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
            {market.nintendoSource === "tokyo" ? "Nintendo (Tokyo)" : "Nintendo (NTDOY)"}
          </p>
          <p
            className={`text-xl font-bold tabular-nums leading-tight sm:text-2xl ${growthPctColorClass(market.nintendoGrowthPct, "nintendo")}`}
          >
            {formatGrowthPct(market.nintendoGrowthPct)}
          </p>
          <p className="text-[11px] leading-snug text-slate-500">
            {nintendoChangeDisplay !== "N/A" ? `${nintendoChangeDisplay} · ` : ""}
            level: {formatUsd(market.nintendo)}
            {market.nintendoSource === "tokyo" ? " (USD est.)" : ""}
            {market.nintendoPreviousClose !== null ? (
              <span className="text-slate-500"> · prev {formatUsd(market.nintendoPreviousClose)}</span>
            ) : null}
          </p>
        </a>
        <a
          href={FRED_CPIAUCSL_SERIES}
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
            <span className="font-normal normal-case text-slate-600">· FRED CPIAUCSL YoY</span>
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
              : "CPI YoY from monthly index (overlay)"}
          </p>
        </a>
      </div>

      <p className="mt-2 text-[10px] leading-tight text-slate-600">
        {market.updatedAt ?? "—"} · {deploymentSha ?? "local"}
      </p>
    </aside>
  );
}
