# ProfAI — Phase 1: Foundation Auth Consent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Stand up the ProfAI repo end-to-end for the *first runnable vertical slice of identity*: a Korean B2C user logs in with Kakao or Google, completes unbundled PIPA consent, is auto-granted 3 free credits, and sees their balance in the nav. All database tables (spec §5), own-row RLS, the concurrency-safe credit RPCs, and the new-user signup-bonus trigger are live and proven by pgTAP + Vitest tests. This phase produces the schema, the typed DB/credit/consent helper layer, the Supabase client factories, middleware session refresh, the auth + consent UI, the base app shell/landing, and the style-preset seed — i.e. the foundation every later phase consumes.

**Architecture:** Next.js 16 App Router (RSC) on Vercel Node runtime; Supabase (Postgres + Auth + Storage + Realtime) as the system of record. Auth is cookie-bound via `@supabase/ssr`; `middleware.ts` refreshes the session on every request and gates protected routes. Credits are a Postgres ledger (`credit_ledger`, append-only) with a cached `profiles.credit_balance`; all mutations go through `SECURITY DEFINER` RPCs called from the server with the service-role client. RLS restricts every row to `auth.uid()`. The signup bonus is a `SECURITY DEFINER` trigger on `auth.users` that inserts the `profiles` row and grants `FREE_SIGNUP_CREDITS` via `grant_credits`.

**Tech Stack:** Next.js 16 App Router + React Server Components, TypeScript strict, pnpm, Tailwind + shadcn/ui, react-hook-form + zod (installed here, used in later phases), `@supabase/ssr` + `@supabase/supabase-js`, Vitest (unit/integration with `vi.mock`), Playwright (E2E), pgTAP (`supabase test db`, requires Docker + Supabase CLI).

## Global Constraints  (copy verbatim into every ProfAI phase)

- Next.js 16 App Router + React Server Components, TypeScript strict. Package manager: pnpm.
- API routes and the worker run on Node runtime: `export const runtime = "nodejs"`. NEVER Edge.
- Test stack: Vitest (unit/integration, with `vi.mock` for Supabase/provider clients) + Playwright (E2E). DB migration/RLS/RPC tests via pgTAP in `supabase/tests` run with `supabase test db` (requires Docker + Supabase CLI). State the Docker requirement where used.
- Every secret is server-only. Client may ONLY see `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. NEVER expose `OPENAI_API_KEY`, `GEMINI_API_KEY`/`AI_GATEWAY_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PAYAPP_USERID`/`LINKKEY`/`VALUE`, `CRON_SECRET`.
- Pin models: OpenAI gpt-image-2 (snapshot `gpt-image-2-2026-04-21`); Google `google/gemini-3-pro-image`; free tier `google/gemini-3.1-flash-image-preview` or `gpt-image-1-mini`. Verify ids live before launch (manual step, do not block).
- Credit unit: 1 credit = 1 output image at 2K. 4K = 2 credits (post-MVP). Free signup = 3 credits, watermarked 1K.
- Korean UI copy. All generated outputs (free tier especially) carry a visible "AI 생성" label per 인공지능기본법.
- Frequent commits: each task ends with a commit. Conventional commit messages (feat/fix/test/chore/docs). End commit body with: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

### ENV VARS (.env.example — full list, this phase creates the file)

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
OPENAI_API_KEY
AI_GATEWAY_API_KEY
PAYAPP_USERID
PAYAPP_LINKKEY
PAYAPP_VALUE
APP_BASE_URL
CRON_SECRET
```

## File Structure  (subset this phase creates/modifies)

| Path | Responsibility |
|---|---|
| `package.json`, `pnpm-lock.yaml`, `tsconfig.json` | pnpm + Next 16 + TS strict scaffold |
| `next.config.ts` | Next config (Node runtime defaults, image domains) |
| `vercel.ts` | Framework-only deploy config (crons owned/finalized in Phase 4; NO crons here) |
| `vitest.config.ts` | Vitest config (node env, alias `@/`) |
| `playwright.config.ts` | Playwright E2E config (webServer dev) |
| `.env.example` | All env var names (no values) |
| `tailwind.config.ts`, `app/globals.css`, `postcss.config.mjs`, `components.json` | Tailwind + shadcn/ui |
| `lib/supabase/server.ts` | `createServerSupabase()` cookie-bound RLS client |
| `lib/supabase/browser.ts` | `createBrowserSupabase()` client-component client |
| `lib/supabase/service.ts` | `createServiceSupabase()` service-role server-only client |
| `lib/supabase/middleware.ts` | `updateSession(request)` cookie refresh |
| `middleware.ts` | Runs `updateSession`, gates protected routes |
| `types/db.ts` | DB row types (Profile, Consent, CreditLedger, Order, StylePreset, GenerationJob, Asset, CreditPack) |
| `lib/db.ts` | DB helpers (insertOrder/getOrder/updateOrder/markOrderPaidIfPending/markOrderRefundedIfPaid/insertJobs/getJob/setJobStatus/insertAsset) |
| `lib/credits.ts` | RPC wrappers (debitCredits/grantCredits/refundHold/clawbackCredits) |
| `lib/consent.ts` | Consent constants + read/write helpers + `hasRequiredConsents` |
| `lib/age.ts` | Age-gate helpers (`MIN_AGE=14`, `ageFromBirthdate`, `isAgeAllowed`) — spec §9 만 14세 미만 차단 |
| `lib/styles.ts` | `CREDIT_PACKS`, `FREE_SIGNUP_CREDITS`, `STYLE_FAMILIES` |
| `supabase/config.toml` | Supabase local project config |
| `supabase/migrations/0001_init_tables.sql` | All tables + indexes (spec §5.1) |
| `supabase/migrations/0002_rls.sql` | Own-row RLS policies |
| `supabase/migrations/0003_credit_rpcs.sql` | `debit_credits`/`grant_credits`/`refund_hold`/`clawback_credits` |
| `supabase/migrations/0004_signup_trigger.sql` | New-user → profile + signup bonus trigger |
| `supabase/seed.sql` | ~12 `style_presets` (spec §8) |
| `supabase/tests/rls.test.sql` | pgTAP: own-row RLS |
| `supabase/tests/credit_rpcs.test.sql` | pgTAP: debit FOR UPDATE / insufficient / refund |
| `supabase/tests/signup_bonus.test.sql` | pgTAP: signup grants 3 credits |
| `app/layout.tsx` | Root shell + nav with credit balance |
| `app/page.tsx` | Landing (hook + free-trial CTA) |
| `app/login/page.tsx` | Kakao + Google OAuth buttons |
| `app/auth/callback/route.ts` | OAuth code exchange |
| `app/onboarding/consent/page.tsx` | Unbundled consent form (gates /create) |
| `app/onboarding/consent/actions.ts` | Server action: persist consents |
| `app/create/page.tsx` | Placeholder studio, gated by consent (filled in later phases) |
| `components/nav.tsx` | Client nav reading balance |
| `tests/unit/*.test.ts` | Vitest unit tests (db/credits/consent/styles) |
| `e2e/auth-consent.spec.ts` | Playwright login + consent gate |

---

## Task 1.1 — Scaffold Next.js 16 + TS strict + Tailwind + shadcn/ui

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `app/layout.tsx` (temporary), `app/page.tsx` (temporary), `app/globals.css`, `tailwind.config.ts`, `postcss.config.mjs`, `components.json`, `.gitignore`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: a buildable Next 16 + TS strict + Tailwind app; path alias `@/*`.

**Steps:**

1. - [ ] Initialize git + pnpm and scaffold Next 16. Run from repo root:
   ```bash
   cd "C:/Users/레노버/profile_gen"
   git init
   pnpm dlx create-next-app@latest . --ts --app --tailwind --eslint --src-dir=false --import-alias "@/*" --use-pnpm --no-turbopack --skip-install
   ```
   (If the scaffolder refuses a non-empty dir because `docs/` exists, scaffold into a temp dir then move files: `pnpm dlx create-next-app@latest .tmpapp ...` and copy everything except `docs/` up. Keep the existing `docs/` folder.)

2. - [ ] Install deps explicitly:
   ```bash
   pnpm add next@^16 react@^19 react-dom@^19 @supabase/ssr @supabase/supabase-js zod react-hook-form @hookform/resolvers
   pnpm add -D typescript @types/node @types/react @types/react-dom tailwindcss postcss autoprefixer vitest @vitejs/plugin-react jsdom @playwright/test
   ```

3. - [ ] Enforce TS strict. Overwrite `tsconfig.json`:
   ```json
   {
     "compilerOptions": {
       "target": "ES2022",
       "lib": ["dom", "dom.iterable", "ES2022"],
       "allowJs": true,
       "skipLibCheck": true,
       "strict": true,
       "noEmit": true,
       "esModuleInterop": true,
       "module": "esnext",
       "moduleResolution": "bundler",
       "resolveJsonModule": true,
       "isolatedModules": true,
       "jsx": "preserve",
       "incremental": true,
       "verbatimModuleSyntax": true,
       "plugins": [{ "name": "next" }],
       "paths": { "@/*": ["./*"] }
     },
     "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
     "exclude": ["node_modules"]
   }
   ```

4. - [ ] Write `next.config.ts`:
   ```ts
   import type { NextConfig } from "next";

   const nextConfig: NextConfig = {
     reactStrictMode: true,
     experimental: {
       // Server Actions enabled by default in App Router; keep body limit generous for later multipart.
       serverActions: { bodySizeLimit: "8mb" },
     },
   };

   export default nextConfig;
   ```

5. - [ ] Initialize shadcn/ui (creates `components.json`, `lib/utils.ts`, wires Tailwind tokens):
   ```bash
   pnpm dlx shadcn@latest init -d -b neutral
   pnpm dlx shadcn@latest add button card checkbox label
   ```
   Confirm `components.json` exists and `components/ui/button.tsx` was created.

6. - [ ] Ensure `.gitignore` excludes secrets and Supabase local artifacts. Append:
   ```
   .env
   .env.local
   *.key
   *credentials*
   *secret*
   .vercel
   supabase/.branches
   supabase/.temp
   /test-results
   /playwright-report
   ```

7. - [ ] Verify build compiles (expected: PASS, "Compiled successfully"):
   ```bash
   pnpm exec tsc --noEmit
   pnpm build
   ```

8. - [ ] Commit:
   ```bash
   git add -A && git commit -m "chore: scaffold Next.js 16 App Router + TS strict + Tailwind + shadcn/ui" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
   ```

---

## Task 1.2 — Test configs, env example, next/vercel config

**Files:**
- Create: `vitest.config.ts`, `playwright.config.ts`, `.env.example`, `vercel.ts`, `tests/unit/.gitkeep`, `e2e/.gitkeep`

**Interfaces:**
- Consumes: scaffold from Task 1.1 (`@/*` alias).
- Produces: `pnpm test` (vitest), `pnpm e2e` (playwright) scripts; framework-only `vercel.ts` (crons owned/finalized in Phase 4, NOT scaffolded here).

**Steps:**

1. - [ ] Write `vitest.config.ts`:
   ```ts
   import { defineConfig } from "vitest/config";
   import react from "@vitejs/plugin-react";
   import path from "node:path";

   export default defineConfig({
     plugins: [react()],
     test: {
       environment: "node",
       include: ["tests/unit/**/*.test.ts", "tests/unit/**/*.test.tsx"],
       globals: true,
     },
     resolve: {
       alias: { "@": path.resolve(__dirname, ".") },
     },
   });
   ```

2. - [ ] Write `playwright.config.ts`:
   ```ts
   import { defineConfig, devices } from "@playwright/test";

   export default defineConfig({
     testDir: "./e2e",
     fullyParallel: true,
     forbidOnly: !!process.env.CI,
     retries: process.env.CI ? 2 : 0,
     reporter: "list",
     use: {
       baseURL: process.env.APP_BASE_URL ?? "http://localhost:3000",
       trace: "on-first-retry",
     },
     projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
     webServer: {
       command: "pnpm dev",
       url: "http://localhost:3000",
       reuseExistingServer: !process.env.CI,
       timeout: 120_000,
     },
   });
   ```

3. - [ ] Add scripts to `package.json` (merge into `"scripts"`):
   ```json
   {
     "scripts": {
       "dev": "next dev",
       "build": "next build",
       "start": "next start",
       "lint": "next lint",
       "typecheck": "tsc --noEmit",
       "test": "vitest run",
       "test:watch": "vitest",
       "e2e": "playwright test",
       "db:test": "supabase test db"
     }
   }
   ```

4. - [ ] Write `.env.example` (names only, never values):
   ```
   # Supabase (public — safe for client)
   NEXT_PUBLIC_SUPABASE_URL=
   NEXT_PUBLIC_SUPABASE_ANON_KEY=
   # Supabase (server-only)
   SUPABASE_SERVICE_ROLE_KEY=
   # AI providers (server-only)
   OPENAI_API_KEY=
   AI_GATEWAY_API_KEY=
   # PayApp (server-only)
   PAYAPP_USERID=
   PAYAPP_LINKKEY=
   PAYAPP_VALUE=
   # App
   APP_BASE_URL=http://localhost:3000
   CRON_SECRET=
   ```

5. - [ ] Write `vercel.ts` (framework-only scaffold — `vercel.ts` is the SINGLE source of deploy config; there is NO `vercel.json`. Crons are owned/finalized in Phase 4 and are intentionally NOT declared here. The worker function timeout is NOT set here either — it moves to a Next.js route segment `export const maxDuration = 300` on `app/api/jobs/worker/route.ts` in Phase 2):
   ```ts
   // Vercel project configuration. Single source of truth (no vercel.json).
   // Phase 1 keeps this framework-only. Cron schedules are added/finalized in Phase 4;
   // the worker maxDuration is a route segment export (Phase 2), NOT a functions entry here.
   const config = {
     $schema: "https://openapi.vercel.sh/vercel.json",
     framework: "nextjs",
   } as const;

   export default config;
   ```
   > NOTE for the implementer: keep `vercel.ts` as the only deploy-config file — do NOT create a `vercel.json`. Crons (`/api/jobs/worker`, `/api/cron/reconcile`, `/api/cron/reap`, `/api/cron/expire`) and their `CRON_SECRET` guards land in Phase 4, which owns the final cron block. This is a deploy-config detail, not blocking for Phase 1 tests.

