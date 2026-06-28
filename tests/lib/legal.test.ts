import { describe, it, expect } from "vitest";
import {
  BUSINESS_INFO,
  OVERSEAS_PROCESSORS,
  RETENTION_POLICY,
  REFUND_POLICY,
  AI_DISCLOSURE_TEXT,
  AI_LABEL_TEXT,
} from "@/lib/legal";

describe("legal constants", () => {
  it("labels generated content as AI per 인공지능기본법", () => {
    expect(AI_LABEL_TEXT).toBe("AI 생성");
    expect(AI_DISCLOSURE_TEXT).toContain("AI");
  });

  it("discloses all 5 overseas processors", () => {
    const names = OVERSEAS_PROCESSORS.map((p) => p.name).join(" ");
    for (const n of ["OpenAI", "Google", "Supabase", "Vercel", "PayApp"]) {
      expect(names).toContain(n);
    }
    for (const p of OVERSEAS_PROCESSORS) {
      expect(p.country.length).toBeGreaterThan(0);
      expect(p.purpose.length).toBeGreaterThan(0);
      expect(p.items.length).toBeGreaterThan(0);
      expect(p.retention.length).toBeGreaterThan(0);
    }
  });

  it("states selfie retention is immediate post-generation purge", () => {
    const selfie = RETENTION_POLICY.find((r) => r.item.includes("셀카"));
    expect(selfie?.period).toContain("파기");
  });

  it("allows refund of unused credits", () => {
    expect(REFUND_POLICY.summary).toContain("환불");
    expect(REFUND_POLICY.steps.length).toBeGreaterThan(0);
  });

  it("exposes business identity fields required by 전자상거래법", () => {
    for (const k of ["company", "ceo", "bizRegNo", "mailOrderNo", "address", "email"] as const) {
      expect(BUSINESS_INFO[k].length).toBeGreaterThan(0);
    }
  });
});
