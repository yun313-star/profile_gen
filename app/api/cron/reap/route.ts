import { createServiceSupabase } from "@/lib/supabase/service";
import { setJobStatus } from "@/lib/db";
import { refundHold } from "@/lib/credits";
import { requireCron } from "@/lib/cron";

export const runtime = "nodejs";

const STUCK_MINUTES = 10;

export async function GET(req: Request): Promise<Response> {
  const denied = requireCron(req);
  if (denied) return denied;

  const svc = createServiceSupabase();
  const cutoff = new Date(Date.now() - STUCK_MINUTES * 60 * 1000).toISOString();

  // jobs wedged in `processing` past the cutoff (worker crashed mid-flight)
  const { data: stuck, error } = await svc
    .from("generation_jobs")
    .select("id,user_id,style_preset_id,style_presets(credit_cost)")
    .eq("status", "processing")
    .is("finished_at", null)
    .lt("created_at", cutoff);
  if (error) throw error;

  let reaped = 0;
  for (const j of (stuck ?? []) as Array<{
    id: string;
    user_id: string;
    style_presets?: { credit_cost?: number } | null;
  }>) {
    const amount = j.style_presets?.credit_cost ?? 1;
    await refundHold(svc, { user_id: j.user_id, amount, job_id: j.id });
    await setJobStatus(svc, j.id, "failed", {
      error_code: "generation_failed",
      finished_at: new Date().toISOString(),
    });
    reaped++;
  }

  return Response.json({ reaped }, { status: 200 });
}
