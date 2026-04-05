/**
 * Loads daily Pokemon spotlight outside the main homepage module graph edge when possible.
 * Dynamic import avoids static cycles between `page.tsx` and spotlight UI.
 */
export async function loadPokemonSpotlightBundleForSuspense() {
  const { getPokemonSpotlightBundleForHome } = await import("@/app/page");
  return getPokemonSpotlightBundleForHome();
}
