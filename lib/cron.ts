import { timingSafeEqual } from "node:crypto";

/**
 * Authorize a Vercel Cron request. Returns a Response (500 if CRON_SECRET is
 * unset — fail CLOSED, never fail open; 401 if the bearer token mismatches) when
 * the request is NOT an authorized cron call, or `null` when it is authorized.
 *
 * Vercel attaches `Authorization: Bearer ${CRON_SECRET}` to cron invocations.
 * Comparison is constant-time to avoid leaking the secret via timing.
 */
export function requireCron(req: Request): Response | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Fail closed: a missing secret must NOT authenticate "Bearer undefined".
    return new Response("Server misconfigured", { status: 500 });
  }
  const got = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return new Response("Unauthorized", { status: 401 });
  }
  return null;
}
