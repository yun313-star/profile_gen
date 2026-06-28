import { beforeEach, describe, expect, it } from "vitest";

beforeEach(() => {
  process.env.PAYAPP_USERID = "testuser";
  process.env.PAYAPP_LINKKEY = "lk_123";
  process.env.PAYAPP_VALUE = "val_123";
});

function feedback(extra: Record<string, string>) {
  return new URLSearchParams({
    userid: "testuser",
    linkkey: "lk_123",
    linkval: "val_123",
    mul_no: "MUL777",
    price: "9900",
    pay_state: "4",
    pay_type: "1",
    var1: "order-abc",
    var2: "user-xyz",
    ...extra,
  });
}

describe("verifyFeedback", () => {
  it("authed=true and decodes fields when all 3 secrets match", async () => {
    const { verifyFeedback } = await import("@/lib/payapp/verify");
    const r = verifyFeedback(feedback({}));
    expect(r).toEqual({
      authed: true,
      payState: "4",
      orderId: "order-abc",
      price: 9900,
      mulNo: "MUL777",
      payType: "1",
    });
  });

  it("authed=false when linkval is wrong (forged)", async () => {
    const { verifyFeedback } = await import("@/lib/payapp/verify");
    expect(verifyFeedback(feedback({ linkval: "WRONG" })).authed).toBe(false);
  });

  it("authed=false when userid is wrong", async () => {
    const { verifyFeedback } = await import("@/lib/payapp/verify");
    expect(verifyFeedback(feedback({ userid: "attacker" })).authed).toBe(false);
  });

  it("authed=false when linkkey is wrong", async () => {
    const { verifyFeedback } = await import("@/lib/payapp/verify");
    expect(verifyFeedback(feedback({ linkkey: "WRONG" })).authed).toBe(false);
  });

  it("price is null for non-numeric price; other states pass through", async () => {
    const { verifyFeedback } = await import("@/lib/payapp/verify");
    const r = verifyFeedback(feedback({ price: "", pay_state: "10" }));
    expect(r.authed).toBe(true);
    expect(r.price).toBeNull();
    expect(r.payState).toBe("10");
  });
});
