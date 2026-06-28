import { test, expect, type BrowserContext } from "@playwright/test";
import { createTestUserSession } from "./session-helper";

function encodeSessionCookies(
  cookieName: string,
  session: object,
): Array<{ name: string; value: string }> {
  const json = JSON.stringify(session);
  const encoded = "base64-" + Buffer.from(json).toString("base64url");
  const MAX = 3180;
  if (encoded.length <= MAX) return [{ name: cookieName, value: encoded }];
  const chunks: Array<{ name: string; value: string }> = [];
  for (let i = 0; i * MAX < encoded.length; i++) {
    chunks.push({ name: `${cookieName}.${i}`, value: encoded.slice(i * MAX, (i + 1) * MAX) });
  }
  return chunks;
}

async function authenticate(context: BrowserContext, email: string) {
  const { session } = await createTestUserSession(email);
  const projectRef = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split(".")[0];
  const cookieName = `sb-${projectRef}-auth-token`;
  const cookiePairs = encodeSessionCookies(cookieName, session);
  await context.addCookies(cookiePairs.map(({ name, value }) => ({
    name, value, domain: "localhost", path: "/", httpOnly: false, secure: false,
    sameSite: "Lax" as const,
  })));
}

test("buffer test", async ({ context }) => {
  expect(typeof authenticate).toBe("function");
});
