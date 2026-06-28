// Regenerates the embedded "AI 생성" glyph path used by lib/watermark.ts.
//
// Why embedded outlines: the legally-required AI label (인공지능기본법) must render on
// Linux/Vercel, where no Korean font is installed. A font-free SVG <path> renders
// identically on every platform, avoiding the tofu that `font-family` text produces.
//
// Usage:
//   1. Download Noto Sans KR (SIL OFL — free to embed), e.g.:
//        curl -L -o /tmp/NotoSansKR-Regular.otf \
//          "https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@main/Sans/SubsetOTF/KR/NotoSansKR-Regular.otf"
//   2. node scripts/gen-watermark-label.mjs /tmp/NotoSansKR-Regular.otf "AI 생성"
//   3. Paste stdout into AI_LABEL_PATH in lib/watermark.ts (em=100, baseline y=0).
//
// Requires: npm i -D fontkit   (fontkit, not opentype.js — opentype emits NaN coords for
// some Hangul glyphs in this font; fontkit produces clean outlines.)
import * as fontkitNS from "fontkit";
import { readFileSync } from "fs";

const fontkit = fontkitNS.default || fontkitNS;
const fontPath = process.argv[2];
const text = process.argv[3] || "AI 생성";
if (!fontPath) {
  console.error("usage: node scripts/gen-watermark-label.mjs <font.otf|ttf> [text]");
  process.exit(1);
}

const font = fontkit.create(readFileSync(fontPath));
const run = font.layout(text);
const s = 100 / font.unitsPerEm; // scale font units -> em=100
let x = 0;
let d = "";
for (let i = 0; i < run.glyphs.length; i++) {
  const g = run.glyphs[i];
  const pos = run.positions[i];
  // glyph path is y-up in font units; flip y (scale -s), baseline at y=0
  d += g.path.scale(s, -s).translate((x + pos.xOffset) * s, 0).toSVG();
  x += pos.xAdvance;
}

console.log(d);
console.error(`advance≈${Math.round(x * s * 10) / 10} (em=100), chars=${d.length}`);
