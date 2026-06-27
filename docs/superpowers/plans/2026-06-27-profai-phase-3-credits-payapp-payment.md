# ProfAI — Phase 3: Credits PayApp Payment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Ship the full credit-purchase loop: a Korean B2C user buys a credit pack through PayApp (real money, test with ₩1,000), and credits are granted **exactly once** on verified feedback. Forged/under-paid callbacks never grant. Refund feedback claws back credits. A reconcile cron backstops missed webhooks.

**Architecture:** PayApp single REST endpoint (`apiLoad.html`, form-urlencoded, response parsed with `URLSearchParams` — NOT JSON). Server is the sole authority on price (`orders.expected_amount`). Flow: `/credits` page → `POST /api/payments/payapp/create` inserts a `PENDING` order + calls `payappCreate` → returns `payurl` → client opens it → PayApp posts to `/api/payments/payapp/feedback` → 4-gate verification (`authed` secrets + `pay_state==4` + amount match + idempotent `markOrderPaidIfPending`) → `grantCredits`. `returnurl` page (`/credits/result`) is read-only polling, never grants. `/api/payments/payapp/cancel` issues `paycancel`. `/api/cron/reconcile` re-checks long-`PENDING` orders.

**Tech Stack:** Next.js 16 App Router (Node runtime route handlers), TypeScript strict, pnpm, Supabase (`createServiceSupabase` in feedback/cron, `createServerSupabase` in create route + result page), Vitest (unit/integration with `vi.mock`), Playwright (E2E with PayApp + feedback stubbed). No real money in automated tests.

## Global Constraints  (copy verbatim into implementation)

- Next.js 16 App Router + React Server Components, TypeScript strict. Package manager: pnpm.
- API routes and the worker run on Node runtime: `export const runtime = "nodejs"`. NEVER Edge.
- Test stack: Vitest (unit/integration, with `vi.mock` for Supabase/provider clients) + Playwright (E2E). DB migration/RLS/RPC tests via pgTAP in `supabase/tests` run with `supabase test db` (requires Docker + Supabase CLI). State the Docker requirement where used.
- Every secret is server-only. Client may ONLY see `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. NEVER expose `OPENAI_API_KEY`, `GEMINI_API_KEY`/`AI_GATEWAY_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PAYAPP_USERID`/`LINKKEY`/`VALUE`, `CRON_SECRET`.
- Pin models: OpenAI gpt-image-2 (snapshot `gpt-image-2-2026-04-21`); Google `google/gemini-3-pro-image`; free tier `google/gemini-3.1-flash-image-preview` or `gpt-image-1-mini`. Verify ids live before launch (manual step, do not block). *(Not exercised this phase but kept for consistency.)*
- Credit unit: 1 credit = 1 output image at 2K. 4K = 2 credits (post-MVP). Free signup = 3 credits, watermarked 1K.
- Korean UI copy. All generated outputs (free tier especially) carry a visible "AI 생성" label per 인공지능기본법.
- Frequent commits: each task ends with a commit. Conventional commit messages (feat/fix/test/chore/docs). End commit body with: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

**ENV VARS used this phase** (`.env.example`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PAYAPP_USERID`, `PAYAPP_LINKKEY`, `PAYAPP_VALUE`, `APP_BASE_URL`, `CRON_SECRET`.

**PayApp facts (verified by prior research):** endpoint `https://api.payapp.kr/oapi/apiLoad.html` (form-urlencoded POST UTF-8). Create response keys: `state`(1=ok), `mul_no`, `payurl`, `errorMessage`, `errno`. Feedback POST keys: `userid`, `linkkey`, `linkval`, `mul_no`, `price`, `pay_state`(4=완료, 10=가상계좌 입금대기, 8/32/9/64/70/71=취소/환불), `pay_type`(1=카드, 15=카카오페이, 16=네이버페이, 7=가상계좌), `var1`(=order.id), `var2`(=user.id). Feedback handler MUST reply HTTP 200 with body exactly `SUCCESS` on every acked case (FAIL only on forged secrets). Grant only when `authed && pay_state==="4" && price===order.expected_amount && markOrderPaidIfPending` flips true.

## File Structure  (subset this phase creates/modifies)

- `lib/payapp/client.ts` — `payappCreate`, `payappCancel`: build form body, POST endpoint, parse `URLSearchParams`, throw on `state!=="1"`.
- `lib/payapp/verify.ts` — `verifyFeedback(params)`: pure function, `authed` = 3 secrets match, decode `pay_state`/`price`/`var1`/`mul_no`/`pay_type`.
- `lib/styles.ts` — `CREDIT_PACKS` constant (consumed; defined in Phase 1 — extend only if absent).
- `lib/db.ts` — order/credit helpers (consumed; defined Phase 1).
- `lib/credits.ts` — `grantCredits` + `clawbackCredits` wrappers (consumed; defined Phase 1; refunds use `clawbackCredits`, never negative `grantCredits`).
- `app/credits/page.tsx` — pack grid + 구매 buttons → POST create → open `payurl`.
- `app/credits/_PackGrid.tsx` — client component for the buy interaction.
- `app/api/payments/payapp/create/route.ts` — auth, insert PENDING order with authoritative `expected_amount`, `payappCreate`, store `payapp_mul_no`, return `{payurl}`.
- `app/api/payments/payapp/feedback/route.ts` — raw form parse, `verifyFeedback`, gates, grant/claw-back, always 200 `SUCCESS`.
- `app/credits/result/page.tsx` — read-only order status (returnurl), never grants.
- `app/api/payments/payapp/cancel/route.ts` — admin/self refund → `payappCancel`.
- `app/api/cron/reconcile/route.ts` — `CRON_SECRET` guard, find long-PENDING orders, reconcile by `mul_no`.
- `tests/payapp/*.test.ts` — Vitest units for client, verify, create, feedback, cancel, reconcile.
- `e2e/credits-buy.spec.ts` — Playwright buy flow with PayApp + feedback stubbed.

**Interfaces consumed from earlier phases (reference only — DO NOT redefine):**

