import { test, expect } from "@playwright/test";
import { createTestUserSession } from "./helpers/session";

test("import test", async () => {
  expect(typeof createTestUserSession).toBe("function");
});
