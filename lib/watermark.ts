import sharp from "sharp";

// Vector outline of the legally-required "AI 생성" label (인공지능기본법: AI-generated
// content must carry a human-perceptible label). The glyphs are embedded as an SVG <path>
// so rendering needs NO font at runtime — output is byte-identical on every platform
// (Windows dev, Linux/Vercel prod). A `font-family` <text> approach tofu-renders Korean on
// Linux where no CJK font is installed; this avoids that class of bug entirely.
//
// Path space: em=100, baseline y=0, glyphs extend to negative y (above baseline);
// advance width ≈ 296.5. Generated from Noto Sans KR (SIL OFL) — see
// scripts/gen-watermark-label.mjs to regenerate if the label text ever changes.
const AI_LABEL = "AI 생성";
const AI_LABEL_PATH =
  "M0.4 0L9.7 0L16.8 -22.4L43.6 -22.4L50.6 0L60.4 0L35.5 -73.3L25.2 -73.3ZM19.1 -29.7L22.7 -41C25.3 -49.3 27.7 -57.2 30 -65.8L30.4 -65.8C32.8 -57.3 35.1 -49.3 37.8 -41L41.3 -29.7ZM70.9 0L80.1 0L80.1 -73.3L70.9 -73.3ZM164 -24.8C145.3 -24.8 133.8 -18.8 133.8 -8.6C133.8 1.6 145.3 7.6 164 7.6C182.6 7.6 194.2 1.6 194.2 -8.6C194.2 -18.8 182.6 -24.8 164 -24.8ZM164 -18.4C177.5 -18.4 185.9 -14.8 185.9 -8.6C185.9 -2.4 177.5 1.2 164 1.2C150.4 1.2 142 -2.4 142 -8.6C142 -14.8 150.4 -18.4 164 -18.4ZM136.4 -77L136.4 -64.9C136.4 -54.8 129.4 -43.1 117.5 -37.8L122 -31.4C130.8 -35.3 137.2 -42.9 140.5 -51.5C143.7 -43.7 149.8 -37.3 158.3 -33.9L162.7 -40.3C151.2 -44.7 144.4 -54.9 144.4 -64.9L144.4 -77ZM166.4 -80.9L166.4 -29.7L174.2 -29.7L174.2 -51.6L185.8 -51.6L185.8 -26.8L193.7 -26.8L193.7 -82.6L185.8 -82.6L185.8 -58.4L174.2 -58.4L174.2 -80.9ZM254.1 -26.5C235.4 -26.5 224 -20.2 224 -9.4C224 1.4 235.4 7.6 254.1 7.6C272.8 7.6 284.2 1.4 284.2 -9.4C284.2 -20.2 272.8 -26.5 254.1 -26.5ZM254.1 -19.9C267.7 -19.9 276 -16 276 -9.4C276 -2.9 267.7 1 254.1 1C240.5 1 232.2 -2.9 232.2 -9.4C232.2 -16 240.5 -19.9 254.1 -19.9ZM232.3 -77.6L232.3 -68.3C232.3 -54.4 223.3 -42.3 209.4 -37.4L213.8 -30.7C224.7 -34.8 232.8 -43.1 236.6 -53.8C240.5 -44.4 248.1 -37.1 258.1 -33.4L262.6 -39.9C249.4 -44.4 240.5 -55.8 240.5 -68.6L240.5 -77.6ZM255.9 -63.6L255.9 -56.7L275.6 -56.7L275.6 -29.2L283.9 -29.2L283.9 -82.7L275.6 -82.7L275.6 -63.6Z";

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) =>
    c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === "&" ? "&amp;" : c === "'" ? "&apos;" : "&quot;",
  );
}

export async function applyWatermark(
  bytes: Uint8Array,
  opts?: { label?: string },
): Promise<Uint8Array> {
  const label = opts?.label ?? AI_LABEL;

  // 1) downscale longest edge to 1024 (never enlarge)
  const resized = await sharp(Buffer.from(bytes))
    .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();

  const meta = await sharp(resized).metadata();
  const w = meta.width ?? 1024;
  const h = meta.height ?? 1024;
  const band = Math.max(40, Math.round(h * 0.07));

  // 2) composite a visible label band (인공지능기본법). The canonical "AI 생성" label is
  // drawn from embedded glyph outlines (font-free, Linux-safe). Any other label (test/edge
  // cases only — production always passes "AI 생성") falls back to system-font <text>.
  const labelEl =
    label === AI_LABEL
      ? `<g transform="translate(${Math.round(band * 0.4)},${h - Math.round(band * 0.3)}) scale(${(band * 0.55) / 100})"><path d="${AI_LABEL_PATH}" fill="#ffffff"/></g>`
      : `<text x="${Math.round(band * 0.4)}" y="${h - Math.round(band * 0.32)}" font-family="sans-serif" font-size="${Math.round(band * 0.55)}" fill="#ffffff">${escapeXml(label)}</text>`;

  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="${h - band}" width="${w}" height="${band}" fill="rgba(0,0,0,0.45)"/>
  ${labelEl}
</svg>`;

  const out = await sharp(resized)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png()
    .toBuffer();

  return new Uint8Array(out);
}
