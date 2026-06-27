import { it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { debitCredits, grantCredits, refundHold, clawbackCredits } from "@/lib/credits";

function sbWithRpc(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn(async () => result);
  return { sb: { rpc } as unknown as SupabaseClient, rpc };
}

it("debitCredits calls debit_credits RPC and returns ledger id", async () => {
  const { sb, rpc } = sbWithRpc({ data: 42, error: null });
  const id = await debitCredits(sb, { user_id: "u1", amount: 1, job_id: "j1" });
  expect(rpc).toHaveBeenCalledWith("debit_credits", { p_user: "u1", p_amount: 1, p_job: "j1" });
  expect(id).toBe(42);
});

it("debitCredits surfaces INSUFFICIENT_CREDITS", async () => {
  const { sb } = sbWithRpc({ data: null, error: { message: "INSUFFICIENT_CREDITS" } });
  await expect(debitCredits(sb, { user_id: "u1", amount: 99, job_id: "j1" })).rejects.toThrow(
    "INSUFFICIENT_CREDITS",
  );
});

it("grantCredits calls grant_credits RPC with mapped args", async () => {
  const { sb, rpc } = sbWithRpc({ data: null, error: null });
  await grantCredits(sb, { user_id: "u1", amount: 10, reason: "purchase", ref_type: "order", ref_id: "o1" });
  expect(rpc).toHaveBeenCalledWith("grant_credits", {
    p_user: "u1", p_amount: 10, p_reason: "purchase", p_ref_type: "order", p_ref_id: "o1",
  });
});

it("refundHold calls refund_hold RPC", async () => {
  const { sb, rpc } = sbWithRpc({ data: null, error: null });
  await refundHold(sb, { user_id: "u1", amount: 1, job_id: "j1" });
  expect(rpc).toHaveBeenCalledWith("refund_hold", { p_user: "u1", p_amount: 1, p_job: "j1" });
});

it("clawbackCredits calls clawback_credits RPC with mapped args (positive amount)", async () => {
  const { sb, rpc } = sbWithRpc({ data: null, error: null });
  await clawbackCredits(sb, { user_id: "u1", amount: 10, order_id: "o1" });
  expect(rpc).toHaveBeenCalledWith("clawback_credits", { p_user: "u1", p_amount: 10, p_order: "o1" });
});

it("clawbackCredits surfaces RPC errors", async () => {
  const { sb } = sbWithRpc({ data: null, error: { message: "PROFILE_NOT_FOUND" } });
  await expect(clawbackCredits(sb, { user_id: "u1", amount: 10, order_id: "o1" })).rejects.toThrow(
    "PROFILE_NOT_FOUND",
  );
});
