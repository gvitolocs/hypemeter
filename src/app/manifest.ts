import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pokemon Hype Meter",
    short_name: "HypeMeter",
    description:
      "Composite Pokemon hype index tracking search demand, market momentum, availability pressure, and event catalysts.",
    start_url: "/",
    display: "standalone",
    background_color: "#020617",
    theme_color: "#06b6d4",
    lang: "en",
  };
}

