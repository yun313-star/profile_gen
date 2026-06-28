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

/**
 * PIPA selfie purge: deletes source_selfie assets whose delete_after has passed,
 * from Storage (BUCKET_SELFIES) and DB. This is the BACKSTOP for orphans — the
 * Phase 2 worker already purges a batch's selfies immediately once its last job
 * leaves (queued, processing). MUST be called with a service-role client. Server-only.
 */
export async function purgeExpiredSelfies(
  sb: SupabaseClient,
  now: Date = new Date(),
): Promise<{ purged: number }> {
  const iso = now.toISOString();
  const { data: rows, error } = await sb
    .from("assets")
    .select("id, storage_path")
    .eq("kind", "source_selfie")
    .not("delete_after", "is", null)
    .lte("delete_after", iso);
  if (error) throw error;

  const list = (rows ?? []) as { id: string; storage_path: string | null }[];
  if (list.length === 0) return { purged: 0 };

  const paths = list.map((r) => r.storage_path).filter((p): p is string => !!p);
  if (paths.length > 0) {
    // source_selfie objects live in the selfies bucket
    const { error: rmErr } = await sb.storage.from(BUCKET_SELFIES).remove(paths);
    if (rmErr) throw rmErr;
  }

  const ids = list.map((r) => r.id);
  const { error: delErr } = await sb.from("assets").delete().in("id", ids);
  if (delErr) throw delErr;

  return { purged: list.length };
}
