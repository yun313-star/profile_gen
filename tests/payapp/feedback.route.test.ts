import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getOrder = vi.fn();
const markOrderPaidIfPending = vi.fn();
const markOrderRefundedIfPaid = vi.fn();
const grantCredits = vi.fn();
const clawbackCredits = vi.fn();

vi.mock("@/lib/supabase/service", () => ({ createServiceSupabase: () => ({ tag: "service" }) }));
vi.mock("@/lib/db", () => ({ getOrder, markOrderPaidIfPending, markOrderRefundedIfPaid }));
vi.mock("@/lib/credits", () => ({ grantCredits, clawbackCredits }));

beforeEach(() => {
  process.env.PAYAPP_USERID = "testuser";
  process.env.PAYAPP_LINKKEY = "lk_123";
  process.env.PAYAPP_VALUE = "val_123";
});
afterEach(() => vi.clearAllMocks());

const ORDER = {
  id: "order-1", user_id: "u1", pack_id: "starter", expected_amount: 9900, credits: 10,
  status: "PENDING", payapp_mul_no: "MUL777", payapp_pay_state: null, payapp_pay_type: null,
  paid_at: null, created_at: "2026-06-27T00:00:00Z",
};

function fbReq(fields: Record<string, string>) {
  const body = new URLSearchParams({
    userid: "testuser", linkkey: "lk_123", linkval: "val_123",
    mul_no: "MUL777", var1: "order-1", var2: "u1",
    price: "9900", pay_state: "4", pay_type: "1", ...fields,
  });
  return new Request("https://app.example.com/api/payments/payapp/feedback", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
}

describe("POST /api/payments/payapp/feedback", () => {
  it("grants exactly once on first verified pay_state=4", async () => {
    getOrder.mockResolvedValue(ORDER);
    markOrderPaidIfPending.mockResolvedValue(true);
    const { POST } = await import("@/app/api/payments/payapp/feedback/route");
    const res = await POST(fbReq({}));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("SUCCESS");
    expect(grantCredits).toHaveBeenCalledTimes(1);
    expect(grantCredits).toHaveBeenCalledWith(expect.anything(), {
      user_id: "u1", amount: 10, reason: "purchase", ref_type: "order", ref_id: "order-1",
    });
    expect(markOrderPaidIfPending).toHaveBeenCalledWith(expect.anything(), "order-1", {
      payapp_mul_no: "MUL777", payapp_pay_state: "4", payapp_pay_type: "1",
    });
  });

  it("idempotent: second feedback does NOT grant again", async () => {
    getOrder.mockResolvedValue({ ...ORDER, status: "PAID" });
    markOrderPaidIfPending.mockResolvedValue(false); // already PAID -> no flip
    const { POST } = await import("@/app/api/payments/payapp/feedback/route");
    const res = await POST(fbReq({}));
    expect(await res.text()).toBe("SUCCESS");
    expect(grantCredits).not.toHaveBeenCalled();
  });

  it("amount mismatch: no grant, still SUCCESS", async () => {
    getOrder.mockResolvedValue(ORDER);
    const { POST } = await import("@/app/api/payments/payapp/feedback/route");
    const res = await POST(fbReq({ price: "1000" }));
    expect(await res.text()).toBe("SUCCESS");
    expect(markOrderPaidIfPending).not.toHaveBeenCalled();
    expect(grantCredits).not.toHaveBeenCalled();
  });

  it("forged secret: FAIL, no DB access", async () => {
    const { POST } = await import("@/app/api/payments/payapp/feedback/route");
    const res = await POST(fbReq({ linkval: "WRONG" }));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("FAIL");
    expect(getOrder).not.toHaveBeenCalled();
    expect(grantCredits).not.toHaveBeenCalled();
  });

  it("vbank pending (pay_state=10): ack only, no grant", async () => {
    getOrder.mockResolvedValue(ORDER);
    const { POST } = await import("@/app/api/payments/payapp/feedback/route");
    const res = await POST(fbReq({ pay_state: "10" }));
    expect(await res.text()).toBe("SUCCESS");
    expect(markOrderPaidIfPending).not.toHaveBeenCalled();
    expect(grantCredits).not.toHaveBeenCalled();
  });

  it("refund (pay_state=64): claws back credits once", async () => {
    getOrder.mockResolvedValue({ ...ORDER, status: "PAID" });
    markOrderRefundedIfPaid.mockResolvedValue(true);
    const { POST } = await import("@/app/api/payments/payapp/feedback/route");
    const res = await POST(fbReq({ pay_state: "64" }));
    expect(await res.text()).toBe("SUCCESS");
    expect(markOrderRefundedIfPaid).toHaveBeenCalledWith(expect.anything(), "order-1");
    expect(clawbackCredits).toHaveBeenCalledWith(expect.anything(), {
      user_id: "u1", amount: 10, order_id: "order-1",
    });
    // Refund uses the dedicated clawback path, never grantCredits with a negative amount.
    expect(grantCredits).not.toHaveBeenCalled();
  });

  it("refund when already REFUNDED: no double claw-back", async () => {
    getOrder.mockResolvedValue({ ...ORDER, status: "REFUNDED" });
    markOrderRefundedIfPaid.mockResolvedValue(false);
    const { POST } = await import("@/app/api/payments/payapp/feedback/route");
    const res = await POST(fbReq({ pay_state: "70" }));
    expect(await res.text()).toBe("SUCCESS");
    expect(clawbackCredits).not.toHaveBeenCalled();
    expect(grantCredits).not.toHaveBeenCalled();
  });

  it("unknown order: SUCCESS ack, no grant", async () => {
    getOrder.mockResolvedValue(null);
    const { POST } = await import("@/app/api/payments/payapp/feedback/route");
    const res = await POST(fbReq({ var1: "ghost" }));
    expect(await res.text()).toBe("SUCCESS");
    expect(grantCredits).not.toHaveBeenCalled();
  });
});
