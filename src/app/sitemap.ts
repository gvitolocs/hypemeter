import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = "https://news.pokoin.com";
  const now = new Date();

  return [
    {
      url: `${baseUrl}/`,
      lastModified: now,
      changeFrequency: "hourly",
      priority: 1,
    },
    {
      url: `${baseUrl}/about`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/contact`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.65,
    },
    ...[
      "live-event-signals",
      "community-hype",
      "market-heat",
      "signal-quality",
      "model-weights",
      "sentiment-1m",
      "sentiment-1y",
      "sentiment-5y",
      "social-google-search",
      "social-reddit",
      "social-youtube",
      "social-facebook",
      "social-threads",
      "social-pokemon-official",
      "component-search-interest",
      "component-market-momentum",
      "component-availability-pressure",
      "component-release-catalyst",
      "component-community-sentiment",
      "component-product-stress",
    ].map((topic) => ({
      url: `${baseUrl}/learn/${topic}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.55,
    })),
  ];
}

