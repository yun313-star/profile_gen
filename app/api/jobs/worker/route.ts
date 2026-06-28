import sharp from "sharp";
import { createServiceSupabase } from "@/lib/supabase/service";
import { queueRead, queueDelete } from "@/lib/queue";
import { getJob, setJobStatus, insertAsset } from "@/lib/db";
import { refundHold } from "@/lib/credits";
import { createSignedUrl, uploadObject, removeObjects, BUCKET_SELFIES, BUCKET_OUTPUTS } from "@/lib/storage";
import { generateImage } from "@/lib/models/router";
import { ModerationBlockedError } from "@/lib/models/types";
import { applyWatermark } from "@/lib/watermark";
import type { StylePreset } from "@/types/db";

export const runtime = "nodejs";
// Vercel route segment config: give the worker up to 5 minutes per drain
// (set HERE, not via vercel.json). See R-CONFIG.
export const maxDuration = 300;

const BATCH = 5;
const VISIBILITY = 60; // seconds

async function loadPreset(svc: any, id: string): Promise<StylePreset | null> {
  const { data } = await svc.from("style_presets").select("*").eq("id", id).single();
  return (data as StylePreset | null) ?? null;
}

export async function POST(req: Request): Promise<Response> {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("unauthorized", { status: 401 });
  }

  const svc = createServiceSupabase();
  const messages = await queueRead(svc, BATCH, VISIBILITY);
  let processed = 0;

  for (const { msgId, message } of messages) {
    const jobId: string = message.job_id;
    const selfiePaths: string[] = message.selfie_paths ?? [];

    let job: Awaited<ReturnType<typeof getJob>> = null;
    try {
      job = await getJob(svc, jobId);
      // Idempotency: only a queued job may trigger a paid model call.
      if (!job || job.status !== "queued") {
        await queueDelete(svc, msgId);
        continue;
      }
      await setJobStatus(svc, jobId, "processing");
    } catch (e) {
      // Transient pre-process DB error: do NOT ack (let pgmq redeliver) and do
      // NOT abort the drain — continue to the next message.
      console.error("worker: pre-process error for job", jobId, e);
      continue;
    }
    if (!job) continue; // type-narrow; the guard above already handled null/non-queued

    let amount = 1;
    try {
      const preset = await loadPreset(svc, job.style_preset_id);
      if (!preset) throw new Error("preset_missing");
      amount = preset.credit_cost;

      // load selfies via signed URLs
      const selfies = await Promise.all(
        selfiePaths.map(async (p) => {
          const url = await createSignedUrl(svc, BUCKET_SELFIES, p);
          const r = await fetch(url);
          return new Uint8Array(await r.arrayBuffer());
        }),
      );

      const out = await generateImage({ selfies, preset });

      // structurally-empty (but not blocked) result → no_image error_code
      if (!out.bytes || out.bytes.byteLength === 0) {
        const err = new Error("no image bytes returned");
        (err as { code?: string }).code = "no_image";
        throw err;
      }

      // free-tier: downscale to 1K + visible "AI 생성" label
      let bytes = out.bytes;
      let mime = out.mime;
      let kind: "output" | "watermarked" = "output";
      if (job.is_watermarked) {
        bytes = await applyWatermark(out.bytes, { label: "AI 생성" });
        mime = "image/png";
        kind = "watermarked";
      }

      // authoritative dims (provider may not report them)
      let width = out.width;
      let height = out.height;
      if (!width || !height) {
        const meta = await sharp(Buffer.from(bytes)).metadata();
        width = meta.width ?? 0;
        height = meta.height ?? 0;
      }

      const path = `${job.user_id}/${job.id}.png`;
      await uploadObject(svc, BUCKET_OUTPUTS, path, bytes, mime);

      const asset = await insertAsset(svc, {
        job_id: job.id,
        user_id: job.user_id,
        storage_path: path,
        kind,
        width: width || null,
        height: height || null,
        mime,
        delete_after: null,
      });

      await setJobStatus(svc, job.id, "done", {
        asset_id: asset.id,
        finished_at: new Date().toISOString(),
      });

      // Immediate selfie purge (spec §7): once no jobs for this batch remain
      // queued/processing, delete the batch's source selfies + their asset rows.
      // Best-effort: a purge failure must NOT flip the already-done job to failed
      // (the Phase 4 expire cron backstops orphaned selfies).
      try {
        const { count, error: countErr } = await svc
          .from("generation_jobs")
          .select("id", { count: "exact", head: true })
          .eq("batch_id", job.batch_id)
          .in("status", ["queued", "processing"]);
        if (!countErr && (count ?? 0) === 0 && selfiePaths.length > 0) {
          await removeObjects(svc, BUCKET_SELFIES, selfiePaths);
          await svc
            .from("assets")
            .delete()
            .eq("user_id", job.user_id)
            .eq("kind", "source_selfie")
            .in("storage_path", selfiePaths);
        }
      } catch {
        // swallow — orphaned selfies are reclaimed by the expire cron
      }
    } catch (e) {
      const error_code =
        e instanceof ModerationBlockedError
          ? "moderation_blocked"
          : (e as { code?: string })?.code === "no_image"
            ? "no_image"
            : "generation_failed";
      await refundHold(svc, { user_id: job.user_id, amount, job_id: job.id });
      await setJobStatus(svc, job.id, "failed", {
        error_code,
        finished_at: new Date().toISOString(),
      });
    } finally {
      await queueDelete(svc, msgId);
      processed++;
    }
  }

  return Response.json({ processed }, { status: 200 });
}
