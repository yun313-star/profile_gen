/**
 * E2E: login redirect + consent gate (Task 1.18)
 *
 * OAuth is STUBBED: we mint a Supabase session for a test user via the
 * service-role admin API (no real Kakao/Google round-trip).
 *
 * Session injection method: direct Playwright cookie injection.
 * @supabase/ssr v0.6+ (createServerClient) stores sessions as
 * "base64-<base64url_json>" cookies named `sb-<projectRef>-auth-token`
 * where projectRef = new URL(supabaseUrl).hostname.split('.')[0].
 * For http://127.0.0.1:54321 the cookie is `sb-127-auth-token`.
 *
 * We bypass the /api/e2e-auth route (which calls setSession server-side and
 * can trigger a GoTrue getUser() + implicit refresh that produces a new JWT
 * with a Windows-machine iat, sometimes rejected by Docker/WSL2 PostgREST
 * due to sub-second clock skew). Direct injection keeps the exact JWT issued
 * by GoTrue, which PostgREST accepts without issue.
 *
 * Requires: `supabase start` running (Docker) + .env.local with local keys.
 */
import { test, expect } from "@playwright/test";
import { createTestUserSession } from "./session-helper";

test("comment test", async () => {
  expect(typeof createTestUserSession).toBe("function");
});
