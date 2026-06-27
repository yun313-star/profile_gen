import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  insertOrder,
  getOrder,
  updateOrder,
  markOrderPaidIfPending,
  markOrderRefundedIfPaid,
  insertJobs,
  getJob,
  setJobStatus,
  insertAsset,
} from "@/lib/db";

/** Build a chainable fake where each terminal returns { data, error }. */
function fakeSb(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  builder.insert = vi.fn(chain);
  builder.update = vi.fn(chain);
  builder.select = vi.fn(chain);
  builder.eq = vi.fn(chain);
  builder.in = vi.fn(chain);
  builder.single = vi.fn(async () => result);
  builder.maybeSingle = vi.fn(async () => result);
  builder.then = undefined;
  const from = vi.fn(() => builder);
  return { sb: { from } as unknown as SupabaseClient, from, builder };
}

it("insertOrder inserts into orders and returns the row", async () => {
  const order = {
    id: "o1", user_id: "u1", pack_id: "starter", expected_amount: 9900, credits: 10,
    status: "PENDING", payapp_mul_no: null, payapp_pay_state: null, payapp_pay_type: null,
    paid_at: null, created_at: "t",
  };
  const { sb, from, builder } = fakeSb({ data: order, error: null });
  const out = await insertOrder(sb, { user_id: "u1", pack_id: "starter", expected_amount: 9900, credits: 10 });
  expect(from).toHaveBeenCalledWith("orders");
  expect(builder.insert).toHaveBeenCalledWith(
    expect.objectContaining({ user_id: "u1", pack_id: "starter", expected_amount: 9900, credits: 10, status: "PENDING" }),
  );
  expect(out).toEqual(order);
});

it("getOrder returns null when not found", async () => {
  const { sb } = fakeSb({ data: null, error: null });
  expect(await getOrder(sb, "missing")).toBeNull();
});

it("markOrderPaidIfPending returns true when a row transitioned", async () => {
  const { sb, builder } = fakeSb({ data: { id: "o1" }, error: null });
  const ok = await markOrderPaidIfPending(sb, "o1", {
    payapp_mul_no: "m1", payapp_pay_state: "4", payapp_pay_type: "1",
  });
  expect(builder.update).toHaveBeenCalledWith(
    expect.objectContaining({ status: "PAID", payapp_mul_no: "m1", payapp_pay_state: "4", payapp_pay_type: "1" }),
  );
  expect(ok).toBe(true);
});

it("markOrderPaidIfPending returns false when no row transitioned", async () => {
  const { sb } = fakeSb({ data: null, error: null });
  const ok = await markOrderPaidIfPending(sb, "o1", {
    payapp_mul_no: "m1", payapp_pay_state: "4", payapp_pay_type: "1",
  });
  expect(ok).toBe(false);
});

it("markOrderRefundedIfPaid returns boolean from PAID->REFUNDED transition", async () => {
  const { sb } = fakeSb({ data: { id: "o1" }, error: null });
  expect(await markOrderRefundedIfPaid(sb, "o1")).toBe(true);
});

it("insertJobs inserts an array and returns rows", async () => {
  const rows = [{ id: "j1" }];
  const { sb, from, builder } = fakeSb({ data: rows, error: null });
  // select() after insert returns the builder; final await resolves builder via thenable shim
  (builder as Record<string, unknown>).select = vi.fn(() => ({
    then: (r: (v: unknown) => void) => r({ data: rows, error: null }),
  }));
  const out = await insertJobs(sb, [
    { user_id: "u1", batch_id: "b1", style_preset_id: "biz_linkedin", model_key: "google/gemini-3-pro-image" },
  ]);
  expect(from).toHaveBeenCalledWith("generation_jobs");
  expect(out).toEqual(rows);
});

it("setJobStatus updates status + patch", async () => {
  const { sb, builder } = fakeSb({ data: null, error: null });
  await setJobStatus(sb, "j1", "processing");
  expect(builder.update).toHaveBeenCalledWith(expect.objectContaining({ status: "processing" }));
});

it("insertAsset inserts into assets and returns the row", async () => {
  const asset = { id: "a1" };
  const { sb, from } = fakeSb({ data: asset, error: null });
  const out = await insertAsset(sb, {
    user_id: "u1", job_id: "j1", storage_path: "p", kind: "output", width: 1024, height: 1536, mime: "image/png",
  });
  expect(from).toHaveBeenCalledWith("assets");
  expect(out).toEqual(asset);
});
