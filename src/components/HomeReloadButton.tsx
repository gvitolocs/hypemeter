"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function HomeReloadButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onReload = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/revalidate-home", {
        method: "POST",
        cache: "no-store",
      });
      if (!res.ok) {
        throw new Error("reload_failed");
      }
      // First refresh immediately, then once more to pick the new payload if a stale response raced.
      router.refresh();
      window.setTimeout(() => {
        router.refresh();
      }, 1200);
    } catch {
      setError("Reload failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onReload}
        disabled={loading}
        className="inline-flex items-center gap-1 rounded-md border border-cyan-400/35 bg-slate-900/70 px-2 py-1 text-[11px] font-medium text-cyan-200 transition-colors hover:bg-slate-800/80 disabled:cursor-not-allowed disabled:opacity-70"
        aria-label="Reload all data"
        title="Force full refetch"
      >
        {loading ? (
          <span className="inline-block h-3 w-3 animate-spin rounded-full border border-cyan-300 border-t-transparent" />
        ) : null}
        {loading ? "Reloading..." : "Reload"}
      </button>
      {error ? <span className="text-[10px] text-rose-300">{error}</span> : null}
    </div>
  );
}
