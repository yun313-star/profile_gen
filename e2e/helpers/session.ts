/**
 * E2E helper: mint a confirmed Supabase test user via the admin API and
 * return the full session so callers can inject it as a cookie directly.
 *
 * The signup trigger (`0004_signup_trigger.sql`) automatically creates the
 * user's `profiles` row and grants 3 FREE_SIGNUP_CREDITS, so by the time
 * `signInWithPassword` resolves the user is fully set up in the DB.
 */
import { createClient, type Session } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export interface TestSession {
  userId: string;
  session: Session;
}

export async function createTestUserSession(
  email: string,
  password = "test-pass-12345",
): Promise<TestSession> {
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });

  // Clean any prior user with this email (best-effort; ignore delete errors).
  const { data: list } = await admin.auth.admin.listUsers();
  const existing = list?.users.find((u) => u.email === email);
  if (existing) await admin.auth.admin.deleteUser(existing.id);

  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name: "E2E 테스터" },
  });
  if (error) throw error;

  // Sign in with the anon client to obtain a real session.
  const anon = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data: signin, error: signErr } = await anon.auth.signInWithPassword({
    email,
    password,
  });
  if (signErr) throw signErr;

  return {
    userId: created.user!.id,
    session: signin.session!,
  };
}
