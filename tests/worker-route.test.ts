// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const queueRead = vi.fn();
const queueDelete = vi.fn();
vi.mock("@/lib/queue", () => ({
  queueRead: (...a: any[]) => queueRead(...a),
  queueDelete: (...a: any[]) => queueDelete(...a),
}));

const getJob = vi.fn();
const setJobStatus = vi.fn();
const insertAsset = vi.fn();
vi.mock("@/lib/db", () => ({
  getJob: (...a: any[]) => getJob(...a),
  setJobStatus: (...a: any[]) => setJobStatus(...a),
  insertAsset: (...a: any[]) => insertAsset(...a),
}));

const refundHold = vi.fn();
vi.mock("@/lib/credits", () => ({ refundHold: (...a: any[]) => refundHold(...a) }));

const createSignedUrl = vi.fn();
const uploadObject = vi.fn();
const removeObjects = vi.fn();
vi.mock("@/lib/storage", () => ({
  createSignedUrl: (...a: any[]) => createSignedUrl(...a),
  uploadObject: (...a: any[]) => uploadObject(...a),
  removeObjects: (...a: any[]) => removeObjects(...a),
  BUCKET_SELFIES: "selfies",
  BUCKET_OUTPUTS: "outputs",
}));

const generateImage = vi.fn();
vi.mock("@/lib/models/router", () => ({ generateImage: (...a: any[]) => generateImage(...a) }));

const applyWatermark = vi.fn();
vi.mock("@/lib/watermark", () => ({ applyWatermark: (...a: any[]) => applyWatermark(...a) }));

import { ModerationBlockedError } from "@/lib/models/types";

const presetSingle = vi.fn();
const remainingJobs = vi.fn(); // generation_jobs active-in-batch count query
const deleteSelfieRows = vi.fn(); // assets delete (source_selfie purge)
const svc: any = {
  from: (table: string) => {
    if (table === "generation_jobs") {
      return { select: () => ({ eq: () => ({ in: () => remainingJobs() }) }) };
    }
    if (table === "assets") {
      return { delete: () => ({ eq: () => ({ eq: () => ({ in: () => deleteSelfieRows() }) }) }) };
    }
    // style_presets
    return { select: () => ({ eq: () => ({ single: () => presetSingle() }) }) };
  },
};
vi.mock("@/lib/supabase/service", () => ({ createServiceSupabase: () => svc }));

import { POST } from "@/app/api/jobs/worker/route";

const PRESET = { id: "p1", model_key: "gpt-image-2", prompt_template: "x", size: "1024x1536", quality: "high", credit_cost: 1, family: "business" };

function req() {
  return new Request("http://t/api/jobs/worker", {
    method: "POST",
    headers: { Authorization: "Bearer secret" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "secret";
  vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([1, 2, 3]))));
  presetSingle.mockResolvedValue({ data: PRESET, error: null });
  remainingJobs.mockResolvedValue({ count: 0, error: null });
  deleteSelfieRows.mockResolvedValue({ error: null });
  removeObjects.mockResolvedValue(undefined);
  createSignedUrl.mockResolvedValue("https://signed/selfie");
  generateImage.mockResolvedValue({ bytes: new Uint8Array([9, 9, 9]), mime: "image/png", width: 1024, height: 1536 });
  uploadObject.mockResolvedValue(undefined);
  insertAsset.mockResolvedValue({ id: "asset-1" });
});

