// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const setJobStatus = vi.fn();
vi.mock("@/lib/db", () => ({ setJobStatus: (...a: any[]) => setJobStatus(...a) }));

const refundHold = vi.fn();
vi.mock("@/lib/credits", () => ({ refundHold: (...a: any[]) => refundHold(...a) }));

const stuckSelect = vi.fn();
const svc: any = {
  from: () => ({
    select: () => ({ eq: () => ({ is: () => ({ lt: () => stuckSelect() }) }) }),
  }),
};
vi.mock("@/lib/supabase/service", () => ({ createServiceSupabase: () => svc }));

import { GET } from "@/app/api/cron/reap/route";

function req(secret = "secret") {
  return new Request("http://t/api/cron/reap", {
    headers: { Authorization: `Bearer ${secret}` },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "secret";
  stuckSelect.mockResolvedValue({ data: [], error: null });
});

describe("GET /api/cron/reap", () => {
  it("rejects without the cron secret", async () => {
    const res = await GET(new Request("http://t/api/cron/reap"));
    expect(res.status).toBe(401);
  });

  it("refunds + fails each stuck processing job", async () => {
    stuckSelect.mockResolvedValue({
      data: [
        { id: "j1", user_id: "u1", style_presets: { credit_cost: 2 } },
        { id: "j2", user_id: "u2", style_presets: { credit_cost: 1 } },
      ],
      error: null,
    });

    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ reaped: 2 });

    expect(refundHold).toHaveBeenCalledWith(svc, { user_id: "u1", amount: 2, job_id: "j1" });
    expect(refundHold).toHaveBeenCalledWith(svc, { user_id: "u2", amount: 1, job_id: "j2" });
    expect(setJobStatus).toHaveBeenCalledWith(
      svc,
      "j1",
      "failed",
      expect.objectContaining({ error_code: "generation_failed" }),
    );
  });

  it("does nothing when no jobs are stuck", async () => {
    const res = await GET(req());
    expect(await res.json()).toEqual({ reaped: 0 });
    expect(refundHold).not.toHaveBeenCalled();
    expect(setJobStatus).not.toHaveBeenCalled();
  });
});
