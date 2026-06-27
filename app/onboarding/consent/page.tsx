import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { getUserConsents, hasRequiredConsents } from "@/lib/consent";
import { ConsentForm } from "./consent-form";

export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const agreed = await getUserConsents(supabase, user.id);
  if (hasRequiredConsents(agreed)) redirect("/create");

  const { error } = await searchParams;
  const errorKind =
    error === "required" || error === "age" || error === "birthdate" ? error : null;

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6 py-10">
      <div>
        <h1 className="text-2xl font-bold">서비스 이용 동의</h1>
        <p className="mt-1 text-sm text-neutral-600">
          만 14세 이상만 이용할 수 있습니다. 얼굴 정보는 민감정보에 준해 처리되며, 원본 셀카는 생성 직후 파기됩니다.
        </p>
      </div>
      <ConsentForm error={errorKind} />
    </div>
  );
}