```ts
// types/db.ts (Phase 1)
Order = { id:string; user_id:string; pack_id:string; expected_amount:number; credits:number; status:"PENDING"|"PAID"|"REFUNDED"; payapp_mul_no:string|null; payapp_pay_state:string|null; payapp_pay_type:string|null; paid_at:string|null; created_at:string }
CreditPack = { id:string; name:string; price:number; credits:number }

// lib/db.ts (Phase 1) — each takes a SupabaseClient as first arg
insertOrder(sb, {user_id, pack_id, expected_amount, credits}): Promise<Order>
getOrder(sb, id): Promise<Order|null>
updateOrder(sb, id, patch: Partial<Order>): Promise<void>
markOrderPaidIfPending(sb, id, {payapp_mul_no, payapp_pay_state, payapp_pay_type}): Promise<boolean> // true only PENDING->PAID
markOrderRefundedIfPaid(sb, id): Promise<boolean>

// lib/credits.ts (Phase 1)
grantCredits(sb, {user_id, amount, reason, ref_type, ref_id}): Promise<void> // p_amount>0 invariant
clawbackCredits(sb, {user_id, amount, order_id}): Promise<void> // dedicated negative path (RPC clawback_credits); refunds only

// lib/supabase (Phase 0/1)
createServerSupabase(): cookie-bound RLS client (Server Components / Route Handlers)
createServiceSupabase(): service-role client (server-only, bypasses RLS) — feedback, cron

// lib/styles.ts (Phase 1)
CREDIT_PACKS: Record<string,CreditPack>
```

> If any consumed symbol does not yet exist when this phase runs (phases executed out of order), STOP and complete the Phase 1 definition rather than redefining it here.

---

## Task 3.1 — PayApp client: `payappCreate`

**Files:**
- Create: `lib/payapp/client.ts`
- Test: `tests/payapp/client.create.test.ts`

**Interfaces:**
- Consumes: `Order` and `CreditPack` from `types/db.ts`.
- Produces: `payappCreate({order: Order, pack: CreditPack, recvphone: string, feedbackUrl: string, returnUrl: string}): Promise<{payurl:string; mul_no:string}>`

**Steps:**

1. - [ ] Ensure dirs exist:
   ```bash
   mkdir -p lib/payapp tests/payapp
   ```

2. - [ ] Write failing test `tests/payapp/client.create.test.ts`:
   ```ts
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
   ```

3. - [ ] Run and confirm FAIL (module missing):
   ```bash
   pnpm vitest run tests/payapp/client.create.test.ts
   ```
   Expected: `Error: Failed to load .../lib/payapp/client` / "payappCreate is not a function".

4. - [ ] Create `lib/payapp/client.ts` with `payappCreate` (full code):
   ```ts
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
   ```

5. - [ ] Run and confirm PASS:
   ```bash
   pnpm vitest run tests/payapp/client.create.test.ts
   ```
   Expected: `2 passed`.

6. - [ ] Commit:
   ```bash
   git add lib/payapp/client.ts tests/payapp/client.create.test.ts
   git commit -m "$(cat <<'EOF'
   feat(payapp): payappCreate builds authoritative payrequest form and parses response

   Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
   EOF
   )"
   ```

---

## Task 3.2 — PayApp client: `payappCancel`

**Files:**
- Modify: `lib/payapp/client.ts`
- Test: `tests/payapp/client.cancel.test.ts`

**Interfaces:**
- Produces: `payappCancel({mul_no, reason}): Promise<{ok:boolean; error?:string}>`

**Steps:**

1. - [ ] Write failing test `tests/payapp/client.cancel.test.ts`:
   ```ts
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
   ```

2. - [ ] Run and confirm FAIL:
   ```bash
   pnpm vitest run tests/payapp/client.cancel.test.ts
   ```
   Expected: "payappCancel is not a function".

3. - [ ] Append `payappCancel` to `lib/payapp/client.ts` (full code, add after `payappCreate`):
   ```ts
   export async function payappCancel(args: {
     mul_no: string;
     reason: string;
   }): Promise<{ ok: boolean; error?: string }> {
     const body = new URLSearchParams({
       cmd: "paycancel",
       userid: requireEnv("PAYAPP_USERID"),
       linkkey: requireEnv("PAYAPP_LINKKEY"),
       mul_no: args.mul_no,
       memo: args.reason,
     });
     const p = await postForm(body);
     if (p.get("state") !== "1") {
       return { ok: false, error: p.get("errorMessage") || `paycancel failed (errno=${p.get("errno") ?? "?"})` };
     }
     return { ok: true };
   }
   ```

4. - [ ] Run and confirm PASS:
   ```bash
   pnpm vitest run tests/payapp/client.cancel.test.ts
   ```
   Expected: `2 passed`.

5. - [ ] Commit:
   ```bash
   git add lib/payapp/client.ts tests/payapp/client.cancel.test.ts
   git commit -m "$(cat <<'EOF'
   feat(payapp): payappCancel issues paycancel and reports failure reason

   Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
   EOF
   )"
   ```

---

## Task 3.3 — `verifyFeedback` pure function

**Files:**
- Create: `lib/payapp/verify.ts`
- Test: `tests/payapp/verify.test.ts`

**Interfaces:**
- Produces: `verifyFeedback(params: URLSearchParams): { authed:boolean; payState:string|null; orderId:string|null; price:number|null; mulNo:string|null; payType:string|null }`. Pure: reads the 3 PayApp secrets from `process.env` (`authed` = `userid && linkkey && linkval` ALL equal env). No network, no DB.

**Steps:**

1. - [ ] Write failing test `tests/payapp/verify.test.ts`:
   ```ts
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

     it("price is null for non-numeric price; other states pass through", async () => {
       const { verifyFeedback } = await import("@/lib/payapp/verify");
       const r = verifyFeedback(feedback({ price: "", pay_state: "10" }));
       expect(r.authed).toBe(true);
       expect(r.price).toBeNull();
       expect(r.payState).toBe("10");
     });
   });
   ```

2. - [ ] Run and confirm FAIL:
   ```bash
   pnpm vitest run tests/payapp/verify.test.ts
   ```
   Expected: cannot find module `@/lib/payapp/verify`.

3. - [ ] Create `lib/payapp/verify.ts` (full code):
   ```ts
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
   ```

4. - [ ] Run and confirm PASS:
   ```bash
   pnpm vitest run tests/payapp/verify.test.ts
   ```
   Expected: `4 passed`.

5. - [ ] Commit:
   ```bash
   git add lib/payapp/verify.ts tests/payapp/verify.test.ts
   git commit -m "$(cat <<'EOF'
   feat(payapp): verifyFeedback pure 3-secret auth gate + field decode

   Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
   EOF
   )"
   ```

---

## Task 3.4 — `POST /api/payments/payapp/create` route

**Files:**
- Create: `app/api/payments/payapp/create/route.ts`
- Test: `tests/payapp/create.route.test.ts`

