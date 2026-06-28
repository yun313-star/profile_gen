// Same content as session.ts inline, to see if the module path is the issue
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

async function createTestUserSession(email: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  return admin;
}

test("inline session", async () => {
  expect(typeof createTestUserSession).toBe("function");
});