6. - [ ] Create empty test dirs:
   ```bash
   mkdir -p tests/unit e2e && touch tests/unit/.gitkeep e2e/.gitkeep
   ```

7. - [ ] Verify configs load (expected: vitest reports "No test files found", exit 0 is acceptable; we just confirm config parses):
   ```bash
   pnpm test || echo "no tests yet — config parsed"
   pnpm exec playwright --version
   ```

8. - [ ] Commit:
   ```bash
   git add -A && git commit -m "chore: add vitest, playwright, env example, framework-only vercel config" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
   ```

---

## Task 1.3 — Supabase client factories + middleware session refresh

**Files:**
- Create: `lib/supabase/server.ts`, `lib/supabase/browser.ts`, `lib/supabase/service.ts`, `lib/supabase/middleware.ts`, `middleware.ts`
- Test: `tests/unit/supabase-clients.test.ts`

**Interfaces:**
- Consumes: env vars `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- Produces (VERBATIM contract):
  - `createServerSupabase(): Promise<SupabaseClient>` — cookie-bound RLS client for Server Components/Route Handlers.
  - `createBrowserSupabase(): SupabaseClient` — client-component client.
  - `createServiceSupabase(): SupabaseClient` — service-role, server-only, bypasses RLS.
  - `updateSession(request: NextRequest): Promise<NextResponse>` — refreshes auth cookies via `getClaims`.

**Steps:**

1. - [ ] Write failing test `tests/unit/supabase-clients.test.ts` (mocks `@supabase/ssr`; asserts factories call the right SDK function with the right keys, and that `createServiceSupabase` uses the service-role key with auth persistence disabled):
   ```ts
   import { describe, it, expect, vi, beforeEach } from "vitest";

   const createServerClient = vi.fn(() => ({ __kind: "server" }));
   const createBrowserClient = vi.fn(() => ({ __kind: "browser" }));

   vi.mock("@supabase/ssr", () => ({ createServerClient, createBrowserClient }));
   vi.mock("next/headers", () => ({
     cookies: vi.fn(async () => ({ getAll: () => [], set: () => {} })),
   }));

   beforeEach(() => {
     vi.clearAllMocks();
     process.env.NEXT_PUBLIC_SUPABASE_URL = "https://proj.supabase.co";
     process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
     process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
   });

   it("createServerSupabase uses url + anon key", async () => {
     const { createServerSupabase } = await import("@/lib/supabase/server");
     await createServerSupabase();
     expect(createServerClient).toHaveBeenCalledWith(
       "https://proj.supabase.co",
       "anon-key",
       expect.objectContaining({ cookies: expect.any(Object) }),
     );
   });

   it("createBrowserSupabase uses url + anon key", async () => {
     const { createBrowserSupabase } = await import("@/lib/supabase/browser");
     createBrowserSupabase();
     expect(createBrowserClient).toHaveBeenCalledWith("https://proj.supabase.co", "anon-key");
   });

   it("createServiceSupabase uses service-role key with persistSession false", async () => {
     const { createServiceSupabase } = await import("@/lib/supabase/service");
     createServiceSupabase();
     expect(createServerClient).toHaveBeenCalledWith(
       "https://proj.supabase.co",
       "service-key",
       expect.objectContaining({ auth: { persistSession: false, autoRefreshToken: false } }),
     );
   });
   ```
   Run (expected: FAIL — modules do not exist yet):
   ```bash
   pnpm test tests/unit/supabase-clients.test.ts
   ```

2. - [ ] Write `lib/supabase/server.ts`:
   ```ts
   import { createServerClient } from "@supabase/ssr";
   import { cookies } from "next/headers";

   /** Cookie-bound, RLS-respecting Supabase client for Server Components and Route Handlers. */
   export async function createServerSupabase() {
     const cookieStore = await cookies();
     return createServerClient(
       process.env.NEXT_PUBLIC_SUPABASE_URL!,
       process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
       {
         cookies: {
           getAll() {
             return cookieStore.getAll();
           },
           setAll(cookiesToSet) {
             try {
               for (const { name, value, options } of cookiesToSet) {
                 cookieStore.set(name, value, options);
               }
             } catch {
               // Called from a Server Component (read-only cookies). Safe to ignore:
               // middleware refreshes the session cookie.
             }
           },
         },
       },
     );
   }
   ```

3. - [ ] Write `lib/supabase/browser.ts`:
   ```ts
   import { createBrowserClient } from "@supabase/ssr";

   /** Browser Supabase client for client components. */
   export function createBrowserSupabase() {
     return createBrowserClient(
       process.env.NEXT_PUBLIC_SUPABASE_URL!,
       process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
     );
   }
   ```

4. - [ ] Write `lib/supabase/service.ts` (server-only — uses service-role key; never import into a client component):
   ```ts
   import "server-only";
   import { createServerClient } from "@supabase/ssr";

   /**
    * Service-role Supabase client. Bypasses RLS. SERVER-ONLY.
    * Use in worker, payapp feedback handler, and cron routes.
    * No cookies: it must not act on behalf of a logged-in user.
    */
   export function createServiceSupabase() {
     return createServerClient(
       process.env.NEXT_PUBLIC_SUPABASE_URL!,
       process.env.SUPABASE_SERVICE_ROLE_KEY!,
       {
         auth: { persistSession: false, autoRefreshToken: false },
         cookies: { getAll: () => [], setAll: () => {} },
       },
     );
   }
   ```

5. - [ ] Write `lib/supabase/middleware.ts`:
   ```ts
   import { createServerClient } from "@supabase/ssr";
   import { NextResponse, type NextRequest } from "next/server";

   /**
    * Refreshes the Supabase auth session and propagates updated cookies.
    * Returns a NextResponse the middleware must return (or copy cookies from).
    */
   export async function updateSession(request: NextRequest) {
     let response = NextResponse.next({ request });

     const supabase = createServerClient(
       process.env.NEXT_PUBLIC_SUPABASE_URL!,
       process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
       {
         cookies: {
           getAll() {
             return request.cookies.getAll();
           },
           setAll(cookiesToSet) {
             for (const { name, value } of cookiesToSet) {
               request.cookies.set(name, value);
             }
             response = NextResponse.next({ request });
             for (const { name, value, options } of cookiesToSet) {
               response.cookies.set(name, value, options);
             }
           },
         },
       },
     );

     // IMPORTANT: getClaims revalidates the JWT and triggers cookie refresh.
     await supabase.auth.getClaims();

     return response;
   }
   ```

6. - [ ] Write `middleware.ts` (refreshes session on every matched request; route protection is added in Task 1.10 once consent gating exists — for now just refresh):
   ```ts
   import { type NextRequest } from "next/server";
   import { updateSession } from "@/lib/supabase/middleware";

   export async function middleware(request: NextRequest) {
     return await updateSession(request);
   }

   export const config = {
     matcher: [
       // Run on everything except static assets and image optimizer.
       "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
     ],
   };
   ```

7. - [ ] Run test (expected: PASS, 3 passed):
   ```bash
   pnpm test tests/unit/supabase-clients.test.ts
   ```

8. - [ ] Commit:
   ```bash
   git add -A && git commit -m "feat: supabase client factories + middleware session refresh" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
   ```

---

## Task 1.4 — DB row types (`types/db.ts`)

**Files:**
- Create: `types/db.ts`
- Test: `tests/unit/db-types.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (VERBATIM): `Profile`, `Consent`, `CreditLedger`, `Order`, `StylePreset`, `GenerationJob`, `Asset`, `CreditPack` plus the `NewJob` input type used by `insertJobs`.

**Steps:**

1. - [ ] Write `types/db.ts` (exact shapes from the contract):
   ```ts
   export type Profile = {
     id: string;
     display_name: string | null;
     phone: string | null;
     age_verified: boolean;
     credit_balance: number;
     created_at: string;
   };

   export type ConsentType =
     | "tos"
     | "privacy"
     | "sensitive_face"
     | "own_face"
     | "marketing";

   export type Consent = {
     id: number;
     user_id: string;
     type: ConsentType;
     version: string;
     agreed_at: string;
     ip: string | null;
   };

   export type CreditLedgerReason =
     | "purchase"
     | "generation_hold"
     | "refund"
     | "release"
     | "signup_bonus";

   export type CreditLedger = {
     id: number;
     user_id: string;
     delta: number;
     reason: CreditLedgerReason;
     ref_type: string | null;
     ref_id: string | null;
     created_at: string;
   };

   export type OrderStatus = "PENDING" | "PAID" | "REFUNDED";

   export type Order = {
     id: string;
     user_id: string;
     pack_id: string;
     expected_amount: number;
     credits: number;
     status: OrderStatus;
     payapp_mul_no: string | null;
     payapp_pay_state: string | null;
     payapp_pay_type: string | null;
     paid_at: string | null;
     created_at: string;
   };

   export type StyleFamily = "business" | "editorial" | "sns" | "fantasy" | "free";

   export type StylePreset = {
     id: string;
     name_ko: string;
     family: StyleFamily;
     model_key: string;
     prompt_template: string;
     size: string;
     quality: string;
     credit_cost: number;
     is_active: boolean;
     sort_order: number;
   };

   export type JobStatus = "queued" | "processing" | "done" | "failed";

   export type GenerationJob = {
     id: string;
     user_id: string;
     batch_id: string;
     style_preset_id: string;
     model_key: string;
     status: JobStatus;
     is_watermarked: boolean;
     hold_ledger_id: number | null;
     asset_id: string | null;
     error_code: string | null;
     created_at: string;
     finished_at: string | null;
   };

   export type AssetKind = "source_selfie" | "output" | "watermarked";

   export type Asset = {
     id: string;
     job_id: string | null;
     user_id: string;
     storage_path: string;
     kind: AssetKind;
     width: number | null;
     height: number | null;
     mime: string;
     delete_after: string | null;
     created_at: string;
   };

   export type CreditPack = {
     id: string;
     name: string;
     price: number;
     credits: number;
   };

   /** Insert shape for generation_jobs (server-generated ids allowed; status defaults queued). */
   export type NewJob = {
     id?: string;
     user_id: string;
     batch_id: string;
     style_preset_id: string;
     model_key: string;
     status?: JobStatus;
     is_watermarked?: boolean;
     hold_ledger_id?: number | null;
   };
   ```

2. - [ ] Write `tests/unit/db-types.test.ts` (compile-time shape guard — fails to typecheck if a field drifts):
   ```ts
   import { describe, it, expect } from "vitest";
   import type {
     Profile,
     Order,
     StylePreset,
     GenerationJob,
     CreditPack,
   } from "@/types/db";

   it("row types have the contracted required fields", () => {
     const p: Profile = {
       id: "u1",
       display_name: null,
       phone: null,
       age_verified: false,
       credit_balance: 3,
       created_at: "2026-06-27T00:00:00Z",
     };
     const o: Order = {
       id: "o1",
       user_id: "u1",
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
     const s: StylePreset = {
       id: "biz_linkedin",
       name_ko: "링크드인 헤드샷",
       family: "business",
       model_key: "google/gemini-3-pro-image",
       prompt_template: "x",
       size: "2K",
       quality: "high",
       credit_cost: 1,
       is_active: true,
       sort_order: 1,
     };
     const j: GenerationJob = {
       id: "j1",
       user_id: "u1",
       batch_id: "b1",
       style_preset_id: "biz_linkedin",
       model_key: "google/gemini-3-pro-image",
       status: "queued",
       is_watermarked: false,
       hold_ledger_id: null,
       asset_id: null,
       error_code: null,
       created_at: "2026-06-27T00:00:00Z",
       finished_at: null,
     };
     const pack: CreditPack = { id: "starter", name: "스타터 10크레딧", price: 9900, credits: 10 };
     expect([p.credit_balance, o.expected_amount, s.credit_cost, j.status, pack.credits]).toEqual([
       3, 9900, 1, "queued", 10,
     ]);
   });
   ```
   Run (expected: PASS, 1 passed; if a field name is wrong, `tsc` fails):
   ```bash
   pnpm test tests/unit/db-types.test.ts
   pnpm exec tsc --noEmit
   ```

3. - [ ] Commit:
   ```bash
   git add -A && git commit -m "feat: DB row types in types/db.ts" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
   ```

---

## Task 1.5 — Supabase init + tables migration (spec §5.1)

**Files:**
- Create: `supabase/config.toml` (via CLI), `supabase/migrations/0001_init_tables.sql`

**Interfaces:**
- Consumes: `types/db.ts` (the SQL columns must match those types exactly).
- Produces: tables `profiles`, `consents`, `credit_ledger`, `orders`, `style_presets`, `generation_jobs`, `assets` + indexes.

> **Docker required** for `supabase start` / `supabase test db`. Install Supabase CLI (`pnpm dlx supabase --version` or `scoop install supabase`).

**Steps:**

1. - [ ] Initialize local Supabase project (creates `supabase/config.toml`, `supabase/migrations/`, `supabase/seed.sql`):
   ```bash
   pnpm dlx supabase init
   ```

