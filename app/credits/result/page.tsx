import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { getOrder } from "@/lib/db";
import { OrderStatus } from "./_OrderStatus";

export const runtime = "nodejs";

export default async function CreditsResultPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const { order: orderId } = await searchParams;
  const sb = await createServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");
  if (!orderId) redirect("/credits");

  const order = await getOrder(sb, orderId);
  if (!order || order.user_id !== user.id) redirect("/credits");

  return (
    <main className="mx-auto max-w-lg px-4 py-16">
      <h1 className="mb-6 text-xl font-bold">결제 결과</h1>
      <OrderStatus orderId={order.id} initialStatus={order.status} />
    </main>
  );
}