**Interfaces:**
- Consumes: `createServerSupabase()`, `insertOrder(sb, …)`, `updateOrder(sb, id, patch)`, `CREDIT_PACKS`, `payappCreate(…)`.
- Produces: `POST` handler returning `{ payurl: string }` (200) or error JSON (400/401/502).

**Steps:**

1. - [ ] Ensure dir:
   ```bash
   mkdir -p app/api/payments/payapp/create
   ```

2. - [ ] Write failing test `tests/payapp/create.route.test.ts`:
   ```ts
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
   ```

3. - [ ] Run and confirm FAIL:
   ```bash
   pnpm vitest run tests/payapp/create.route.test.ts
   ```
   Expected: cannot find module route.

4. - [ ] Create `app/api/payments/payapp/create/route.ts` (full code):
   ```ts
   import { NextResponse } from "next/server";
   import { createServerSupabase } from "@/lib/supabase/server";
   import { insertOrder, updateOrder } from "@/lib/db";
   import { payappCreate } from "@/lib/payapp/client";
   import { CREDIT_PACKS } from "@/lib/styles";

   export const runtime = "nodejs";

   export async function POST(req: Request) {
     const sb = await createServerSupabase();
     const { data: { user } } = await sb.auth.getUser();
     if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

     let body: unknown;
     try {
       body = await req.json();
     } catch {
       return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
     }
     const packId = (body as { pack_id?: unknown })?.pack_id;
     if (typeof packId !== "string" || !(packId in CREDIT_PACKS)) {
       return NextResponse.json({ error: "알 수 없는 크레딧 팩입니다." }, { status: 400 });
     }
     const pack = CREDIT_PACKS[packId];

     // expected_amount is set server-side from CREDIT_PACKS — never trust client.
     const order = await insertOrder(sb, {
       user_id: user.id,
       pack_id: pack.id,
       expected_amount: pack.price,
       credits: pack.credits,
     });

     const base = process.env.APP_BASE_URL!;
     const recvphone = (user as { phone?: string | null }).phone || "01000000000";
     try {
       const { payurl, mul_no } = await payappCreate({
         order,
         pack,
         recvphone,
         feedbackUrl: `${base}/api/payments/payapp/feedback`,
         returnUrl: `${base}/credits/result?order=${order.id}`,
       });
       await updateOrder(sb, order.id, { payapp_mul_no: mul_no });
       return NextResponse.json({ payurl });
     } catch (e) {
       return NextResponse.json(
         { error: e instanceof Error ? e.message : "결제 생성에 실패했습니다." },
         { status: 502 },
       );
     }
   }
   ```

5. - [ ] Run and confirm PASS:
   ```bash
   pnpm vitest run tests/payapp/create.route.test.ts
   ```
   Expected: `4 passed`.

6. - [ ] Commit:
   ```bash
   git add app/api/payments/payapp/create/route.ts tests/payapp/create.route.test.ts
   git commit -m "$(cat <<'EOF'
   feat(payapp): create route inserts authoritative PENDING order and returns payurl

   Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
   EOF
   )"
   ```

---

## Task 3.5 — `POST /api/payments/payapp/feedback` (grant + idempotency)

**Files:**
- Create: `app/api/payments/payapp/feedback/route.ts`
- Test: `tests/payapp/feedback.route.test.ts`

**Interfaces:**
- Consumes: `createServiceSupabase()`, `verifyFeedback(params)`, `getOrder(sb, id)`, `markOrderPaidIfPending(sb, id, {payapp_mul_no, payapp_pay_state, payapp_pay_type})`, `markOrderRefundedIfPaid(sb, id)`, `grantCredits(sb, {user_id, amount, reason, ref_type, ref_id})`, `clawbackCredits(sb, {user_id, amount, order_id})` (Phase 1, `lib/credits.ts` — dedicated refund path).
- Produces: `POST` handler. Always returns 200 except forged secrets → 200 `FAIL`. Body is plain text.

**Behavior contract:**
- Parse raw body via `await req.text()` + `URLSearchParams` (NOT JSON — PayApp posts form-urlencoded).
- `verifyFeedback`; if `!authed` → 200 body `FAIL` (forged: no DB write, log).
- Look up order by `orderId` (var1). If missing → 200 `SUCCESS` (ack, nothing to do).
- Classify by `payState`:
  - `"4"` (완료): require `price === order.expected_amount`; `markOrderPaidIfPending(... pay_state, pay_type ...)`; if flipped → `grantCredits(reason:"purchase", ref_type:"order", ref_id:order.id)`. Idempotent: a second feedback finds order already PAID → flip returns false → no second grant.
  - `"9" | "64" | "70" | "71"` (취소/환불): `markOrderRefundedIfPaid`; if flipped → `clawbackCredits(sb, {user_id, amount: order.credits, order_id: order.id})` (dedicated negative path — NOT `grantCredits` with a negative amount; `grant_credits` keeps its `p_amount>0` invariant). Idempotent on PAID→REFUNDED.
  - `"10"` (가상계좌 입금대기) and any other state: ack only, no grant.
- ALWAYS 200 `SUCCESS` for every acked case (forces no PayApp retry storm).

**Steps:**

1. - [ ] Ensure dir:
   ```bash
   mkdir -p app/api/payments/payapp/feedback
   ```

2. - [ ] Write failing test `tests/payapp/feedback.route.test.ts`:
   ```ts
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
   ```

3. - [ ] Run and confirm FAIL:
   ```bash
   pnpm vitest run tests/payapp/feedback.route.test.ts
   ```
   Expected: cannot find module route.

4. - [ ] Create `app/api/payments/payapp/feedback/route.ts` (full code):
   ```ts
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
     const sb = createServiceSupabase();
     const order = await getOrder(sb, v.orderId);
     if (!order) return success();

     // Completed payment -> grant.
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
   }
   ```

5. - [ ] Run and confirm PASS:
   ```bash
   pnpm vitest run tests/payapp/feedback.route.test.ts
   ```
   Expected: `8 passed`.

6. - [ ] Commit:
   ```bash
   git add app/api/payments/payapp/feedback/route.ts tests/payapp/feedback.route.test.ts
   git commit -m "$(cat <<'EOF'
   feat(payapp): feedback webhook — 4-gate verify, idempotent grant, refund claw-back

   Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
   EOF
   )"
   ```

---

## Task 3.6 — `/api/payments/payapp/cancel` route (admin/self refund)

**Files:**
- Create: `app/api/payments/payapp/cancel/route.ts`
- Test: `tests/payapp/cancel.route.test.ts`

