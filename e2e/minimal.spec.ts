import { test, expect } from "@playwright/test";
test("minimal test", async ({ page }) => {
  await expect(1 + 1).toBe(2);
});
