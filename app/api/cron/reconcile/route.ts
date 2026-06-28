import { NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabase/service";
import { requireCron } from "@/lib/cron";

export const runtime = "nodejs";

// Orders older than this still PENDING but with a mul_no are suspicious (user reached PayApp,
// feedback possibly missed). Threshold: 30 minutes.
const STALE_MINUTES = 30;

export async function GET(req: Request) {
  const denied = requireCron(req);
  if (denied) return denied;

  const sb = createServiceSupabase();
  const cutoff = new Date(Date.now() - STALE_MINUTES * 60_000).toISOString();
  const { data, error } = await sb
    .from("orders")
    .select("id, user_id, payapp_mul_no, created_at, expected_amount")
    .eq("status", "PENDING")
    .not("payapp_mul_no", "is", null)
    .lt("created_at", cutoff);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const stale = data ?? [];
  if (stale.length > 0) {
    console.warn("[cron/reconcile] stale PENDING orders need manual review", {
      count: stale.length,
      orderIds: stale.map((o) => (o as { id: string }).id),
    });
  }
  // NOTE ★: PayApp exposes no documented GET status API (spec §6.1, §13). We cannot auto-grant
  // here — grants stay exclusive to verified feedback. When a status cmd is confirmed, add a
  // single re-poll + amount-gated grant before returning.
  return NextResponse.json({
    checked: stale.length,
    note: "★ manual: no PayApp status API — stale PENDING orders logged for operator review; no auto-grant",
  });
}
