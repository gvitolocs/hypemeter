"use client";

import { useEffect, useMemo, useState } from "react";
import { CardTraderHighlightImage } from "@/components/CardTraderHighlightImage";

type CardHighlightData = {
  name: string;
  imageUrl: string;
  cardUrl: string;
  fromPrice: string;
};

type Props = {
  cardTraderBestSeller: CardHighlightData | null;
};

const STORAGE_KEY = "hypemeter_last_card_highlight_v1";

function isCardHighlightData(value: unknown): value is CardHighlightData {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<CardHighlightData>;
  return (
    typeof row.name === "string" &&
    row.name.trim().length > 0 &&
    typeof row.imageUrl === "string" &&
    row.imageUrl.trim().length > 0 &&
    typeof row.cardUrl === "string" &&
    row.cardUrl.trim().length > 0 &&
    typeof row.fromPrice === "string"
  );
}

export function CardHighlightPanel({ cardTraderBestSeller }: Props) {
  const [cachedCard, setCachedCard] = useState<CardHighlightData | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (isCardHighlightData(cardTraderBestSeller)) {
      setCachedCard(cardTraderBestSeller);
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cardTraderBestSeller));
      } catch {
        /* ignore storage quota / privacy mode issues */
      }
      return;
    }

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (isCardHighlightData(parsed)) setCachedCard(parsed);
    } catch {
      /* ignore malformed storage */
    }
  }, [cardTraderBestSeller]);

  const shownCard = useMemo(() => cardTraderBestSeller ?? cachedCard, [cardTraderBestSeller, cachedCard]);
  const isCachedFallback = !cardTraderBestSeller && !!cachedCard;

  if (shownCard) {
    return (
      <div className="flex h-full w-full max-w-full shrink-0 flex-col rounded-2xl border border-amber-400/30 bg-slate-950/80 p-3 lg:w-56">
        <p className="text-[10px] uppercase tracking-[0.14em] text-amber-300">Card Highlight</p>
        <a
          href={shownCard.cardUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-2 flex min-h-0 flex-1 items-start gap-2.5 rounded-xl transition-colors hover:bg-slate-900/60"
          title={isCachedFallback ? "Open cached fallback listing on CardTrader" : "Open this listing on CardTrader"}
        >
          <CardTraderHighlightImage
            imageUrl={shownCard.imageUrl}
            alt=""
            width={70}
            height={98}
            className="h-16 w-auto shrink-0 rounded-md bg-slate-900 object-contain object-top shadow-inner"
          />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold leading-snug text-white line-clamp-3">{shownCard.name}</p>
            {shownCard.fromPrice ? (
              <p className="mt-1 text-[11px] font-medium text-amber-200/95">from ${shownCard.fromPrice}</p>
            ) : null}
            {isCachedFallback ? (
              <p className="mt-1 text-[10px] text-amber-300/80">cached fallback (CardTrader maintenance)</p>
            ) : null}
          </div>
        </a>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full max-w-full shrink-0 flex-col rounded-2xl border border-amber-400/30 bg-slate-950/80 p-3 lg:w-56">
      <p className="text-[10px] uppercase tracking-[0.14em] text-amber-300">Card Highlight</p>
      <div className="mt-2 flex min-h-0 flex-1 items-center rounded-xl border border-amber-400/20 bg-slate-900/60 px-2.5 py-2">
        <p className="text-xs font-medium leading-snug text-amber-100/95">CardTrader under maintenance</p>
      </div>
    </div>
  );
}
