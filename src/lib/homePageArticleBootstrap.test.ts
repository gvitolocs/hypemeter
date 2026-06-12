import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetStaticDataDbForTests } from "@/lib/staticDataDb";

vi.mock("server-only", () => ({}));

function freshDbDir() {
  return path.join(os.tmpdir(), `hypemeter-home-bootstrap-${Date.now()}-${Math.random().toString(36).slice(2)}`);
}

function rssResponse(prefix: string, count: number) {
  const now = new Date().toUTCString();
  const items = Array.from({ length: count }, (_, idx) => {
    const n = idx + 1;
    return `<item>
      <title>Pokemon ${prefix} headline ${n} announces TCG update</title>
      <link>https://example.com/${prefix.toLowerCase()}-${n}</link>
      <pubDate>${now}</pubDate>
      <source>Example ${prefix}</source>
      <description>Pokemon cards and games update ${n}.</description>
    </item>`;
  }).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?><rss><channel>${items}</channel></rss>`;
}

afterEach(() => {
  const dir = process.env.HYPEMETER_SQLITE_DIR;
  resetStaticDataDbForTests();
  vi.restoreAllMocks();
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
  delete process.env.HYPEMETER_SQLITE_DIR;
});

describe("home page article bootstrap", () => {
  it("uses bounded Google News bootstrap instead of hardcoded hub articles on cold start", async () => {
    const dir = freshDbDir();
    fs.mkdirSync(dir, { recursive: true });
    process.env.HYPEMETER_SQLITE_DIR = dir;
    resetStaticDataDbForTests();

    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(rssResponse("Daily", 5), {
            status: 200,
            headers: { "Content-Type": "application/rss+xml" },
          }),
        )
        .mockResolvedValueOnce(
          new Response(rssResponse("Backup", 6), {
            status: 200,
            headers: { "Content-Type": "application/rss+xml" },
          }),
        )
        .mockResolvedValueOnce(
          new Response(rssResponse("Primary", 6), {
            status: 200,
            headers: { "Content-Type": "application/rss+xml" },
          }),
        ),
    );

    const { loadHomePageDataForTests } = await import("@/app/page");
    const payload = await loadHomePageDataForTests();

    expect(payload.topArticles.map((item) => item.title)).toContain(
      "Pokemon Daily headline 1 announces TCG update",
    );
    expect(payload.topArticles.map((item) => item.title)).not.toContain("Pokemon News Hub");
    expect(payload.topArticles).toHaveLength(10);
    expect(payload.items.length).toBeGreaterThanOrEqual(10);
    expect(payload.liveEventSignals.length).toBeGreaterThan(0);
  }, 15_000);
});