**Interfaces:**
- Consumes: `createServerSupabase()`, `getOrder(sb, id)`, `payappCancel({mul_no, reason})`.
- Produces: `POST` handler. Body `{ order_id: string, reason?: string }`. Verifies the order belongs to the caller (RLS via `createServerSupabase` + ownership check), then issues `paycancel`. Does NOT itself flip the order/credits — the refund **feedback** (Task 3.5) is the single authority for state + claw-back.

**Steps:**

1. - [ ] Ensure dir:
   ```bash
   mkdir -p app/api/payments/payapp/cancel
   ```

2. - [ ] Write failing test `tests/payapp/cancel.route.test.ts`:
   ```ts
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
   ```

3. - [ ] Run and confirm FAIL:
   ```bash
   pnpm vitest run tests/payapp/cancel.route.test.ts
   ```
   Expected: cannot find module route.

4. - [ ] Create `app/api/payments/payapp/cancel/route.ts` (full code):
   ```ts
   import { NextResponse } from "next/server";
   import { createServerSupabase } from "@/lib/supabase/server";
   import { getOrder } from "@/lib/db";
   import { payappCancel } from "@/lib/payapp/client";

   export const runtime = "nodejs";

   export async function POST(req: Request) {
     const sb = await createServerSupabase();
     const { data: { user } } = await sb.auth.getUser();
     if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

     let body: unknown;
     try {
       body = await req.json();
     } catch {
       return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
     }
     const orderId = (body as { order_id?: unknown })?.order_id;
     const reason = (body as { reason?: unknown })?.reason;
     if (typeof orderId !== "string") {
       return NextResponse.json({ error: "주문 ID가 필요합니다." }, { status: 400 });
     }

     const order = await getOrder(sb, orderId);
     if (!order || order.user_id !== user.id) {
       return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
     }
     if (order.status !== "PAID" || !order.payapp_mul_no) {
       return NextResponse.json({ error: "취소 가능한 결제가 아닙니다." }, { status: 409 });
     }

     // Issue paycancel. State flip + credit claw-back happen via the refund feedback (single authority).
     const result = await payappCancel({
       mul_no: order.payapp_mul_no,
       reason: typeof reason === "string" && reason.trim() ? reason : "고객 환불 요청",
     });
     if (!result.ok) {
       return NextResponse.json({ error: result.error ?? "환불 요청에 실패했습니다." }, { status: 502 });
     }
     return NextResponse.json({ ok: true });
   }
   ```

5. - [ ] Run and confirm PASS:
   ```bash
   pnpm vitest run tests/payapp/cancel.route.test.ts
   ```
   Expected: `5 passed`.

6. - [ ] Commit:
   ```bash
   git add app/api/payments/payapp/cancel/route.ts tests/payapp/cancel.route.test.ts
   git commit -m "$(cat <<'EOF'
   feat(payapp): cancel route issues paycancel for owned PAID orders

   Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
   EOF
   )"
   ```

---

## Task 3.7 — `/api/cron/reconcile` route (missed-webhook backstop)

**Files:**
- Create: `app/api/cron/reconcile/route.ts`
- Test: `tests/payapp/reconcile.route.test.ts`

**Interfaces:**
- Consumes: `createServiceSupabase()`. Uses Supabase query directly to find stale PENDING orders (older than threshold with a `payapp_mul_no`).
- Produces: `GET` handler guarded by `Authorization: Bearer ${CRON_SECRET}`. Returns `{ checked:number, note:string }`.

**Reconcile design (PayApp has NO public GET status API ★):** This cron cannot reliably re-pull state from PayApp (no documented status endpoint — spec §6.1, §13). So it **identifies** long-PENDING orders that have a `mul_no` (meaning the user reached PayApp) and logs them for manual operator review. It does NOT grant credits — granting remains exclusively the verified-feedback path. Output includes a `★` manual note. If/when a status `cmd` is confirmed, this is where the "적립 전 재조회 1회" check is added.

**Steps:**

1. - [ ] Ensure dir:
   ```bash
   mkdir -p app/api/cron/reconcile
   ```

2. - [ ] Write failing test `tests/payapp/reconcile.route.test.ts`:
   ```ts
   import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

   const lt = vi.fn();
   const not = vi.fn();
   const eq = vi.fn();
   const select = vi.fn();
   const from = vi.fn();

   // Chainable Supabase query stub: from().select().eq().not().lt() resolves to {data,error}.
   function makeSb(rows: unknown[]) {
     const builder: Record<string, unknown> = {};
     const ret = () => builder;
     builder.select = vi.fn(ret);
     builder.eq = vi.fn(ret);
     builder.not = vi.fn(ret);
     builder.lt = vi.fn(async () => ({ data: rows, error: null }));
     return { from: vi.fn(() => builder) };
   }

   vi.mock("@/lib/supabase/service", () => ({ createServiceSupabase: () => makeSb(globalThis.__rows ?? []) }));

   beforeEach(() => { process.env.CRON_SECRET = "cron_secret_xyz"; });
   afterEach(() => { vi.clearAllMocks(); delete (globalThis as Record<string, unknown>).__rows; });

   function req(auth?: string) {
     return new Request("https://app.example.com/api/cron/reconcile", {
       headers: auth ? { authorization: auth } : {},
     });
   }

   describe("GET /api/cron/reconcile", () => {
     it("401 without bearer secret", async () => {
       const { GET } = await import("@/app/api/cron/reconcile/route");
       expect((await GET(req())).status).toBe(401);
     });

     it("401 with wrong secret", async () => {
       const { GET } = await import("@/app/api/cron/reconcile/route");
       expect((await GET(req("Bearer nope"))).status).toBe(401);
     });

     it("200 and reports stale PENDING count with manual note", async () => {
       (globalThis as Record<string, unknown>).__rows = [{ id: "o1" }, { id: "o2" }];
       const { GET } = await import("@/app/api/cron/reconcile/route");
       const res = await GET(req("Bearer cron_secret_xyz"));
       expect(res.status).toBe(200);
       const json = await res.json();
       expect(json.checked).toBe(2);
       expect(json.note).toContain("★");
     });
   });
   ```

3. - [ ] Run and confirm FAIL:
   ```bash
   pnpm vitest run tests/payapp/reconcile.route.test.ts
   ```
   Expected: cannot find module route.

