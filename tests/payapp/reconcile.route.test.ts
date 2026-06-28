import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const lt = vi.fn();
const not = vi.fn();
const eq = vi.fn();
const select = vi.fn();
const from = vi.fn();

// Chainable Supabase query stub: from().select().eq().not().lt() resolves to {data,error}.
function makeSb(rows: unknown[]) {
  const builder: Record<string, unknown> = {};
  const ret = () => builder;
  builder.select = vi.fn(ret);
  builder.eq = vi.fn(ret);
  builder.not = vi.fn(ret);
  builder.lt = vi.fn(async () => ({ data: rows, error: null }));
  return { from: vi.fn(() => builder) };
}

vi.mock("@/lib/supabase/service", () => ({ createServiceSupabase: () => makeSb(((globalThis as unknown) as Record<string, unknown[]>).__rows ?? []) }));

beforeEach(() => { process.env.CRON_SECRET = "cron_secret_xyz"; });
afterEach(() => { vi.clearAllMocks(); delete (globalThis as Record<string, unknown>).__rows; });

function req(auth?: string) {
  return new Request("https://app.example.com/api/cron/reconcile", {
    headers: auth ? { authorization: auth } : {},
  });
}

describe("GET /api/cron/reconcile", () => {
  it("401 without bearer secret", async () => {
    const { GET } = await import("@/app/api/cron/reconcile/route");
    expect((await GET(req())).status).toBe(401);
  });

  it("401 with wrong secret", async () => {
    const { GET } = await import("@/app/api/cron/reconcile/route");
    expect((await GET(req("Bearer nope"))).status).toBe(401);
  });

  it("200 and reports stale PENDING count with manual note", async () => {
    (globalThis as Record<string, unknown>).__rows = [{ id: "o1" }, { id: "o2" }];
    const { GET } = await import("@/app/api/cron/reconcile/route");
    const res = await GET(req("Bearer cron_secret_xyz"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.checked).toBe(2);
    expect(json.note).toContain("★");
  });
});
