import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

test("supabase import", async () => {
  expect(typeof createClient).toBe("function");
});