4. - [ ] Create `app/api/cron/reconcile/route.ts` (full code):
   ```ts
   import { NextResponse } from "next/server";
   import { createServiceSupabase } from "@/lib/supabase/service";

   export const runtime = "nodejs";

   // Orders older than this still PENDING but with a mul_no are suspicious (user reached PayApp,
   // feedback possibly missed). Threshold: 30 minutes.
   const STALE_MINUTES = 30;

   export async function GET(req: Request) {
     const auth = req.headers.get("authorization");
     if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
       return NextResponse.json({ error: "unauthorized" }, { status: 401 });
     }

     const sb = createServiceSupabase();
     const cutoff = new Date(Date.now() - STALE_MINUTES * 60_000).toISOString();
     const { data, error } = await sb
       .from("orders")
       .select("id, user_id, payapp_mul_no, created_at, expected_amount")
       .eq("status", "PENDING")
       .not("payapp_mul_no", "is", null)
       .lt("created_at", cutoff);

     if (error) {
       return NextResponse.json({ error: error.message }, { status: 500 });
     }

     const stale = data ?? [];
     if (stale.length > 0) {
       console.warn("[cron/reconcile] stale PENDING orders need manual review", {
         count: stale.length,
         orderIds: stale.map((o) => (o as { id: string }).id),
       });
     }
     // NOTE ★: PayApp exposes no documented GET status API (spec §6.1, §13). We cannot auto-grant
     // here — grants stay exclusive to verified feedback. When a status cmd is confirmed, add a
     // single re-poll + amount-gated grant before returning.
     return NextResponse.json({
       checked: stale.length,
       note: "★ manual: no PayApp status API — stale PENDING orders logged for operator review; no auto-grant",
     });
   }
   ```

5. - [ ] Run and confirm PASS:
   ```bash
   pnpm vitest run tests/payapp/reconcile.route.test.ts
   ```
   Expected: `3 passed`.

6. - [ ] Do NOT write any cron schedule here. The single deployment-config source is `vercel.ts`, which is **owned and finalized in Phase 4** (it declares ALL crons together: `/api/jobs/worker`, `/api/cron/reconcile`, `/api/cron/reap`, `/api/cron/expire`, each guarded by `Authorization: Bearer ${CRON_SECRET}`). Phase 3 only ships the `/api/cron/reconcile` **route handler** and its test — the `*/10 * * * *` schedule for it is registered by Phase 4's `vercel.ts`. There is NO `vercel.json` (deleted; do not reference it).
   (Vercel Cron sends the configured `Authorization: Bearer ${CRON_SECRET}` header; confirm the project env has `CRON_SECRET` set — manual ★ before deploy, owned by Phase 4 config.)

7. - [ ] Commit:
   ```bash
   git add app/api/cron/reconcile/route.ts tests/payapp/reconcile.route.test.ts
   git commit -m "$(cat <<'EOF'
   feat(cron): reconcile backstop flags stale PENDING orders (no auto-grant)

   Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
   EOF
   )"
   ```

---

## Task 3.8 — `/credits` page + PackGrid buy interaction

**Files:**
- Create: `app/credits/page.tsx` (Server Component)
- Create: `app/credits/_PackGrid.tsx` (Client Component)
- Test: `tests/payapp/packgrid.test.tsx`

**Interfaces:**
- Consumes: `CREDIT_PACKS` from `lib/styles.ts`, `createServerSupabase()` for the current balance.
- Produces: rendered pack grid; `구매` button → `POST /api/payments/payapp/create` → opens `payurl` (mobile: full redirect; PC: popup with redirect fallback).

**Steps:**

1. - [ ] Ensure dir:
   ```bash
   mkdir -p app/credits tests/payapp
   ```

2. - [ ] Write failing component test `tests/payapp/packgrid.test.tsx` (jsdom; uses Testing Library — assumes Phase 0 configured `@testing-library/react` + `jsdom` env in `vitest.config.ts`):
   ```tsx
   // @vitest-environment jsdom
   import { afterEach, describe, expect, it, vi } from "vitest";
   import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
   import { PackGrid } from "@/app/credits/_PackGrid";

   const PACKS = [
     { id: "starter", name: "스타터 10크레딧", price: 9900, credits: 10 },
     { id: "value", name: "밸류 30크레딧", price: 24900, credits: 30 },
   ];

   afterEach(() => { cleanup(); vi.restoreAllMocks(); });

   describe("PackGrid", () => {
     it("renders all packs with Korean price", () => {
       render(<PackGrid packs={PACKS} isMobile={false} />);
       expect(screen.getByText("스타터 10크레딧")).toBeTruthy();
       expect(screen.getByText(/9,900원/)).toBeTruthy();
       expect(screen.getAllByRole("button", { name: "구매" })).toHaveLength(2);
     });

     it("on PC, opens payurl in a popup window", async () => {
       const fetchMock = vi.fn(async () =>
         new Response(JSON.stringify({ payurl: "https://pay.payapp.kr/p/MUL777" }), { status: 200 }));
       vi.stubGlobal("fetch", fetchMock);
       const openMock = vi.fn(() => ({}) as Window);
       vi.stubGlobal("open", openMock);

       render(<PackGrid packs={PACKS} isMobile={false} />);
       fireEvent.click(screen.getAllByRole("button", { name: "구매" })[0]);

       await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
         "/api/payments/payapp/create",
         expect.objectContaining({ method: "POST" }),
       ));
       const sentBody = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
       expect(sentBody).toEqual({ pack_id: "starter" });
       await waitFor(() => expect(openMock).toHaveBeenCalledWith("https://pay.payapp.kr/p/MUL777", "_blank"));
     });

     it("on mobile, full-redirects to payurl", async () => {
       vi.stubGlobal("fetch", vi.fn(async () =>
         new Response(JSON.stringify({ payurl: "https://pay.payapp.kr/p/MUL888" }), { status: 200 })));
       const assignMock = vi.fn();
       // jsdom location is non-configurable; spy the helper instead via a custom event hook.
       render(<PackGrid packs={PACKS} isMobile redirect={assignMock} />);
       fireEvent.click(screen.getAllByRole("button", { name: "구매" })[1]);
       await waitFor(() => expect(assignMock).toHaveBeenCalledWith("https://pay.payapp.kr/p/MUL888"));
     });
   });
   ```

3. - [ ] Run and confirm FAIL:
   ```bash
   pnpm vitest run tests/payapp/packgrid.test.tsx
   ```
   Expected: cannot find module `@/app/credits/_PackGrid`.

