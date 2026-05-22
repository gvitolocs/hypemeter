"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

const AD_CLIENT = "ca-pub-4839405057855605";
const FALLBACK_AD_SLOT = process.env.NEXT_PUBLIC_ADSENSE_DISPLAY_SLOT?.trim() ?? "";

type Props = {
  label: string;
  className?: string;
  slot?: string;
};

export function AdSenseSlot({ label, className = "", slot }: Props) {
  const adSlot = slot?.trim() || FALLBACK_AD_SLOT;

  useEffect(() => {
    if (!adSlot) return;
    try {
      window.adsbygoogle = window.adsbygoogle || [];
      window.adsbygoogle.push({});
    } catch {
      /* Ad blockers or pre-approval states can block AdSense. */
    }
  }, [adSlot]);

  if (!adSlot) {
    if (process.env.NODE_ENV === "production") return null;

    return (
      <aside
        aria-label={label}
        className={`rounded-3xl border border-white/10 bg-slate-900/70 p-3 text-center shadow-lg shadow-black/20 ${className}`}
      >
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Advertisement</p>
        <div className="flex min-h-28 items-center justify-center rounded-2xl border border-dashed border-white/10 bg-slate-950/50 px-4 text-xs text-slate-500">
          Configure NEXT_PUBLIC_ADSENSE_DISPLAY_SLOT to enable this placement.
        </div>
      </aside>
    );
  }

  return (
    <aside
      aria-label={label}
      className={`rounded-3xl border border-white/10 bg-slate-900/70 p-3 text-center shadow-lg shadow-black/20 ${className}`}
    >
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Advertisement</p>
      <ins
        key={adSlot}
        className="adsbygoogle block min-h-28 text-center"
        style={{ display: "block", textAlign: "center" }}
        data-ad-client={AD_CLIENT}
        data-ad-slot={adSlot}
        data-ad-layout="in-article"
        data-ad-format="fluid"
      />
    </aside>
  );
}
