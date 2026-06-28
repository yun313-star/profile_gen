import { afterEach, describe, expect, it, vi } from "vitest";
import type { CreditPack, Order } from "@/types/db";

const ENV = {
  PAYAPP_USERID: "testuser",
  PAYAPP_LINKKEY: "lk_123",
  PAYAPP_VALUE: "val_123",
  APP_BASE_URL: "https://app.example.com",
};

function setEnv() {
  for (const [k, v] of Object.entries(ENV)) process.env[k] = v;
}

const order: Order = {
  id: "11111111-1111-1111-1111-111111111111",
  user_id: "22222222-2222-2222-2222-222222222222",
  pack_id: "starter",
  expected_amount: 9900,
  credits: 10,
  status: "PENDING",
  payapp_mul_no: null,
  payapp_pay_state: null,
  payapp_pay_type: null,
  paid_at: null,
  created_at: "2026-06-27T00:00:00Z",
};
const pack: CreditPack = { id: "starter", name: "스타터 10크레딧", price: 9900, credits: 10 };

afterEach(() => vi.restoreAllMocks());

describe("payappCreate", () => {
  it("posts a correct form body and returns payurl + mul_no on state=1", async () => {
    setEnv();
    let capturedBody = "";
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      capturedBody = String(init.body);
      return new Response("state=1&mul_no=MUL777&payurl=https%3A%2F%2Fpay.payapp.kr%2Fp%2FMUL777", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { payappCreate } = await import("@/lib/payapp/client");
    const res = await payappCreate({
      order,
      pack,
      recvphone: "01012345678",
      feedbackUrl: `${ENV.APP_BASE_URL}/api/payments/payapp/feedback`,
      returnUrl: `${ENV.APP_BASE_URL}/credits/result?order=${order.id}`,
    });
    expect(res).toEqual({ payurl: "https://pay.payapp.kr/p/MUL777", mul_no: "MUL777" });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.payapp.kr/oapi/apiLoad.html",
      expect.objectContaining({ method: "POST" }),
    );
    const p = new URLSearchParams(capturedBody);
    expect(p.get("cmd")).toBe("payrequest");
    expect(p.get("userid")).toBe("testuser");
    expect(p.get("goodname")).toBe("스타터 10크레딧");
    expect(p.get("price")).toBe("9900");
    expect(p.get("recvphone")).toBe("01012345678");
    expect(p.get("smsuse")).toBe("n");
    expect(p.get("checkretry")).toBe("y");
    expect(p.get("var1")).toBe(order.id);
    expect(p.get("var2")).toBe(order.user_id);
    expect(p.get("feedbackurl")).toBe("https://app.example.com/api/payments/payapp/feedback");
    expect(p.get("returnurl")).toBe(`https://app.example.com/credits/result?order=${order.id}`);
  });

  it("throws with errorMessage when state!=1", async () => {
    setEnv();
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response("state=0&errorMessage=%EA%B0%80%EB%A7%B9%EC%A0%90%20%EC%98%A4%EB%A5%98&errno=12", { status: 200 }),
    ));
    const { payappCreate } = await import("@/lib/payapp/client");
    await expect(
      payappCreate({ order, pack, recvphone: "01012345678", feedbackUrl: "x", returnUrl: "y" }),
    ).rejects.toThrow("가맹점 오류");
  });
});
