import type { SupabaseClient } from "@supabase/supabase-js";

export const BUCKET_SELFIES = "selfies" as const;
export const BUCKET_OUTPUTS = "outputs" as const;

export async function uploadObject(
  sb: SupabaseClient,
  bucket: string,
  path: string,
  bytes: Uint8Array,
  mime: string,
): Promise<void> {
  const { error } = await sb.storage.from(bucket).upload(path, bytes, {
    contentType: mime,
    upsert: true,
  });
  if (error) throw error;
}

export async function createSignedUrl(
  sb: SupabaseClient,
  bucket: string,
  path: string,
  expiresIn = 300,
): Promise<string> {
  const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error || !data?.signedUrl) throw error ?? new Error("createSignedUrl failed");
  return data.signedUrl;
}

export async function downloadBytes(
  sb: SupabaseClient,
  bucket: string,
  path: string,
): Promise<Uint8Array> {
  const { data, error } = await sb.storage.from(bucket).download(path);
  if (error || !data) throw error ?? new Error("download failed");
  return new Uint8Array(await data.arrayBuffer());
}

export async function removeObjects(
  sb: SupabaseClient,
  bucket: string,
  paths: string[],
): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await sb.storage.from(bucket).remove(paths);
  if (error) throw error;
}
