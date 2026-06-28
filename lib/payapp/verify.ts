export function verifyFeedback(params: URLSearchParams): {
  authed: boolean;
  payState: string | null;
  orderId: string | null;
  price: number | null;
  mulNo: string | null;
  payType: string | null;
} {
  const userid = params.get("userid");
  const linkkey = params.get("linkkey");
  const linkval = params.get("linkval");
  const authed =
    !!userid &&
    !!linkkey &&
    !!linkval &&
    userid === process.env.PAYAPP_USERID &&
    linkkey === process.env.PAYAPP_LINKKEY &&
    linkval === process.env.PAYAPP_VALUE;

  const rawPrice = params.get("price");
  const priceNum = rawPrice !== null && rawPrice.trim() !== "" ? Number(rawPrice) : NaN;

  return {
    authed,
    payState: params.get("pay_state"),
    orderId: params.get("var1"),
    price: Number.isFinite(priceNum) ? priceNum : null,
    mulNo: params.get("mul_no"),
    payType: params.get("pay_type"),
  };
}
