"use client";

import { useMemo, useState } from "react";

type NarrativeCardItem = {
  id: "momentum" | "breadth" | "conviction";
  title: string;
  label: string;
  fillPct: number;
  explanation: string;
};

type Props = {
  items: NarrativeCardItem[];
};

const TERM_INFO_URL: Record<NarrativeCardItem["id"], string> = {
  momentum: "https://en.wikipedia.org/wiki/Momentum_(finance)",
  breadth: "https://en.wikipedia.org/wiki/Breadth_of_market",
  conviction: "https://naturalinvestments.com/the-meaning-of-conviction/",
};

export function NarrativeFlipCards({ items }: Props) {
  const [flippedId, setFlippedId] = useState<NarrativeCardItem["id"] | null>(null);
  const cardItems = useMemo(() => items.slice(0, 3), [items]);

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {cardItems.map((item) => {
        const isFlipped = flippedId === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => setFlippedId((prev) => (prev === item.id ? null : item.id))}
            className="narrative-flip-card narrative-flip-button relative h-[9.4rem] text-left sm:h-[10.4rem]"
            aria-pressed={isFlipped}
            aria-label={`${item.title} card. Click to flip explanation.`}
          >
            <div className={`narrative-flip-inner ${isFlipped ? "is-flipped" : ""}`}>
              <div className="narrative-flip-face narrative-flip-front relative overflow-hidden rounded-lg border border-white/15 bg-slate-800/95 px-3 py-3">
                <div className="narrative-fill-body pointer-events-none absolute inset-x-0 bottom-0" style={{ height: `${item.fillPct}%` }} />
                <div className="pointer-events-none absolute inset-x-0 top-0 h-11 bg-slate-950/35" />
                <div className="relative z-10 flex h-full flex-col justify-between gap-1">
                  {TERM_INFO_URL[item.id] ? (
                    <a
                      href={TERM_INFO_URL[item.id]}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(event) => event.stopPropagation()}
                      className="w-fit text-[10px] uppercase tracking-[0.13em] text-slate-100 underline decoration-cyan-300/65 underline-offset-2 transition-colors hover:text-cyan-200"
                      title={`Open external definition of ${item.title}`}
                    >
                      {item.title}
                    </a>
                  ) : (
                    <p className="text-[10px] uppercase tracking-[0.13em] text-slate-100">{item.title}</p>
                  )}
                  <p className="pr-1 text-base font-bold leading-tight text-white sm:text-lg">{item.label}</p>
                </div>
              </div>

              <div className="narrative-flip-face narrative-flip-back rounded-lg border border-cyan-400/25 bg-slate-900/96 px-3 py-3">
                <div className="flex h-full flex-col">
                  <p className="text-[10px] uppercase tracking-[0.13em] text-cyan-300">{item.title} detail</p>
                  <p className="narrative-flip-copy mt-2 text-[12px] leading-relaxed text-slate-200">{item.explanation}</p>
                </div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
