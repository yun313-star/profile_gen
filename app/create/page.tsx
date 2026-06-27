import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { getUserConsents, hasRequiredConsents } from "@/lib/consent";

export default async function CreatePage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const agreed = await getUserConsents(supabase, user.id);
  if (!hasRequiredConsents(agreed)) redirect("/onboarding/consent");

  return (
    <div className="py-10">
      <h1 className="text-2xl font-bold">스튜디오</h1>
      <p className="mt-2 text-sm text-neutral-600">
        셀카 업로드와 스타일 선택은 다음 단계에서 제공됩니다. (Phase 2)
      </p>
    </div>
  );
}
