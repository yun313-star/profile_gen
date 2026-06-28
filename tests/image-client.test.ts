// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  validateSelfieFile,
  MAX_SELFIE_BYTES,
  MAX_SELFIE_COUNT,
  ALLOWED_MIME,
} from "@/lib/image-client";

describe("validateSelfieFile", () => {
  it("accepts a small png", () => {
    expect(validateSelfieFile({ type: "image/png", size: 1000 })).toEqual({ ok: true });
  });

  it("rejects unsupported mime", () => {
    const r = validateSelfieFile({ type: "image/gif", size: 1000 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("형식");
  });

  it("rejects oversize files", () => {
    const r = validateSelfieFile({ type: "image/png", size: MAX_SELFIE_BYTES + 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("10MB");
  });

  it("exposes constants", () => {
    expect(MAX_SELFIE_COUNT).toBe(3);
    expect(ALLOWED_MIME).toContain("image/webp");
  });
});
