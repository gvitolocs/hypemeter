type PokemonSpotlightCopyPokemon = {
  name?: string | null;
  types?: Array<string | null | undefined> | null;
};

type PokemonSpotlightCopyArticle = {
  title?: string | null;
  summary?: string | null;
};

function cleanText(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

export function pokemonSpotlightCopy(args: {
  pokemon?: PokemonSpotlightCopyPokemon | null;
  article?: PokemonSpotlightCopyArticle | null;
}): string {
  const articleTitle = cleanText(args.article?.title);
  if (articleTitle) return articleTitle;

  const articleSummary = cleanText(args.article?.summary);
  if (articleSummary) return articleSummary;

  const pokemonName = cleanText(args.pokemon?.name);
  if (pokemonName) {
    const types = (args.pokemon?.types ?? [])
      .map((type) => cleanText(type))
      .filter(Boolean)
      .join("/");
    const typeLabel = types ? ` (${types})` : "";
    return `${pokemonName} is today's Pokemon spotlight${typeLabel}, selected by the daily rotation while same-Pokemon headlines are quiet.`;
  }

  return "Daily spotlight is warming up. Try Reload in a few seconds.";
}
