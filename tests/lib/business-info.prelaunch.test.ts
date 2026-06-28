import { describe, it, expect } from "vitest";
import { BUSINESS_INFO } from "@/lib/legal";

describe("BUSINESS_INFO prelaunch gate", () => {
  it("has no unfilled ★ placeholders", () => {
    for (const [k, v] of Object.entries(BUSINESS_INFO)) {
      expect(String(v), `${k} still contains a ★ placeholder`).not.toContain("★");
    }
  });

  it("has all required identity fields populated", () => {
    for (const k of ["company", "ceo", "bizRegNo", "mailOrderNo", "address", "email"] as const) {
      expect(BUSINESS_INFO[k].length).toBeGreaterThan(0);
    }
  });
});