describe("POST /api/jobs/worker", () => {
  it("rejects without the cron secret", async () => {
    const res = await POST(new Request("http://t/api/jobs/worker", { method: "POST" }));
    expect(res.status).toBe(401);
  });

  it("processes a queued job: generate → upload → insertAsset → done → ack", async () => {
    queueRead.mockResolvedValue([{ msgId: 1, message: { job_id: "j1", selfie_paths: ["u/b/0.png"] } }]);
    getJob.mockResolvedValue({ id: "j1", user_id: "u", status: "queued", style_preset_id: "p1", is_watermarked: false, batch_id: "b1" });

    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(generateImage).toHaveBeenCalledTimes(1);
    expect(uploadObject).toHaveBeenCalledWith(svc, "outputs", "u/j1.png", expect.any(Uint8Array), "image/png");
    expect(setJobStatus).toHaveBeenCalledWith(svc, "j1", "done", expect.objectContaining({ asset_id: "asset-1" }));
    expect(queueDelete).toHaveBeenCalledWith(svc, 1);
    expect(refundHold).not.toHaveBeenCalled();
  });

  it("IDEMPOTENCY: skips a job already past queued without paying", async () => {
    queueRead.mockResolvedValue([{ msgId: 2, message: { job_id: "jdone", selfie_paths: ["p"] } }]);
    getJob.mockResolvedValue({ id: "jdone", user_id: "u", status: "done", style_preset_id: "p1", is_watermarked: false });

    await POST(req());
    expect(generateImage).not.toHaveBeenCalled();
    expect(setJobStatus).not.toHaveBeenCalled();
    expect(queueDelete).toHaveBeenCalledWith(svc, 2); // still acked
  });

  it("watermarks free jobs and records kind=watermarked", async () => {
    queueRead.mockResolvedValue([{ msgId: 3, message: { job_id: "jf", selfie_paths: ["p"] } }]);
    getJob.mockResolvedValue({ id: "jf", user_id: "u", status: "queued", style_preset_id: "p1", is_watermarked: true });
    applyWatermark.mockResolvedValue(new Uint8Array([7, 7]));

    await POST(req());
    expect(applyWatermark).toHaveBeenCalledWith(expect.any(Uint8Array), { label: "AI 생성" });
    expect(insertAsset).toHaveBeenCalledWith(svc, expect.objectContaining({ kind: "watermarked" }));
  });

  it("REFUND: on ModerationBlockedError refunds hold and marks failed", async () => {
    queueRead.mockResolvedValue([{ msgId: 4, message: { job_id: "jb", selfie_paths: ["p"] } }]);
    getJob.mockResolvedValue({ id: "jb", user_id: "u", status: "queued", style_preset_id: "p1", is_watermarked: false });
    generateImage.mockRejectedValue(new ModerationBlockedError("blocked"));

    await POST(req());
    expect(refundHold).toHaveBeenCalledWith(svc, { user_id: "u", amount: 1, job_id: "jb" });
    expect(setJobStatus).toHaveBeenCalledWith(svc, "jb", "failed", expect.objectContaining({ error_code: "moderation_blocked" }));
    expect(queueDelete).toHaveBeenCalledWith(svc, 4);
  });

  it("ERROR CODES: a structurally-empty result → no_image, refunds + failed", async () => {
    queueRead.mockResolvedValue([{ msgId: 7, message: { job_id: "jn", selfie_paths: ["p"] } }]);
    getJob.mockResolvedValue({ id: "jn", user_id: "u", status: "queued", style_preset_id: "p1", is_watermarked: false, batch_id: "b1" });
    generateImage.mockResolvedValue({ bytes: new Uint8Array([]), mime: "image/png", width: 0, height: 0 });

    await POST(req());
    expect(refundHold).toHaveBeenCalledWith(svc, { user_id: "u", amount: 1, job_id: "jn" });
    expect(setJobStatus).toHaveBeenCalledWith(svc, "jn", "failed", expect.objectContaining({ error_code: "no_image" }));
  });

  it("PURGE: deletes the batch's source selfies once no active jobs remain", async () => {
    queueRead.mockResolvedValue([{ msgId: 5, message: { job_id: "jp", selfie_paths: ["u/b1/0.png", "u/b1/1.png"] } }]);
    getJob.mockResolvedValue({ id: "jp", user_id: "u", status: "queued", style_preset_id: "p1", is_watermarked: false, batch_id: "b1" });
    remainingJobs.mockResolvedValue({ count: 0, error: null });

    await POST(req());
    expect(removeObjects).toHaveBeenCalledWith(svc, "selfies", ["u/b1/0.png", "u/b1/1.png"]);
  });

  it("PURGE: keeps selfies while sibling jobs in the batch are still active", async () => {
    queueRead.mockResolvedValue([{ msgId: 6, message: { job_id: "jp2", selfie_paths: ["u/b1/0.png"] } }]);
    getJob.mockResolvedValue({ id: "jp2", user_id: "u", status: "queued", style_preset_id: "p1", is_watermarked: false, batch_id: "b1" });
    remainingJobs.mockResolvedValue({ count: 2, error: null });

    await POST(req());
    expect(removeObjects).not.toHaveBeenCalled();
  });

  it("ERROR CODES: a generic generateImage error → generation_failed, refunds + failed", async () => {
    queueRead.mockResolvedValue([{ msgId: 9, message: { job_id: "jg", selfie_paths: ["p"] } }]);
    getJob.mockResolvedValue({ id: "jg", user_id: "u", status: "queued", style_preset_id: "p1", is_watermarked: false, batch_id: "b1" });
    generateImage.mockRejectedValue(new Error("boom"));

    await POST(req());
    expect(refundHold).toHaveBeenCalledWith(svc, { user_id: "u", amount: 1, job_id: "jg" });
    expect(setJobStatus).toHaveBeenCalledWith(svc, "jg", "failed", expect.objectContaining({ error_code: "generation_failed" }));
  });

  it("PURGE best-effort: a purge failure does NOT flip the done job to failed", async () => {
    queueRead.mockResolvedValue([{ msgId: 10, message: { job_id: "jpb", selfie_paths: ["u/b1/0.png"] } }]);
    getJob.mockResolvedValue({ id: "jpb", user_id: "u", status: "queued", style_preset_id: "p1", is_watermarked: false, batch_id: "b1" });
    remainingJobs.mockResolvedValue({ count: 0, error: null });
    removeObjects.mockRejectedValue(new Error("storage down"));

    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(setJobStatus).toHaveBeenCalledWith(svc, "jpb", "done", expect.objectContaining({ asset_id: "asset-1" }));
    expect(setJobStatus).not.toHaveBeenCalledWith(svc, "jpb", "failed", expect.anything());
    expect(refundHold).not.toHaveBeenCalled();
  });
});
