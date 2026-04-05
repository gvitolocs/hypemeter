import Image from "next/image";
import { loadPokemonSpotlightBundleForSuspense } from "@/lib/homeSpotlightServer";
import { pokemonPokedexUrl } from "@/lib/pokemonPokedexUrl";

/** Daily Pokemon spotlight: same once-per-day resolver as the home pipeline, non-blocking for TTFB. */
export async function HomePokemonHighlightAsync() {
  const { pokemon: pokemonOfDay, article: pokemonOfDayArticle } = await loadPokemonSpotlightBundleForSuspense();

  const pokemonHighlightHref =
    pokemonOfDayArticle?.link ?? (pokemonOfDay ? pokemonPokedexUrl(pokemonOfDay.name) : "#");
  const pokemonHighlightTitle = pokemonOfDayArticle
    ? `Open spotlight article from ${pokemonOfDayArticle.source}`
    : pokemonOfDay
      ? `Open ${pokemonOfDay.name} on Pokemon Pokedex`
      : "Pokemon highlight";

  return (
    <a
      href={pokemonHighlightHref}
      target="_blank"
      rel="noreferrer"
      className="flex h-full w-full max-w-full flex-col rounded-2xl border border-cyan-400/25 bg-slate-950/80 p-3 lg:w-56 hover:border-cyan-300/50"
      title={pokemonHighlightTitle}
    >
      <p className="text-[10px] uppercase tracking-[0.14em] text-cyan-300">Pokemon Highlight</p>
      <div className="mt-2 flex min-h-0 flex-1 flex-col justify-between gap-2">
        <div className="flex min-h-0 items-start gap-3">
          {pokemonOfDay?.image ? (
            <Image
              src={`/api/pokemon-highlight-image?url=${encodeURIComponent(pokemonOfDay.image)}`}
              alt={pokemonOfDay.name}
              width={72}
              height={72}
              className="h-[72px] w-[72px] shrink-0 rounded-lg bg-slate-900 object-contain p-1.5"
              unoptimized
            />
          ) : (
            <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-lg bg-slate-900 text-xs text-slate-400">
              N/A
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-bold leading-snug text-white">
              {pokemonOfDay
                ? `#${pokemonOfDay.id} ${pokemonOfDay.name}`
                : "Daily spotlight unavailable"}
            </p>
            {pokemonOfDay?.types?.length ? (
              <div className="mt-1 flex flex-wrap gap-1">
                {pokemonOfDay.types.map((type) => (
                  <span
                    key={type}
                    className="rounded-full border border-fuchsia-400/35 bg-fuchsia-500/10 px-2 py-0.5 text-[10px] text-fuchsia-200"
                  >
                    {type}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        <p className="line-clamp-3 text-[11px] leading-snug text-slate-400">
          {pokemonOfDayArticle?.title ??
            pokemonOfDayArticle?.summary ??
            "Daily spotlight is refreshing from cache. Try Reload in a few seconds."}
        </p>
      </div>
    </a>
  );
}
