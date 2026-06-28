import { createServerSupabase } from "@/lib/supabase/server";
import { createServiceSupabase } from "@/lib/supabase/service";
import { validateSelfieFile, MAX_SELFIE_COUNT } from "@/lib/image-client";
import { uploadObject, BUCKET_SELFIES } from "@/lib/storage";
import { debitCredits, refundHold } from "@/lib/credits";
import { insertJobs } from "@/lib/db";
import { queueSend } from "@/lib/queue";
import { hasRequiredConsents } from "@/lib/consent";
import type { StylePreset, ConsentType } from "@/types/db";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  const server = await createServerSupabase();

  // 1) auth
  const { data: auth } = await server.auth.getUser();
  const user = auth?.user;
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  // 2) consent gate — REQUIRED_CONSENTS (incl. "tos") + hasRequiredConsents()
  //    are the canonical contract in @/lib/consent (Phase 1). Never redefine here.
  const { data: consentRows } = await server.from("consents").select("type").eq("user_id", user.id);
  const have = (consentRows ?? []).map((c: { type: string }) => c.type) as ConsentType[];
  if (!hasRequiredConsents(have)) {
    return Response.json({ error: "consent_required" }, { status: 403 });
  }

  // 3) age gate (spec §9, 만 14세 미만 차단) — must pass BEFORE any hold/enqueue
  const { data: profile } = await server
    .from("profiles")
    .select("age_verified")
    .eq("id", user.id)
    .single();
  if (!profile?.age_verified) {
    return Response.json({ error: "age_verification_required" }, { status: 403 });
  }

  // 4) parse + validate input
  const form = await req.formData();
  const styleId = String(form.get("styleId") ?? "");
  const count = Number(form.get("count") ?? 0);
  const files = form.getAll("selfies").filter((f): f is File => f instanceof File);

  if (!styleId) return Response.json({ error: "styleId required" }, { status: 400 });
  if (!Number.isInteger(count) || count < 1 || count > 4) {
    return Response.json({ error: "count must be 1..4" }, { status: 400 });
  }
  if (files.length < 1 || files.length > MAX_SELFIE_COUNT) {
    return Response.json({ error: `1..${MAX_SELFIE_COUNT} selfies required` }, { status: 400 });
  }
  for (const f of files) {
    const v = validateSelfieFile({ type: f.type, size: f.size });
    if (!v.ok) return Response.json({ error: v.reason }, { status: 400 });
  }

  // 5) load active preset (cookie client → RLS allows reading active presets)
  const { data: presetRow } = await server
    .from("style_presets")
    .select("*")
    .eq("id", styleId)
    .eq("is_active", true)
    .single();
  const preset = presetRow as StylePreset | null;
  if (!preset) return Response.json({ error: "unknown style" }, { status: 400 });

  const svc = createServiceSupabase();
  const batchId = crypto.randomUUID();
  const isWatermarked = preset.family === "free";

  // 6) upload selfies → private bucket
  const selfiePaths: string[] = [];
  for (let i = 0; i < files.length; i++) {
    const path = `${user.id}/${batchId}/${i}.png`;
    const bytes = new Uint8Array(await files[i].arrayBuffer());
    await uploadObject(svc, BUCKET_SELFIES, path, bytes, files[i].type || "image/png");
    selfiePaths.push(path);
  }

  // 7) hold credits (1 row per job). Roll back all holds if any debit fails.
  const jobIds = Array.from({ length: count }, () => crypto.randomUUID());
  const held: { jobId: string; ledgerId: number }[] = [];
  try {
    for (const jobId of jobIds) {
      const ledgerId = await debitCredits(svc, {
        user_id: user.id,
        amount: preset.credit_cost,
        job_id: jobId,
      });
      held.push({ jobId, ledgerId });
    }
  } catch {
    for (const h of held) {
      await refundHold(svc, { user_id: user.id, amount: preset.credit_cost, job_id: h.jobId });
    }
    return Response.json({ error: "insufficient_credits" }, { status: 402 });
  }

  // 8) insert N queued jobs carrying their hold ledger id
  await insertJobs(
    svc,
    held.map((h) => ({
      id: h.jobId,
      user_id: user.id,
      batch_id: batchId,
      style_preset_id: preset.id,
      model_key: preset.model_key,
      status: "queued" as const,
      is_watermarked: isWatermarked,
      hold_ledger_id: h.ledgerId,
    })),
  );

  // 9) enqueue one message per job (idempotency key = job_id)
  for (const jobId of jobIds) {
    await queueSend(svc, { job_id: jobId, selfie_paths: selfiePaths });
  }

  // 10) non-awaited kick to the worker (best-effort; cron also drains the queue)
  void fetch(`${process.env.APP_BASE_URL}/api/jobs/worker`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
  }).catch(() => {});

  return Response.json({ batchId, jobIds }, { status: 202 });
}
