import { expect, test } from "@playwright/test";

// Buy-flow E2E: 구매 → (stubbed PayApp create) → simulate PayApp's server-to-server
// feedback (forged-but-valid with TEST secrets) → result page flips to 충전 완료.
// NO real money: the /api/payments/payapp/create call is stubbed at the browser
// boundary and the feedback is simulated via an authenticated request.
//
// Requires: dev server started with E2E=1 + TEST PayApp secrets
// (PAYAPP_USERID=testuser, PAYAPP_LINKKEY=lk_test, PAYAPP_VALUE=val_test) and an
// authenticated storageState (Phase-2 auth setup project).
//
// NOTE: in THIS local environment the Playwright RUNNER cannot start (exits 127,
// a Git-Bash/Windows/sandbox toolchain issue — see task-1.18-report.md), and the
// authenticated storageState fixture is not yet wired. So this is test.fixme. The
// buy correctness is authoritatively proven by the create-route + feedback-route
// Vitest suites (idempotent grant, amount gate, forged-reject). Unskip once the
// auth-setup project and a working runner are available in CI.
test.fixme("user buys starter pack and credits flip to completed", async ({ page, request, baseURL }) => {
  // Stub the create call to return a fake payurl (no real PayApp).
  await page.route("**/api/payments/payapp/create", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ payurl: `${baseURL}/credits`, order_id: "e2e-order" }),
    });
  });

  await page.goto("/credits");
  await expect(page.getByRole("heading", { name: "크레딧 충전" })).toBeVisible();

  await page.getByRole("button", { name: "구매" }).first().click();

  const orderId = await page.evaluate(() => window.localStorage.getItem("e2e_last_order"));
  expect(orderId, "create route should stash order id for e2e").toBeTruthy();

  // Simulate PayApp's server-to-server feedback for the order.
  const fb = await request.post("/api/payments/payapp/feedback", {
    form: {
      userid: "testuser",
      linkkey: "lk_test",
      linkval: "val_test",
      mul_no: "E2E-MUL",
      var1: orderId!,
      var2: "e2e-user",
      price: "9900",
      pay_state: "4",
      pay_type: "1",
    },
  });
  expect(fb.status()).toBe(200);
  expect(await fb.text()).toBe("SUCCESS");

  // Result page shows completed after polling.
  await page.goto(`/credits/result?order=${orderId}`);
  await expect(page.getByText("충전이 완료되었습니다.")).toBeVisible({ timeout: 10_000 });
});
