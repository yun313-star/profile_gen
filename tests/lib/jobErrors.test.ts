import { describe, it, expect } from "vitest";
import { describeJobError } from "@/lib/jobErrors";

describe("describeJobError", () => {
  it("explains moderation block in friendly Korean and confirms refund", () => {
    const v = describeJobError("moderation_blocked");
    expect(v.title).toContain("생성");
    expect(v.message).toContain("환불");
    expect(v.refunded).toBe(true);
    expect(v.canRetry).toBe(true);
  });

  it("handles empty/no-image provider response", () => {
    const v = describeJobError("no_image");
    expect(v.refunded).toBe(true);
    expect(v.message.length).toBeGreaterThan(0);
  });

  it("handles the generic generation_failed code", () => {
    const v = describeJobError("generation_failed");
    expect(v.title).toContain("문제");
    expect(v.message).toContain("환불");
    expect(v.refunded).toBe(true);
    expect(v.canRetry).toBe(true);
  });

  it("falls back for unknown / null codes and still confirms refund", () => {
    for (const code of [null, "weird_code"]) {
      const v = describeJobError(code);
      expect(v.message).toContain("환불");
      expect(v.refunded).toBe(true);
    }
  });
});
