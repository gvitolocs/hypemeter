/** Build official Pokedex URL from a species display name (matches homepage slug rules). */
export function pokemonPokedexUrl(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug ? `https://www.pokemon.com/us/pokedex/${slug}` : "https://www.pokemon.com/us/pokedex/";
}
