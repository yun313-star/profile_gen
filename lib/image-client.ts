export const MAX_SELFIE_BYTES = 10 * 1024 * 1024; // 10MB
export const MAX_SELFIE_DIM = 2048;
export const MAX_SELFIE_COUNT = 3;
export const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"] as const;

export type SelfieValidation = { ok: true } | { ok: false; reason: string };

export function validateSelfieFile(file: { type: string; size: number }): SelfieValidation {
  if (!(ALLOWED_MIME as readonly string[]).includes(file.type)) {
    return { ok: false, reason: "지원하지 않는 형식입니다 (JPG/PNG/WEBP)" };
  }
  if (file.size > MAX_SELFIE_BYTES) {
    return { ok: false, reason: "파일이 너무 큽니다 (최대 10MB)" };
  }
  return { ok: true };
}

// Browser-only: downscale longest edge to MAX_SELFIE_DIM and re-encode as PNG.
export async function resizeSelfie(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SELFIE_DIM / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d context unavailable");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))), "image/png");
  });
}
