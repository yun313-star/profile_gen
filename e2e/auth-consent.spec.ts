/**
 * E2E: login redirect + consent gate (Task 1.18)
 *
 * OAuth is STUBBED: we mint a Supabase session for a test user via the
 * service-role admin API (no real Kakao/Google round-trip).
 *
 * Session injection method: direct Playwright cookie injection.
 * @supabase/ssr v0.6+ (createServerClient) stores sessions as
 * "base64-<base64url_json>" cookies named `sb-<projectRef>-auth-token`
 * where projectRef = new URL(supabaseUrl).hostname.split('.')[0].
 * For http://127.0.0.1:54321 the cookie is `sb-127-auth-token`.
 *
 * We bypass the /api/e2e-auth route (which calls setSession server-side and
 * can trigger a GoTrue getUser() + implicit refresh that produces a new JWT
 * with a Windows-machine iat, sometimes rejected by Docker/WSL2 PostgREST
 * due to sub-second clock skew). Direct injection keeps the exact JWT issued
 * by GoTrue, which PostgREST accepts without issue.
 *
 * Requires: `supabase start` running (Docker) + .env.local with local keys.
 */
import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { createTestUserSession } from "./session-helper";

/**
 * Encode a Supabase session as the @supabase/ssr cookie value.
 * Format: "base64-<base64url_encoded_session_json>"
 * Chunked at MAX_CHUNK_SIZE=3180 if the value exceeds that limit.
 */
function encodeSessionCookies(
  cookieName: string,
  session: object,
): Array<{ name: string; value: string }> {
  const json = JSON.stringify(session);
  const encoded = "base64-" + Buffer.from(json).toString("base64url");
  const MAX = 3180;
  if (encoded.length <= MAX) {
    return [{ name: cookieName, value: encoded }];
  }
  // Chunk if needed (rare for local Supabase sessions, but handled for safety).
  const chunks: Array<{ name: string; value: string }> = [];
  for (let i = 0; i * MAX < encoded.length; i++) {
    chunks.push({ name: `${cookieName}.${i}`, value: encoded.slice(i * MAX, (i + 1) * MAX) });
  }
  return chunks;
}

/** Inject a Supabase session directly as browser cookies (no server round-trip). */
async function authenticate(context: BrowserContext, email: string) {
  const { session } = await createTestUserSession(email);

  // Derive the cookie name from the local Supabase URL.
  const projectRef = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split(".")[0];
  const cookieName = `sb-${projectRef}-auth-token`;

  const cookiePairs = encodeSessionCookies(cookieName, session);
  await context.addCookies(
    cookiePairs.map(({ name, value }) => ({
      name,
      value,
      domain: "localhost",
      path: "/",
      httpOnly: false,
      secure: false,
      sameSite: "Lax" as const,
    })),
  );
}

// ─── Test 1: Landing page ───────────────────────────────────────────────────

test("landing shows the free-credit hook", async ({ page }) => {
  await page.goto("/");
  // app/page.tsx: <p>가입 즉시 무료 {FREE_SIGNUP_CREDITS}크레딧</p>
  await expect(page.getByText(/무료 3크레딧/)).toBeVisible();
  // app/page.tsx: <Link href="/login">무료로 시작하기</Link>
  await expect(page.getByRole("link", { name: "무료로 시작하기" })).toBeVisible();
});

// ─── Test 2: Unauthenticated redirect ────────────────────────────────────────

test("unauthenticated /create redirects to /login", async ({ page }) => {
  await page.goto("/create");
  await expect(page).toHaveURL(/\/login/);
});

// ─── Test 3: Consent gate ────────────────────────────────────────────────────

test("authenticated-but-unconsented user is gated, then reaches /create after consent", async ({
  page,
  context,
}) => {
  await authenticate(context, `e2e+${Date.now()}@test.dev`);

  // Authenticated user hitting /create → gated to consent onboarding.
  // app/create/page.tsx: if (!hasRequiredConsents(agreed)) redirect("/onboarding/consent")
  await page.goto("/create");
  await expect(page).toHaveURL(/\/onboarding\/consent/);

  // consent-form.tsx: submit disabled until birthdate + all required checkboxes
  const submit = page.getByRole("button", { name: "동의하고 시작하기" });
  await expect(submit).toBeDisabled();

  // consent-form.tsx: <input type="date" name="birthdate" />
  await page.locator('input[name="birthdate"]').fill("2000-01-01");

  // consent-form.tsx: <label>...<input onChange={toggleAll} />전체 동의</label>
  // Clicking the label text triggers toggleAll(true) → all consent checkboxes checked.
  await page.getByText("전체 동의").click();
  await expect(submit).toBeEnabled();

  // Submit → server action → records consents → redirect("/create")
  await submit.click();

  // app/create/page.tsx: <h1>스튜디오</h1>
  await expect(page).toHaveURL(/\/create/);
  await expect(page.getByRole("heading", { name: "스튜디오" })).toBeVisible();

  // components/nav.tsx: <span aria-label="보유 크레딧">크레딧 {balance}</span>
  // The signup trigger granted 3 free credits.
  await expect(page.getByLabel("보유 크레딧")).toContainText("3");
});
