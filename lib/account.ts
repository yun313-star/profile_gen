import type { SupabaseClient } from "@supabase/supabase-js";
import { BUCKET_SELFIES, BUCKET_OUTPUTS } from "@/lib/storage";

const DELETE_ORDER = [
  "assets",
  "generation_jobs",
  "credit_ledger",
  "orders",
  "consents",
] as const;

/**
 * Permanently deletes ALL data for a user:
 *  1. storage objects for the user's assets, across BOTH private buckets
 *     (selfies + outputs), routed by assets.kind,
 *  2. owned DB rows (child -> parent order),
 *  3. the auth.users row (cascades the profile).
 * MUST be called with a service-role client (bypasses RLS). Server-only.
 */
export async function deleteUserData(sb: SupabaseClient, userId: string): Promise<void> {
  // 1) collect + remove storage objects from both buckets
  const { data: assets, error: assetsErr } = await sb
    .from("assets")
    .select("storage_path, kind")
    .eq("user_id", userId);
  if (assetsErr) throw assetsErr;
  const rows = (assets ?? []) as { storage_path: string | null; kind: string | null }[];
  const pick = (keep: (kind: string | null) => boolean) =>
    rows.filter((a) => keep(a.kind)).map((a) => a.storage_path).filter((p): p is string => !!p);
  const selfiePaths = pick((k) => k === "source_selfie");
  const outputPaths = pick((k) => k !== "source_selfie");
  if (selfiePaths.length > 0) {
    const { error: rmErr } = await sb.storage.from(BUCKET_SELFIES).remove(selfiePaths);
    if (rmErr) throw rmErr;
  }
  if (outputPaths.length > 0) {
    const { error: rmErr } = await sb.storage.from(BUCKET_OUTPUTS).remove(outputPaths);
    if (rmErr) throw rmErr;
  }

  // 2) delete owned rows, children first
  for (const table of DELETE_ORDER) {
    const { error } = await sb.from(table).delete().eq("user_id", userId);
    if (error) throw error;
  }
  const { error: profErr } = await sb.from("profiles").delete().eq("id", userId);
  if (profErr) throw profErr;

  // 3) delete the auth user (cascades the profile row if still present)
  const { error: authErr } = await sb.auth.admin.deleteUser(userId);
  if (authErr) throw authErr;
}