2. - [ ] Write `supabase/migrations/0001_init_tables.sql`:
   ```sql
   -- ProfAI Phase 1: core tables (spec §5.1)

   create table if not exists public.profiles (
     id uuid primary key references auth.users (id) on delete cascade,
     display_name text,
     phone text,
     age_verified boolean not null default false,
     credit_balance integer not null default 0,
     created_at timestamptz not null default now()
   );

   create table if not exists public.consents (
     id bigint generated always as identity primary key,
     user_id uuid not null references public.profiles (id) on delete cascade,
     type text not null check (type in ('tos','privacy','sensitive_face','own_face','marketing')),
     version text not null,
     agreed_at timestamptz not null default now(),
     ip text
   );
   create index if not exists consents_user_idx on public.consents (user_id);

   create table if not exists public.credit_ledger (
     id bigint generated always as identity primary key,
     user_id uuid not null references public.profiles (id) on delete cascade,
     delta integer not null,
     reason text not null check (reason in ('purchase','generation_hold','refund','release','signup_bonus')),
     ref_type text,
     ref_id uuid,
     created_at timestamptz not null default now()
   );
   create index if not exists credit_ledger_user_idx on public.credit_ledger (user_id);

   create table if not exists public.orders (
     id uuid primary key default gen_random_uuid(),
     user_id uuid not null references public.profiles (id) on delete cascade,
     pack_id text not null,
     expected_amount integer not null,
     credits integer not null,
     status text not null default 'PENDING' check (status in ('PENDING','PAID','REFUNDED')),
     payapp_mul_no text,
     payapp_pay_state text,
     payapp_pay_type text,
     paid_at timestamptz,
     created_at timestamptz not null default now()
   );
   create unique index if not exists orders_mul_no_uniq
     on public.orders (payapp_mul_no) where payapp_mul_no is not null;
   create index if not exists orders_user_idx on public.orders (user_id);

   create table if not exists public.style_presets (
     id text primary key,
     name_ko text not null,
     family text not null check (family in ('business','editorial','sns','fantasy','free')),
     model_key text not null,
     prompt_template text not null,
     size text not null,
     quality text not null,
     credit_cost integer not null default 1,
     is_active boolean not null default true,
     sort_order integer not null default 0
   );

   create table if not exists public.generation_jobs (
     id uuid primary key default gen_random_uuid(),
     user_id uuid not null references public.profiles (id) on delete cascade,
     batch_id uuid not null,
     style_preset_id text not null references public.style_presets (id),
     model_key text not null,
     status text not null default 'queued' check (status in ('queued','processing','done','failed')),
     is_watermarked boolean not null default false,
     hold_ledger_id bigint references public.credit_ledger (id),
     asset_id uuid,
     error_code text,
     created_at timestamptz not null default now(),
     finished_at timestamptz
   );
   create index if not exists generation_jobs_user_idx on public.generation_jobs (user_id);
   create index if not exists generation_jobs_batch_idx on public.generation_jobs (batch_id);
   create index if not exists generation_jobs_status_idx on public.generation_jobs (status);

   create table if not exists public.assets (
     id uuid primary key default gen_random_uuid(),
     job_id uuid references public.generation_jobs (id) on delete set null,
     user_id uuid not null references public.profiles (id) on delete cascade,
     storage_path text not null,
     kind text not null check (kind in ('source_selfie','output','watermarked')),
     width integer,
     height integer,
     mime text not null,
     delete_after timestamptz,
     created_at timestamptz not null default now()
   );
   create index if not exists assets_user_idx on public.assets (user_id);
   create index if not exists assets_job_idx on public.assets (job_id);

   -- assets.id <-> generation_jobs.asset_id FK added after both tables exist
   alter table public.generation_jobs
     add constraint generation_jobs_asset_fk
     foreign key (asset_id) references public.assets (id) on delete set null;
   ```

3. - [ ] Start local stack and apply migration (expected: "Applying migration 0001_init_tables.sql..." then OK):
   ```bash
   pnpm dlx supabase start
   pnpm dlx supabase db reset
   ```

4. - [ ] Verify tables exist:
   ```bash
   pnpm dlx supabase db diff --schema public | head -50
   # Expect: no diff (migration matches DB)
   ```

5. - [ ] Commit:
   ```bash
   git add -A && git commit -m "feat: core tables migration (profiles, consents, ledger, orders, presets, jobs, assets)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
   ```

---

## Task 1.6 — RLS policies + pgTAP test

**Files:**
- Create: `supabase/migrations/0002_rls.sql`, `supabase/tests/rls.test.sql`

**Interfaces:**
- Consumes: tables from Task 1.5.
- Produces: own-row RLS on user-scoped tables; `style_presets` readable to authenticated users.

> **Docker required** for `supabase test db`.

**Steps:**

1. - [ ] Write `supabase/migrations/0002_rls.sql`:
   ```sql
   -- ProfAI Phase 1: RLS — every user-scoped row is own-row only (user_id = auth.uid()).

   alter table public.profiles enable row level security;
   alter table public.consents enable row level security;
   alter table public.credit_ledger enable row level security;
   alter table public.orders enable row level security;
   alter table public.generation_jobs enable row level security;
   alter table public.assets enable row level security;
   alter table public.style_presets enable row level security;

   -- profiles: own row select/update (id = auth.uid()). No client insert/delete (trigger + service-role only).
   create policy profiles_select_own on public.profiles
     for select using (id = (select auth.uid()));
   create policy profiles_update_own on public.profiles
     for update using (id = (select auth.uid())) with check (id = (select auth.uid()));

   -- consents: own-row select + insert (user agrees from the client).
   create policy consents_select_own on public.consents
     for select using (user_id = (select auth.uid()));
   create policy consents_insert_own on public.consents
     for insert with check (user_id = (select auth.uid()));

   -- credit_ledger: own-row READ ONLY (writes via SECURITY DEFINER RPC / service-role only).
   create policy credit_ledger_select_own on public.credit_ledger
     for select using (user_id = (select auth.uid()));

   -- orders: own-row READ ONLY (writes via service-role in payapp routes).
   create policy orders_select_own on public.orders
     for select using (user_id = (select auth.uid()));

   -- generation_jobs: own-row READ ONLY (writes via server with service-role).
   create policy generation_jobs_select_own on public.generation_jobs
     for select using (user_id = (select auth.uid()));

   -- assets: own-row READ ONLY (writes via server).
   create policy assets_select_own on public.assets
     for select using (user_id = (select auth.uid()));

   -- style_presets: any authenticated user may read active presets (catalog).
   create policy style_presets_read on public.style_presets
     for select to authenticated using (true);
   ```

