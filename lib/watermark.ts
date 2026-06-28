import sharp from "sharp";

export async function applyWatermark(
  bytes: Uint8Array,
  opts?: { label?: string },
): Promise<Uint8Array> {
  const label = opts?.label ?? "AI 생성";

  // 1) downscale longest edge to 1024 (never enlarge)
  const resized = await sharp(Buffer.from(bytes))
    .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();

  const meta = await sharp(resized).metadata();
  const w = meta.width ?? 1024;
  const h = meta.height ?? 1024;
  const band = Math.max(40, Math.round(h * 0.07));
  const fontSize = Math.round(band * 0.55);

  // 2) composite a visible label band (인공지능기본법: human-perceptible AI label)
  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="${h - band}" width="${w}" height="${band}" fill="rgba(0,0,0,0.45)"/>
  <text x="${Math.round(band * 0.4)}" y="${h - Math.round(band * 0.32)}"
        font-family="sans-serif" font-size="${fontSize}" fill="#ffffff">${label}</text>
</svg>`;

  const out = await sharp(resized)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png()
    .toBuffer();

  return new Uint8Array(out);
}
