import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { CREDIT_PACKS } from "@/lib/styles";
import { PackGrid } from "./_PackGrid";

export const runtime = "nodejs";

export default async function CreditsPage() {
  const sb = await createServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login?next=/credits");

  const { data: profile } = await sb
    .from("profiles")
    .select("credit_balance")
    .eq("id", user.id)
    .single();

  const ua = (await headers()).get("user-agent") ?? "";
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  const packs = Object.values(CREDIT_PACKS);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold">크레딧 충전</h1>
      <p className="mt-1 text-sm text-gray-500">
        현재 잔액: {profile?.credit_balance ?? 0}크레딧
      </p>
      <p className="mt-1 text-xs text-gray-400">
        1크레딧 = 2K 결과 이미지 1장. 결제는 페이앱(PayApp)으로 안전하게 진행됩니다.
      </p>
      <div className="mt-8">
        <PackGrid packs={packs} isMobile={isMobile} />
      </div>
    </main>
  );
}
