import { describe, expect, it } from "vitest";
import {
  extractBestSellersSection,
  fetchPokoinHotBlueprintCard,
  parseCardTraderBestSellerFromText,
  pickBestCardImageUrl,
  pokoinCardUrlFromCardTraderData,
  sanitizeCardHighlightName,
} from "./fetchCardTraderBestSeller";

describe("sanitizeCardHighlightName", () => {
  it("removes leading .jpg) from broken markdown", () => {
    expect(sanitizeCardHighlightName(".jpg) Gloom Obsidian Flames")).toBe(
      "Gloom Obsidian Flames",
    );
  });
  it("removes leading .png) and ](url)", () => {
    expect(sanitizeCardHighlightName("](https://cdn/x.png) Card Title")).toBe("Card Title");
    expect(sanitizeCardHighlightName(".png) Pikachu")).toBe("Pikachu");
  });
  it("strips HTML and markdown image junk before the title", () => {
    expect(
      sanitizeCardHighlightName(
        '<img src="/x.jpg" /> .jpg) Gloom Obsidian Flames Special Illustration Rare',
      ),
    ).toBe("Gloom Obsidian Flames Special Illustration Rare");
  });
});

describe("fetchCardTraderBestSeller", () => {
  it("rotates through Pokoin hot blueprint data for the highlighted card", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          blueprints: [
            { blueprintId: "316600", name: "Leafeon", set: "Prismatic Evolutions", number: "005/131" },
            { blueprintId: "234470", name: "Pikachu", set: "Dark Phantasma", number: "073/071" },
          ],
          cards: [
            {
              card_id: "316600",
              name: "Leafeon",
              set_name: "Prismatic Evolutions",
              card_number: "005/131",
              image_url: "https://cdn.pokoin.com/316600_leafeon-005-131-prismatic-evolutions.jpg",
            },
            {
              card_id: "234470",
              name: "Pikachu",
              set_name: "Dark Phantasma",
              card_number: "073/071",
              image_url: "https://cdn.pokoin.com/234470_pikachu-073-071-dark-phantasma.jpg",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )) as typeof fetch;

    try {
      const card = await fetchPokoinHotBlueprintCard("1");
      expect(card).toEqual({
        name: "Pikachu · Dark Phantasma · 073/071",
        imageUrl: "https://cdn.pokoin.com/234470_pikachu-073-071-dark-phantasma.jpg",
        cardUrl: "https://pokoin.com/234470",
        fromPrice: "",
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("extractBestSellersSection finds markdown block", () => {
    const md = `# Hub\n## Best Sellers\n\n![x](https://cdn.example.com/a.png) [Label](https://www.cardtrader.com/en/cards/1)\n\n## Other`;
    const s = extractBestSellersSection(md);
    expect(s).toBeTruthy();
    expect(s).toContain("cardtrader.com");
  });

  it("parseCardTraderBestSellerFromText: markdown wrapped image+card", () => {
    const md = `## Best Sellers

[![thumb](https://www.cardtrader.com/uploads/xx/card.png) Card Name Starting from: $12.34](https://www.cardtrader.com/en/pokemon/cards/12345)
`;
    const r = parseCardTraderBestSellerFromText(md);
    expect(r).not.toBeNull();
    expect(r!.imageUrl).toContain("card.png");
    expect(r!.cardUrl).toBe("https://pokoin.com/12345");
    expect(r!.fromPrice).toBe("12.34");
  });

  it("parseCardTraderBestSellerFromText: loose image + card urls", () => {
    const md = `## Best Sellers
Some text
https://www.cardtrader.com/uploads/a.webp
https://www.cardtrader.com/en/pokemon/cards/999-name
`;
    const r = parseCardTraderBestSellerFromText(md);
    expect(r).not.toBeNull();
    expect(r!.imageUrl).toContain("webp");
    expect(r!.cardUrl).toBe("https://pokoin.com/999");
  });

  it("parseCardTraderBestSellerFromText: card only → empty imageUrl", () => {
    const md = `## Best Sellers
https://www.cardtrader.com/en/pokemon/cards/only-link
`;
    const r = parseCardTraderBestSellerFromText(md);
    expect(r).not.toBeNull();
    expect(r!.imageUrl).toBe("");
    expect(r!.cardUrl).toContain("cardtrader.com");
  });

  it("pickBestCardImageUrl prefers blueprint over CardTrader fallback show.png", () => {
    const best = pickBestCardImageUrl([
      "/assets/fallbacks/card_uploader/show.png",
      "/uploads/blueprints/image/255640/show_gloom.jpg",
    ]);
    expect(best).toContain("uploads/blueprints");
    expect(best).not.toContain("fallbacks");
  });

  it("parse: listing flipper HTML — front scan wins", () => {
    const html = `## Best Sellers
<a href="/en/cards/256093">
<img src="/assets/fallbacks/card_uploader/show.png" alt="back">
<img src="/uploads/blueprints/image/255640/show_gloom.jpg" alt="front">
</a>`;
    const r = parseCardTraderBestSellerFromText(html);
    expect(r).not.toBeNull();
    expect(r!.imageUrl).toContain("https://www.cardtrader.com");
    expect(r!.imageUrl).toContain("uploads/blueprints");
    expect(r!.cardUrl).toBe("https://pokoin.com/256093");
  });

  it("parse: blueprint URL with parentheses in filename (e.g. show_...(2).jpg)", () => {
    const md = `## Best Sellers
https://www.cardtrader.com/en/pokemon/cards/123-slug
https://www.cardtrader.com/uploads/blueprints/image/111169/show_pidgeotto-22-102-base-set(2).jpg
`;
    const r = parseCardTraderBestSellerFromText(md);
    expect(r).not.toBeNull();
    expect(r!.imageUrl).toContain("111169");
    expect(r!.imageUrl).toContain("show_pidgeotto");
    expect(r!.imageUrl).toContain("(2).jpg");
  });

  it("parse: Jina markdown [![…](preview_…(2).jpg)](card) — full image URL", () => {
    const md = `## Best Sellers
[![Image: Pidgeotto](https://www.cardtrader.com/uploads/blueprints/image/111169/preview_pidgeotto-22-102-base-set(2).jpg) Pidgeotto Base Set Starting from: $1.95](https://www.cardtrader.com/en/cards/pidgeotto-22-102-base-set)
`;
    const r = parseCardTraderBestSellerFromText(md);
    expect(r).not.toBeNull();
    expect(r!.imageUrl).toContain("preview_pidgeotto");
    expect(r!.imageUrl).toContain("(2).jpg");
    expect(r!.cardUrl).toBe("https://pokoin.com/111169");
  });

  it("parse: does not swap first row’s preview_ art for another row’s higher-scoring show_ blueprint", () => {
    const md = `## Best Sellers
[![a](https://www.cardtrader.com/uploads/blueprints/image/100/preview_gloom.jpg) Gloom Obsidian Flames Starting from: $2.50](https://www.cardtrader.com/en/cards/gloom-slug)
[![b](https://www.cardtrader.com/uploads/blueprints/image/200/show_other-card.jpg) Other Card](https://www.cardtrader.com/en/cards/other-slug)
`;
    const r = parseCardTraderBestSellerFromText(md);
    expect(r).not.toBeNull();
    expect(r!.name).toContain("Gloom");
    expect(r!.imageUrl).toContain("preview_gloom");
    expect(r!.imageUrl).not.toContain("show_other");
  });

  it("builds Pokoin card URLs from shared blueprint ids", () => {
    expect(
      pokoinCardUrlFromCardTraderData(
        "https://www.cardtrader.com/en/pokemon/cards/274267-nemona",
        "",
      ),
    ).toBe("https://pokoin.com/274267");
    expect(
      pokoinCardUrlFromCardTraderData(
        "https://www.cardtrader.com/en/cards/gloom-slug",
        "https://www.cardtrader.com/uploads/blueprints/image/255640/show_gloom.jpg",
      ),
    ).toBe("https://pokoin.com/255640");
  });
});
