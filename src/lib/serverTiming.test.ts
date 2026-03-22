import { describe, expect, it } from "vitest";
import { runWithTimingCollector, timedAsync } from "./serverTiming";

describe("serverTiming", () => {
  it("runWithTimingCollector records timedAsync spans", async () => {
    const { result, spans } = await runWithTimingCollector(async () => {
      await timedAsync("test:inner", async () => 7);
      return "done";
    });
    expect(result).toBe("done");
    expect(spans.some((s) => s.label === "test:inner")).toBe(true);
  });

  it("timedAsync returns the async result", async () => {
    const result = await timedAsync("test:noop", async () => 42);
    expect(result).toBe(42);
  });

  it("timedAsync propagates rejection", async () => {
    await expect(
      timedAsync("test:throw", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
  });
});
