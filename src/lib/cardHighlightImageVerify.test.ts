import { describe, expect, it } from "vitest";
import { imageBytesLookLikeRaster } from "./cardHighlightImageVerify";

describe("imageBytesLookLikeRaster", () => {
  it("accepts minimal JPEG magic", () => {
    const b = Buffer.alloc(40);
    b[0] = 0xff;
    b[1] = 0xd8;
    b[2] = 0xff;
    expect(imageBytesLookLikeRaster(b)).toBe(true);
  });

  it("rejects HTML/text", () => {
    const b = Buffer.from("<!DOCTYPE html><html>", "utf8");
    expect(imageBytesLookLikeRaster(b)).toBe(false);
  });
});
