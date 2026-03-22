import { describe, expect, it } from "vitest";
import {
  extractBestSellersSection,
  parseCardTraderBestSellerFromText,
  pickBestCardImageUrl,
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
    expect(r!.cardUrl).toContain("cardtrader.com");
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
    expect(r!.cardUrl).toContain("/cards/");
  });

  it("parseCardTraderBestSellerFromText: card only → empty imageUrl", () => {
    const md = `## Best Sellers
https://www.cardtrader.com/en/pokemon/cards/only-link
`;
    const r = parseCardTraderBestSellerFromText(md);
    expect(r).not.toBeNull();
    expect(r!.imageUrl).toBe("");
    expect(r!.cardUrl).toContain("/cards/");
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
    expect(r!.cardUrl).toContain("cardtrader.com");
  });
});