4. - [ ] Create `app/credits/_PackGrid.tsx` (full code, Client Component):
   ```tsx
   "use client";

   import { useState } from "react";
   import type { CreditPack } from "@/types/db";

   export function PackGrid({
     packs,
     isMobile,
     redirect = (url: string) => {
       window.location.href = url;
     },
   }: {
     packs: CreditPack[];
     isMobile: boolean;
     redirect?: (url: string) => void;
   }) {
     const [loadingId, setLoadingId] = useState<string | null>(null);
     const [error, setError] = useState<string | null>(null);

     async function buy(packId: string) {
       setError(null);
       setLoadingId(packId);
       try {
         const res = await fetch("/api/payments/payapp/create", {
           method: "POST",
           headers: { "content-type": "application/json" },
           body: JSON.stringify({ pack_id: packId }),
         });
         const data = (await res.json()) as { payurl?: string; error?: string };
         if (!res.ok || !data.payurl) {
           setError(data.error ?? "결제 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.");
           return;
         }
         if (isMobile) {
           redirect(data.payurl);
         } else {
           const win = window.open(data.payurl, "_blank");
           if (!win) redirect(data.payurl); // popup blocked -> fallback to full redirect
         }
       } catch {
         setError("네트워크 오류가 발생했습니다.");
       } finally {
         setLoadingId(null);
       }
     }

     return (
       <div>
         {error && (
           <p role="alert" className="mb-4 text-sm text-red-600">
             {error}
           </p>
         )}
         <ul className="grid grid-cols-1 gap-4 sm:grid-cols-3">
           {packs.map((pack) => (
             <li key={pack.id} className="rounded-2xl border p-6">
               <h3 className="text-lg font-semibold">{pack.name}</h3>
               <p className="mt-2 text-2xl font-bold">{pack.price.toLocaleString("ko-KR")}원</p>
               <p className="mt-1 text-sm text-gray-500">{pack.credits}크레딧</p>
               <button
                 type="button"
                 onClick={() => buy(pack.id)}
                 disabled={loadingId !== null}
                 className="mt-4 w-full rounded-xl bg-black py-3 font-medium text-white disabled:opacity-50"
               >
                 {loadingId === pack.id ? "처리 중…" : "구매"}
               </button>
             </li>
           ))}
         </ul>
       </div>
     );
   }
   ```

5. - [ ] Create `app/credits/page.tsx` (full code, Server Component — detects mobile via UA header):
   ```tsx
   import { headers } from "next/headers";
   import { redirect } from "next/navigation";
   import { createServerSupabase } from "@/lib/supabase/server";
   import { CREDIT_PACKS } from "@/lib/styles";
   import { PackGrid } from "./_PackGrid";

   export const runtime = "nodejs";

   export default async function CreditsPage() {
     const sb = await createServerSupabase();
     const { data: { user } } = await sb.auth.getUser();
     if (!user) redirect("/login?next=/credits");

     const { data: profile } = await sb
       .from("profiles")
       .select("credit_balance")
       .eq("id", user.id)
       .single();

     const ua = (await headers()).get("user-agent") ?? "";
     const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
     const packs = Object.values(CREDIT_PACKS);

     return (
       <main className="mx-auto max-w-3xl px-4 py-10">
         <h1 className="text-2xl font-bold">크레딧 충전</h1>
         <p className="mt-1 text-sm text-gray-500">
           현재 잔액: {profile?.credit_balance ?? 0}크레딧
         </p>
         <p className="mt-1 text-xs text-gray-400">
           1크레딧 = 2K 결과 이미지 1장. 결제는 페이앱(PayApp)으로 안전하게 진행됩니다.
         </p>
         <div className="mt-8">
           <PackGrid packs={packs} isMobile={isMobile} />
         </div>
       </main>
     );
   }
   ```

6. - [ ] Run and confirm PASS:
   ```bash
   pnpm vitest run tests/payapp/packgrid.test.tsx
   ```
   Expected: `3 passed`.

7. - [ ] Commit:
   ```bash
   git add app/credits/page.tsx app/credits/_PackGrid.tsx tests/payapp/packgrid.test.tsx
   git commit -m "$(cat <<'EOF'
   feat(credits): pack grid page opens PayApp payurl (mobile redirect / PC popup fallback)

   Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
   EOF
   )"
   ```

---

## Task 3.9 — `/credits/result` returnurl page (read-only polling)

**Files:**
- Create: `app/credits/result/page.tsx` (Server Component shell)
- Create: `app/credits/result/_OrderStatus.tsx` (Client Component polling)
- Test: `tests/payapp/order-status.test.tsx`

**Interfaces:**
- Consumes: `createServerSupabase()` to read the order (RLS-scoped).
- Produces: read-only status view that polls a lightweight status endpoint. NEVER grants credits (the spec forbids returnurl-side granting — feedback is the only grant path).

> Add a tiny read-only status endpoint as part of this task: `app/credits/result/status/route.ts` returning `{ status }` for the caller's own order. Polling stops once status is terminal (`PAID`/`REFUNDED`).

**Steps:**

1. - [ ] Ensure dirs:
   ```bash
   mkdir -p app/credits/result/status
   ```

2. - [ ] Write failing test `tests/payapp/order-status.test.tsx`:
   ```tsx
   // @vitest-environment jsdom
   import { afterEach, describe, expect, it, vi } from "vitest";
   import { cleanup, render, screen, waitFor } from "@testing-library/react";
   import { OrderStatus } from "@/app/credits/result/_OrderStatus";

   afterEach(() => { cleanup(); vi.restoreAllMocks(); });

   describe("OrderStatus", () => {
     it("shows pending then transitions to paid via polling", async () => {
       const responses = ["PENDING", "PAID"];
       vi.stubGlobal("fetch", vi.fn(async () =>
         new Response(JSON.stringify({ status: responses.shift() ?? "PAID" }), { status: 200 })));
       render(<OrderStatus orderId="order-1" initialStatus="PENDING" pollMs={10} />);
       expect(screen.getByText(/결제 확인 중/)).toBeTruthy();
       await waitFor(() => expect(screen.getByText(/충전이 완료/)).toBeTruthy(), { timeout: 1000 });
     });

     it("renders refunded terminal state without polling", () => {
       const fetchMock = vi.fn();
       vi.stubGlobal("fetch", fetchMock);
       render(<OrderStatus orderId="order-2" initialStatus="REFUNDED" pollMs={10} />);
       expect(screen.getByText(/환불/)).toBeTruthy();
       expect(fetchMock).not.toHaveBeenCalled();
     });
   });
   ```

3. - [ ] Run and confirm FAIL:
   ```bash
   pnpm vitest run tests/payapp/order-status.test.tsx
   ```
   Expected: cannot find module `_OrderStatus`.

