import { it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  REQUIRED_CONSENTS,
  OPTIONAL_CONSENTS,
  CONSENT_VERSION,
  hasRequiredConsents,
  getUserConsents,
  recordConsents,
} from "@/lib/consent";

it("required consents are the four PIPA mandatory items", () => {
  expect(REQUIRED_CONSENTS).toEqual(["tos", "privacy", "sensitive_face", "own_face"]);
  expect(OPTIONAL_CONSENTS).toEqual(["marketing"]);
});

it("hasRequiredConsents true only when all four present", () => {
  expect(hasRequiredConsents(["tos", "privacy", "sensitive_face", "own_face"])).toBe(true);
  expect(hasRequiredConsents(["tos", "privacy", "sensitive_face", "own_face", "marketing"])).toBe(true);
  expect(hasRequiredConsents(["tos", "privacy", "sensitive_face"])).toBe(false);
  expect(hasRequiredConsents([])).toBe(false);
});

it("getUserConsents returns distinct consent types for the user", async () => {
  const select = vi.fn(() => ({ eq: vi.fn(async () => ({ data: [{ type: "tos" }, { type: "tos" }, { type: "privacy" }], error: null })) }));
  const sb = { from: vi.fn(() => ({ select })) } as unknown as SupabaseClient;
  const out = await getUserConsents(sb, "u1");
  expect(out.sort()).toEqual(["privacy", "tos"]);
});

it("recordConsents inserts one row per type with version + ip", async () => {
  const insert = vi.fn(async () => ({ error: null }));
  const sb = { from: vi.fn(() => ({ insert })) } as unknown as SupabaseClient;
  await recordConsents(sb, { userId: "u1", types: ["tos", "privacy"], ip: "1.2.3.4" });
  expect(insert).toHaveBeenCalledWith([
    { user_id: "u1", type: "tos", version: CONSENT_VERSION, ip: "1.2.3.4" },
    { user_id: "u1", type: "privacy", version: CONSENT_VERSION, ip: "1.2.3.4" },
  ]);
});
