"use client";

import { useEffect, useState } from "react";
import { homeRefreshPeriodEndMs } from "@/lib/homeRefreshPeriodAnchor";

function formatMmSs(msRemaining: number): string {
  const seconds = Math.max(0, Math.ceil(msRemaining / 1000));
  const mm = Math.floor(seconds / 60);
  const ss = seconds % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

/** Countdown to the next wall-clock-aligned refresh boundary (stable across page reloads). */
export function HomeNextUpdateCountdown({ ttlSec }: { ttlSec: number }) {
  const [remainingMs, setRemainingMs] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => {
      const end = homeRefreshPeriodEndMs(Date.now(), ttlSec);
      setRemainingMs(Math.max(0, end - Date.now()));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [ttlSec]);

  return (
    <p className="whitespace-nowrap text-[11px] text-cyan-200/85 underline decoration-cyan-400/35 underline-offset-2">
      Next update in {remainingMs === null ? "--:--" : formatMmSs(remainingMs)}
    </p>
  );
}
