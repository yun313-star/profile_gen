import { test, expect } from "@playwright/test";
import { createTestUserSession } from "./session-helper";

test("flat import test", async () => {
  expect(typeof createTestUserSession).toBe("function");
});
