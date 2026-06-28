import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { createTestUserSession } from "./session-helper";

test("type import test", async ({ page, context }) => {
  expect(typeof createTestUserSession).toBe("function");
});
