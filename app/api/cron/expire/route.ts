import { createServiceSupabase } from "@/lib/supabase/service";
import { purgeExpiredSelfies } from "@/lib/account";
import { requireCron } from "@/lib/cron";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = requireCron(req);
  if (denied) return denied;
  const sb = createServiceSupabase();
  const { purged } = await purgeExpiredSelfies(sb);
  return Response.json({ ok: true, purged });
}
