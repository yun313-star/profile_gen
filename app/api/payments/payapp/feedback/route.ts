import { createServiceSupabase } from "@/lib/supabase/service";
import { verifyFeedback } from "@/lib/payapp/verify";
import { getOrder, markOrderPaidIfPending, markOrderRefundedIfPaid } from "@/lib/db";
import { grantCredits, clawbackCredits } from "@/lib/credits";

export const runtime = "nodejs";

const REFUND_STATES = new Set(["9", "64", "70", "71"]);

function success() {
  return new Response("SUCCESS", { status: 200, headers: { "content-type": "text/plain" } });
}

export async function POST(req: Request) {
  const params = new URLSearchParams(await req.text());
  const v = verifyFeedback(params);

  if (!v.authed) {
    // Forged or misconfigured callback. Never touch the DB. Tell PayApp it failed.
    console.warn("[payapp/feedback] unauthenticated callback rejected", { mulNo: v.mulNo });
    return new Response("FAIL", { status: 200, headers: { "content-type": "text/plain" } });
  }

  if (!v.orderId) return success();

  // Wrap all DB work: a transient error must still return 200 SUCCESS so PayApp does
  // NOT retry-storm. DB-level idempotency (markOrder*IfPending flips) makes any later
  // retry safe, and the reconcile cron backstops a missed grant.
  try {
    const sb = createServiceSupabase();
    const order = await getOrder(sb, v.orderId);
    if (!order) return success();

    // Completed payment -> grant credits (idempotent: markOrderPaidIfPending returns false
    // if order is already PAID, preventing a second grant).
    if (v.payState === "4") {
      if (v.price !== order.expected_amount) {
        console.warn("[payapp/feedback] amount mismatch", {
          orderId: order.id, got: v.price, expected: order.expected_amount,
        });
        return success();
      }
      const flipped = await markOrderPaidIfPending(sb, order.id, {
        payapp_mul_no: v.mulNo,
        payapp_pay_state: v.payState,
        payapp_pay_type: v.payType,
      });
      if (flipped) {
        await grantCredits(sb, {
          user_id: order.user_id,
          amount: order.credits,
          reason: "purchase",
          ref_type: "order",
          ref_id: order.id,
        });
      }
      return success();
    }

    // Cancellation / refund -> claw back via the dedicated negative path.
    // NEVER grantCredits with a negative amount — grant_credits keeps its p_amount>0 invariant.
    if (v.payState && REFUND_STATES.has(v.payState)) {
      const flipped = await markOrderRefundedIfPaid(sb, order.id);
      if (flipped) {
        await clawbackCredits(sb, {
          user_id: order.user_id,
          amount: order.credits,
          order_id: order.id,
        });
      }
      return success();
    }

    // pay_state 10 (vbank pending) and anything else: acknowledge, do not grant.
    return success();
  } catch (e) {
    console.error("[payapp/feedback] handler error; acking to avoid retry storm", e);
    return success();
  }
}
