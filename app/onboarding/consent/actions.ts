"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createServerSupabase } from "@/lib/supabase/server";
import { createServiceSupabase } from "@/lib/supabase/service";
import {
  recordConsents,
  hasRequiredConsents,
  REQUIRED_CONSENTS,
  OPTIONAL_CONSENTS,
} from "@/lib/consent";
import { isAgeAllowed } from "@/lib/age";
import type { ConsentType } from "@/types/db";

export async function submitConsent(formData: FormData): Promise<void> {
  // Cookie-bound client: used ONLY to verify the authenticated session identity.
  // All writes use serviceSb (service-role) to enforce server-authoritativeness.
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // --- Age gate (spec §9, 만 14세 미만 차단) — enforce BEFORE recording consents. ---
  const birthdate = (formData.get("birthdate") as string | null)?.trim() ?? "";
  if (!birthdate) {
    redirect("/onboarding/consent?error=birthdate");
  }
  if (!isAgeAllowed(birthdate)) {
    // Under 14 (or unparseable): block, do not proceed, do not write anything.
    redirect("/onboarding/consent?error=age");
  }

  const all: ConsentType[] = [...REQUIRED_CONSENTS, ...OPTIONAL_CONSENTS];
  const agreed = all.filter((t) => formData.get(t) === "on");

  if (!hasRequiredConsents(agreed)) {
    redirect("/onboarding/consent?error=required");
  }

  const hdrs = await headers();
  const ip =
    hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? hdrs.get("x-real-ip") ?? null;

  // Service-role client for all writes: bypasses RLS, scoped to the verified user.id only.
  // user.id comes from the session (server-verified), never from the request body.
  const serviceSb = createServiceSupabase();

  await recordConsents(serviceSb, { userId: user.id, types: agreed, ip });

  // Age verified (>= 14): persist the flag the Phase 2 generate route gates on.
  // Written via service_role — clients no longer have UPDATE (age_verified) privilege.
  const { error: ageErr } = await serviceSb
    .from("profiles")
    .update({ age_verified: true })
    .eq("id", user.id);
  if (ageErr) throw new Error(`submitConsent: age_verified update failed: ${ageErr.message}`);

  redirect("/create");
}
