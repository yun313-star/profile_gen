import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const insertOrder = vi.fn();
const updateOrder = vi.fn();
const payappCreate = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(async () => ({ auth: { getUser } })),
}));
vi.mock("@/lib/db", () => ({ insertOrder, updateOrder }));
vi.mock("@/lib/payapp/client", () => ({ payappCreate }));

beforeEach(() => {
  process.env.APP_BASE_URL = "https://app.example.com";
});
afterEach(() => vi.clearAllMocks());

function req(body: unknown) {
  return new Request("https://app.example.com/api/payments/payapp/create", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/payments/payapp/create", () => {
  it("401 when not authenticated", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const { POST } = await import("@/app/api/payments/payapp/create/route");
    const res = await POST(req({ pack_id: "starter" }));
    expect(res.status).toBe(401);
  });

  it("400 on unknown pack_id", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    const { POST } = await import("@/app/api/payments/payapp/create/route");
    const res = await POST(req({ pack_id: "nope" }));
    expect(res.status).toBe(400);
    expect(insertOrder).not.toHaveBeenCalled();
  });

  it("inserts PENDING with authoritative price, stores mul_no, returns payurl", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1", phone: "01012345678" } }, error: null });
    insertOrder.mockResolvedValue({
      id: "order-1", user_id: "u1", pack_id: "starter", expected_amount: 9900, credits: 10,
      status: "PENDING", payapp_mul_no: null, payapp_pay_state: null, payapp_pay_type: null,
      paid_at: null, created_at: "2026-06-27T00:00:00Z",
    });
    payappCreate.mockResolvedValue({ payurl: "https://pay.payapp.kr/p/MUL777", mul_no: "MUL777" });
    const { POST } = await import("@/app/api/payments/payapp/create/route");
    const res = await POST(req({ pack_id: "starter" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ payurl: "https://pay.payapp.kr/p/MUL777" });

    expect(insertOrder).toHaveBeenCalledWith(expect.anything(), {
      user_id: "u1", pack_id: "starter", expected_amount: 9900, credits: 10,
    });
    expect(payappCreate).toHaveBeenCalledWith(expect.objectContaining({
      recvphone: "01012345678",
      feedbackUrl: "https://app.example.com/api/payments/payapp/feedback",
      returnUrl: "https://app.example.com/credits/result?order=order-1",
    }));
    expect(updateOrder).toHaveBeenCalledWith(expect.anything(), "order-1", { payapp_mul_no: "MUL777" });
  });

  it("502 when payappCreate throws", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    insertOrder.mockResolvedValue({
      id: "order-2", user_id: "u1", pack_id: "starter", expected_amount: 9900, credits: 10,
      status: "PENDING", payapp_mul_no: null, payapp_pay_state: null, payapp_pay_type: null,
      paid_at: null, created_at: "2026-06-27T00:00:00Z",
    });
    payappCreate.mockRejectedValue(new Error("가맹점 오류"));
    const { POST } = await import("@/app/api/payments/payapp/create/route");
    const res = await POST(req({ pack_id: "starter" }));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("가맹점 오류");
  });
});
