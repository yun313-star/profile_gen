// @vitest-environment node
import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { applyWatermark } from "@/lib/watermark";

async function makePng(w: number, h: number): Promise<Uint8Array> {
  const buf = await sharp({
    create: { width: w, height: h, channels: 3, background: { r: 120, g: 120, b: 120 } },
  })
    .png()
    .toBuffer();
  return new Uint8Array(buf);
}

describe("applyWatermark", () => {
  it("downscales a 3000px image so the longest edge is <= 1024", async () => {
    const src = await makePng(3000, 1500);
    const out = await applyWatermark(src);
    const meta = await sharp(Buffer.from(out)).metadata();
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(1024);
    expect(meta.format).toBe("png");
  });

  it("does not enlarge a small image", async () => {
    const src = await makePng(400, 400);
    const out = await applyWatermark(src, { label: "AI 생성" });
    const meta = await sharp(Buffer.from(out)).metadata();
    expect(meta.width).toBe(400);
    expect(meta.height).toBe(400);
  });

  it("returns a non-empty valid PNG", async () => {
    const src = await makePng(800, 600);
    const out = await applyWatermark(src);
    expect(out.byteLength).toBeGreaterThan(100);
  });

  it("composites a visible white 'AI 생성' label into the bottom band (인공지능기본법)", async () => {
    const src = await makePng(800, 600);
    const out = await applyWatermark(src);
    const meta = await sharp(Buffer.from(out)).metadata();
    const h = meta.height ?? 0;
    const w = meta.width ?? 0;
    const band = Math.max(40, Math.round(h * 0.07));
    // The label region (bottom-left of the band) must contain near-white pixels — the
    // font-free glyph outlines. Guards against the legally-required label silently
    // disappearing (e.g. a broken path, or tofu if anyone reverts to font-based text).
    const region = await sharp(Buffer.from(out))
      .extract({ left: 0, top: h - band, width: Math.min(220, w), height: band })
      .stats();
    const maxBrightness = Math.max(...region.channels.map((c) => c.max));
    expect(maxBrightness).toBeGreaterThan(240);
  });
});
