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
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: list } = await admin.auth.admin.listUsers();
  const existing = list?.users.find((u) => u.email === email);
  if (existing) await admin.auth.admin.deleteUser(existing.id);
  const { data: created, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { name: "E2E 테스터" },
  });
  if (error) throw error;
  const anon = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data: signin, error: signErr } = await anon.auth.signInWithPassword({ email, password });
  if (signErr) throw signErr;
  return { userId: created.user!.id, session: signin.session! };
}
