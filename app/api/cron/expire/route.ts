import { createServiceSupabase } from "@/lib/supabase/service";
import { purgeExpiredSelfies } from "@/lib/account";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const sb = createServiceSupabase();
  const { purged } = await purgeExpiredSelfies(sb);
  return Response.json({ ok: true, purged });
}
