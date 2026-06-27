import "server-only";
import { createServerClient } from "@supabase/ssr";

/**
 * Service-role Supabase client. Bypasses RLS. SERVER-ONLY.
 * Use in worker, payapp feedback handler, and cron routes.
 * No cookies: it must not act on behalf of a logged-in user.
 */
export function createServiceSupabase() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      cookies: { getAll: () => [], setAll: () => {} },
    },
  );
}