4. - [ ] Create `app/credits/result/_OrderStatus.tsx` (full code):
   ```tsx
   "use client";

   import { useEffect, useState } from "react";

   type Status = "PENDING" | "PAID" | "REFUNDED";

   export function OrderStatus({
     orderId,
     initialStatus,
     pollMs = 3000,
   }: {
     orderId: string;
     initialStatus: Status;
     pollMs?: number;
   }) {
     const [status, setStatus] = useState<Status>(initialStatus);

     useEffect(() => {
       if (status !== "PENDING") return;
       let active = true;
       const timer = setInterval(async () => {
         try {
           const res = await fetch(`/credits/result/status?order=${encodeURIComponent(orderId)}`);
           if (!res.ok) return;
           const data = (await res.json()) as { status?: Status };
           if (active && data.status && data.status !== "PENDING") {
             setStatus(data.status);
             clearInterval(timer);
           }
         } catch {
           // transient; keep polling
         }
       }, pollMs);
       return () => {
         active = false;
         clearInterval(timer);
       };
     }, [status, orderId, pollMs]);

     if (status === "PAID") {
       return (
         <div role="status" className="rounded-xl bg-green-50 p-6 text-green-800">
           <p className="font-semibold">충전이 완료되었습니다.</p>
           <p className="mt-1 text-sm">크레딧이 적립되었어요. 이제 프로필을 만들어 보세요.</p>
         </div>
       );
     }
     if (status === "REFUNDED") {
       return (
         <div role="status" className="rounded-xl bg-gray-50 p-6 text-gray-700">
           <p className="font-semibold">환불 처리된 주문입니다.</p>
         </div>
       );
     }
     return (
       <div role="status" className="rounded-xl bg-yellow-50 p-6 text-yellow-800">
         <p className="font-semibold">결제 확인 중…</p>
         <p className="mt-1 text-sm">결제가 완료되면 자동으로 크레딧이 적립됩니다. 잠시만 기다려 주세요.</p>
       </div>
     );
   }
   ```

5. - [ ] Create `app/credits/result/status/route.ts` (full code — read-only, RLS-scoped, never grants):
   ```ts
   import { NextResponse } from "next/server";
   import { createServerSupabase } from "@/lib/supabase/server";
   import { getOrder } from "@/lib/db";

   export const runtime = "nodejs";

   export async function GET(req: Request) {
     const sb = await createServerSupabase();
     const { data: { user } } = await sb.auth.getUser();
     if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

     const orderId = new URL(req.url).searchParams.get("order");
     if (!orderId) return NextResponse.json({ error: "missing order" }, { status: 400 });

     const order = await getOrder(sb, orderId);
     if (!order || order.user_id !== user.id) {
       return NextResponse.json({ error: "not found" }, { status: 404 });
     }
     // READ-ONLY: returnurl path must never grant credits (spec §6.2).
     return NextResponse.json({ status: order.status });
   }
   ```

6. - [ ] Create `app/credits/result/page.tsx` (full code):
   ```tsx
   import { redirect } from "next/navigation";
   import { createServerSupabase } from "@/lib/supabase/server";
   import { getOrder } from "@/lib/db";
   import { OrderStatus } from "./_OrderStatus";

   export const runtime = "nodejs";

   export default async function CreditsResultPage({
     searchParams,
   }: {
     searchParams: Promise<{ order?: string }>;
   }) {
     const { order: orderId } = await searchParams;
     const sb = await createServerSupabase();
     const { data: { user } } = await sb.auth.getUser();
     if (!user) redirect("/login");
     if (!orderId) redirect("/credits");

     const order = await getOrder(sb, orderId);
     if (!order || order.user_id !== user.id) redirect("/credits");

     return (
       <main className="mx-auto max-w-lg px-4 py-16">
         <h1 className="mb-6 text-xl font-bold">결제 결과</h1>
         <OrderStatus orderId={order.id} initialStatus={order.status} />
       </main>
     );
   }
   ```

7. - [ ] Run and confirm PASS:
   ```bash
   pnpm vitest run tests/payapp/order-status.test.tsx
   ```
   Expected: `2 passed`.

8. - [ ] Commit:
   ```bash
   git add app/credits/result/page.tsx app/credits/result/_OrderStatus.tsx app/credits/result/status/route.ts tests/payapp/order-status.test.tsx
   git commit -m "$(cat <<'EOF'
   feat(credits): returnurl result page polls order status read-only (never grants)

   Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
   EOF
   )"
   ```

---

## Task 3.10 — End-to-end buy flow (Playwright, PayApp + feedback stubbed)

**Files:**
- Create: `e2e/credits-buy.spec.ts`

**Interfaces:**
- Consumes: the full route set above. NO real PayApp call, NO real money.

**Test design:** Intercept the outbound PayApp endpoint at the Playwright network layer so `payappCreate` gets a synthetic `state=1&mul_no=...&payurl=...`. Point the synthetic `payurl` at a test page that immediately POSTs a forged-but-valid (test-secret) feedback to `/api/payments/payapp/feedback`, simulating PayApp's webhook. Then assert the result page flips to "충전이 완료". Requires a running dev server with **test PayApp env secrets** (`PAYAPP_USERID=testuser`, etc.) and a seeded logged-in session (use the Phase-2 auth helper / storage state). Mark as needing the local stack.

**Steps:**

1. - [ ] Ensure dir:
   ```bash
   mkdir -p e2e
   ```

