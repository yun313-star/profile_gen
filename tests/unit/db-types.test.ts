import { describe, it, expect } from "vitest";
import type {
  Profile,
  Order,
  StylePreset,
  GenerationJob,
  CreditPack,
} from "@/types/db";

it("row types have the contracted required fields", () => {
  const p: Profile = {
    id: "u1",
    display_name: null,
    phone: null,
    age_verified: false,
    credit_balance: 3,
    created_at: "2026-06-27T00:00:00Z",
  };
  const o: Order = {
    id: "o1",
    user_id: "u1",
    pack_id: "starter",
    expected_amount: 9900,
    credits: 10,
    status: "PENDING",
    payapp_mul_no: null,
    payapp_pay_state: null,
    payapp_pay_type: null,
    paid_at: null,
    created_at: "2026-06-27T00:00:00Z",
  };
  const s: StylePreset = {
    id: "biz_linkedin",
    name_ko: "링크드인 헤드샷",
    family: "business",
    model_key: "google/gemini-3-pro-image",
    prompt_template: "x",
    size: "2K",
    quality: "high",
    credit_cost: 1,
    is_active: true,
    sort_order: 1,
  };
  const j: GenerationJob = {
    id: "j1",
    user_id: "u1",
    batch_id: "b1",
    style_preset_id: "biz_linkedin",
    model_key: "google/gemini-3-pro-image",
    status: "queued",
    is_watermarked: false,
    hold_ledger_id: null,
    asset_id: null,
    error_code: null,
    created_at: "2026-06-27T00:00:00Z",
    finished_at: null,
  };
  const pack: CreditPack = { id: "starter", name: "스타터 10크레딧", price: 9900, credits: 10 };
  expect([p.credit_balance, o.expected_amount, s.credit_cost, j.status, pack.credits]).toEqual([
    3, 9900, 1, "queued", 10,
  ]);
});
