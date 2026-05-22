import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pokoin News",
    short_name: "Pokoin News",
    description:
      "Pokemon news, TCG market hype, crypto gaming signals, play-to-earn trends and card market momentum from Pokoin.",
    start_url: "/",
    display: "standalone",
    background_color: "#020617",
    theme_color: "#06b6d4",
    lang: "en",
    icons: [
      {
        src: "/pokoin.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/pokoin-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/pokoin-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/pokoin-1024.png",
        sizes: "1024x1024",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}

