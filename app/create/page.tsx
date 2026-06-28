import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { getUserConsents, hasRequiredConsents } from "@/lib/consent";
import { Studio } from "./studio";

export default async function CreatePage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const agreed = await getUserConsents(supabase, user.id);
  if (!hasRequiredConsents(agreed)) redirect("/onboarding/consent");

  // Age gate: profiles.age_verified must be true (producer also 403s, but gate here too)
  const { data: profile } = await supabase
    .from("profiles")
    .select("age_verified")
    .eq("id", user.id)
    .single();
  if (!profile?.age_verified) redirect("/onboarding/consent");

  return <Studio />;
}
