import { CardHighlightPanel } from "@/components/CardHighlightPanel";
import { fetchCardTraderPokemonBestSeller } from "@/lib/fetchCardTraderBestSeller";

/** Card-of-day: resolved after shell streams (daily cache key + home TTL in fetch layer). */
export async function HomeCardHighlightAsync() {
  const cardTraderBestSeller = await fetchCardTraderPokemonBestSeller();
  return <CardHighlightPanel cardTraderBestSeller={cardTraderBestSeller} />;
}
