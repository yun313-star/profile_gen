import { it, expect, vi, beforeEach } from "vitest";

const purgeMock = vi.fn();
vi.mock("@/lib/supabase/service", () => ({ createServiceSupabase: () => ({}) }));
vi.mock("@/lib/account", () => ({ purgeExpiredSelfies: (...a: unknown[]) => purgeMock(...a) }));

import { GET } from "@/app/api/cron/expire/route";

beforeEach(() => {
  purgeMock.mockReset();
  process.env.CRON_SECRET = "s3cret";
});

it("rejects requests without the correct bearer token", async () => {
  const res = await GET(new Request("http://x/api/cron/expire"));
  expect(res.status).toBe(401);
  expect(purgeMock).not.toHaveBeenCalled();
});

it("purges and returns the count when authorized", async () => {
  purgeMock.mockResolvedValue({ purged: 4 });
  const res = await GET(
    new Request("http://x/api/cron/expire", {
      headers: { authorization: "Bearer s3cret" },
    }),
  );
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true, purged: 4 });
  expect(purgeMock).toHaveBeenCalledTimes(1);
});
