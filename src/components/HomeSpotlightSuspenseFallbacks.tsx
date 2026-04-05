/** Skeletons for header Card / Pokemon slots while async server components resolve. */
export function HomeCardHighlightFallback() {
  return (
    <div className="flex h-full w-full max-w-full shrink-0 animate-pulse flex-col rounded-2xl border border-amber-400/20 bg-slate-950/80 p-4 lg:w-64">
      <p className="text-[10px] uppercase tracking-[0.14em] text-amber-300/80">Card Highlight</p>
      <div className="mt-2 flex min-h-0 flex-1 items-start gap-2.5 rounded-xl bg-slate-900/50 px-2 py-2">
        <div className="h-24 w-[4.5rem] shrink-0 rounded-md bg-slate-800/80" />
        <div className="min-w-0 flex-1 space-y-2 pt-1">
          <div className="h-3.5 w-[85%] rounded bg-slate-800/80" />
          <div className="h-3 w-[45%] rounded bg-slate-800/60" />
        </div>
      </div>
    </div>
  );
}

export function HomePokemonHighlightFallback() {
  return (
    <div className="flex h-full w-full max-w-full animate-pulse flex-col rounded-2xl border border-cyan-400/20 bg-slate-950/80 p-3 lg:w-56">
      <p className="text-[10px] uppercase tracking-[0.14em] text-cyan-300/80">Pokemon Highlight</p>
      <div className="mt-2 flex min-h-0 flex-1 flex-col justify-between gap-2">
        <div className="flex min-h-0 items-start gap-3">
          <div className="h-[72px] w-[72px] shrink-0 rounded-lg bg-slate-800/80" />
          <div className="min-w-0 flex-1 space-y-2 pt-1">
            <div className="h-4 w-[70%] rounded bg-slate-800/80" />
            <div className="h-3 w-[40%] rounded bg-slate-800/60" />
          </div>
        </div>
        <div className="h-8 w-full rounded bg-slate-800/50" />
      </div>
    </div>
  );
}
