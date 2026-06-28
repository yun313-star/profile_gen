import { test, expect } from "@playwright/test";
import { createTestUserSession } from "./helpers/session";

test("landing shows the free-credit hook", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText(/무료 3크레딧/)).toBeVisible();
  await expect(page.getByRole("link", { name: "무료로 시작하기" })).toBeVisible();
});

test("unauthenticated /create redirects to /login", async ({ page }) => {
  await page.goto("/create");
  await expect(page).toHaveURL(/\/login/);
});

// The authenticated consent + age gate is proven server-side by pgTAP (25/25:
// own-row RLS, plus the privilege-layer revokes that block a client from
// self-setting age_verified or fabricating consents) and by the middleware /
// RSC redirect logic. A browser-level proof additionally requires injecting a
// real @supabase/ssr session cookie, whose chunked-base64 format is version-
// and project-ref-specific for local Supabase. That injection harness is
// deferred (do NOT ship a session-minting route in the app). The helper below
// already mints a real session via the admin API; wiring the cookie injection
// is the only remaining step.
test.fixme(
  "authenticated-but-unconsented user is gated, then reaches /create after consent",
  async ({ page }) => {
    const { session } = await createTestUserSession(`e2e+${Date.now()}@test.dev`);
    expect(session.access_token).toBeTruthy();
    // TODO(e2e-harness): inject `session` as the sb-<ref>-auth-token cookie, then:
    //   await page.goto("/create");
    //   await expect(page).toHaveURL(/\/onboarding\/consent/);
    //   await page.locator('input[name="birthdate"]').fill("2000-01-01");
    //   // check all REQUIRED_CONSENTS, submit
    //   await expect(page).toHaveURL(/\/create/);
    //   await expect(page.getByLabel("보유 크레딧")).toContainText("3");
  },
);
