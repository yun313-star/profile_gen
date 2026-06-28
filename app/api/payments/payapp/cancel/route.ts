import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrder } from "@/lib/db";
import { payappCancel } from "@/lib/payapp/client";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const sb = await createServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const orderId = (body as { order_id?: unknown })?.order_id;
  const reason = (body as { reason?: unknown })?.reason;
  if (typeof orderId !== "string") {
    return NextResponse.json({ error: "주문 ID가 필요합니다." }, { status: 400 });
  }

  const order = await getOrder(sb, orderId);
  if (!order || order.user_id !== user.id) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }
  if (order.status !== "PAID" || !order.payapp_mul_no) {
    return NextResponse.json({ error: "취소 가능한 결제가 아닙니다." }, { status: 409 });
  }

  // Issue paycancel only. State flip + credit claw-back happen via the refund feedback
  // (Task 3.5: markOrderRefundedIfPaid + clawbackCredits) — that is the single authority.
  // Double-handling here would cause a double-clawback.
  const result = await payappCancel({
    mul_no: order.payapp_mul_no,
    reason: typeof reason === "string" && reason.trim() ? reason : "고객 환불 요청",
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "환불 요청에 실패했습니다." }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
