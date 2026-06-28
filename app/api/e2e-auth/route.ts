/**
 * TEST-ONLY endpoint — not reachable in production (guarded by NODE_ENV check).
 *
 * Playwright E2E tests POST { accessToken, refreshToken } here to mint a
 * Supabase session cookie in the browser context without doing a real OAuth
 * round-trip.  The `createServerClient` call triggers the @supabase/ssr
 * `setAll` callback which writes the session as Set-Cookie headers on the
 * response; the browser stores them and sends them on all subsequent requests.
 *
 * Why not esm.sh? Remote imports can be blocked in sandboxed environments.
 * This route uses the app's own bundled @supabase/ssr, always available.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not Found", { status: 404 });
  }

  const { accessToken, refreshToken } = (await request.json()) as {
    accessToken: string;
    refreshToken: string;
  };

  const response = NextResponse.json({ ok: true });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>,
        ) {
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2]);
          }
        },
      },
    },
  );

  await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  return response;
}
