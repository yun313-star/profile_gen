import { test, expect } from "@playwright/test";
import { createTestUserSession } from "./session-helper";

// ─── Test 1: Landing page ───────────────────────────────────────────────────

test("unicode comment test", async () => {
  expect(typeof createTestUserSession).toBe("function");
});
