import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { insertOrder, updateOrder } from "@/lib/db";
import { payappCreate } from "@/lib/payapp/client";
import { CREDIT_PACKS } from "@/lib/styles";

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
  const packId = (body as { pack_id?: unknown })?.pack_id;
  if (typeof packId !== "string" || !(packId in CREDIT_PACKS)) {
    return NextResponse.json({ error: "알 수 없는 크레딧 팩입니다." }, { status: 400 });
  }
  const pack = CREDIT_PACKS[packId];

  // expected_amount is set server-side from CREDIT_PACKS — never trust client.
  const order = await insertOrder(sb, {
    user_id: user.id,
    pack_id: pack.id,
    expected_amount: pack.price,
    credits: pack.credits,
  });

  const base = process.env.APP_BASE_URL!;
  const recvphone = (user as { phone?: string | null }).phone || "01000000000";
  try {
    const { payurl, mul_no } = await payappCreate({
      order,
      pack,
      recvphone,
      feedbackUrl: `${base}/api/payments/payapp/feedback`,
      returnUrl: `${base}/credits/result?order=${order.id}`,
    });
    await updateOrder(sb, order.id, { payapp_mul_no: mul_no });
    return NextResponse.json({ payurl });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "결제 생성에 실패했습니다." },
      { status: 502 },
    );
  }
}
