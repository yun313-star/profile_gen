"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { createServiceSupabase } from "@/lib/supabase/service";
import { deleteUserData } from "@/lib/account";
import { CONSENT_VERSION } from "@/lib/consent";

async function requireUserId() {
  const sb = await createServerSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  return { sb, userId: user.id };
}

export async function setMarketingConsent(agreed: boolean): Promise<void> {
  const { sb, userId } = await requireUserId();
  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  // All consent writes (incl. marketing grant/withdraw) are versioned with the
  // single dated CONSENT_VERSION; withdrawal is recorded by suffixing the same
  // base version (the consents table is an append-only log with no `granted` column).
  const { error } = await sb.from("consents").insert({
    user_id: userId,
    type: "marketing",
    version: agreed ? CONSENT_VERSION : `${CONSENT_VERSION}-withdrawn`,
    ip,
  });
  if (error) throw error;
}

export async function deleteAccount(): Promise<void> {
  const { sb, userId } = await requireUserId();
  const service = createServiceSupabase();
  await deleteUserData(service, userId);
  await sb.auth.signOut();
  redirect("/");
}
