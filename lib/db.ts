import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Order,
  GenerationJob,
  Asset,
  NewJob,
  JobStatus,
  AssetKind,
} from "@/types/db";

function unwrap<T>(res: { data: T | null; error: { message: string } | null }, ctx: string): T {
  if (res.error) throw new Error(`${ctx}: ${res.error.message}`);
  if (res.data == null) throw new Error(`${ctx}: no data returned`);
  return res.data;
}

export async function insertOrder(
  sb: SupabaseClient,
  input: { user_id: string; pack_id: string; expected_amount: number; credits: number },
): Promise<Order> {
  const res = await sb
    .from("orders")
    .insert({ ...input, status: "PENDING" })
    .select()
    .single();
  return unwrap<Order>(res, "insertOrder");
}

export async function getOrder(sb: SupabaseClient, id: string): Promise<Order | null> {
  const res = await sb.from("orders").select().eq("id", id).maybeSingle();
  if (res.error) throw new Error(`getOrder: ${res.error.message}`);
  return (res.data as Order | null) ?? null;
}

export async function updateOrder(
  sb: SupabaseClient,
  id: string,
  patch: Partial<Order>,
): Promise<void> {
  const res = await sb.from("orders").update(patch).eq("id", id);
  if (res.error) throw new Error(`updateOrder: ${res.error.message}`);
}

/**
 * Idempotent PENDING -> PAID transition. Returns true only if THIS call flipped the row
 * (guarded by status='PENDING'). Duplicate PayApp feedback yields false (no double-grant).
 */
export async function markOrderPaidIfPending(
  sb: SupabaseClient,
  id: string,
  fields: { payapp_mul_no: string | null; payapp_pay_state: string | null; payapp_pay_type: string | null },
): Promise<boolean> {
  const res = await sb
    .from("orders")
    .update({
      status: "PAID",
      paid_at: new Date().toISOString(),
      payapp_mul_no: fields.payapp_mul_no,
      payapp_pay_state: fields.payapp_pay_state,
      payapp_pay_type: fields.payapp_pay_type,
    })
    .eq("id", id)
    .eq("status", "PENDING")
    .select()
    .maybeSingle();
  if (res.error) throw new Error(`markOrderPaidIfPending: ${res.error.message}`);
  return res.data != null;
}

/** Idempotent PAID -> REFUNDED transition. True only if this call flipped the row. */
export async function markOrderRefundedIfPaid(sb: SupabaseClient, id: string): Promise<boolean> {
  const res = await sb
    .from("orders")
    .update({ status: "REFUNDED" })
    .eq("id", id)
    .eq("status", "PAID")
    .select()
    .maybeSingle();
  if (res.error) throw new Error(`markOrderRefundedIfPaid: ${res.error.message}`);
  return res.data != null;
}

export async function insertJobs(sb: SupabaseClient, jobs: NewJob[]): Promise<GenerationJob[]> {
  const res = await sb.from("generation_jobs").insert(jobs).select();
  if (res.error) throw new Error(`insertJobs: ${res.error.message}`);
  return (res.data as GenerationJob[]) ?? [];
}

export async function getJob(sb: SupabaseClient, id: string): Promise<GenerationJob | null> {
  const res = await sb.from("generation_jobs").select().eq("id", id).maybeSingle();
  if (res.error) throw new Error(`getJob: ${res.error.message}`);
  return (res.data as GenerationJob | null) ?? null;
}

export async function setJobStatus(
  sb: SupabaseClient,
  id: string,
  status: JobStatus,
  patch?: Partial<GenerationJob>,
): Promise<void> {
  const res = await sb
    .from("generation_jobs")
    .update({ status, ...patch })
    .eq("id", id);
  if (res.error) throw new Error(`setJobStatus: ${res.error.message}`);
}

export async function insertAsset(
  sb: SupabaseClient,
  asset: {
    user_id: string;
    job_id: string | null;
    storage_path: string;
    kind: AssetKind;
    width?: number | null;
    height?: number | null;
    mime: string;
    delete_after?: string | null;
  },
): Promise<Asset> {
  const res = await sb.from("assets").insert(asset).select().single();
  return unwrap<Asset>(res, "insertAsset");
}
