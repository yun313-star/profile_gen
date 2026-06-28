import { afterEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const getOrder = vi.fn();
const payappCancel = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(async () => ({ auth: { getUser } })),
}));
vi.mock("@/lib/db", () => ({ getOrder }));
vi.mock("@/lib/payapp/client", () => ({ payappCancel }));

afterEach(() => vi.clearAllMocks());

const PAID_ORDER = {
  id: "order-1", user_id: "u1", pack_id: "starter", expected_amount: 9900, credits: 10,
  status: "PAID", payapp_mul_no: "MUL777", payapp_pay_state: "4", payapp_pay_type: "1",
  paid_at: "2026-06-27T01:00:00Z", created_at: "2026-06-27T00:00:00Z",
};

function req(body: unknown) {
  return new Request("https://app.example.com/api/payments/payapp/cancel", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
}

describe("POST /api/payments/payapp/cancel", () => {
  it("401 when not authed", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const { POST } = await import("@/app/api/payments/payapp/cancel/route");
    expect((await POST(req({ order_id: "order-1" }))).status).toBe(401);
  });

  it("403 when order belongs to another user", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u2" } } });
    getOrder.mockResolvedValue(PAID_ORDER);
    const { POST } = await import("@/app/api/payments/payapp/cancel/route");
    const res = await POST(req({ order_id: "order-1" }));
    expect(res.status).toBe(403);
    expect(payappCancel).not.toHaveBeenCalled();
  });

  it("409 when order not PAID or missing mul_no", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    getOrder.mockResolvedValue({ ...PAID_ORDER, status: "PENDING" });
    const { POST } = await import("@/app/api/payments/payapp/cancel/route");
    expect((await POST(req({ order_id: "order-1" }))).status).toBe(409);
  });

  it("issues paycancel and returns ok", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    getOrder.mockResolvedValue(PAID_ORDER);
    payappCancel.mockResolvedValue({ ok: true });
    const { POST } = await import("@/app/api/payments/payapp/cancel/route");
    const res = await POST(req({ order_id: "order-1", reason: "user requested" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(payappCancel).toHaveBeenCalledWith({ mul_no: "MUL777", reason: "user requested" });
  });

  it("502 when payappCancel reports failure", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    getOrder.mockResolvedValue(PAID_ORDER);
    payappCancel.mockResolvedValue({ ok: false, error: "취소 불가" });
    const { POST } = await import("@/app/api/payments/payapp/cancel/route");
    const res = await POST(req({ order_id: "order-1" }));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("취소 불가");
  });
});
