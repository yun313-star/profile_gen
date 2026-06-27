import type { SupabaseClient } from "@supabase/supabase-js";
import type { CreditLedgerReason } from "@/types/db";

/**
 * Reserve (hold) credits for a generation job. Maps to debit_credits SECURITY DEFINER RPC.
 * Returns the generation_hold ledger row id. Throws 'INSUFFICIENT_CREDITS' when balance is too low.
 * Must be called with a service-role client (RPC is granted to service_role only).
 */
export async function debitCredits(
  sb: SupabaseClient,
  args: { user_id: string; amount: number; job_id: string },
): Promise<number> {
  const { data, error } = await sb.rpc("debit_credits", {
    p_user: args.user_id,
    p_amount: args.amount,
    p_job: args.job_id,
  });
  if (error) throw new Error(error.message);
  return data as number;
}

/** Add credits (purchase / refund / release / signup_bonus). Maps to grant_credits RPC. */
export async function grantCredits(
  sb: SupabaseClient,
  args: {
    user_id: string;
    amount: number;
    reason: Extract<CreditLedgerReason, "purchase" | "refund" | "release" | "signup_bonus">;
    ref_type: string | null;
    ref_id: string | null;
  },
): Promise<void> {
  const { error } = await sb.rpc("grant_credits", {
    p_user: args.user_id,
    p_amount: args.amount,
    p_reason: args.reason,
    p_ref_type: args.ref_type,
    p_ref_id: args.ref_id,
  });
  if (error) throw new Error(error.message);
}

/** Release a held credit on failed/blocked generation. Maps to refund_hold RPC. */
export async function refundHold(
  sb: SupabaseClient,
  args: { user_id: string; amount: number; job_id: string },
): Promise<void> {
  const { error } = await sb.rpc("refund_hold", {
    p_user: args.user_id,
    p_amount: args.amount,
    p_job: args.job_id,
  });
  if (error) throw new Error(error.message);
}

/**
 * Deduct credits for a PAYMENT REFUND (Phase 3 payapp feedback refund branch).
 * Dedicated negative path: maps to clawback_credits RPC, which floors the balance at 0
 * and writes a negative 'refund' ledger row. `amount` is ALWAYS positive — never model a
 * refund by calling grantCredits with a negative amount (grant_credits enforces p_amount>0).
 */
export async function clawbackCredits(
  sb: SupabaseClient,
  args: { user_id: string; amount: number; order_id: string },
): Promise<void> {
  const { error } = await sb.rpc("clawback_credits", {
    p_user: args.user_id,
    p_amount: args.amount,
    p_order: args.order_id,
  });
  if (error) throw new Error(error.message);
}
