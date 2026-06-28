import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrder } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const sb = await createServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const orderId = new URL(req.url).searchParams.get("order");
  if (!orderId) return NextResponse.json({ error: "missing order" }, { status: 400 });

  const order = await getOrder(sb, orderId);
  if (!order || order.user_id !== user.id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  // READ-ONLY: returnurl path must never grant credits (spec §6.2).
  return NextResponse.json({ status: order.status });
}