2. - [ ] Create `e2e/credits-buy.spec.ts` (full code):
   ```ts
   import { expect, test } from "@playwright/test";

   // Requires: pnpm dev running with TEST PayApp secrets (PAYAPP_USERID=testuser,
   // PAYAPP_LINKKEY=lk_test, PAYAPP_VALUE=val_test) and an authenticated storageState
   // (configured in playwright.config.ts -> use.storageState from the Phase 2 auth setup).
   // NO real money: the PayApp endpoint is intercepted and feedback is simulated.

   const PAYAPP_ENDPOINT = "https://api.payapp.kr/oapi/apiLoad.html";

   test("user buys starter pack and credits flip to completed", async ({ page, request, baseURL }) => {
     // Intercept the server-side PayApp create call is NOT possible from the browser context;
     // instead intercept at the app boundary: the create route calls PayApp server-side, so we
     // run against a dev server started with PAYAPP_ENDPOINT overridden to a local mock — OR,
     // simpler for E2E: stub the browser fetch to /api/payments/payapp/create to return a fake payurl.
     await page.route("**/api/payments/payapp/create", async (route) => {
       await route.fulfill({
         status: 200,
         contentType: "application/json",
         body: JSON.stringify({ payurl: `${baseURL}/e2e/fake-payapp` }),
       });
     });

     await page.goto("/credits");
     await expect(page.getByRole("heading", { name: "크레딧 충전" })).toBeVisible();

     // Capture the popup the PC flow opens.
     const popupPromise = page.waitForEvent("popup");
     await page.getByRole("button", { name: "구매" }).first().click();
     const popup = await popupPromise;
     await popup.waitForLoadState();

     // Simulate PayApp's server-to-server feedback for the order we just created.
     // The order id is the most recent PENDING order for this user; fetch it via a test helper route
     // OR derive it: here we look it up through the result-status by reading the create response.
     // For determinism, the dev server exposes E2E_LAST_ORDER via a test-only header on create.
     // (If unavailable, seed a known order id in the test DB.)
     const orderId = await page.evaluate(() => window.localStorage.getItem("e2e_last_order"));
     expect(orderId, "create route should stash order id for e2e").toBeTruthy();

     const fb = await request.post("/api/payments/payapp/feedback", {
       form: {
         userid: "testuser",
         linkkey: "lk_test",
         linkval: "val_test",
         mul_no: "E2E-MUL",
         var1: orderId!,
         var2: "e2e-user",
         price: "9900",
         pay_state: "4",
         pay_type: "1",
       },
     });
     expect(fb.status()).toBe(200);
     expect(await fb.text()).toBe("SUCCESS");

     // Result page should show completed after polling.
     await page.goto(`/credits/result?order=${orderId}`);
     await expect(page.getByText("충전이 완료되었습니다.")).toBeVisible({ timeout: 10_000 });
   });
   ```

3. - [ ] To support the E2E order-id handoff, add a test-only stash in the create route. Guard it behind `process.env.E2E === "1"` so production never exposes it. Modify the **client** PackGrid to persist the created order id when an `E2E` flag header comes back — simplest is: in `app/api/payments/payapp/create/route.ts`, when `process.env.E2E === "1"`, include the order id in the JSON, and in `_PackGrid.tsx` stash it. Add to the create route's success branch:
   ```ts
   // inside POST, replace the success return with:
   const payload: { payurl: string; order_id?: string } = { payurl };
   if (process.env.E2E === "1") payload.order_id = order.id;
   return NextResponse.json(payload);
   ```
   And in `_PackGrid.tsx` `buy()`, after a successful response, before redirect/open:
   ```ts
   if (data.order_id) window.localStorage.setItem("e2e_last_order", data.order_id);
   ```
   (Update the `data` type to `{ payurl?: string; order_id?: string; error?: string }`.)

4. - [ ] Run the E2E suite (requires `pnpm dev` with E2E + test PayApp env, and Playwright browsers installed):
   ```bash
   E2E=1 PAYAPP_USERID=testuser PAYAPP_LINKKEY=lk_test PAYAPP_VALUE=val_test pnpm playwright test e2e/credits-buy.spec.ts
   ```
   Expected: `1 passed`. (If the auth storageState is not yet wired from Phase 2, mark this test `test.skip` with a TODO referencing the Phase 2 auth-setup project and keep the file committed.)

5. - [ ] Run the full Vitest suite to confirm no regressions from the create-route E2E tweak:
   ```bash
   pnpm vitest run tests/payapp
   ```
   Expected: all PayApp unit/integration tests pass.

6. - [ ] Commit:
   ```bash
   git add e2e/credits-buy.spec.ts app/api/payments/payapp/create/route.ts app/credits/_PackGrid.tsx
   git commit -m "$(cat <<'EOF'
   test(payapp): e2e buy flow with stubbed PayApp + simulated feedback (no real money)

   Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
   EOF
   )"
   ```

---

## Task 3.11 — Manual launch checklist (no code; documented gates)

**Files:** none (this task records ★ manual gates in the PR description / launch runbook).

**Steps:**

1. - [ ] Confirm `.env.example` (owned by Phase 0) contains `PAYAPP_USERID`, `PAYAPP_LINKKEY`, `PAYAPP_VALUE`, `APP_BASE_URL`, `CRON_SECRET`. If any are missing, add them with empty placeholder values and commit (`chore(env): add PayApp + cron env keys`).

2. - [ ] Document these pre-launch manual gates (★) in the PR body — DO NOT block the plan on them:
   - Register PayApp 개인사업자 account; obtain real `userid` / `linkkey` / `linkval`; set in Vercel project env (Production + Preview).
   - Run a real ₩1,000 transaction end-to-end (card + 카카오페이), verify credits granted exactly once, then `paycancel` and verify claw-back via refund feedback.
   - Confirm PayApp sender IP whitelist (if any) and feedback field spelling against a captured real payload (`card_name`, `pay_type` codes) — adjust `verifyFeedback`/`feedback` parsing only if the live payload differs.
   - Confirm whether PayApp exposes a status `cmd`; if yes, extend `/api/cron/reconcile` to re-poll + amount-gate before any grant.
   - Confirm `CRON_SECRET` is set so Vercel Cron's `Authorization: Bearer` header matches.

3. - [ ] Final verification — run the whole phase's automated tests once more and capture output for the PR:
   ```bash
   pnpm vitest run tests/payapp
   ```
   Expected: full PayApp suite green.

4. - [ ] Commit any env/doc changes:
   ```bash
   git add .env.example
   git commit -m "$(cat <<'EOF'
   chore(payapp): ensure env keys present + document launch gates

   Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
   EOF
   )"
   ```

---

## Phase 3 Done Criteria

- [ ] `lib/payapp/client.ts` (`payappCreate`, `payappCancel`) + `lib/payapp/verify.ts` (`verifyFeedback`) unit-tested.
- [ ] `/api/payments/payapp/create` inserts authoritative PENDING order, stores `mul_no`, returns `payurl`.
- [ ] `/api/payments/payapp/feedback` grants exactly once (idempotent), rejects forged secret (FAIL), rejects amount mismatch, handles vbank-pending (ack), claws back on refund — always 200 `SUCCESS` on acked cases.
- [ ] `/credits` page renders packs and launches PayApp (mobile redirect / PC popup+fallback); `/credits/result` polls read-only and never grants.
- [ ] `/api/payments/payapp/cancel` issues `paycancel` for owned PAID orders.
- [ ] `/api/cron/reconcile` is `CRON_SECRET`-guarded and flags stale PENDING orders (no auto-grant; ★ manual note).
- [ ] Playwright buy-flow E2E passes (or is `skip`-marked pending Phase 2 auth setup) with PayApp + feedback stubbed.
- [ ] All secrets server-only; client never sees PayApp keys or `CRON_SECRET`.