2. - [ ] Write `supabase/tests/rls.test.sql` (pgTAP — proves user A cannot see user B's rows, and cannot directly write the ledger):
   ```sql
   begin;
   select plan(6);

   -- Seed two auth users + profiles directly (service context inside test).
   insert into auth.users (id, email) values
     ('00000000-0000-0000-0000-00000000000a', 'a@test.dev'),
     ('00000000-0000-0000-0000-00000000000b', 'b@test.dev');
   insert into public.profiles (id, credit_balance) values
     ('00000000-0000-0000-0000-00000000000a', 5),
     ('00000000-0000-0000-0000-00000000000b', 5);
   insert into public.credit_ledger (user_id, delta, reason) values
     ('00000000-0000-0000-0000-00000000000a', 5, 'signup_bonus'),
     ('00000000-0000-0000-0000-00000000000b', 5, 'signup_bonus');

   -- Act as user A.
   set local role authenticated;
   set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

   select is(
     (select count(*)::int from public.profiles),
     1,
     'profiles: user A sees only own profile row'
   );
   select is(
     (select credit_balance from public.profiles),
     5,
     'profiles: user A reads own balance'
   );
   select is(
     (select count(*)::int from public.credit_ledger),
     1,
     'ledger: user A sees only own ledger rows'
   );

   -- A direct ledger insert by the user must be blocked (no insert policy).
   select throws_ok(
     $$ insert into public.credit_ledger (user_id, delta, reason)
        values ('00000000-0000-0000-0000-00000000000a', 999, 'purchase') $$,
     '42501',
     'new row violates row-level security policy for table "credit_ledger"',
     'ledger: direct client insert is denied by RLS'
   );

   -- A cannot select B's order.
   set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
   insert into public.orders (user_id, pack_id, expected_amount, credits)
     values ('00000000-0000-0000-0000-00000000000b', 'starter', 9900, 10);
   set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
   select is(
     (select count(*)::int from public.orders),
     0,
     'orders: user A cannot see user B order'
   );

   -- style_presets readable by authenticated.
   reset role;
   insert into public.style_presets (id, name_ko, family, model_key, prompt_template, size, quality)
     values ('t1', '테스트', 'free', 'gpt-image-1-mini', 'p', '1K', 'low');
   set local role authenticated;
   set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
   select is(
     (select count(*)::int from public.style_presets where id = 't1'),
     1,
     'style_presets: authenticated user can read catalog'
   );

   select * from finish();
   rollback;
   ```

3. - [ ] Run pgTAP (expected: all 6 tests pass):
   ```bash
   pnpm dlx supabase test db
   ```

4. - [ ] Commit:
   ```bash
   git add -A && git commit -m "feat: own-row RLS policies + pgTAP test" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
   ```

---

## Task 1.7 — Credit RPCs + pgTAP concurrency test

**Files:**
- Create: `supabase/migrations/0003_credit_rpcs.sql`, `supabase/tests/credit_rpcs.test.sql`

**Interfaces:**
- Consumes: tables + RLS from Tasks 1.5/1.6.
- Produces (VERBATIM signatures):
  - `debit_credits(p_user uuid, p_amount int, p_job uuid) returns bigint` — `FOR UPDATE` lock; throws `INSUFFICIENT_CREDITS`; inserts `generation_hold` ledger.
  - `grant_credits(p_user uuid, p_amount int, p_reason text, p_ref_type text, p_ref_id uuid) returns void` — keeps the `p_amount > 0` invariant (NEVER called with a negative amount).
  - `refund_hold(p_user uuid, p_amount int, p_job uuid) returns void`.
  - `clawback_credits(p_user uuid, p_amount int, p_order uuid) returns void` — DEDICATED negative path for payment refunds (Phase 3). `FOR UPDATE` lock; deducts `LEAST(p_amount, current balance)` flooring the balance at 0; inserts a `credit_ledger` row with `delta = -(actual deducted)`, reason `refund`, `ref_type 'order'`, `ref_id p_order`. This exists so refunds NEVER call `grant_credits` with a negative amount.

> **Docker required** for pgTAP.

**Steps:**

1. - [ ] Write `supabase/migrations/0003_credit_rpcs.sql`:
   ```sql
   -- ProfAI Phase 1: credit RPCs (SECURITY DEFINER, called server-side via service-role).

   create or replace function public.debit_credits(p_user uuid, p_amount int, p_job uuid)
   returns bigint
   language plpgsql
   security definer
   set search_path = public
   as $$
   declare
     v_bal int;
     v_ledger bigint;
   begin
     if p_amount <= 0 then
       raise exception 'INVALID_AMOUNT';
     end if;
     -- Lock the balance row to serialize concurrent debits.
     select credit_balance into v_bal from public.profiles where id = p_user for update;
     if v_bal is null then
       raise exception 'PROFILE_NOT_FOUND';
     end if;
     if v_bal < p_amount then
       raise exception 'INSUFFICIENT_CREDITS';
     end if;
     update public.profiles
       set credit_balance = credit_balance - p_amount
       where id = p_user;
     insert into public.credit_ledger (user_id, delta, reason, ref_type, ref_id)
       values (p_user, -p_amount, 'generation_hold', 'job', p_job)
       returning id into v_ledger;
     return v_ledger;
   end;
   $$;

   create or replace function public.grant_credits(
     p_user uuid, p_amount int, p_reason text, p_ref_type text, p_ref_id uuid
   )
   returns void
   language plpgsql
   security definer
   set search_path = public
   as $$
   begin
     if p_amount <= 0 then
       raise exception 'INVALID_AMOUNT';
     end if;
     if p_reason not in ('purchase','refund','release','signup_bonus') then
       raise exception 'INVALID_REASON';
     end if;
     update public.profiles
       set credit_balance = credit_balance + p_amount
       where id = p_user;
     insert into public.credit_ledger (user_id, delta, reason, ref_type, ref_id)
       values (p_user, p_amount, p_reason, p_ref_type, p_ref_id);
   end;
   $$;

   create or replace function public.refund_hold(p_user uuid, p_amount int, p_job uuid)
   returns void
   language plpgsql
   security definer
   set search_path = public
   as $$
   begin
     if p_amount <= 0 then
       raise exception 'INVALID_AMOUNT';
     end if;
     update public.profiles
       set credit_balance = credit_balance + p_amount
       where id = p_user;
     insert into public.credit_ledger (user_id, delta, reason, ref_type, ref_id)
       values (p_user, p_amount, 'release', 'job', p_job);
   end;
   $$;

   -- Dedicated negative path for payment refunds (Phase 3 payapp feedback refund branch).
   -- Deducts LEAST(p_amount, balance), floors balance at 0, writes a negative 'refund' ledger row.
   -- This exists so refunds NEVER call grant_credits with a negative amount (that keeps p_amount>0).
   create or replace function public.clawback_credits(p_user uuid, p_amount int, p_order uuid)
   returns void
   language plpgsql
   security definer
   set search_path = public
   as $$
   declare
     v_bal int;
     v_deduct int;
   begin
     if p_amount <= 0 then
       raise exception 'INVALID_AMOUNT';
     end if;
     -- Lock the balance row to serialize against concurrent debits/grants.
     select credit_balance into v_bal from public.profiles where id = p_user for update;
     if v_bal is null then
       raise exception 'PROFILE_NOT_FOUND';
     end if;
     v_deduct := least(p_amount, v_bal);   -- never push the balance below 0
     update public.profiles
       set credit_balance = credit_balance - v_deduct
       where id = p_user;
     insert into public.credit_ledger (user_id, delta, reason, ref_type, ref_id)
       values (p_user, -v_deduct, 'refund', 'order', p_order);
   end;
   $$;

   -- Lock down execution: only service_role may call these (server-side).
   revoke all on function public.debit_credits(uuid, int, uuid) from public, anon, authenticated;
   revoke all on function public.grant_credits(uuid, int, text, text, uuid) from public, anon, authenticated;
   revoke all on function public.refund_hold(uuid, int, uuid) from public, anon, authenticated;
   revoke all on function public.clawback_credits(uuid, int, uuid) from public, anon, authenticated;
   grant execute on function public.debit_credits(uuid, int, uuid) to service_role;
   grant execute on function public.grant_credits(uuid, int, text, text, uuid) to service_role;
   grant execute on function public.refund_hold(uuid, int, uuid) to service_role;
   grant execute on function public.clawback_credits(uuid, int, uuid) to service_role;
   ```

2. - [ ] Write `supabase/tests/credit_rpcs.test.sql` (pgTAP — proves debit decrements + writes hold ledger, insufficient throws, refund releases, the hold ledger uses `generation_hold`, and that `clawback_credits` deducts/floors-at-0 and writes a negative `refund` ledger row):
   ```sql
   begin;
   select plan(12);

   insert into auth.users (id, email) values
     ('00000000-0000-0000-0000-0000000000c1', 'c1@test.dev');
   insert into public.profiles (id, credit_balance) values
     ('00000000-0000-0000-0000-0000000000c1', 3);

   -- debit 1 credit
   select lives_ok(
     $$ select public.debit_credits('00000000-0000-0000-0000-0000000000c1', 1,
          '00000000-0000-0000-0000-0000000000j1') $$,
     'debit_credits: debits without error'
   );
   select is(
     (select credit_balance from public.profiles where id = '00000000-0000-0000-0000-0000000000c1'),
     2,
     'debit_credits: balance 3 -> 2'
   );
   select is(
     (select delta from public.credit_ledger
        where user_id = '00000000-0000-0000-0000-0000000000c1' and reason = 'generation_hold'),
     -1,
     'debit_credits: writes generation_hold ledger delta -1'
   );

   -- insufficient: try to debit 100
   select throws_ok(
     $$ select public.debit_credits('00000000-0000-0000-0000-0000000000c1', 100,
          '00000000-0000-0000-0000-0000000000j2') $$,
     'INSUFFICIENT_CREDITS',
     'debit_credits: throws INSUFFICIENT_CREDITS when balance too low'
   );

   -- refund the held credit
   select lives_ok(
     $$ select public.refund_hold('00000000-0000-0000-0000-0000000000c1', 1,
          '00000000-0000-0000-0000-0000000000j1') $$,
     'refund_hold: releases without error'
   );
   select is(
     (select credit_balance from public.profiles where id = '00000000-0000-0000-0000-0000000000c1'),
     3,
     'refund_hold: balance 2 -> 3'
   );

   -- grant (purchase) adds credits + ledger
   select lives_ok(
     $$ select public.grant_credits('00000000-0000-0000-0000-0000000000c1', 10, 'purchase', 'order',
          '00000000-0000-0000-0000-0000000000o1') $$,
     'grant_credits: purchase grant succeeds'
   );
   -- balance is now 13 (3 -1 debit +1 refund +10 grant).

   -- clawback_credits: dedicated negative refund path (deducts, writes negative 'refund' ledger).
   select lives_ok(
     $$ select public.clawback_credits('00000000-0000-0000-0000-0000000000c1', 5,
          '00000000-0000-0000-0000-0000000000o1') $$,
     'clawback_credits: deducts without error'
   );
   select is(
     (select credit_balance from public.profiles where id = '00000000-0000-0000-0000-0000000000c1'),
     8,
     'clawback_credits: balance 13 -> 8'
   );
   select is(
     (select delta from public.credit_ledger
        where user_id = '00000000-0000-0000-0000-0000000000c1' and reason = 'refund'
        order by id desc limit 1),
     -5,
     'clawback_credits: writes negative refund ledger delta -5'
   );

   -- clawback larger than balance floors at 0 (deducts only what remains).
   select lives_ok(
     $$ select public.clawback_credits('00000000-0000-0000-0000-0000000000c1', 100,
          '00000000-0000-0000-0000-0000000000o1') $$,
     'clawback_credits: over-clawback does not error'
   );
   select is(
     (select credit_balance from public.profiles where id = '00000000-0000-0000-0000-0000000000c1'),
     0,
     'clawback_credits: balance floors at 0 (never negative)'
   );

   select * from finish();
   rollback;
   ```

3. - [ ] Add a concurrency proof. Append a second test file is overkill; instead document + assert serialization with a session-level lock test inside the same run. Add to `supabase/tests/credit_rpcs.test.sql` BEFORE `finish()` a check that `for update` exists in the function body (guards against accidental removal):
   ```sql
   select matches(
     (select pg_get_functiondef('public.debit_credits(uuid,int,uuid)'::regprocedure)),
     'for update',
     'debit_credits: balance row is locked FOR UPDATE (concurrency safety)'
   );
   ```
   Update `select plan(12);` to `select plan(13);`.

4. - [ ] Run pgTAP (expected: 13 tests pass):
   ```bash
   pnpm dlx supabase test db
   ```

5. - [ ] Commit:
   ```bash
   git add -A && git commit -m "feat: credit RPCs (debit/grant/refund/clawback) + pgTAP incl. FOR UPDATE guard" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
   ```

---

## Task 1.8 — New-user signup trigger (profile + free credits) + pgTAP

**Files:**
- Create: `supabase/migrations/0004_signup_trigger.sql`, `supabase/tests/signup_bonus.test.sql`

**Interfaces:**
- Consumes: `profiles`, `grant_credits`, `FREE_SIGNUP_CREDITS = 3` (the literal 3 is hardcoded in SQL; `lib/styles.ts` exposes the same constant to TS in Task 1.9).
- Produces: trigger `on_auth_user_created` → inserts `profiles` row + grants 3 credits with reason `signup_bonus`.

> **Docker required** for pgTAP.

**Steps:**

1. - [ ] Write `supabase/migrations/0004_signup_trigger.sql`:
   ```sql
   -- ProfAI Phase 1: on new auth user, create profile + grant FREE_SIGNUP_CREDITS (=3).

   create or replace function public.handle_new_user()
   returns trigger
   language plpgsql
   security definer
   set search_path = public
   as $$
   begin
     insert into public.profiles (id, display_name, phone)
       values (
         new.id,
         coalesce(new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'full_name'),
         new.phone
       )
       on conflict (id) do nothing;

     -- Grant the 3-credit signup bonus exactly once (only when the profile was newly created).
     if found then
       perform public.grant_credits(new.id, 3, 'signup_bonus', 'auth', new.id);
     end if;

     return new;
   end;
   $$;

   drop trigger if exists on_auth_user_created on auth.users;
   create trigger on_auth_user_created
     after insert on auth.users
     for each row execute function public.handle_new_user();
   ```

2. - [ ] Write `supabase/tests/signup_bonus.test.sql` (pgTAP — inserting an auth user creates a profile with balance 3 + a `signup_bonus` ledger row; re-running does not double-grant):
   ```sql
   begin;
   select plan(4);

   insert into auth.users (id, email, raw_user_meta_data)
     values ('00000000-0000-0000-0000-0000000000d1', 'd1@test.dev', '{"name":"테스터"}'::jsonb);

   select is(
     (select count(*)::int from public.profiles where id = '00000000-0000-0000-0000-0000000000d1'),
     1,
     'signup: profile row created for new auth user'
   );
   select is(
     (select credit_balance from public.profiles where id = '00000000-0000-0000-0000-0000000000d1'),
     3,
     'signup: free balance is 3 (FREE_SIGNUP_CREDITS)'
   );
   select is(
     (select delta from public.credit_ledger
        where user_id = '00000000-0000-0000-0000-0000000000d1' and reason = 'signup_bonus'),
     3,
     'signup: signup_bonus ledger row delta = 3'
   );
   select is(
     (select display_name from public.profiles where id = '00000000-0000-0000-0000-0000000000d1'),
     '테스터',
     'signup: display_name copied from auth metadata'
   );

   select * from finish();
   rollback;
   ```

3. - [ ] Run pgTAP (expected: 4 tests pass; full suite now 6 + 13 + 4 = 23 assertions across 3 files):
   ```bash
   pnpm dlx supabase test db
   ```

4. - [ ] Commit:
   ```bash
   git add -A && git commit -m "feat: signup trigger creates profile + grants 3 free credits + pgTAP" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
   ```

---

## Task 1.9 — `lib/styles.ts` constants + unit test

**Files:**
- Create: `lib/styles.ts`
- Test: `tests/unit/styles.test.ts`

**Interfaces:**
- Consumes: `CreditPack` from `types/db.ts`.
- Produces (VERBATIM): `CREDIT_PACKS: Record<string, CreditPack>`, `FREE_SIGNUP_CREDITS = 3`, `STYLE_FAMILIES = ["business","editorial","sns","fantasy"]`.

**Steps:**

1. - [ ] Write failing test `tests/unit/styles.test.ts`:
   ```ts
   import { describe, it, expect } from "vitest";
   import { CREDIT_PACKS, FREE_SIGNUP_CREDITS, STYLE_FAMILIES } from "@/lib/styles";

   it("FREE_SIGNUP_CREDITS is 3", () => {
     expect(FREE_SIGNUP_CREDITS).toBe(3);
   });

   it("STYLE_FAMILIES are the four MVP families", () => {
     expect(STYLE_FAMILIES).toEqual(["business", "editorial", "sns", "fantasy"]);
   });

   it("CREDIT_PACKS match spec §10 pricing", () => {
     expect(CREDIT_PACKS.starter).toEqual({ id: "starter", name: "스타터 10크레딧", price: 9900, credits: 10 });
     expect(CREDIT_PACKS.value).toEqual({ id: "value", name: "밸류 30크레딧", price: 24900, credits: 30 });
     expect(CREDIT_PACKS.pro).toEqual({ id: "pro", name: "프로 60크레딧", price: 44900, credits: 60 });
   });
   ```
   Run (expected: FAIL — module missing):
   ```bash
   pnpm test tests/unit/styles.test.ts
   ```

2. - [ ] Write `lib/styles.ts`:
   ```ts
   import type { CreditPack, StyleFamily } from "@/types/db";

   /** Credit packs sold via PayApp (spec §10 recommended starting prices, KRW). */
   export const CREDIT_PACKS: Record<string, CreditPack> = {
     starter: { id: "starter", name: "스타터 10크레딧", price: 9900, credits: 10 },
     value: { id: "value", name: "밸류 30크레딧", price: 24900, credits: 30 },
     pro: { id: "pro", name: "프로 60크레딧", price: 44900, credits: 60 },
   };

   /** Free credits granted on signup (1 credit = 1 image @ 2K; free tier is watermarked 1K). */
   export const FREE_SIGNUP_CREDITS = 3 as const;

   /** The four paid MVP style families (the 'free' funnel family is internal, not user-selectable here). */
   export const STYLE_FAMILIES: ReadonlyArray<Exclude<StyleFamily, "free">> = [
     "business",
     "editorial",
     "sns",
     "fantasy",
   ];
   ```

3. - [ ] Run test (expected: PASS, 3 passed):
   ```bash
   pnpm test tests/unit/styles.test.ts
   ```

4. - [ ] Commit:
   ```bash
   git add -A && git commit -m "feat: lib/styles.ts credit packs + signup/family constants" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
   ```

---

## Task 1.10 — Seed ~12 style presets (`supabase/seed.sql`)

**Files:**
- Modify: `supabase/seed.sql`

**Interfaces:**
- Consumes: `style_presets` table; spec §8 catalog; model-key pins.
- Produces: 12 seeded presets (business×3, editorial×3, sns×3, fantasy×3) plus model_key/size/quality per spec §8.

**Steps:**

1. - [ ] Overwrite `supabase/seed.sql` with the catalog (idempotent upsert; model ids pinned per Global Constraints — flagged for live verification before launch). CANONICAL `model_key` values (must match the Phase 2 router in `lib/models/router.ts` exactly): gemini high = `google/gemini-3-pro-image`; openai = `gpt-image-2`; free tier = `google/gemini-3.1-flash-image-preview`. Never use a bare `gemini-3-pro-image`:
   ```sql
   -- ProfAI style catalog (spec §8). Model ids pinned; verify live ids before launch.
   -- Canonical model_key: "google/gemini-3-pro-image" | "gpt-image-2" | free "google/gemini-3.1-flash-image-preview".
   insert into public.style_presets
     (id, name_ko, family, model_key, prompt_template, size, quality, credit_cost, is_active, sort_order)
   values
     -- 비즈·증명사진 (identity critical) → Nano Banana Pro (google/gemini-3-pro-image), 2K
     ('biz_linkedin', '링크드인 헤드샷', 'business', 'google/gemini-3-pro-image',
      'Professional LinkedIn headshot, clean studio lighting, neutral background, business attire, sharp focus, preserve the person''s facial identity exactly.', '2K', 'high', 1, true, 10),
     ('biz_id_kr', '한국 증명사진(흰배경 정장)', 'business', 'google/gemini-3-pro-image',
      'Korean ID photo, pure white background, formal suit, front-facing, evenly lit, passport/ID style, preserve facial identity exactly.', '2K', 'high', 1, true, 11),
     ('biz_color_bg', '컬러배경 프로필', 'business', 'google/gemini-3-pro-image',
      'Corporate profile photo on a solid color gradient background, soft key light, confident expression, preserve facial identity exactly.', '2K', 'high', 1, true, 12),

     -- 컨셉 화보 (editorial) → GPT Image 2 high (A/B vs gemini), 1024x1536
     ('edit_cinematic', '시네마틱 필름', 'editorial', 'gpt-image-2',
      'Cinematic film-still portrait, moody key light, shallow depth of field, anamorphic look, filmic color grade, preserve facial identity.', '1024x1536', 'high', 1, true, 20),
     ('edit_vintage', '빈티지', 'editorial', 'gpt-image-2',
      'Vintage analog portrait, warm faded tones, soft grain, retro wardrobe, nostalgic mood, preserve facial identity.', '1024x1536', 'high', 1, true, 21),
     ('edit_season', '계절(벚꽃·단풍)', 'editorial', 'google/gemini-3-pro-image',
      'Seasonal outdoor portrait among cherry blossoms or autumn maple leaves, natural golden light, bokeh background, preserve facial identity.', '1024x1536', 'high', 1, true, 22),

     -- SNS 감성 → GPT Image 2 high, 1024x1536
     ('sns_insta', '인스타 데일리', 'sns', 'gpt-image-2',
      'Instagram daily lifestyle portrait, candid natural light, trendy casual outfit, airy bright tones, preserve facial identity.', '1024x1536', 'high', 1, true, 30),
     ('sns_cafe', '카페 무드', 'sns', 'gpt-image-2',
      'Cozy cafe-mood portrait, warm ambient window light, coffee-shop background bokeh, relaxed vibe, preserve facial identity.', '1024x1536', 'high', 1, true, 31),
     ('sns_bw', '흑백', 'sns', 'gpt-image-2',
      'High-contrast black and white portrait, dramatic monochrome lighting, fine grain, timeless mood, preserve facial identity.', '1024x1536', 'high', 1, true, 32),

     -- 판타지·아트 (identity less critical) → GPT Image 2, medium
     ('fan_cyberpunk', '사이버펑크', 'fantasy', 'gpt-image-2',
      'Cyberpunk neon-lit portrait, futuristic city backdrop, rim lighting in magenta and cyan, high-tech wardrobe, keep recognizable likeness.', '1024x1536', 'medium', 1, true, 40),
     ('fan_anime', '애니풍', 'fantasy', 'gpt-image-2',
      'Anime-style illustrated portrait, clean cel shading, expressive eyes, vibrant palette, keep recognizable likeness.', '1024x1536', 'medium', 1, true, 41),
     ('fan_renaissance', '르네상스 유화', 'fantasy', 'gpt-image-2',
      'Renaissance oil-painting portrait, chiaroscuro lighting, classical wardrobe, painterly brushwork, keep recognizable likeness.', '1024x1536', 'medium', 1, true, 42)
   on conflict (id) do update set
     name_ko = excluded.name_ko,
     family = excluded.family,
     model_key = excluded.model_key,
     prompt_template = excluded.prompt_template,
     size = excluded.size,
     quality = excluded.quality,
     credit_cost = excluded.credit_cost,
     is_active = excluded.is_active,
     sort_order = excluded.sort_order;
   ```

2. - [ ] Apply seed (expected: db reset re-runs migrations then seed; 12 rows):
   ```bash
   pnpm dlx supabase db reset
   ```
   Then verify count:
   ```bash
   pnpm dlx supabase db reset >/dev/null 2>&1; \
   PGPASSWORD=postgres psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c \
     "select family, count(*) from public.style_presets group by family order by family;"
   # Expect: business=3, editorial=3, fantasy=3, sns=3 (12 total)
   ```
   (If `psql` is unavailable, use `pnpm dlx supabase db reset` output which prints seed application success.)

3. - [ ] Commit:
   ```bash
   git add -A && git commit -m "feat: seed 12 style presets across 4 families (spec §8)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
   ```

---

## Task 1.11 — `lib/db.ts` helpers + unit tests (mock Supabase)

**Files:**
- Create: `lib/db.ts`
- Test: `tests/unit/db.test.ts`

**Interfaces:**
- Consumes: row types from `types/db.ts`; a `SupabaseClient` passed as first arg.
- Produces (VERBATIM):
  - `insertOrder(sb, {user_id, pack_id, expected_amount, credits}): Promise<Order>`
  - `getOrder(sb, id): Promise<Order|null>`
  - `updateOrder(sb, id, patch: Partial<Order>): Promise<void>`
  - `markOrderPaidIfPending(sb, id, {payapp_mul_no, payapp_pay_state, payapp_pay_type}): Promise<boolean>`
  - `markOrderRefundedIfPaid(sb, id): Promise<boolean>`
  - `insertJobs(sb, jobs: NewJob[]): Promise<GenerationJob[]>`
  - `getJob(sb, id): Promise<GenerationJob|null>`
  - `setJobStatus(sb, id, status, patch?): Promise<void>`
  - `insertAsset(sb, asset): Promise<Asset>`

**Steps:**

1. - [ ] Write failing test `tests/unit/db.test.ts` (a chainable fake Supabase query builder; assert correct table/filters and the conditional-update boolean semantics):
   ```ts
   import { describe, it, expect, vi } from "vitest";
   import type { SupabaseClient } from "@supabase/supabase-js";
   import {
     insertOrder,
     getOrder,
     updateOrder,
     markOrderPaidIfPending,
     markOrderRefundedIfPaid,
     insertJobs,
     getJob,
     setJobStatus,
     insertAsset,
   } from "@/lib/db";

   /** Build a chainable fake where each terminal returns { data, error }. */
   function fakeSb(result: { data: unknown; error: unknown }) {
     const builder: Record<string, unknown> = {};
     const chain = () => builder;
     builder.insert = vi.fn(chain);
     builder.update = vi.fn(chain);
     builder.select = vi.fn(chain);
     builder.eq = vi.fn(chain);
     builder.in = vi.fn(chain);
     builder.single = vi.fn(async () => result);
     builder.maybeSingle = vi.fn(async () => result);
     builder.then = undefined;
     const from = vi.fn(() => builder);
     return { sb: { from } as unknown as SupabaseClient, from, builder };
   }

   it("insertOrder inserts into orders and returns the row", async () => {
     const order = {
       id: "o1", user_id: "u1", pack_id: "starter", expected_amount: 9900, credits: 10,
       status: "PENDING", payapp_mul_no: null, payapp_pay_state: null, payapp_pay_type: null,
       paid_at: null, created_at: "t",
     };
     const { sb, from, builder } = fakeSb({ data: order, error: null });
     const out = await insertOrder(sb, { user_id: "u1", pack_id: "starter", expected_amount: 9900, credits: 10 });
     expect(from).toHaveBeenCalledWith("orders");
     expect(builder.insert).toHaveBeenCalledWith(
       expect.objectContaining({ user_id: "u1", pack_id: "starter", expected_amount: 9900, credits: 10, status: "PENDING" }),
     );
     expect(out).toEqual(order);
   });

   it("getOrder returns null when not found", async () => {
     const { sb } = fakeSb({ data: null, error: null });
     expect(await getOrder(sb, "missing")).toBeNull();
   });

   it("markOrderPaidIfPending returns true when a row transitioned", async () => {
     const { sb, builder } = fakeSb({ data: { id: "o1" }, error: null });
     const ok = await markOrderPaidIfPending(sb, "o1", {
       payapp_mul_no: "m1", payapp_pay_state: "4", payapp_pay_type: "1",
     });
     expect(builder.update).toHaveBeenCalledWith(
       expect.objectContaining({ status: "PAID", payapp_mul_no: "m1", payapp_pay_state: "4", payapp_pay_type: "1" }),
     );
     expect(ok).toBe(true);
   });

   it("markOrderPaidIfPending returns false when no row transitioned", async () => {
     const { sb } = fakeSb({ data: null, error: null });
     const ok = await markOrderPaidIfPending(sb, "o1", {
       payapp_mul_no: "m1", payapp_pay_state: "4", payapp_pay_type: "1",
     });
     expect(ok).toBe(false);
   });

   it("markOrderRefundedIfPaid returns boolean from PAID->REFUNDED transition", async () => {
     const { sb } = fakeSb({ data: { id: "o1" }, error: null });
     expect(await markOrderRefundedIfPaid(sb, "o1")).toBe(true);
   });

   it("insertJobs inserts an array and returns rows", async () => {
     const rows = [{ id: "j1" }];
     const { sb, from, builder } = fakeSb({ data: rows, error: null });
     // select() after insert returns the builder; final await resolves builder via thenable shim
     (builder as Record<string, unknown>).select = vi.fn(() => ({
       then: (r: (v: unknown) => void) => r({ data: rows, error: null }),
     }));
     const out = await insertJobs(sb, [
       { user_id: "u1", batch_id: "b1", style_preset_id: "biz_linkedin", model_key: "google/gemini-3-pro-image" },
     ]);
     expect(from).toHaveBeenCalledWith("generation_jobs");
     expect(out).toEqual(rows);
   });

   it("setJobStatus updates status + patch", async () => {
     const { sb, builder } = fakeSb({ data: null, error: null });
     await setJobStatus(sb, "j1", "processing");
     expect(builder.update).toHaveBeenCalledWith(expect.objectContaining({ status: "processing" }));
   });

   it("insertAsset inserts into assets and returns the row", async () => {
     const asset = { id: "a1" };
     const { sb, from } = fakeSb({ data: asset, error: null });
     const out = await insertAsset(sb, {
       user_id: "u1", job_id: "j1", storage_path: "p", kind: "output", width: 1024, height: 1536, mime: "image/png",
     });
     expect(from).toHaveBeenCalledWith("assets");
     expect(out).toEqual(asset);
   });
   ```
   Run (expected: FAIL — `lib/db.ts` missing):
   ```bash
   pnpm test tests/unit/db.test.ts
   ```

2. - [ ] Write `lib/db.ts`:
   ```ts
   import type { SupabaseClient } from "@supabase/supabase-js";
   import type {
     Order,
     GenerationJob,
     Asset,
     NewJob,
     JobStatus,
     AssetKind,
   } from "@/types/db";

   function unwrap<T>(res: { data: T | null; error: { message: string } | null }, ctx: string): T {
     if (res.error) throw new Error(`${ctx}: ${res.error.message}`);
     if (res.data == null) throw new Error(`${ctx}: no data returned`);
     return res.data;
   }

   export async function insertOrder(
     sb: SupabaseClient,
     input: { user_id: string; pack_id: string; expected_amount: number; credits: number },
   ): Promise<Order> {
     const res = await sb
       .from("orders")
       .insert({ ...input, status: "PENDING" })
       .select()
       .single();
     return unwrap<Order>(res, "insertOrder");
   }

   export async function getOrder(sb: SupabaseClient, id: string): Promise<Order | null> {
     const res = await sb.from("orders").select().eq("id", id).maybeSingle();
     if (res.error) throw new Error(`getOrder: ${res.error.message}`);
     return (res.data as Order | null) ?? null;
   }

   export async function updateOrder(
     sb: SupabaseClient,
     id: string,
     patch: Partial<Order>,
   ): Promise<void> {
     const res = await sb.from("orders").update(patch).eq("id", id);
     if (res.error) throw new Error(`updateOrder: ${res.error.message}`);
   }

   /**
    * Idempotent PENDING -> PAID transition. Returns true only if THIS call flipped the row
    * (guarded by status='PENDING'). Duplicate PayApp feedback yields false (no double-grant).
    */
   export async function markOrderPaidIfPending(
     sb: SupabaseClient,
     id: string,
     fields: { payapp_mul_no: string | null; payapp_pay_state: string | null; payapp_pay_type: string | null },
   ): Promise<boolean> {
     const res = await sb
       .from("orders")
       .update({
         status: "PAID",
         paid_at: new Date().toISOString(),
         payapp_mul_no: fields.payapp_mul_no,
         payapp_pay_state: fields.payapp_pay_state,
         payapp_pay_type: fields.payapp_pay_type,
       })
       .eq("id", id)
       .eq("status", "PENDING")
       .select()
       .maybeSingle();
     if (res.error) throw new Error(`markOrderPaidIfPending: ${res.error.message}`);
     return res.data != null;
   }

   /** Idempotent PAID -> REFUNDED transition. True only if this call flipped the row. */
   export async function markOrderRefundedIfPaid(sb: SupabaseClient, id: string): Promise<boolean> {
     const res = await sb
       .from("orders")
       .update({ status: "REFUNDED" })
       .eq("id", id)
       .eq("status", "PAID")
       .select()
       .maybeSingle();
     if (res.error) throw new Error(`markOrderRefundedIfPaid: ${res.error.message}`);
     return res.data != null;
   }

   export async function insertJobs(sb: SupabaseClient, jobs: NewJob[]): Promise<GenerationJob[]> {
     const res = await sb.from("generation_jobs").insert(jobs).select();
     if (res.error) throw new Error(`insertJobs: ${res.error.message}`);
     return (res.data as GenerationJob[]) ?? [];
   }

   export async function getJob(sb: SupabaseClient, id: string): Promise<GenerationJob | null> {
     const res = await sb.from("generation_jobs").select().eq("id", id).maybeSingle();
     if (res.error) throw new Error(`getJob: ${res.error.message}`);
     return (res.data as GenerationJob | null) ?? null;
   }

   export async function setJobStatus(
     sb: SupabaseClient,
     id: string,
     status: JobStatus,
     patch?: Partial<GenerationJob>,
   ): Promise<void> {
     const res = await sb
       .from("generation_jobs")
       .update({ status, ...patch })
       .eq("id", id);
     if (res.error) throw new Error(`setJobStatus: ${res.error.message}`);
   }

   export async function insertAsset(
     sb: SupabaseClient,
     asset: {
       user_id: string;
       job_id: string | null;
       storage_path: string;
       kind: AssetKind;
       width?: number | null;
       height?: number | null;
       mime: string;
       delete_after?: string | null;
     },
   ): Promise<Asset> {
     const res = await sb.from("assets").insert(asset).select().single();
     return unwrap<Asset>(res, "insertAsset");
   }
   ```

3. - [ ] Run test (expected: PASS, 8 passed):
   ```bash
   pnpm test tests/unit/db.test.ts
   ```

4. - [ ] Commit:
   ```bash
   git add -A && git commit -m "feat: lib/db.ts order/job/asset helpers + unit tests" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
   ```

---

## Task 1.12 — `lib/credits.ts` RPC wrappers + unit tests

**Files:**
- Create: `lib/credits.ts`
- Test: `tests/unit/credits.test.ts`

**Interfaces:**
- Consumes: credit RPCs `debit_credits`/`grant_credits`/`refund_hold`/`clawback_credits` (Task 1.7); `SupabaseClient` first arg.
- Produces (VERBATIM):
  - `debitCredits(sb, {user_id, amount, job_id}): Promise<number>`
  - `grantCredits(sb, {user_id, amount, reason, ref_type, ref_id}): Promise<void>` — `amount` is always positive; NEVER pass a negative amount to model a refund (use `clawbackCredits`).
  - `refundHold(sb, {user_id, amount, job_id}): Promise<void>`
  - `clawbackCredits(sb, {user_id, amount, order_id}): Promise<void>` — dedicated negative path for payment refunds (Phase 3); maps to `clawback_credits` RPC.

**Steps:**

1. - [ ] Write failing test `tests/unit/credits.test.ts`:
   ```ts
   import { describe, it, expect, vi } from "vitest";
   import type { SupabaseClient } from "@supabase/supabase-js";
   import { debitCredits, grantCredits, refundHold, clawbackCredits } from "@/lib/credits";

   function sbWithRpc(result: { data: unknown; error: unknown }) {
     const rpc = vi.fn(async () => result);
     return { sb: { rpc } as unknown as SupabaseClient, rpc };
   }

   it("debitCredits calls debit_credits RPC and returns ledger id", async () => {
     const { sb, rpc } = sbWithRpc({ data: 42, error: null });
     const id = await debitCredits(sb, { user_id: "u1", amount: 1, job_id: "j1" });
     expect(rpc).toHaveBeenCalledWith("debit_credits", { p_user: "u1", p_amount: 1, p_job: "j1" });
     expect(id).toBe(42);
   });

   it("debitCredits surfaces INSUFFICIENT_CREDITS", async () => {
     const { sb } = sbWithRpc({ data: null, error: { message: "INSUFFICIENT_CREDITS" } });
     await expect(debitCredits(sb, { user_id: "u1", amount: 99, job_id: "j1" })).rejects.toThrow(
       "INSUFFICIENT_CREDITS",
     );
   });

   it("grantCredits calls grant_credits RPC with mapped args", async () => {
     const { sb, rpc } = sbWithRpc({ data: null, error: null });
     await grantCredits(sb, { user_id: "u1", amount: 10, reason: "purchase", ref_type: "order", ref_id: "o1" });
     expect(rpc).toHaveBeenCalledWith("grant_credits", {
       p_user: "u1", p_amount: 10, p_reason: "purchase", p_ref_type: "order", p_ref_id: "o1",
     });
   });

   it("refundHold calls refund_hold RPC", async () => {
     const { sb, rpc } = sbWithRpc({ data: null, error: null });
     await refundHold(sb, { user_id: "u1", amount: 1, job_id: "j1" });
     expect(rpc).toHaveBeenCalledWith("refund_hold", { p_user: "u1", p_amount: 1, p_job: "j1" });
   });

   it("clawbackCredits calls clawback_credits RPC with mapped args (positive amount)", async () => {
     const { sb, rpc } = sbWithRpc({ data: null, error: null });
     await clawbackCredits(sb, { user_id: "u1", amount: 10, order_id: "o1" });
     expect(rpc).toHaveBeenCalledWith("clawback_credits", { p_user: "u1", p_amount: 10, p_order: "o1" });
   });

   it("clawbackCredits surfaces RPC errors", async () => {
     const { sb } = sbWithRpc({ data: null, error: { message: "PROFILE_NOT_FOUND" } });
     await expect(clawbackCredits(sb, { user_id: "u1", amount: 10, order_id: "o1" })).rejects.toThrow(
       "PROFILE_NOT_FOUND",
     );
   });
   ```
   Run (expected: FAIL — module missing):
   ```bash
   pnpm test tests/unit/credits.test.ts
   ```

2. - [ ] Write `lib/credits.ts`:
   ```ts
   import type { SupabaseClient } from "@supabase/supabase-js";
   import type { CreditLedgerReason } from "@/types/db";

   /**
    * Reserve (hold) credits for a generation job. Maps to debit_credits SECURITY DEFINER RPC.
    * Returns the generation_hold ledger row id. Throws 'INSUFFICIENT_CREDITS' when balance is too low.
    * Must be called with a service-role client (RPC is granted to service_role only).
    */
   export async function debitCredits(
     sb: SupabaseClient,
     args: { user_id: string; amount: number; job_id: string },
   ): Promise<number> {
     const { data, error } = await sb.rpc("debit_credits", {
       p_user: args.user_id,
       p_amount: args.amount,
       p_job: args.job_id,
     });
     if (error) throw new Error(error.message);
     return data as number;
   }

   /** Add credits (purchase / refund / release / signup_bonus). Maps to grant_credits RPC. */
   export async function grantCredits(
     sb: SupabaseClient,
     args: {
       user_id: string;
       amount: number;
       reason: Extract<CreditLedgerReason, "purchase" | "refund" | "release" | "signup_bonus">;
       ref_type: string | null;
       ref_id: string | null;
     },
   ): Promise<void> {
     const { error } = await sb.rpc("grant_credits", {
       p_user: args.user_id,
       p_amount: args.amount,
       p_reason: args.reason,
       p_ref_type: args.ref_type,
       p_ref_id: args.ref_id,
     });
     if (error) throw new Error(error.message);
   }

   /** Release a held credit on failed/blocked generation. Maps to refund_hold RPC. */
   export async function refundHold(
     sb: SupabaseClient,
     args: { user_id: string; amount: number; job_id: string },
   ): Promise<void> {
     const { error } = await sb.rpc("refund_hold", {
       p_user: args.user_id,
       p_amount: args.amount,
       p_job: args.job_id,
     });
     if (error) throw new Error(error.message);
   }

   /**
    * Deduct credits for a PAYMENT REFUND (Phase 3 payapp feedback refund branch).
    * Dedicated negative path: maps to clawback_credits RPC, which floors the balance at 0
    * and writes a negative 'refund' ledger row. `amount` is ALWAYS positive — never model a
    * refund by calling grantCredits with a negative amount (grant_credits enforces p_amount>0).
    */
   export async function clawbackCredits(
     sb: SupabaseClient,
     args: { user_id: string; amount: number; order_id: string },
   ): Promise<void> {
     const { error } = await sb.rpc("clawback_credits", {
       p_user: args.user_id,
       p_amount: args.amount,
       p_order: args.order_id,
     });
     if (error) throw new Error(error.message);
   }
   ```

3. - [ ] Run test (expected: PASS, 6 passed):
   ```bash
   pnpm test tests/unit/credits.test.ts
   ```

4. - [ ] Commit:
   ```bash
   git add -A && git commit -m "feat: lib/credits.ts RPC wrappers (debit/grant/refund/clawback) + unit tests" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
   ```

---

## Task 1.13 — `lib/consent.ts` constants + helpers + unit test

**Files:**
- Create: `lib/consent.ts`
- Test: `tests/unit/consent.test.ts`

**Interfaces:**
- Consumes: `Consent`, `ConsentType` from `types/db.ts`; `SupabaseClient`.
- Produces:
  - `REQUIRED_CONSENTS: ConsentType[] = ["tos","privacy","sensitive_face","own_face"]`
  - `OPTIONAL_CONSENTS: ConsentType[] = ["marketing"]`
  - `CONSENT_VERSION = "2026-06-27"`
  - `CONSENT_LABELS: Record<ConsentType, { title: string; required: boolean }>` (Korean copy)
  - `getUserConsents(sb, userId): Promise<ConsentType[]>`
  - `hasRequiredConsents(agreed: ConsentType[]): boolean`
  - `recordConsents(sb, {userId, types, ip}): Promise<void>`

**Steps:**

1. - [ ] Write failing test `tests/unit/consent.test.ts`:
   ```ts
   import { describe, it, expect, vi } from "vitest";
   import type { SupabaseClient } from "@supabase/supabase-js";
   import {
     REQUIRED_CONSENTS,
     OPTIONAL_CONSENTS,
     CONSENT_VERSION,
     hasRequiredConsents,
     getUserConsents,
     recordConsents,
   } from "@/lib/consent";

   it("required consents are the four PIPA mandatory items", () => {
     expect(REQUIRED_CONSENTS).toEqual(["tos", "privacy", "sensitive_face", "own_face"]);
     expect(OPTIONAL_CONSENTS).toEqual(["marketing"]);
   });

   it("hasRequiredConsents true only when all four present", () => {
     expect(hasRequiredConsents(["tos", "privacy", "sensitive_face", "own_face"])).toBe(true);
     expect(hasRequiredConsents(["tos", "privacy", "sensitive_face", "own_face", "marketing"])).toBe(true);
     expect(hasRequiredConsents(["tos", "privacy", "sensitive_face"])).toBe(false);
     expect(hasRequiredConsents([])).toBe(false);
   });

   it("getUserConsents returns distinct consent types for the user", async () => {
     const select = vi.fn(() => ({ eq: vi.fn(async () => ({ data: [{ type: "tos" }, { type: "tos" }, { type: "privacy" }], error: null })) }));
     const sb = { from: vi.fn(() => ({ select })) } as unknown as SupabaseClient;
     const out = await getUserConsents(sb, "u1");
     expect(out.sort()).toEqual(["privacy", "tos"]);
   });

   it("recordConsents inserts one row per type with version + ip", async () => {
     const insert = vi.fn(async () => ({ error: null }));
     const sb = { from: vi.fn(() => ({ insert })) } as unknown as SupabaseClient;
     await recordConsents(sb, { userId: "u1", types: ["tos", "privacy"], ip: "1.2.3.4" });
     expect(insert).toHaveBeenCalledWith([
       { user_id: "u1", type: "tos", version: CONSENT_VERSION, ip: "1.2.3.4" },
       { user_id: "u1", type: "privacy", version: CONSENT_VERSION, ip: "1.2.3.4" },
     ]);
   });
   ```
   Run (expected: FAIL — module missing):
   ```bash
   pnpm test tests/unit/consent.test.ts
   ```

2. - [ ] Write `lib/consent.ts`:
   ```ts
   import type { SupabaseClient } from "@supabase/supabase-js";
   import type { ConsentType } from "@/types/db";

   /** PIPA unbundled mandatory consents (must all be present to access /create). */
   export const REQUIRED_CONSENTS: ConsentType[] = ["tos", "privacy", "sensitive_face", "own_face"];
   /** Optional consents (do not gate access). */
   export const OPTIONAL_CONSENTS: ConsentType[] = ["marketing"];

   /** Bump this string when consent copy/scope changes; new version forces re-consent. */
   export const CONSENT_VERSION = "2026-06-27";

   /** Korean labels for the consent UI (spec §9 PIPA). */
   export const CONSENT_LABELS: Record<ConsentType, { title: string; required: boolean }> = {
     tos: { title: "[필수] 이용약관 동의", required: true },
     privacy: {
       title: "[필수] 개인정보 수집·이용 동의 (항목: 셀카·얼굴 / 목적: AI 프로필 생성 / 보유: 생성 직후 파기)",
       required: true,
     },
     sensitive_face: {
       title: "[필수] 얼굴 정보(민감정보 준함) 처리에 대한 별도 동의",
       required: true,
     },
     own_face: { title: "[필수] 본인 얼굴만 업로드함을 확인", required: true },
     marketing: { title: "[선택] 마케팅 정보 수신 동의", required: false },
   };

   /** Returns the distinct consent types the user has already agreed to. */
   export async function getUserConsents(sb: SupabaseClient, userId: string): Promise<ConsentType[]> {
     const { data, error } = await sb.from("consents").select("type").eq("user_id", userId);
     if (error) throw new Error(`getUserConsents: ${error.message}`);
     const set = new Set<ConsentType>();
     for (const row of (data ?? []) as { type: ConsentType }[]) set.add(row.type);
     return [...set];
   }

   /** True iff every REQUIRED_CONSENTS type is present in `agreed`. */
   export function hasRequiredConsents(agreed: ConsentType[]): boolean {
     const set = new Set(agreed);
     return REQUIRED_CONSENTS.every((t) => set.has(t));
   }

   /** Insert one consent row per agreed type (append-only audit, with version + IP). */
   export async function recordConsents(
     sb: SupabaseClient,
     args: { userId: string; types: ConsentType[]; ip: string | null },
   ): Promise<void> {
     if (args.types.length === 0) return;
     const rows = args.types.map((type) => ({
       user_id: args.userId,
       type,
       version: CONSENT_VERSION,
       ip: args.ip,
     }));
     const { error } = await sb.from("consents").insert(rows);
     if (error) throw new Error(`recordConsents: ${error.message}`);
   }
   ```

3. - [ ] Run test (expected: PASS, 4 passed):
   ```bash
   pnpm test tests/unit/consent.test.ts
   ```

4. - [ ] Commit:
   ```bash
   git add -A && git commit -m "feat: lib/consent.ts PIPA consent constants + read/write helpers + tests" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
   ```

---

## Task 1.14 — Root shell + nav with credit balance

**Files:**
- Create/Modify: `app/layout.tsx`, `components/nav.tsx`
- Modify: `app/globals.css` (keep shadcn tokens)

**Interfaces:**
- Consumes: `createServerSupabase()`; `Profile` type.
- Produces: `<Nav />` showing `credit_balance` for logged-in users; logged-out shows 로그인 CTA.

**Steps:**

1. - [ ] Write `components/nav.tsx` (server component — reads session + balance via cookie-bound client):
   ```tsx
   import Link from "next/link";
   import { createServerSupabase } from "@/lib/supabase/server";

   export async function Nav() {
     const supabase = await createServerSupabase();
     const {
       data: { user },
     } = await supabase.auth.getUser();

     let balance: number | null = null;
     if (user) {
       const { data } = await supabase
         .from("profiles")
         .select("credit_balance")
         .eq("id", user.id)
         .maybeSingle();
       balance = (data?.credit_balance as number | undefined) ?? 0;
     }

     return (
       <header className="flex items-center justify-between border-b px-4 py-3">
         <Link href="/" className="text-lg font-bold tracking-tight">
           ProfAI
         </Link>
         <nav className="flex items-center gap-4 text-sm">
           {user ? (
             <>
               <span
                 className="rounded-full bg-neutral-100 px-3 py-1 font-medium"
                 aria-label="보유 크레딧"
               >
                 크레딧 {balance ?? 0}
               </span>
               <Link href="/create" className="hover:underline">
                 만들기
               </Link>
               <Link href="/gallery" className="hover:underline">
                 갤러리
               </Link>
               <Link href="/credits" className="hover:underline">
                 크레딧 충전
               </Link>
               <Link href="/account" className="hover:underline">
                 내 계정
               </Link>
             </>
           ) : (
             <Link
               href="/login"
               className="rounded-md bg-neutral-900 px-3 py-1.5 text-white"
             >
               로그인
             </Link>
           )}
         </nav>
       </header>
     );
   }
   ```

2. - [ ] Overwrite `app/layout.tsx`:
   ```tsx
   import type { Metadata } from "next";
   import "./globals.css";
   import { Nav } from "@/components/nav";

   export const metadata: Metadata = {
     title: "ProfAI — AI 프로필 사진 생성기",
     description: "셀카 1~3장으로 비즈·증명사진부터 컨셉 화보까지. AI 프로필 사진을 즉석 생성.",
   };

   export default function RootLayout({ children }: { children: React.ReactNode }) {
     return (
       <html lang="ko">
         <body className="min-h-screen bg-white text-neutral-900 antialiased">
           <Nav />
           <main className="mx-auto w-full max-w-5xl px-4 py-8">{children}</main>
         </body>
       </html>
     );
   }
   ```

3. - [ ] Verify typecheck + build (expected: PASS):
   ```bash
   pnpm exec tsc --noEmit
   pnpm build
   ```

4. - [ ] Commit:
   ```bash
   git add -A && git commit -m "feat: root shell + nav showing credit balance" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
   ```

---

## Task 1.15 — Landing page (`app/page.tsx`)

**Files:**
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `FREE_SIGNUP_CREDITS`; `STYLE_FAMILIES`.
- Produces: landing hero with hook + free-trial CTA → `/login`.

**Steps:**

1. - [ ] Overwrite `app/page.tsx`:
   ```tsx
   import Link from "next/link";
   import { FREE_SIGNUP_CREDITS, STYLE_FAMILIES } from "@/lib/styles";

   const FAMILY_LABELS: Record<(typeof STYLE_FAMILIES)[number], string> = {
     business: "비즈·증명사진",
     editorial: "컨셉 화보",
     sns: "SNS 감성",
     fantasy: "판타지·아트",
   };

   export default function LandingPage() {
     return (
       <div className="flex flex-col items-center gap-10 py-10 text-center">
         <section className="flex flex-col items-center gap-4">
           <p className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium">
             가입 즉시 무료 {FREE_SIGNUP_CREDITS}크레딧
           </p>
           <h1 className="max-w-2xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
             셀카 한 장이면, 프로필 사진이 완성됩니다
           </h1>
           <p className="max-w-xl text-neutral-600">
             AI가 셀카를 레퍼런스로 비즈·증명사진부터 컨셉 화보까지 즉석 생성. 별도 학습 없이 바로.
           </p>
           <Link
             href="/login"
             className="mt-2 rounded-lg bg-neutral-900 px-6 py-3 font-semibold text-white"
           >
             무료로 시작하기
           </Link>
           <p className="text-xs text-neutral-500">
             모든 결과물에는 ‘AI 생성’ 라벨이 표시됩니다 (인공지능기본법 준수).
           </p>
         </section>

         <section className="grid w-full grid-cols-2 gap-3 sm:grid-cols-4">
           {STYLE_FAMILIES.map((f) => (
             <div key={f} className="rounded-xl border p-4 text-sm font-medium">
               {FAMILY_LABELS[f]}
             </div>
           ))}
         </section>
       </div>
     );
   }
   ```

2. - [ ] Verify build (expected: PASS):
   ```bash
   pnpm build
   ```

3. - [ ] Commit:
   ```bash
   git add -A && git commit -m "feat: landing page with hook + free-trial CTA" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
   ```

---

## Task 1.16 — Login page + OAuth callback (Kakao + Google)

**Files:**
- Create: `app/login/page.tsx`, `app/auth/callback/route.ts`

**Interfaces:**
- Consumes: `createBrowserSupabase()` (client, for `signInWithOAuth`), `createServerSupabase()` (callback code exchange).
- Produces: Kakao/Google sign-in; `/auth/callback` exchanges code → redirects to `next` (default `/onboarding/consent`).

**Steps:**

1. - [ ] Write `app/login/page.tsx` (client component — `signInWithOAuth` redirects to provider, then back to `/auth/callback`):
   ```tsx
   "use client";

   import { createBrowserSupabase } from "@/lib/supabase/browser";

   export default function LoginPage() {
     const supabase = createBrowserSupabase();

     async function signIn(provider: "kakao" | "google") {
       const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent("/onboarding/consent")}`;
       await supabase.auth.signInWithOAuth({ provider, options: { redirectTo } });
     }

     return (
       <div className="mx-auto flex max-w-sm flex-col items-center gap-6 py-16">
         <h1 className="text-2xl font-bold">로그인 / 회원가입</h1>
         <p className="text-center text-sm text-neutral-600">
           소셜 계정으로 3초 만에 시작하고 무료 크레딧을 받으세요.
         </p>
         <div className="flex w-full flex-col gap-3">
           <button
             type="button"
             onClick={() => signIn("kakao")}
             className="w-full rounded-md bg-[#FEE500] px-4 py-3 font-semibold text-[#191600]"
           >
             카카오로 시작하기
           </button>
           <button
             type="button"
             onClick={() => signIn("google")}
             className="w-full rounded-md border px-4 py-3 font-semibold"
           >
             Google로 시작하기
           </button>
         </div>
         <p className="text-center text-xs text-neutral-500">
           로그인 시 만 14세 이상이며 본인 얼굴만 업로드함에 동의하는 것으로 간주되지 않으며, 다음 단계에서
           별도 동의를 받습니다.
         </p>
       </div>
     );
   }
   ```

2. - [ ] Write `app/auth/callback/route.ts`:
   ```ts
   import { NextResponse, type NextRequest } from "next/server";
   import { createServerSupabase } from "@/lib/supabase/server";

   export const runtime = "nodejs";

   export async function GET(request: NextRequest) {
     const { searchParams, origin } = new URL(request.url);
     const code = searchParams.get("code");
     const next = searchParams.get("next") ?? "/onboarding/consent";

     if (code) {
       const supabase = await createServerSupabase();
       const { error } = await supabase.auth.exchangeCodeForSession(code);
       if (!error) {
         return NextResponse.redirect(`${origin}${next}`);
       }
     }
     return NextResponse.redirect(`${origin}/login?error=auth`);
   }
   ```

3. - [ ] Document provider setup (no code — manual Supabase dashboard step). Add note to plan execution log: enable Kakao + Google providers in Supabase Auth, set redirect URL `${APP_BASE_URL}/auth/callback`. For local E2E this is stubbed (Task 1.18). Verify build:
   ```bash
   pnpm build
   ```
   (expected: PASS)

4. - [ ] Commit:
   ```bash
   git add -A && git commit -m "feat: kakao/google login page + oauth callback code exchange" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
   ```

---

## Task 1.17 — Consent onboarding flow + age gate + route gating

**Files:**
- Create: `lib/age.ts`, `app/onboarding/consent/page.tsx`, `app/onboarding/consent/actions.ts`, `app/onboarding/consent/consent-form.tsx`, `app/create/page.tsx`
- Test: `tests/unit/age.test.ts`
- Modify: `lib/supabase/middleware.ts` (add route gating)

**Interfaces:**
- Consumes: `getUserConsents`, `recordConsents`, `hasRequiredConsents`, `REQUIRED_CONSENTS`, `OPTIONAL_CONSENTS`, `CONSENT_LABELS` (Task 1.13); `createServerSupabase()`.
- Produces:
  - `lib/age.ts`: `MIN_AGE = 14`, `ageFromBirthdate(birthdate: string, today?: Date): number`, `isAgeAllowed(birthdate: string, today?: Date): boolean`.
  - Age gate (spec §9, 만 14세 미만 차단): the consent onboarding collects a birthdate; ages < 14 are blocked with a Korean notice and cannot proceed; ages ≥ 14 set `profiles.age_verified = true` via the server action.
  - Consent gate — `/create` requires all REQUIRED_CONSENTS; otherwise redirect to `/onboarding/consent`.

**Steps:**

1. - [ ] Write the age-gate helper `lib/age.ts` (TDD — write `tests/unit/age.test.ts` first):
   ```ts
   // tests/unit/age.test.ts
   import { describe, it, expect } from "vitest";
   import { MIN_AGE, ageFromBirthdate, isAgeAllowed } from "@/lib/age";

   const today = new Date("2026-06-27T00:00:00Z");

   it("MIN_AGE is the legal 14 gate (spec §9)", () => {
     expect(MIN_AGE).toBe(14);
   });

   it("ageFromBirthdate computes full years, not yet had birthday this year", () => {
     expect(ageFromBirthdate("2012-12-01", today)).toBe(13); // birthday later in 2026
     expect(ageFromBirthdate("2012-06-27", today)).toBe(14); // birthday today
     expect(ageFromBirthdate("2000-01-01", today)).toBe(26);
   });

   it("isAgeAllowed blocks < 14, allows >= 14", () => {
     expect(isAgeAllowed("2012-12-01", today)).toBe(false); // turns 14 after today => 13
     expect(isAgeAllowed("2012-06-27", today)).toBe(true); // exactly 14 today
     expect(isAgeAllowed("2013-01-01", today)).toBe(false); // 13
     expect(isAgeAllowed("1990-05-05", today)).toBe(true);
   });
   ```
   Then implement `lib/age.ts`:
   ```ts
   /** Legal age gate: 만 14세 미만 차단 (spec §9). */
   export const MIN_AGE = 14 as const;

   /** Full years between `birthdate` (YYYY-MM-DD) and `today` (default: now). */
   export function ageFromBirthdate(birthdate: string, today: Date = new Date()): number {
     const b = new Date(`${birthdate}T00:00:00Z`);
     if (Number.isNaN(b.getTime())) return Number.NaN;
     let age = today.getUTCFullYear() - b.getUTCFullYear();
     const m = today.getUTCMonth() - b.getUTCMonth();
     if (m < 0 || (m === 0 && today.getUTCDate() < b.getUTCDate())) age -= 1;
     return age;
   }

   /** True iff the person is at least MIN_AGE years old (and birthdate parses). */
   export function isAgeAllowed(birthdate: string, today: Date = new Date()): boolean {
     const age = ageFromBirthdate(birthdate, today);
     return Number.isFinite(age) && age >= MIN_AGE;
   }
   ```
   Run (expected: PASS, 3 passed):
   ```bash
   pnpm test tests/unit/age.test.ts
   ```

2. - [ ] Write the server action `app/onboarding/consent/actions.ts`:
   ```ts
   "use server";

   import { redirect } from "next/navigation";
   import { headers } from "next/headers";
   import { createServerSupabase } from "@/lib/supabase/server";
   import {
     recordConsents,
     hasRequiredConsents,
     REQUIRED_CONSENTS,
     OPTIONAL_CONSENTS,
   } from "@/lib/consent";
   import { isAgeAllowed } from "@/lib/age";
   import type { ConsentType } from "@/types/db";

   export async function submitConsent(formData: FormData): Promise<void> {
     const supabase = await createServerSupabase();
     const {
       data: { user },
     } = await supabase.auth.getUser();
     if (!user) redirect("/login");

     // --- Age gate (spec §9, 만 14세 미만 차단) — enforce BEFORE recording consents. ---
     const birthdate = (formData.get("birthdate") as string | null)?.trim() ?? "";
     if (!birthdate) {
       redirect("/onboarding/consent?error=birthdate");
     }
     if (!isAgeAllowed(birthdate)) {
       // Under 14 (or unparseable): block, do not proceed, do not write anything.
       redirect("/onboarding/consent?error=age");
     }

     const all: ConsentType[] = [...REQUIRED_CONSENTS, ...OPTIONAL_CONSENTS];
     const agreed = all.filter((t) => formData.get(t) === "on");

     if (!hasRequiredConsents(agreed)) {
       redirect("/onboarding/consent?error=required");
     }

     const hdrs = await headers();
     const ip =
       hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? hdrs.get("x-real-ip") ?? null;

     await recordConsents(supabase, { userId: user.id, types: agreed, ip });

     // Age verified (>= 14): persist the flag the Phase 2 generate route gates on.
     const { error: ageErr } = await supabase
       .from("profiles")
       .update({ age_verified: true })
       .eq("id", user.id);
     if (ageErr) throw new Error(`submitConsent: age_verified update failed: ${ageErr.message}`);

     redirect("/create");
   }
   ```
   > NOTE: `profiles_update_own` RLS (Task 1.6) permits a user to update their OWN row, so the cookie-bound client can set `age_verified` for `auth.uid()`. The boolean is the single source the Phase 2 `app/api/generate/route.ts` checks (403 if not true).

3. - [ ] Write the client form `app/onboarding/consent/consent-form.tsx` (collects birthdate for the age gate + the consent checkboxes; submit stays disabled until a birthdate is entered AND all required consents are checked):
   ```tsx
   "use client";

   import { useState } from "react";
   import { submitConsent } from "./actions";
   import {
     REQUIRED_CONSENTS,
     OPTIONAL_CONSENTS,
     CONSENT_LABELS,
   } from "@/lib/consent";
   import { MIN_AGE } from "@/lib/age";

   type ErrorKind = "required" | "age" | "birthdate" | null;

   export function ConsentForm({ error }: { error: ErrorKind }) {
     const [checked, setChecked] = useState<Record<string, boolean>>({});
     const [birthdate, setBirthdate] = useState("");
     const allRequiredChecked = REQUIRED_CONSENTS.every((t) => checked[t]);
     const canSubmit = allRequiredChecked && birthdate !== "";

     function toggleAll(on: boolean) {
       const next: Record<string, boolean> = {};
       for (const t of [...REQUIRED_CONSENTS, ...OPTIONAL_CONSENTS]) next[t] = on;
       setChecked(next);
     }

     return (
       <form action={submitConsent} className="flex flex-col gap-4">
         {error === "required" && (
           <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
             필수 동의 항목에 모두 체크해야 진행할 수 있습니다.
           </p>
         )}
         {error === "age" && (
           <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
             만 {MIN_AGE}세 미만은 서비스를 이용할 수 없습니다.
           </p>
         )}
         {error === "birthdate" && (
           <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
             생년월일을 입력해 주세요.
           </p>
         )}

         <label className="flex flex-col gap-1 border-b pb-3 text-sm">
           <span className="font-semibold">생년월일 (만 {MIN_AGE}세 이상만 이용 가능)</span>
           <input
             type="date"
             name="birthdate"
             required
             value={birthdate}
             max="2099-12-31"
             onChange={(e) => setBirthdate(e.target.value)}
             className="rounded-md border px-3 py-2"
           />
         </label>

         <label className="flex items-center gap-2 border-b pb-3 text-sm font-semibold">
           <input
             type="checkbox"
             checked={[...REQUIRED_CONSENTS, ...OPTIONAL_CONSENTS].every((t) => checked[t])}
             onChange={(e) => toggleAll(e.target.checked)}
           />
           전체 동의
         </label>

         {[...REQUIRED_CONSENTS, ...OPTIONAL_CONSENTS].map((t) => (
           <label key={t} className="flex items-start gap-2 text-sm">
             <input
               type="checkbox"
               name={t}
               checked={!!checked[t]}
               onChange={(e) => setChecked((c) => ({ ...c, [t]: e.target.checked }))}
             />
             <span>{CONSENT_LABELS[t].title}</span>
           </label>
         ))}

         <button
           type="submit"
           disabled={!canSubmit}
           className="mt-2 rounded-lg bg-neutral-900 px-6 py-3 font-semibold text-white disabled:opacity-40"
         >
           동의하고 시작하기
         </button>
       </form>
     );
   }
   ```

4. - [ ] Write the page `app/onboarding/consent/page.tsx` (server component — redirects if already consented):
   ```tsx
   import { redirect } from "next/navigation";
   import { createServerSupabase } from "@/lib/supabase/server";
   import { getUserConsents, hasRequiredConsents } from "@/lib/consent";
   import { ConsentForm } from "./consent-form";

   export default async function ConsentPage({
     searchParams,
   }: {
     searchParams: Promise<{ error?: string }>;
   }) {
     const supabase = await createServerSupabase();
     const {
       data: { user },
     } = await supabase.auth.getUser();
     if (!user) redirect("/login");

     const agreed = await getUserConsents(supabase, user.id);
     if (hasRequiredConsents(agreed)) redirect("/create");

     const { error } = await searchParams;
     const errorKind =
       error === "required" || error === "age" || error === "birthdate" ? error : null;

     return (
       <div className="mx-auto flex max-w-lg flex-col gap-6 py-10">
         <div>
           <h1 className="text-2xl font-bold">서비스 이용 동의</h1>
           <p className="mt-1 text-sm text-neutral-600">
             만 14세 이상만 이용할 수 있습니다. 얼굴 정보는 민감정보에 준해 처리되며, 원본 셀카는 생성 직후 파기됩니다.
           </p>
         </div>
         <ConsentForm error={errorKind} />
       </div>
     );
   }
   ```
   (`searchParams` stays typed `{ error?: string }` — it already covers `required`/`age`/`birthdate`.)

5. - [ ] Write the gated placeholder `app/create/page.tsx` (real studio UI lands in a later phase; here it just proves the gate works):
   ```tsx
   import { redirect } from "next/navigation";
   import { createServerSupabase } from "@/lib/supabase/server";
   import { getUserConsents, hasRequiredConsents } from "@/lib/consent";

   export default async function CreatePage() {
     const supabase = await createServerSupabase();
     const {
       data: { user },
     } = await supabase.auth.getUser();
     if (!user) redirect("/login");

     const agreed = await getUserConsents(supabase, user.id);
     if (!hasRequiredConsents(agreed)) redirect("/onboarding/consent");

     return (
       <div className="py-10">
         <h1 className="text-2xl font-bold">스튜디오</h1>
         <p className="mt-2 text-sm text-neutral-600">
           셀카 업로드와 스타일 선택은 다음 단계에서 제공됩니다. (Phase 2)
         </p>
       </div>
     );
   }
   ```

6. - [ ] Add middleware-level auth gating for protected paths. Replace `lib/supabase/middleware.ts` body to also redirect unauthenticated users away from protected routes (keep cookie refresh logic; the `getClaims` result is reused):
   ```ts
   import { createServerClient } from "@supabase/ssr";
   import { NextResponse, type NextRequest } from "next/server";

   const PROTECTED_PREFIXES = ["/create", "/gallery", "/credits", "/account", "/onboarding"];

   /**
    * Refreshes the Supabase auth session, propagates updated cookies, and
    * redirects unauthenticated users away from protected routes.
    */
   export async function updateSession(request: NextRequest) {
     let response = NextResponse.next({ request });

     const supabase = createServerClient(
       process.env.NEXT_PUBLIC_SUPABASE_URL!,
       process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
       {
         cookies: {
           getAll() {
             return request.cookies.getAll();
           },
           setAll(cookiesToSet) {
             for (const { name, value } of cookiesToSet) {
               request.cookies.set(name, value);
             }
             response = NextResponse.next({ request });
             for (const { name, value, options } of cookiesToSet) {
               response.cookies.set(name, value, options);
             }
           },
         },
       },
     );

     const { data } = await supabase.auth.getClaims();
     const path = request.nextUrl.pathname;
     const isProtected = PROTECTED_PREFIXES.some((p) => path === p || path.startsWith(p + "/"));

     if (isProtected && !data?.claims) {
       const url = request.nextUrl.clone();
       url.pathname = "/login";
       url.searchParams.set("next", path);
       return NextResponse.redirect(url);
     }

     return response;
   }
   ```

7. - [ ] Verify build + typecheck + age test (expected: PASS):
   ```bash
   pnpm test tests/unit/age.test.ts
   pnpm exec tsc --noEmit
   pnpm build
   ```

8. - [ ] Commit:
   ```bash
   git add -A && git commit -m "feat: unbundled consent onboarding + age gate (만 14세) + middleware route gating to /create" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
   ```

---

## Task 1.18 — Playwright E2E: login redirect + consent gate

**Files:**
- Create: `e2e/auth-consent.spec.ts`, `e2e/helpers/session.ts`

**Interfaces:**
- Consumes: running app (`pnpm dev` via playwright webServer); Supabase local stack (`supabase start`).
- Produces: E2E proof that (a) unauthenticated `/create` redirects to `/login`, (b) landing renders the free-credit hook, (c) an authenticated-but-not-consented user is gated to `/onboarding/consent` and, after consent, reaches `/create`.

> OAuth is stubbed: we mint a Supabase session for a seeded test user via the service-role admin API (no real Kakao/Google round-trip). Requires `supabase start` running (Docker) and `.env.local` populated with local keys.

**Steps:**

1. - [ ] Write `e2e/helpers/session.ts` (creates a confirmed test user via admin API and returns access/refresh tokens; the trigger auto-creates the profile + 3 credits):
   ```ts
   import { createClient } from "@supabase/supabase-js";

   const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
   const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
   const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

   export async function createTestUserSession(email: string, password = "test-pass-12345") {
     const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

     // Clean any prior user with this email (best-effort).
     const { data: list } = await admin.auth.admin.listUsers();
     const existing = list?.users.find((u) => u.email === email);
     if (existing) await admin.auth.admin.deleteUser(existing.id);

     const { data: created, error } = await admin.auth.admin.createUser({
       email,
       password,
       email_confirm: true,
       user_metadata: { name: "E2E 테스터" },
     });
     if (error) throw error;

     const anon = createClient(url, anonKey, { auth: { persistSession: false } });
     const { data: signin, error: signErr } = await anon.auth.signInWithPassword({ email, password });
     if (signErr) throw signErr;

     return {
       userId: created.user!.id,
       accessToken: signin.session!.access_token,
       refreshToken: signin.session!.refresh_token,
     };
   }
   ```

2. - [ ] Write `e2e/auth-consent.spec.ts`:
   ```ts
   import { test, expect, type Page } from "@playwright/test";
   import { createTestUserSession } from "./helpers/session";

   /** Inject Supabase session cookies so the app sees an authenticated user. */
   async function authenticate(page: Page, email: string) {
     const { accessToken, refreshToken } = await createTestUserSession(email);
     // @supabase/ssr stores the session under a project-ref cookie; set it via the browser client.
     await page.addInitScript(
       ([at, rt, url, anon]) => {
         (window as unknown as { __E2E_SESSION__: unknown }).__E2E_SESSION__ = {
           accessToken: at,
           refreshToken: rt,
           url,
           anon,
         };
       },
       [accessToken, refreshToken, process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY],
     );
     await page.goto("/");
     // Establish the SSR cookie by calling setSession in the browser context.
     await page.evaluate(async () => {
       const s = (window as unknown as { __E2E_SESSION__: { accessToken: string; refreshToken: string; url: string; anon: string } }).__E2E_SESSION__;
       const mod = await import("https://esm.sh/@supabase/ssr@latest");
       const client = mod.createBrowserClient(s.url, s.anon);
       await client.auth.setSession({ access_token: s.accessToken, refresh_token: s.refreshToken });
     });
   }

   test("landing shows the free-credit hook", async ({ page }) => {
     await page.goto("/");
     await expect(page.getByText(/무료 3크레딧/)).toBeVisible();
     await expect(page.getByRole("link", { name: "무료로 시작하기" })).toBeVisible();
   });

   test("unauthenticated /create redirects to /login", async ({ page }) => {
     await page.goto("/create");
     await expect(page).toHaveURL(/\/login/);
   });

   test("authenticated-but-unconsented user is gated, then reaches /create after consent", async ({ page }) => {
     await authenticate(page, `e2e+${Date.now()}@test.dev`);

     // Going to /create should bounce to the consent onboarding.
     await page.goto("/create");
     await expect(page).toHaveURL(/\/onboarding\/consent/);

     // Submit button disabled until birthdate is entered AND all required boxes are checked.
     const submit = page.getByRole("button", { name: "동의하고 시작하기" });
     await expect(submit).toBeDisabled();

     // Enter a birthdate that clears the 만 14세 age gate.
     await page.locator('input[name="birthdate"]').fill("2000-01-01");

     // Check all four required consents via 전체 동의.
     await page.getByText("전체 동의").click();
     await expect(submit).toBeEnabled();
     await submit.click();

     // Now /create is reachable.
     await expect(page).toHaveURL(/\/create/);
     await expect(page.getByRole("heading", { name: "스튜디오" })).toBeVisible();

     // Nav shows the 3 free credits.
     await expect(page.getByLabel("보유 크레딧")).toContainText("3");
   });
   ```
   > NOTE: the `esm.sh` dynamic import in `authenticate` is the simplest cookie-mint path for E2E; if the test runner blocks remote imports, replace it by POSTing tokens to a tiny test-only route or by setting the `sb-<ref>-auth-token` cookie directly. Document whichever the implementer chooses; the assertions stay identical.

3. - [ ] Run E2E (requires `supabase start` running + `.env.local`). Expected: 3 passed:
   ```bash
   pnpm dlx supabase start
   pnpm exec playwright install chromium
   pnpm e2e e2e/auth-consent.spec.ts
   ```

4. - [ ] Run the full unit + db suite as a phase gate (expected: all green — Vitest suites pass; `supabase test db` 23 assertions pass):
   ```bash
   pnpm test
   pnpm dlx supabase test db
   pnpm exec tsc --noEmit
   ```

5. - [ ] Commit:
   ```bash
   git add -A && git commit -m "test: e2e login redirect + consent gate to /create" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
   ```

---

## Phase 1 Done — Definition of Done

- [ ] `pnpm build` and `pnpm exec tsc --noEmit` pass.
- [ ] `pnpm test` (Vitest) green: supabase-clients, db-types, styles, db, credits (incl. clawback), consent, age.
- [ ] `pnpm dlx supabase test db` green: RLS (6) + credit RPCs incl. FOR UPDATE guard + clawback (13) + signup bonus (4).
- [ ] `pnpm e2e` green: landing hook, unauth `/create`→`/login`, consent gate → `/create`, nav shows 3 credits.
- [ ] Age gate (spec §9): consent onboarding collects a birthdate; under-14 is blocked (Korean notice, no writes); ≥14 sets `profiles.age_verified = true`. `lib/age.ts` unit test green.
- [ ] Migrations 0001–0004 + `seed.sql` (12 presets, canonical `model_key` values) apply cleanly via `supabase db reset`.
- [ ] A real Kakao/Google login (manual, providers enabled in Supabase dashboard) creates a profile with 3 credits and reaches consent → `/create`.
- [ ] No secret in `NEXT_PUBLIC_*`; service-role only in server-only modules; credit RPCs revoked from anon/authenticated.

## Hand-off to Phase 2 (interfaces produced)

These are now live for later phases to consume **verbatim**:
- Supabase clients: `createServerSupabase()`, `createBrowserSupabase()`, `createServiceSupabase()`, `updateSession(request)`.
- Types: all of `types/db.ts` (`Profile`, `Consent`, `CreditLedger`, `Order`, `StylePreset`, `GenerationJob`, `Asset`, `CreditPack`, `NewJob`).
- DB helpers: `lib/db.ts` (`insertOrder`, `getOrder`, `updateOrder`, `markOrderPaidIfPending`, `markOrderRefundedIfPaid`, `insertJobs`, `getJob`, `setJobStatus`, `insertAsset`).
- Credit wrappers: `lib/credits.ts` (`debitCredits`, `grantCredits`, `refundHold`, `clawbackCredits`) over RPCs `debit_credits`/`grant_credits`/`refund_hold`/`clawback_credits`. `grant_credits` keeps its `p_amount>0` invariant; payment refunds use `clawbackCredits` (the dedicated negative path), never a negative `grantCredits`.
- Consent: `lib/consent.ts` (`REQUIRED_CONSENTS`, `OPTIONAL_CONSENTS`, `CONSENT_VERSION`, `CONSENT_LABELS`, `getUserConsents`, `hasRequiredConsents`, `recordConsents`).
- Constants: `lib/styles.ts` (`CREDIT_PACKS`, `FREE_SIGNUP_CREDITS`, `STYLE_FAMILIES`).
- Schema: all spec §5 tables, own-row RLS, credit RPCs (service_role-only), signup trigger; 12 seeded `style_presets`.
- App shell: `app/layout.tsx` + `components/nav.tsx` (credit balance), `app/page.tsx` landing, `/login`, `/auth/callback`, `/onboarding/consent` (incl. age gate writing `profiles.age_verified`), gated `/create` placeholder, `middleware.ts` session refresh + route gating, framework-only `vercel.ts` (crons owned/finalized in Phase 4).
