import type { CreditPack, Order } from "@/types/db";

const PAYAPP_ENDPOINT = "https://api.payapp.kr/oapi/apiLoad.html";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

async function postForm(body: URLSearchParams): Promise<URLSearchParams> {
  const res = await fetch(PAYAPP_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded; charset=utf-8" },
    body: body.toString(),
  });
  const text = await res.text();
  return new URLSearchParams(text);
}

export async function payappCreate(args: {
  order: Order;
  pack: CreditPack;
  recvphone: string;
  feedbackUrl: string;
  returnUrl: string;
}): Promise<{ payurl: string; mul_no: string }> {
  const { order, pack, recvphone, feedbackUrl, returnUrl } = args;
  const body = new URLSearchParams({
    cmd: "payrequest",
    userid: requireEnv("PAYAPP_USERID"),
    goodname: pack.name,
    price: String(order.expected_amount),
    recvphone: recvphone || "01000000000",
    smsuse: "n",
    feedbackurl: feedbackUrl,
    returnurl: returnUrl,
    var1: order.id,
    var2: order.user_id,
    checkretry: "y",
  });
  const p = await postForm(body);
  if (p.get("state") !== "1") {
    throw new Error(p.get("errorMessage") || `PayApp create failed (errno=${p.get("errno") ?? "?"})`);
  }
  const payurl = p.get("payurl");
  const mul_no = p.get("mul_no");
  if (!payurl || !mul_no) throw new Error("PayApp create: missing payurl/mul_no");
  return { payurl, mul_no };
}
