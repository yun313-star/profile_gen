import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => vi.restoreAllMocks());

function setEnv() {
  process.env.PAYAPP_USERID = "testuser";
  process.env.PAYAPP_LINKKEY = "lk_123";
  process.env.PAYAPP_VALUE = "val_123";
}

describe("payappCancel", () => {
  it("posts cmd=paycancel with mul_no + memo and returns ok on state=1", async () => {
    setEnv();
    let body = "";
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init: RequestInit) => {
      body = String(init.body);
      return new Response("state=1", { status: 200 });
    }));
    const { payappCancel } = await import("@/lib/payapp/client");
    const res = await payappCancel({ mul_no: "MUL777", reason: "user requested" });
    expect(res).toEqual({ ok: true });
    const p = new URLSearchParams(body);
    expect(p.get("cmd")).toBe("paycancel");
    expect(p.get("userid")).toBe("testuser");
    expect(p.get("linkkey")).toBe("lk_123");
    expect(p.get("mul_no")).toBe("MUL777");
    expect(p.get("memo")).toBe("user requested");
  });

  it("returns ok=false with error when state!=1", async () => {
    setEnv();
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response("state=0&errorMessage=%EC%B7%A8%EC%86%8C%20%EB%B6%88%EA%B0%80", { status: 200 })));
    const { payappCancel } = await import("@/lib/payapp/client");
    const res = await payappCancel({ mul_no: "MUL777", reason: "x" });
    expect(res.ok).toBe(false);
    expect(res.error).toBe("취소 불가");
  });
});
