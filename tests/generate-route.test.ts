// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const getUser = vi.fn();
const consentSelect = vi.fn();
const profileSingle = vi.fn();
const presetSingle = vi.fn();

// NOTE: @/lib/consent is NOT mocked — the route must consume the REAL
// REQUIRED_CONSENTS (incl. "tos") + hasRequiredConsents() from Phase 1.

// cookie-bound client: auth + consents + profiles (age) + style_presets reads
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: () => ({
    auth: { getUser },
    from: (table: string) => {
      if (table === "consents") {
        return { select: () => ({ eq: () => consentSelect() }) };
      }
      if (table === "profiles") {
        return { select: () => ({ eq: () => ({ single: () => profileSingle() }) }) };
      }
      // style_presets
      return { select: () => ({ eq: () => ({ eq: () => ({ single: () => presetSingle() }) }) }) };
    },
  }),
}));

const svc = { _tag: "svc" };
vi.mock("@/lib/supabase/service", () => ({ createServiceSupabase: () => svc }));

const debitCredits = vi.fn();
const refundHold = vi.fn();
vi.mock("@/lib/credits", () => ({
  debitCredits: (...a: any[]) => debitCredits(...a),
  refundHold: (...a: any[]) => refundHold(...a),
}));

const insertJobs = vi.fn();
vi.mock("@/lib/db", () => ({ insertJobs: (...a: any[]) => insertJobs(...a) }));

const uploadObject = vi.fn();
vi.mock("@/lib/storage", () => ({
  uploadObject: (...a: any[]) => uploadObject(...a),
  BUCKET_SELFIES: "selfies",
}));

const queueSend = vi.fn();
vi.mock("@/lib/queue", () => ({ queueSend: (...a: any[]) => queueSend(...a) }));

import { POST } from "@/app/api/generate/route";

const USER = { id: "11111111-1111-1111-1111-111111111111" };
const PRESET = {
  id: "biz_headshot",
  family: "business",
  model_key: "gpt-image-2",
  prompt_template: "x",
  size: "1024x1536",
  quality: "high",
  credit_cost: 1,
  is_active: true,
};

function buildReq(count: number, files = 1) {
  const fd = new FormData();
  fd.set("styleId", "biz_headshot");
  fd.set("count", String(count));
  for (let i = 0; i < files; i++) {
    fd.append("selfies", new File([new Uint8Array([1, 2, 3])], `s${i}.png`, { type: "image/png" }));
  }
  return new Request("http://t/api/generate", { method: "POST", body: fd });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn(async () => new Response("ok")));
  process.env.APP_BASE_URL = "http://t";
  process.env.CRON_SECRET = "secret";
  getUser.mockResolvedValue({ data: { user: USER }, error: null });
  consentSelect.mockResolvedValue({
    data: [{ type: "tos" }, { type: "privacy" }, { type: "sensitive_face" }, { type: "own_face" }],
    error: null,
  });
  profileSingle.mockResolvedValue({ data: { age_verified: true }, error: null });
  presetSingle.mockResolvedValue({ data: PRESET, error: null });
  uploadObject.mockResolvedValue(undefined);
  debitCredits.mockImplementation(async () => 100 + Math.floor(Math.random() * 1000));
  insertJobs.mockImplementation(async (_sb: any, jobs: any[]) => jobs);
  queueSend.mockResolvedValue(undefined);
});

describe("POST /api/generate", () => {
  it("holds N credits, inserts N jobs, enqueues N messages, returns 202", async () => {
    const res = await POST(buildReq(3));
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.batchId).toBeTruthy();
    expect(body.jobIds).toHaveLength(3);
    expect(debitCredits).toHaveBeenCalledTimes(3);
    expect(insertJobs).toHaveBeenCalledTimes(1);
    const jobsArg = insertJobs.mock.calls[0][1];
    expect(jobsArg).toHaveLength(3);
    expect(jobsArg[0]).toMatchObject({
      user_id: USER.id,
      style_preset_id: "biz_headshot",
      model_key: "gpt-image-2",
      status: "queued",
      is_watermarked: false,
    });
    expect(jobsArg[0].hold_ledger_id).toBeTypeOf("number");
    expect(queueSend).toHaveBeenCalledTimes(3);
    // non-awaited worker kick
    expect((globalThis.fetch as any)).toHaveBeenCalledWith(
      "http://t/api/jobs/worker",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("returns 401 when unauthenticated", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const res = await POST(buildReq(1));
    expect(res.status).toBe(401);
  });

  it("returns 403 when a required consent is missing", async () => {
    consentSelect.mockResolvedValue({ data: [{ type: "privacy" }], error: null });
    const res = await POST(buildReq(1));
    expect(res.status).toBe(403);
    expect(debitCredits).not.toHaveBeenCalled();
  });

  it("treats 'tos' as required (missing tos → 403)", async () => {
    // all consents present EXCEPT "tos" → must still fail
    consentSelect.mockResolvedValue({
      data: [{ type: "privacy" }, { type: "sensitive_face" }, { type: "own_face" }],
      error: null,
    });
    const res = await POST(buildReq(1));
    expect(res.status).toBe(403);
    expect(debitCredits).not.toHaveBeenCalled();
  });

  it("returns 403 when age is not verified (before any hold/enqueue)", async () => {
    profileSingle.mockResolvedValue({ data: { age_verified: false }, error: null });
    const res = await POST(buildReq(1));
    expect(res.status).toBe(403);
    expect(debitCredits).not.toHaveBeenCalled();
    expect(insertJobs).not.toHaveBeenCalled();
    expect(queueSend).not.toHaveBeenCalled();
  });

  it("returns 400 for count out of range", async () => {
    const res = await POST(buildReq(9));
    expect(res.status).toBe(400);
  });

  it("rolls back holds and returns 402 on insufficient credits", async () => {
    debitCredits.mockReset();
    debitCredits.mockResolvedValueOnce(501).mockRejectedValueOnce(new Error("INSUFFICIENT_CREDITS"));
    const res = await POST(buildReq(2));
    expect(res.status).toBe(402);
    expect(refundHold).toHaveBeenCalledTimes(1); // one successful hold rolled back
    expect(insertJobs).not.toHaveBeenCalled();
    expect(queueSend).not.toHaveBeenCalled();
  });

  it("marks free-family presets as watermarked", async () => {
    presetSingle.mockResolvedValue({
      data: { ...PRESET, family: "free", model_key: "gpt-image-1-mini" },
      error: null,
    });
    const res = await POST(buildReq(1));
    expect(res.status).toBe(202);
    const jobsArg = insertJobs.mock.calls[0][1];
    expect(jobsArg[0].is_watermarked).toBe(true);
  });
});
