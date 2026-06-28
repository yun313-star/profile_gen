import { test, expect } from "@playwright/test";

// Inline the session helper to test if relative import chain is the issue
async function createTestUserSession(email: string, password = "test-pass-12345") {
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: list } = await admin.auth.admin.listUsers();
  return list;
}

test("dynamic import test", async () => {
  expect(typeof createTestUserSession).toBe("function");
});
