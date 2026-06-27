# ProfAI — Phase 4: Compliance Polish Launch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Turn the working vertical slice (auth + generation + payments from Phases 1–3) into a **compliant, installable MVP**: PIPA consent history + data-deletion + selfie-purge cron, 인공지능기본법 AI-generation labeling/disclosure, legal pages (terms/privacy with 국외수탁), moderation-failure UX with credit-refund messaging, own-face/age-gate copy, PWA installability, SEO metadata, Vercel Analytics, wired cron schedules, and a documented pre-launch checklist.

**Architecture:** All new server logic runs on the **Node runtime** as Route Handlers / Server Actions on Vercel (Fluid Compute). Data deletion and selfie purge use the **service-role** Supabase client (bypasses RLS) and are reachable only from authenticated Server Actions (deletion) or a `CRON_SECRET`-guarded route (purge). Legal/disclosure/labeling are pure presentational React (RSC + small client islands). PWA is a Next.js metadata route (`app/manifest.ts`) plus static icons. Crons are declared in `vercel.ts` (the single deployment-config source — Phase 1 scaffolds a minimal `vercel.ts`; this phase owns/finalizes the four cron schedules; there is no `vercel.json`).

**Tech Stack:** Next.js 16 App Router + RSC, TypeScript strict, pnpm. Vitest (+ `@testing-library/react` + jsdom) for unit/component tests; Supabase/provider clients mocked with `vi.mock`. `@vercel/analytics` for analytics, `sharp` (already a dependency from the watermark module) to generate PWA icons.

---

## Global Constraints  (apply to EVERY task in this phase)

- Next.js 16 App Router + React Server Components, TypeScript strict. Package manager: **pnpm**.
- API routes and the worker run on Node runtime: `export const runtime = "nodejs"`. **NEVER Edge.**
- Test stack: Vitest (unit/integration, with `vi.mock` for Supabase/provider clients) + Playwright (E2E). DB migration/RLS/RPC tests via pgTAP in `supabase/tests` run with `supabase test db` (requires Docker + Supabase CLI). State the Docker requirement where used.
- Every secret is server-only. Client may ONLY see `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. **NEVER** expose `OPENAI_API_KEY`, `GEMINI_API_KEY`/`AI_GATEWAY_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PAYAPP_USERID`/`LINKKEY`/`VALUE`, `CRON_SECRET`.
- Pin models: OpenAI `gpt-image-2` (snapshot `gpt-image-2-2026-04-21`); Google `google/gemini-3-pro-image`; free tier `google/gemini-3.1-flash-image-preview` or `gpt-image-1-mini`. Verify ids live before launch (manual step, do not block).
- Credit unit: 1 credit = 1 output image at 2K. 4K = 2 credits (post-MVP). Free signup = 3 credits, watermarked 1K.
- **Korean UI copy.** All generated outputs (free tier especially) carry a visible "AI 생성" label per 인공지능기본법.
- Frequent commits: each task ends with a commit. Conventional commit messages (feat/fix/test/chore/docs). End every commit body with:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

### Relevant ENV VARS (`.env.example`)
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `AI_GATEWAY_API_KEY` (Gemini via Vercel AI Gateway), `PAYAPP_USERID`, `PAYAPP_LINKKEY`, `PAYAPP_VALUE`, `APP_BASE_URL`, `CRON_SECRET`.

### Assumptions consumed from earlier phases (reference only — do NOT redefine)
- `lib/supabase/server.ts` → `createServerSupabase(): Promise<SupabaseClient>` — cookie-bound RLS client (await it).
- `lib/supabase/service.ts` → `createServiceSupabase(): SupabaseClient` — service-role, server-only, bypasses RLS.
- `types/db.ts` row types: `Profile`, `Consent`, `GenerationJob`, `Asset` (exact shapes per shared contract).
- `lib/styles.ts` → `CREDIT_PACKS`, `FREE_SIGNUP_CREDITS`, `STYLE_FAMILIES`.
- Worker (Phase 2) sets `generation_jobs.status='failed'` + `error_code` on failure to **exactly one of three canonical lowercase snake values**: `"moderation_blocked"` (gemini empty/blocked output → `ModerationBlockedError`), `"no_image"` (a structurally-empty-but-not-blocked result), or `"generation_failed"` (any other thrown error); and calls `refundHold(...)` so failed jobs are already credit-refunded.
- `app/api/cron/reap/route.ts` is created in **Phase 2** (generation-lifecycle reaper) and `app/api/cron/reconcile/route.ts` in **Phase 3**; both already exist by this phase and guard on `Authorization: Bearer ${CRON_SECRET}`. This phase only wires their cron **schedules** (Task 4.12) — it does NOT create reap.
- Storage: there are **two private buckets** defined in Phase 2 `lib/storage.ts` — `BUCKET_SELFIES = "selfies"` and `BUCKET_OUTPUTS = "outputs"`. There is **no** `"media"` bucket. `assets.storage_path` is the object **key within the bucket selected by `assets.kind`** (`source_selfie` → selfies, generated outputs → outputs). `lib/account.ts` imports both constants from `lib/storage.ts` and operates on both buckets.
- `app/layout.tsx`, `app/result/[batchId]/page.tsx`, `app/create/page.tsx` already exist (Phases 1–3); this phase **modifies** them.
- Path alias `@/*` → repo root is configured in `tsconfig.json` and mirrored in `vitest.config.ts` (Phase 0). Component tests rely on it.

---

## File Structure  (subset this phase creates/modifies)

| Path | Responsibility |
|---|---|
| `lib/legal.ts` | **Create** — business info, overseas-processor list, retention policy, refund policy, AI-disclosure/label strings (pure constants). |
| `lib/jobErrors.ts` | **Create** — pure `describeJobError(errorCode)` → friendly Korean copy + refund flag. |
| `lib/account.ts` | **Create** — `deleteUserData(sb,userId)` (storage + cascade rows + auth user) and `purgeExpiredSelfies(sb,now?)` (PIPA selfie purge). |
| `components/AiLabel.tsx` | **Create** — visible "AI 생성" label chip for generated images. |
| `components/AiDisclosureBanner.tsx` | **Create** — site-wide AI-generation disclosure banner. |
| `components/SiteFooter.tsx` | **Create** — 사업자정보 + 환불정책 요약 + legal links footer. |
| `components/JobErrorCard.tsx` | **Create** — failed-job friendly retry + refund surface (client). |
| `components/UploadConsentNotice.tsx` | **Create** — own-face / 만 14세 gate copy on upload. |
| `components/MarketingToggle.tsx` | **Create** — client checkbox calling `setMarketingConsent` action. |
| `components/DeleteAccountButton.tsx` | **Create** — client confirm-then-delete calling `deleteAccount` action. |
| `app/legal/terms/page.tsx` | **Create** — 이용약관. |
| `app/legal/privacy/page.tsx` | **Create** — 개인정보처리방침 (국외수탁/보유·파기/민감정보 근거). |
| `app/account/actions.ts` | **Create** — `deleteAccount()` + `setMarketingConsent(agreed)` Server Actions. |
| `app/account/page.tsx` | **Create** — consent history view + marketing toggle + delete section. |
| `app/api/cron/expire/route.ts` | **Create** — `CRON_SECRET`-guarded selfie purge endpoint. |
| `app/manifest.ts` | **Create** — PWA manifest metadata route. |
| `public/icon-192.png` / `icon-512.png` / `apple-touch-icon.png` | **Create** — PWA icons (generated with sharp). |
| `app/layout.tsx` | **Modify** — SEO `metadata`, `manifest` link, `<AiDisclosureBanner/>`, `<SiteFooter/>`, `<Analytics/>`. |
| `app/result/[batchId]/page.tsx` | **Modify** — render `<JobErrorCard/>` for failed jobs. |
| `app/create/page.tsx` | **Modify** — render `<UploadConsentNotice/>` near the uploader. |
| `vercel.ts` | **Modify (own/finalize)** — single deploy-config source; four cron schedules (worker drain backstop + reconcile/reap/expire). No `vercel.json`. |
| `docs/LAUNCH_CHECKLIST.md` | **Create** — manual pre-launch gate mirroring spec §12. |

---

## Task 4.1 — Legal/compliance constants (`lib/legal.ts`)

**Files:**
- Create: `lib/legal.ts`
- Test: `tests/lib/legal.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `BUSINESS_INFO`, `OVERSEAS_PROCESSORS` (array of `{name,country,purpose,items,retention}`), `RETENTION_POLICY` (array of `{item,period}`), `REFUND_POLICY` (`{summary,steps[]}`), `AI_DISCLOSURE_TEXT: string`, `AI_LABEL_TEXT: string`.

**Steps:**

1. - [ ] Write failing test `tests/lib/legal.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import {
  BUSINESS_INFO,
  OVERSEAS_PROCESSORS,
  RETENTION_POLICY,
  REFUND_POLICY,
  AI_DISCLOSURE_TEXT,
  AI_LABEL_TEXT,
} from "@/lib/legal";

describe("legal constants", () => {
  it("labels generated content as AI per 인공지능기본법", () => {
    expect(AI_LABEL_TEXT).toBe("AI 생성");
    expect(AI_DISCLOSURE_TEXT).toContain("AI");
  });

  it("discloses all 5 overseas processors", () => {
    const names = OVERSEAS_PROCESSORS.map((p) => p.name).join(" ");
    for (const n of ["OpenAI", "Google", "Supabase", "Vercel", "PayApp"]) {
      expect(names).toContain(n);
    }
    for (const p of OVERSEAS_PROCESSORS) {
      expect(p.country.length).toBeGreaterThan(0);
      expect(p.purpose.length).toBeGreaterThan(0);
      expect(p.items.length).toBeGreaterThan(0);
      expect(p.retention.length).toBeGreaterThan(0);
    }
  });

  it("states selfie retention is immediate post-generation purge", () => {
    const selfie = RETENTION_POLICY.find((r) => r.item.includes("셀카"));
    expect(selfie?.period).toContain("파기");
  });

  it("allows refund of unused credits", () => {
    expect(REFUND_POLICY.summary).toContain("환불");
    expect(REFUND_POLICY.steps.length).toBeGreaterThan(0);
  });

  it("exposes business identity fields required by 전자상거래법", () => {
    for (const k of ["company", "ceo", "bizRegNo", "mailOrderNo", "address", "email"] as const) {
      expect(BUSINESS_INFO[k].length).toBeGreaterThan(0);
    }
  });
});
```

2. - [ ] Run it — expect **FAIL** (module missing):
   `pnpm vitest run tests/lib/legal.test.ts`
   Expected: `Error: Failed to resolve import "@/lib/legal"` / suite fails.

3. - [ ] Create `lib/legal.ts` (★ = replace with the registered business's real values before launch):
```ts
export const BUSINESS_INFO = {
  serviceName: "ProfAI",
  company: "★사업자명 입력",
  ceo: "★대표자명 입력",
  bizRegNo: "★사업자등록번호 입력",
  mailOrderNo: "★통신판매업신고번호 입력",
  address: "★사업장 주소 입력",
  email: "support@profai.kr",
  phone: "★대표 전화번호 입력",
} as const;

export type OverseasProcessor = {
  name: string;
  country: string;
  purpose: string;
  items: string;
  retention: string;
};

export const OVERSEAS_PROCESSORS: readonly OverseasProcessor[] = [
  {
    name: "OpenAI, L.L.C.",
    country: "미국",
    purpose: "AI 이미지 생성(images.edit)",
    items: "이용자가 업로드한 셀카 이미지",
    retention: "생성 처리 직후 즉시 파기(no-training·단기보존 요청)",
  },
  {
    name: "Google LLC",
    country: "미국",
    purpose: "AI 이미지 생성(Gemini, Vercel AI Gateway 경유)",
    items: "이용자가 업로드한 셀카 이미지",
    retention: "생성 처리 직후 즉시 파기(no-training·단기보존 요청)",
  },
  {
    name: "Supabase, Inc.",
    country: "미국/싱가포르",
    purpose: "인증·데이터베이스·이미지 스토리지",
    items: "계정정보, 생성 결과 이미지",
    retention: "회원 탈퇴 또는 이용자 삭제 요청 시까지",
  },
  {
    name: "Vercel, Inc.",
    country: "미국",
    purpose: "애플리케이션 호스팅·서버 처리",
    items: "서비스 이용 트래픽(처리 시 일시적)",
    retention: "요청 처리 직후",
  },
  {
    name: "주식회사 페이앱(PayApp)",
    country: "대한민국",
    purpose: "신용카드·간편결제 등 결제 처리",
    items: "주문·결제 정보",
    retention: "전자상거래 등 관계법령이 정한 보존기간",
  },
] as const;

export type RetentionItem = { item: string; period: string };

export const RETENTION_POLICY: readonly RetentionItem[] = [
  { item: "업로드 셀카(원본)", period: "AI 생성 처리 직후 즉시 파기(보존 시에도 최대 N일 내 자동 삭제)" },
  { item: "생성 결과 이미지", period: "회원 탈퇴 또는 이용자 삭제 요청 시까지" },
  { item: "결제·거래 기록", period: "전자상거래 등에서의 소비자보호에 관한 법률에 따라 5년" },
  { item: "동의 이력", period: "회원 탈퇴 후 관계법령이 정한 보존기간" },
] as const;

export const REFUND_POLICY = {
  summary:
    "미사용 크레딧은 환불 가능합니다. 이미 사용(생성에 차감)된 크레딧은 디지털 콘텐츠 제공이 완료된 것으로 보아 청약철회가 제한될 수 있으며, 이는 결제 전 고지·동의를 받습니다.",
  steps: [
    "환불 요청은 고객센터 이메일(support@profai.kr)로 접수합니다.",
    "미사용 크레딧 잔액을 기준으로 원결제수단 취소 또는 환급으로 처리합니다.",
    "결제대행(PayApp)을 통한 취소는 영업일 기준 약 3~5일 소요될 수 있습니다.",
  ],
} as const;

export const AI_LABEL_TEXT = "AI 생성";
export const AI_DISCLOSURE_TEXT =
  "본 서비스는 AI로 이미지를 생성합니다. 생성된 모든 이미지에는 'AI 생성' 표시가 포함됩니다.";
```

4. - [ ] Run it — expect **PASS**:
   `pnpm vitest run tests/lib/legal.test.ts`
   Expected: `5 passed`.

5. - [ ] Add a **launch-gate** test that fails while any `BUSINESS_INFO` field still holds a `★` placeholder. Create `tests/lib/business-info.prelaunch.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { BUSINESS_INFO } from "@/lib/legal";

describe("BUSINESS_INFO prelaunch gate", () => {
  it("has no unfilled ★ placeholders", () => {
    for (const [k, v] of Object.entries(BUSINESS_INFO)) {
      expect(String(v), `${k} still contains a ★ placeholder`).not.toContain("★");
    }
  });

  it("has all required identity fields populated", () => {
    for (const k of ["company", "ceo", "bizRegNo", "mailOrderNo", "address", "email"] as const) {
      expect(BUSINESS_INFO[k].length).toBeGreaterThan(0);
    }
  });
});
```
   This test is **expected to FAIL until launch** (the seeded values still contain `★`) — that is intentional. It must NOT run in the default suite (so dev CI stays green) but must be runnable as an explicit launch gate.

6. - [ ] Wire it as a **separate, excluded** script. In `package.json` `scripts` add:
```json
"test:prelaunch": "vitest run tests/lib/business-info.prelaunch.test.ts"
```
   and exclude the prelaunch glob from the default run by adding to `vitest.config.ts` `test.exclude` (alongside the Vitest defaults):
```ts
exclude: ["**/node_modules/**", "**/dist/**", "**/*.prelaunch.test.ts"],
```
   Verify default run skips it and the gate runs (and currently fails) on demand:
   `pnpm vitest run` → does NOT include `business-info.prelaunch`;
   `pnpm test:prelaunch` → runs it and **FAILS** until ★ fields are replaced with the real registered business values.

7. - [ ] Commit:
```bash
git add -A && git commit -m "feat: add legal/compliance constants (lib/legal.ts) + excluded BUSINESS_INFO prelaunch gate

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4.2 — AI label + disclosure banner components

**Files:**
- Create: `components/AiLabel.tsx`, `components/AiDisclosureBanner.tsx`
- Test: `tests/components/ai-disclosure.test.tsx`

**Interfaces:**
- Consumes: `AI_LABEL_TEXT`, `AI_DISCLOSURE_TEXT` from `lib/legal.ts`.
- Produces: `AiLabel({className?})`, `AiDisclosureBanner()` React components.

**Steps:**

1. - [ ] Install component-test deps (jsdom + Testing Library) — they are needed by every component test in this phase:
   `pnpm add -D @testing-library/react @testing-library/jest-dom jsdom`
   Expected: packages added to `devDependencies`.

2. - [ ] Write failing test `tests/components/ai-disclosure.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { AiLabel } from "@/components/AiLabel";
import { AiDisclosureBanner } from "@/components/AiDisclosureBanner";

afterEach(() => cleanup());

describe("AI labeling (인공지능기본법)", () => {
  it("renders a visible 'AI 생성' label chip", () => {
    render(<AiLabel />);
    expect(screen.getByTestId("ai-label")).toHaveTextContent("AI 생성");
  });

  it("renders the site-wide AI disclosure banner", () => {
    render(<AiDisclosureBanner />);
    const banner = screen.getByTestId("ai-disclosure-banner");
    expect(banner).toHaveTextContent("AI로 이미지를 생성");
  });
});
```

3. - [ ] Run it — expect **FAIL**:
   `pnpm vitest run tests/components/ai-disclosure.test.tsx`
   Expected: unresolved imports / suite fails.
   (If the assertion `toHaveTextContent` errors as unknown matcher, add `import "@testing-library/jest-dom";` at the top of the test file.)

4. - [ ] Create `components/AiLabel.tsx`:
```tsx
import { AI_LABEL_TEXT } from "@/lib/legal";

export function AiLabel({ className = "" }: { className?: string }) {
  return (
    <span
      data-testid="ai-label"
      className={`inline-flex items-center rounded-md bg-black/70 px-2 py-0.5 text-xs font-medium text-white ${className}`}
    >
      {AI_LABEL_TEXT}
    </span>
  );
}
```

5. - [ ] Create `components/AiDisclosureBanner.tsx`:
```tsx
import { AI_DISCLOSURE_TEXT } from "@/lib/legal";

export function AiDisclosureBanner() {
  return (
    <div
      role="note"
      data-testid="ai-disclosure-banner"
      className="w-full bg-amber-50 px-4 py-2 text-center text-sm text-amber-900"
    >
      {AI_DISCLOSURE_TEXT}
    </div>
  );
}
```

6. - [ ] Run it — expect **PASS**:
   `pnpm vitest run tests/components/ai-disclosure.test.tsx`
   Expected: `2 passed`.

7. - [ ] Commit:
```bash
git add -A && git commit -m "feat: add AiLabel + AiDisclosureBanner components

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

> NOTE for the implementer: wherever Phases 2–3 render a generated/output image (`app/result/[batchId]/page.tsx`, `app/gallery/page.tsx`), overlay `<AiLabel className="absolute bottom-2 right-2" />` on the image container so every displayed output carries the visible label. This is in addition to the baked-in watermark on free-tier bytes.

---

## Task 4.3 — Site footer (사업자정보 + 환불정책)

**Files:**
- Create: `components/SiteFooter.tsx`
- Test: `tests/components/site-footer.test.tsx`

**Interfaces:**
- Consumes: `BUSINESS_INFO`, `REFUND_POLICY` from `lib/legal.ts`.
- Produces: `SiteFooter()` React component.

**Steps:**

1. - [ ] Write failing test `tests/components/site-footer.test.tsx`:
```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { SiteFooter } from "@/components/SiteFooter";

afterEach(() => cleanup());

describe("SiteFooter", () => {
  it("shows business identity + legal links + refund summary", () => {
    render(<SiteFooter />);
    expect(screen.getByText(/사업자등록번호/)).toBeInTheDocument();
    expect(screen.getByText(/통신판매업신고/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "이용약관" })).toHaveAttribute("href", "/legal/terms");
    expect(screen.getByRole("link", { name: "개인정보처리방침" })).toHaveAttribute("href", "/legal/privacy");
    expect(screen.getByText(/미사용 크레딧/)).toBeInTheDocument();
  });
});
```

2. - [ ] Run it — expect **FAIL**:
   `pnpm vitest run tests/components/site-footer.test.tsx`

3. - [ ] Create `components/SiteFooter.tsx`:
```tsx
import Link from "next/link";
import { BUSINESS_INFO, REFUND_POLICY } from "@/lib/legal";

export function SiteFooter() {
  const b = BUSINESS_INFO;
  return (
    <footer className="mt-16 border-t border-gray-200 bg-gray-50 px-4 py-8 text-xs leading-relaxed text-gray-500">
      <div className="mx-auto max-w-3xl space-y-3">
        <nav className="flex flex-wrap gap-4 font-medium text-gray-700">
          <Link href="/legal/terms">이용약관</Link>
          <Link href="/legal/privacy">개인정보처리방침</Link>
          <a href={`mailto:${b.email}`}>고객센터</a>
        </nav>
        <div className="space-y-0.5">
          <p>
            {b.serviceName} · 상호: {b.company} · 대표: {b.ceo}
          </p>
          <p>
            사업자등록번호: {b.bizRegNo} · 통신판매업신고번호: {b.mailOrderNo}
          </p>
          <p>
            주소: {b.address} · 문의: {b.email}
            {b.phone ? ` · ${b.phone}` : ""}
          </p>
        </div>
        <p className="text-gray-400">{REFUND_POLICY.summary}</p>
        <p className="text-gray-400">© {new Date().getFullYear()} {b.serviceName}. All rights reserved.</p>
      </div>
    </footer>
  );
}
```

4. - [ ] Run it — expect **PASS**:
   `pnpm vitest run tests/components/site-footer.test.tsx`
   Expected: `1 passed`.

5. - [ ] Commit:
```bash
git add -A && git commit -m "feat: add SiteFooter with business info + refund policy

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4.4 — Legal pages: terms + privacy

**Files:**
- Create: `app/legal/terms/page.tsx`, `app/legal/privacy/page.tsx`
- Test: `tests/app/legal.test.tsx`

**Interfaces:**
- Consumes: `BUSINESS_INFO`, `OVERSEAS_PROCESSORS`, `RETENTION_POLICY`, `REFUND_POLICY` from `lib/legal.ts`.
- Produces: default-export RSC pages (sync functions) + `metadata` exports.

**Steps:**

1. - [ ] Write failing test `tests/app/legal.test.tsx`:
```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import TermsPage from "@/app/legal/terms/page";
import PrivacyPage from "@/app/legal/privacy/page";

afterEach(() => cleanup());

describe("legal pages", () => {
  it("terms page mentions refund / 청약철회", () => {
    render(<TermsPage />);
    expect(screen.getByRole("heading", { name: /이용약관/ })).toBeInTheDocument();
    expect(screen.getByText(/청약철회/)).toBeInTheDocument();
  });

  it("privacy page discloses overseas processors, retention, and sensitive-data basis", () => {
    render(<PrivacyPage />);
    expect(screen.getByText(/국외/)).toBeInTheDocument();
    expect(screen.getByText(/OpenAI/)).toBeInTheDocument();
    expect(screen.getByText(/Google/)).toBeInTheDocument();
    expect(screen.getByText(/PayApp/)).toBeInTheDocument();
    expect(screen.getByText(/민감정보/)).toBeInTheDocument();
    expect(screen.getByText(/파기/)).toBeInTheDocument();
  });
});
```

2. - [ ] Run it — expect **FAIL**:
   `pnpm vitest run tests/app/legal.test.tsx`

3. - [ ] Create `app/legal/terms/page.tsx`:
```tsx
import type { Metadata } from "next";
import { BUSINESS_INFO, REFUND_POLICY } from "@/lib/legal";

export const metadata: Metadata = {
  title: "이용약관 | ProfAI",
  description: "ProfAI 서비스 이용약관",
};

export default function TermsPage() {
  const b = BUSINESS_INFO;
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 text-sm leading-relaxed text-gray-800">
      <h1 className="mb-6 text-2xl font-bold">이용약관</h1>

      <h2 className="mt-8 mb-2 text-lg font-semibold">제1조 (목적)</h2>
      <p>
        본 약관은 {b.company}(이하 "회사")가 제공하는 {b.serviceName} 서비스(AI 프로필 이미지 생성)의 이용
        조건과 절차, 회사와 이용자의 권리·의무 및 책임사항을 규정함을 목적으로 합니다.
      </p>

      <h2 className="mt-8 mb-2 text-lg font-semibold">제2조 (서비스의 성격 및 AI 고지)</h2>
      <p>
        본 서비스는 인공지능(AI) 모델을 이용해 이용자가 업로드한 셀카를 참조하여 프로필 이미지를 생성합니다.
        생성된 모든 이미지에는 사람이 인지 가능한 'AI 생성' 표시가 포함되며, 이는 인공지능기본법에 따른
        고지 의무를 이행하기 위한 것입니다.
      </p>

      <h2 className="mt-8 mb-2 text-lg font-semibold">제3조 (본인 얼굴 업로드 의무)</h2>
      <p>
        이용자는 본인의 얼굴 사진만 업로드해야 하며, 타인·유명인 등 제3자의 얼굴을 업로드해서는 안 됩니다.
        만 14세 미만 아동은 서비스를 이용할 수 없습니다. 위반 시 회사는 사전 통지 없이 이용을 제한할 수 있습니다.
      </p>

      <h2 className="mt-8 mb-2 text-lg font-semibold">제4조 (크레딧 및 결제)</h2>
      <p>
        서비스는 크레딧을 통해 이용하며, 1크레딧은 2K 해상도 결과 이미지 1장 생성에 사용됩니다. 결제는 결제대행사
        페이앱(PayApp)을 통해 처리됩니다. 결제 금액·구성은 결제 전 화면에 고지됩니다.
      </p>

      <h2 className="mt-8 mb-2 text-lg font-semibold">제5조 (청약철회 및 환불)</h2>
      <p>{REFUND_POLICY.summary}</p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {REFUND_POLICY.steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
      <p className="mt-2">
        이미 생성에 사용(차감)된 크레딧은 「전자상거래 등에서의 소비자보호에 관한 법률」 제17조 제2항에 따라
        디지털 콘텐츠 제공이 개시된 것으로 보아 청약철회가 제한될 수 있으며, 회사는 이를 결제 전 명확히 고지하고
        이용자의 동의를 받습니다. 미사용 크레딧은 언제든 환불을 요청할 수 있습니다.
      </p>

      <h2 className="mt-8 mb-2 text-lg font-semibold">제6조 (금지행위)</h2>
      <p>
        타인 사칭, 불법·음란(NSFW)·혐오 콘텐츠 생성 시도, 자동화된 대량 요청 등은 금지되며 위반 시 이용이 제한될
        수 있습니다. 신고 및 게시중단(테이크다운) 요청은 {b.email} 으로 접수할 수 있습니다.
      </p>

      <h2 className="mt-8 mb-2 text-lg font-semibold">제7조 (사업자 정보)</h2>
      <p>
        상호: {b.company} · 대표: {b.ceo} · 사업자등록번호: {b.bizRegNo} · 통신판매업신고번호: {b.mailOrderNo} ·
        주소: {b.address} · 문의: {b.email}
      </p>
    </main>
  );
}
```

4. - [ ] Create `app/legal/privacy/page.tsx`:
```tsx
import type { Metadata } from "next";
import { BUSINESS_INFO, OVERSEAS_PROCESSORS, RETENTION_POLICY } from "@/lib/legal";

export const metadata: Metadata = {
  title: "개인정보처리방침 | ProfAI",
  description: "ProfAI 개인정보처리방침 (수집·이용, 국외수탁, 보유·파기, 민감정보 동의)",
};

export default function PrivacyPage() {
  const b = BUSINESS_INFO;
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 text-sm leading-relaxed text-gray-800">
      <h1 className="mb-6 text-2xl font-bold">개인정보처리방침</h1>

      <h2 className="mt-8 mb-2 text-lg font-semibold">1. 수집하는 개인정보 항목 및 목적</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>계정정보(이메일·소셜 식별자): 회원 식별·로그인</li>
        <li>전화번호(선택): 결제 및 고객 응대</li>
        <li>업로드 셀카 이미지(얼굴): AI 프로필 이미지 생성(생성 외 목적 미사용)</li>
        <li>결제·거래정보: 크레딧 결제 처리 및 법령상 기록 보존</li>
      </ul>

      <h2 className="mt-8 mb-2 text-lg font-semibold">2. 민감정보(얼굴 정보)에 관한 별도 동의</h2>
      <p>
        업로드되는 얼굴 이미지는 개인을 식별할 수 있는 민감정보에 준하여 처리합니다. 회사는 「개인정보 보호법」에
        따라 이용약관 동의와 별도로 ① 개인정보(얼굴) 수집·이용 동의, ② 얼굴=민감정보 준함 별도 동의, ③ 본인
        얼굴만 업로드 확인을 각각 분리(언번들)하여 받습니다. 동의 거부 시 AI 생성 서비스 이용이 제한됩니다.
        동의 이력(버전·시각·IP)은 별도로 보관합니다.
      </p>

      <h2 className="mt-8 mb-2 text-lg font-semibold">3. 보유 및 파기</h2>
      <table className="mt-2 w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-gray-300">
            <th className="py-1 pr-4">항목</th>
            <th className="py-1">보유기간 / 파기</th>
          </tr>
        </thead>
        <tbody>
          {RETENTION_POLICY.map((r) => (
            <tr key={r.item} className="border-b border-gray-100">
              <td className="py-1 pr-4 align-top">{r.item}</td>
              <td className="py-1 align-top">{r.period}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2">
        업로드한 원본 셀카는 AI 생성 처리가 끝나는 즉시 파기하며, 위탁사(OpenAI·Google)에는 학습 미사용(no-training)
        및 단기 보존 후 삭제를 요청합니다.
      </p>

      <h2 className="mt-8 mb-2 text-lg font-semibold">4. 개인정보의 국외 이전(국외수탁)</h2>
      <p>회사는 서비스 제공을 위해 아래와 같이 개인정보 처리를 국외 사업자에게 위탁합니다.</p>
      <table className="mt-2 w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-gray-300">
            <th className="py-1 pr-3">수탁자</th>
            <th className="py-1 pr-3">국가</th>
            <th className="py-1 pr-3">목적</th>
            <th className="py-1 pr-3">항목</th>
            <th className="py-1">보유·이용기간</th>
          </tr>
        </thead>
        <tbody>
          {OVERSEAS_PROCESSORS.map((p) => (
            <tr key={p.name} className="border-b border-gray-100 align-top">
              <td className="py-1 pr-3">{p.name}</td>
              <td className="py-1 pr-3">{p.country}</td>
              <td className="py-1 pr-3">{p.purpose}</td>
              <td className="py-1 pr-3">{p.items}</td>
              <td className="py-1">{p.retention}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="mt-8 mb-2 text-lg font-semibold">5. 이용자의 권리 및 데이터 삭제</h2>
      <p>
        이용자는 언제든지 계정 페이지(/account)에서 동의 이력 열람, 마케팅 수신 동의 변경, 회원 탈퇴 및 데이터
        영구 삭제(업로드 사진·생성 이미지·계정정보 일괄 삭제)를 요청할 수 있습니다.
      </p>

      <h2 className="mt-8 mb-2 text-lg font-semibold">6. 문의처</h2>
      <p>
        개인정보 보호책임자 문의: {b.email} ({b.company})
      </p>
    </main>
  );
}
```

5. - [ ] Run it — expect **PASS**:
   `pnpm vitest run tests/app/legal.test.tsx`
   Expected: `2 passed`.

6. - [ ] Commit:
```bash
git add -A && git commit -m "feat: add terms + privacy legal pages with 국외수탁/민감정보 disclosures

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4.5 — PWA manifest, SEO metadata, Analytics, layout wiring

**Files:**
- Create: `app/manifest.ts`, `public/icon-192.png`, `public/icon-512.png`, `public/apple-touch-icon.png`
- Modify: `app/layout.tsx`
- Test: `tests/app/manifest.test.ts`, `tests/app/layout-metadata.test.ts`

**Interfaces:**
- Consumes: `AiDisclosureBanner` (Task 4.2), `SiteFooter` (Task 4.3), `@vercel/analytics/next` `Analytics`.
- Produces: default-export `manifest(): MetadataRoute.Manifest`; `metadata: Metadata` export from `app/layout.tsx`.

**Steps:**

1. - [ ] Install analytics dep:
   `pnpm add @vercel/analytics`
   Expected: added to `dependencies`.

2. - [ ] Generate PWA icons with sharp (solid brand-color squares — replace with real artwork before launch). Run from repo root:
```bash
node -e "const sharp=require('sharp');(async()=>{for(const s of [192,512,180]){const name=s===180?'apple-touch-icon':'icon-'+s;await sharp({create:{width:s,height:s,channels:4,background:{r:79,g:70,b:229,alpha:1}}}).png().toFile('public/'+name+'.png');console.log('wrote public/'+name+'.png');}})();"
```
   Expected: `wrote public/icon-192.png` / `wrote public/icon-512.png` / `wrote public/apple-touch-icon.png`.

3. - [ ] Write failing test `tests/app/manifest.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import manifest from "@/app/manifest";

describe("PWA manifest", () => {
  it("is installable (standalone, start_url, name, icons)", () => {
    const m = manifest();
    expect(m.display).toBe("standalone");
    expect(m.start_url).toBe("/");
    expect(m.name).toContain("ProfAI");
    expect(m.short_name).toBeDefined();
    const sizes = (m.icons ?? []).map((i) => i.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
  });
});
```

4. - [ ] Write failing test `tests/app/layout-metadata.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { metadata } from "@/app/layout";

describe("root metadata (SEO + PWA link)", () => {
  it("has title, description, and links the manifest", () => {
    expect(String(metadata.title)).toContain("ProfAI");
    expect(metadata.description).toBeTruthy();
    expect(metadata.manifest).toBe("/manifest.webmanifest");
  });
});
```

5. - [ ] Run both — expect **FAIL**:
   `pnpm vitest run tests/app/manifest.test.ts tests/app/layout-metadata.test.ts`

6. - [ ] Create `app/manifest.ts`:
```ts
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ProfAI — AI 프로필 사진 생성기",
    short_name: "ProfAI",
    description: "셀카 한 장으로 만드는 AI 프로필 사진",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#4f46e5",
    lang: "ko",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
```

7. - [ ] Modify `app/layout.tsx` — merge the new SEO `metadata`/`viewport`, banner, footer, and Analytics **into the existing Phase 1 layout while keeping its `<Nav/>` and `<main className="mx-auto … max-w-5xl …">` wrapper**. The Phase 1 file (per Phase 1 Task) is exactly:
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
   Replace it with this **full merged file** (Nav + max-w-5xl `<main>` retained; banner above Nav, footer + Analytics below; body becomes a flex column so the footer sits at the bottom):
```tsx
import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import { Nav } from "@/components/nav";
import { AiDisclosureBanner } from "@/components/AiDisclosureBanner";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_BASE_URL ?? "https://profai.kr"),
  title: { default: "ProfAI — AI 프로필 사진 생성기", template: "%s | ProfAI" },
  description: "셀카 한 장으로 비즈니스·증명사진부터 컨셉 화보까지, AI가 만들어 주는 프로필 사진.",
  applicationName: "ProfAI",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "ProfAI", statusBarStyle: "default" },
  icons: { icon: "/icon-192.png", apple: "/apple-touch-icon.png" },
  openGraph: {
    title: "ProfAI — AI 프로필 사진 생성기",
    description: "셀카 한 장으로 만드는 AI 프로필 사진",
    type: "website",
    locale: "ko_KR",
  },
};

export const viewport: Viewport = { themeColor: "#4f46e5" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="flex min-h-screen flex-col bg-white text-neutral-900 antialiased">
        <AiDisclosureBanner />
        <Nav />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
        <SiteFooter />
        <Analytics />
      </body>
    </html>
  );
}
```

8. - [ ] Run both — expect **PASS**:
   `pnpm vitest run tests/app/manifest.test.ts tests/app/layout-metadata.test.ts`
   Expected: `2 passed` total (1 each).

9. - [ ] Commit:
```bash
git add -A && git commit -m "feat: PWA manifest + icons, SEO metadata, Vercel Analytics, layout wiring

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4.6 — Moderation/failure UX on result page

**Files:**
- Create: `lib/jobErrors.ts`, `components/JobErrorCard.tsx`
- Modify: `app/result/[batchId]/page.tsx`
- Test: `tests/lib/jobErrors.test.ts`, `tests/components/job-error-card.test.tsx`

**Interfaces:**
- Consumes: the three canonical worker-set `error_code` values (Phase 2) — `"moderation_blocked"`, `"no_image"`, `"generation_failed"`. `describeJobError` switches on exactly these three plus a `default` fallback (for `null`/unknown). Failed jobs are already credit-refunded by the worker.
- Produces: `describeJobError(errorCode: string | null): { title; message; refunded; canRetry }`; `JobErrorCard({ errorCode })` client component (the result page only has the streamed `errorCode`, not a full job row).

**Steps:**

1. - [ ] Write failing test `tests/lib/jobErrors.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { describeJobError } from "@/lib/jobErrors";

describe("describeJobError", () => {
  it("explains moderation block in friendly Korean and confirms refund", () => {
    const v = describeJobError("moderation_blocked");
    expect(v.title).toContain("생성");
    expect(v.message).toContain("환불");
    expect(v.refunded).toBe(true);
    expect(v.canRetry).toBe(true);
  });

  it("handles empty/no-image provider response", () => {
    const v = describeJobError("no_image");
    expect(v.refunded).toBe(true);
    expect(v.message.length).toBeGreaterThan(0);
  });

  it("handles the generic generation_failed code", () => {
    const v = describeJobError("generation_failed");
    expect(v.title).toContain("문제");
    expect(v.message).toContain("환불");
    expect(v.refunded).toBe(true);
    expect(v.canRetry).toBe(true);
  });

  it("falls back for unknown / null codes and still confirms refund", () => {
    for (const code of [null, "weird_code"]) {
      const v = describeJobError(code);
      expect(v.message).toContain("환불");
      expect(v.refunded).toBe(true);
    }
  });
});
```

2. - [ ] Run it — expect **FAIL**:
   `pnpm vitest run tests/lib/jobErrors.test.ts`

3. - [ ] Create `lib/jobErrors.ts`:
```ts
export type JobErrorView = {
  title: string;
  message: string;
  refunded: boolean;
  canRetry: boolean;
};

export function describeJobError(errorCode: string | null): JobErrorView {
  switch (errorCode) {
    case "moderation_blocked":
      return {
        title: "이미지를 생성하지 못했어요",
        message:
          "업로드하신 사진이 안전 정책에 의해 생성이 제한되었어요. 얼굴이 선명하게 보이는 본인 사진으로 다시 시도해 주세요. 차감된 크레딧은 자동으로 환불되었습니다.",
        refunded: true,
        canRetry: true,
      };
    case "no_image":
      return {
        title: "결과 이미지를 받지 못했어요",
        message:
          "일시적인 문제로 이미지가 생성되지 않았어요. 같은 사진으로 다시 시도해 주세요. 차감된 크레딧은 환불되었습니다.",
        refunded: true,
        canRetry: true,
      };
    case "generation_failed":
      return {
        title: "생성 중 문제가 발생했어요",
        message:
          "이미지 생성 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요. 차감된 크레딧은 환불되었습니다.",
        refunded: true,
        canRetry: true,
      };
    default:
      return {
        title: "생성 중 문제가 발생했어요",
        message:
          "잠시 후 다시 시도해 주세요. 차감된 크레딧은 환불되었습니다. 문제가 계속되면 고객센터로 문의해 주세요.",
        refunded: true,
        canRetry: true,
      };
  }
}
```

4. - [ ] Run it — expect **PASS**:
   `pnpm vitest run tests/lib/jobErrors.test.ts`
   Expected: `4 passed`.

5. - [ ] Write failing test `tests/components/job-error-card.test.tsx`:
```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { JobErrorCard } from "@/components/JobErrorCard";

afterEach(() => cleanup());

describe("JobErrorCard", () => {
  it("renders friendly copy, refund note, and a retry link to /create", () => {
    render(<JobErrorCard errorCode="moderation_blocked" />);
    expect(screen.getByText(/생성이 제한/)).toBeInTheDocument();
    expect(screen.getByText(/환불/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /다시 만들기/ })).toHaveAttribute("href", "/create");
  });

  it("falls back for an unknown/null code and still shows the refund note + retry", () => {
    render(<JobErrorCard errorCode={null} />);
    expect(screen.getByText(/환불/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /다시 만들기/ })).toHaveAttribute("href", "/create");
  });
});
```

6. - [ ] Run it — expect **FAIL**:
   `pnpm vitest run tests/components/job-error-card.test.tsx`

7. - [ ] Create `components/JobErrorCard.tsx`:
```tsx
"use client";

import Link from "next/link";
import { describeJobError } from "@/lib/jobErrors";

export function JobErrorCard({ errorCode }: { errorCode: string | null }) {
  const v = describeJobError(errorCode);
  return (
    <div
      data-testid="job-error-card"
      role="alert"
      className="flex flex-col items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"
    >
      <p className="font-semibold">{v.title}</p>
      <p className="text-rose-800">{v.message}</p>
      {v.canRetry && (
        <Link
          href="/create"
          className="rounded-md bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700"
        >
          다시 만들기
        </Link>
      )}
    </div>
  );
}
```

8. - [ ] Run it — expect **PASS**:
   `pnpm vitest run tests/components/job-error-card.test.tsx`
   Expected: `2 passed`.

9. - [ ] Modify `app/result/[batchId]/page.tsx` (the Phase 2 client page). The grid maps over `Object.entries(stream)` where each entry is `[id, s]` and `s: JobStreamState` exposes `s.status` and `s.errorCode` (set from `j.error_code` in Phase 2). Add the import after the existing `BUCKET_OUTPUTS` import:
```tsx
import { JobErrorCard } from "@/components/JobErrorCard";
```
   Then replace the existing per-tile body. **Old** (Phase 2):
```tsx
        {entries.map(([id, s]) => (
          <div key={id} className="rounded-lg border p-2">
            {s.status === "done" && urls[id] ? (
              <a href={urls[id]} download={`profai-${id}.png`}>
                <img src={urls[id]} alt="결과" className="w-full rounded" />
              </a>
            ) : (
              <div className="flex aspect-[4/5] items-center justify-center text-sm text-gray-500">
                {s.status === "failed"
                  ? "생성 실패 (크레딧이 환불되었습니다)"
                  : STATUS_LABEL[s.status] ?? s.status}
              </div>
            )}
          </div>
        ))}
```
   **New** (failed jobs render `<JobErrorCard/>` in place of the bare "생성 실패" text; done/progress branches unchanged):
```tsx
        {entries.map(([id, s]) => (
          <div key={id} className="rounded-lg border p-2">
            {s.status === "failed" ? (
              <JobErrorCard errorCode={s.errorCode} />
            ) : s.status === "done" && urls[id] ? (
              <a href={urls[id]} download={`profai-${id}.png`}>
                <img src={urls[id]} alt="결과" className="w-full rounded" />
              </a>
            ) : (
              <div className="flex aspect-[4/5] items-center justify-center text-sm text-gray-500">
                {STATUS_LABEL[s.status] ?? s.status}
              </div>
            )}
          </div>
        ))}
```

10. - [ ] Commit:
```bash
git add -A && git commit -m "feat: moderation/failure UX with refund messaging on result page

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4.7 — Own-face / age-gate upload notice

**Files:**
- Create: `components/UploadConsentNotice.tsx`
- Modify: `app/create/page.tsx`
- Test: `tests/components/upload-consent-notice.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `UploadConsentNotice()` React component.

**Steps:**

1. - [ ] Write failing test `tests/components/upload-consent-notice.test.tsx`:
```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { UploadConsentNotice } from "@/components/UploadConsentNotice";

afterEach(() => cleanup());

describe("UploadConsentNotice", () => {
  it("states own-face-only, age gate, and links privacy policy", () => {
    render(<UploadConsentNotice />);
    expect(screen.getByText(/본인 얼굴/)).toBeInTheDocument();
    expect(screen.getByText(/14세/)).toBeInTheDocument();
    expect(screen.getByText(/타인|유명인/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /개인정보처리방침/ })).toHaveAttribute("href", "/legal/privacy");
  });
});
```

2. - [ ] Run it — expect **FAIL**:
   `pnpm vitest run tests/components/upload-consent-notice.test.tsx`

3. - [ ] Create `components/UploadConsentNotice.tsx`:
```tsx
import Link from "next/link";

export function UploadConsentNotice() {
  return (
    <div
      data-testid="upload-consent-notice"
      className="rounded-lg border border-indigo-100 bg-indigo-50 p-3 text-xs leading-relaxed text-indigo-900"
    >
      <ul className="list-disc space-y-1 pl-4">
        <li>반드시 <strong>본인 얼굴</strong> 사진만 업로드해 주세요. 타인·유명인 등 제3자의 얼굴은 업로드할 수 없습니다.</li>
        <li><strong>만 14세 미만</strong>은 이용할 수 없습니다(만 19세 이상 권장).</li>
        <li>업로드한 원본 사진은 AI 생성 직후 즉시 파기됩니다.</li>
        <li>
          자세한 내용은{" "}
          <Link href="/legal/privacy" className="underline">
            개인정보처리방침
          </Link>
          을 확인해 주세요.
        </li>
      </ul>
    </div>
  );
}
```

4. - [ ] Run it — expect **PASS**:
   `pnpm vitest run tests/components/upload-consent-notice.test.tsx`
   Expected: `1 passed`.

5. - [ ] Modify `app/create/page.tsx` (the Phase 2 client page). Add the import after the existing `STYLE_FAMILIES` import:
```tsx
import { UploadConsentNotice } from "@/components/UploadConsentNotice";
```
   Then anchor the notice inside the selfie-upload `<section>`, between its label and the file `<input>`. **Old** (Phase 2):
```tsx
      <section className="mt-6">
        <label className="block text-sm font-medium">셀카 업로드 (최대 {MAX_SELFIE_COUNT}장)</label>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={(e) => onFiles(e.target.files)}
          className="mt-2"
        />
        {files.length > 0 && <p className="mt-1 text-sm text-gray-500">{files.length}장 선택됨</p>}
      </section>
```
   **New** (notice rendered immediately above the uploader input):
```tsx
      <section className="mt-6">
        <label className="block text-sm font-medium">셀카 업로드 (최대 {MAX_SELFIE_COUNT}장)</label>
        <UploadConsentNotice />
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={(e) => onFiles(e.target.files)}
          className="mt-2"
        />
        {files.length > 0 && <p className="mt-1 text-sm text-gray-500">{files.length}장 선택됨</p>}
      </section>
```

6. - [ ] Commit:
```bash
git add -A && git commit -m "feat: own-face/age-gate upload notice on create page

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4.8 — Data deletion logic (`deleteUserData`)

**Files:**
- Create: `lib/account.ts`
- Test: `tests/lib/account.delete.test.ts`

**Interfaces:**
- Consumes: a service-role `SupabaseClient` (from `createServiceSupabase()`); `BUCKET_SELFIES`/`BUCKET_OUTPUTS` from `lib/storage.ts` (Phase 2); `assets.storage_path` keys, routed to a bucket by `assets.kind` (`source_selfie` → selfies, otherwise outputs).
- Produces: `deleteUserData(sb: SupabaseClient, userId: string): Promise<void>` — purges objects from **both** buckets, deletes owned rows, then the auth user.

**Steps:**

1. - [ ] Write failing test `tests/lib/account.delete.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { deleteUserData } from "@/lib/account";
import { BUCKET_SELFIES, BUCKET_OUTPUTS } from "@/lib/storage";

function makeSb(opts: {
  assets?: { storage_path: string; kind: string }[];
  deleteUserSpy?: ReturnType<typeof vi.fn>;
  deleteTables?: string[];
}) {
  const deleteUserSpy = opts.deleteUserSpy ?? vi.fn().mockResolvedValue({ error: null });
  const deleteTables = opts.deleteTables ?? [];
  const assets = opts.assets ?? [];
  // record which bucket each remove() call targeted
  const removeByBucket: Record<string, string[][]> = {};
  const storage = {
    from: (bucket: string) => ({
      remove: (paths: string[]) => {
        (removeByBucket[bucket] ??= []).push(paths);
        return Promise.resolve({ error: null });
      },
    }),
  };
  const from = (table: string) => {
    const o: any = { _op: "select" };
    o.select = () => o;
    o.eq = () => o;
    o.in = () => o;
    o.not = () => o;
    o.lte = () => o;
    o.delete = () => {
      o._op = "delete";
      deleteTables.push(table);
      return o;
    };
    o.then = (resolve: (v: any) => void) =>
      resolve(o._op === "delete" ? { error: null } : { data: assets, error: null });
    return o;
  };
  return {
    sb: {
      from,
      storage,
      auth: { admin: { deleteUser: deleteUserSpy } },
    } as any,
    removeByBucket,
    deleteUserSpy,
    deleteTables,
  };
}

describe("deleteUserData", () => {
  it("removes objects from BOTH buckets by kind, deletes rows, then deletes the auth user", async () => {
    const deleteTables: string[] = [];
    const { sb, removeByBucket, deleteUserSpy } = makeSb({
      assets: [
        { storage_path: "u1/b/a.png", kind: "source_selfie" },
        { storage_path: "u1/b/0.png", kind: "output" },
      ],
      deleteTables,
    });
    await deleteUserData(sb, "u1");
    expect(removeByBucket[BUCKET_SELFIES]).toEqual([["u1/b/a.png"]]);
    expect(removeByBucket[BUCKET_OUTPUTS]).toEqual([["u1/b/0.png"]]);
    expect(deleteTables).toEqual([
      "assets",
      "generation_jobs",
      "credit_ledger",
      "orders",
      "consents",
      "profiles",
    ]);
    expect(deleteUserSpy).toHaveBeenCalledWith("u1");
  });

  it("skips storage.remove for a bucket with no matching assets", async () => {
    const { sb, removeByBucket, deleteUserSpy } = makeSb({ assets: [] });
    await deleteUserData(sb, "u2");
    expect(removeByBucket[BUCKET_SELFIES]).toBeUndefined();
    expect(removeByBucket[BUCKET_OUTPUTS]).toBeUndefined();
    expect(deleteUserSpy).toHaveBeenCalledWith("u2");
  });

  it("throws if auth user deletion fails (so the caller can surface it)", async () => {
    const deleteUserSpy = vi.fn().mockResolvedValue({ error: { message: "boom" } });
    const { sb } = makeSb({ assets: [], deleteUserSpy });
    await expect(deleteUserData(sb, "u3")).rejects.toBeTruthy();
  });
});
```

2. - [ ] Run it — expect **FAIL**:
   `pnpm vitest run tests/lib/account.delete.test.ts`

3. - [ ] Create `lib/account.ts`:
```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { BUCKET_SELFIES, BUCKET_OUTPUTS } from "@/lib/storage";

const DELETE_ORDER = [
  "assets",
  "generation_jobs",
  "credit_ledger",
  "orders",
  "consents",
] as const;

/**
 * Permanently deletes ALL data for a user:
 *  1. storage objects for the user's assets, across BOTH private buckets
 *     (selfies + outputs), routed by assets.kind,
 *  2. owned DB rows (child -> parent order),
 *  3. the auth.users row (cascades the profile).
 * MUST be called with a service-role client (bypasses RLS). Server-only.
 */
export async function deleteUserData(sb: SupabaseClient, userId: string): Promise<void> {
  // 1) collect + remove storage objects from both buckets
  const { data: assets, error: assetsErr } = await sb
    .from("assets")
    .select("storage_path, kind")
    .eq("user_id", userId);
  if (assetsErr) throw assetsErr;
  const rows = (assets ?? []) as { storage_path: string | null; kind: string | null }[];
  const pick = (keep: (kind: string | null) => boolean) =>
    rows.filter((a) => keep(a.kind)).map((a) => a.storage_path).filter((p): p is string => !!p);
  const selfiePaths = pick((k) => k === "source_selfie");
  const outputPaths = pick((k) => k !== "source_selfie");
  if (selfiePaths.length > 0) {
    const { error: rmErr } = await sb.storage.from(BUCKET_SELFIES).remove(selfiePaths);
    if (rmErr) throw rmErr;
  }
  if (outputPaths.length > 0) {
    const { error: rmErr } = await sb.storage.from(BUCKET_OUTPUTS).remove(outputPaths);
    if (rmErr) throw rmErr;
  }

  // 2) delete owned rows, children first
  for (const table of DELETE_ORDER) {
    const { error } = await sb.from(table).delete().eq("user_id", userId);
    if (error) throw error;
  }
  const { error: profErr } = await sb.from("profiles").delete().eq("id", userId);
  if (profErr) throw profErr;

  // 3) delete the auth user (cascades the profile row if still present)
  const { error: authErr } = await sb.auth.admin.deleteUser(userId);
  if (authErr) throw authErr;
}
```

4. - [ ] Run it — expect **PASS**:
   `pnpm vitest run tests/lib/account.delete.test.ts`
   Expected: `3 passed`.

5. - [ ] Commit:
```bash
git add -A && git commit -m "feat: deleteUserData (storage + cascade rows + auth user)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4.9 — Selfie purge logic (`purgeExpiredSelfies`)

**Files:**
- Modify: `lib/account.ts` (add export)
- Test: `tests/lib/account.purge.test.ts`

**Interfaces:**
- Consumes: service-role `SupabaseClient`; `Asset` rows with `kind="source_selfie"` and `delete_after`.
- Produces: `purgeExpiredSelfies(sb: SupabaseClient, now?: Date): Promise<{ purged: number }>`.

**Steps:**

1. - [ ] Write failing test `tests/lib/account.purge.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { purgeExpiredSelfies } from "@/lib/account";

function makeSb(rows: { id: string; storage_path: string }[]) {
  const removeSpy = vi.fn().mockResolvedValue({ error: null });
  const deleteSpy = vi.fn();
  const from = () => {
    const o: any = { _op: "select" };
    o.select = () => o;
    o.eq = () => o;
    o.not = () => o;
    o.lte = () => o;
    o.in = (_col: string, ids: string[]) => {
      deleteSpy(ids);
      return o;
    };
    o.delete = () => {
      o._op = "delete";
      return o;
    };
    o.then = (resolve: (v: any) => void) =>
      resolve(o._op === "delete" ? { error: null } : { data: rows, error: null });
    return o;
  };
  return {
    sb: { from, storage: { from: () => ({ remove: removeSpy }) } } as any,
    removeSpy,
    deleteSpy,
  };
}

describe("purgeExpiredSelfies", () => {
  it("removes expired selfie objects + rows and returns the count", async () => {
    const { sb, removeSpy, deleteSpy } = makeSb([
      { id: "a1", storage_path: "sel/u1/x.png" },
      { id: "a2", storage_path: "sel/u2/y.png" },
    ]);
    const res = await purgeExpiredSelfies(sb, new Date("2026-06-27T00:00:00Z"));
    expect(res.purged).toBe(2);
    expect(removeSpy).toHaveBeenCalledWith(["sel/u1/x.png", "sel/u2/y.png"]);
    expect(deleteSpy).toHaveBeenCalledWith(["a1", "a2"]);
  });

  it("is a no-op when nothing is expired", async () => {
    const { sb, removeSpy } = makeSb([]);
    const res = await purgeExpiredSelfies(sb);
    expect(res.purged).toBe(0);
    expect(removeSpy).not.toHaveBeenCalled();
  });
});
```

2. - [ ] Run it — expect **FAIL**:
   `pnpm vitest run tests/lib/account.purge.test.ts`

3. - [ ] Append to `lib/account.ts`:
```ts
/**
 * PIPA selfie purge: deletes source_selfie assets whose delete_after has passed,
 * from Storage (BUCKET_SELFIES) and DB. This is the BACKSTOP for orphans — the
 * Phase 2 worker already purges a batch's selfies immediately once its last job
 * leaves (queued, processing). MUST be called with a service-role client. Server-only.
 */
export async function purgeExpiredSelfies(
  sb: SupabaseClient,
  now: Date = new Date(),
): Promise<{ purged: number }> {
  const iso = now.toISOString();
  const { data: rows, error } = await sb
    .from("assets")
    .select("id, storage_path")
    .eq("kind", "source_selfie")
    .not("delete_after", "is", null)
    .lte("delete_after", iso);
  if (error) throw error;

  const list = (rows ?? []) as { id: string; storage_path: string | null }[];
  if (list.length === 0) return { purged: 0 };

  const paths = list.map((r) => r.storage_path).filter((p): p is string => !!p);
  if (paths.length > 0) {
    // source_selfie objects live in the selfies bucket
    const { error: rmErr } = await sb.storage.from(BUCKET_SELFIES).remove(paths);
    if (rmErr) throw rmErr;
  }

  const ids = list.map((r) => r.id);
  const { error: delErr } = await sb.from("assets").delete().in("id", ids);
  if (delErr) throw delErr;

  return { purged: list.length };
}
```

4. - [ ] Run it — expect **PASS**:
   `pnpm vitest run tests/lib/account.purge.test.ts`
   Expected: `2 passed`.

5. - [ ] Commit:
```bash
git add -A && git commit -m "feat: purgeExpiredSelfies for PIPA selfie retention

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4.10 — Account Server Actions + page (consent history, marketing toggle, delete)

**Files:**
- Create: `app/account/actions.ts`, `components/MarketingToggle.tsx`, `components/DeleteAccountButton.tsx`, `app/account/page.tsx`
- Test: `tests/app/account-page.test.tsx`

**Interfaces:**
- Consumes: `createServerSupabase()` (Promise), `createServiceSupabase()`, `deleteUserData` (Task 4.8), `Consent`/`Profile` types.
- Produces: Server Actions `deleteAccount(): Promise<void>`, `setMarketingConsent(agreed: boolean): Promise<void>`; client components `MarketingToggle({initial})`, `DeleteAccountButton()`; RSC `AccountPage`.

**Steps:**

1. - [ ] Create `app/account/actions.ts`:
```ts
"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { createServiceSupabase } from "@/lib/supabase/service";
import { deleteUserData } from "@/lib/account";
import { CONSENT_VERSION } from "@/lib/consent";

async function requireUserId() {
  const sb = await createServerSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  return { sb, userId: user.id };
}

export async function setMarketingConsent(agreed: boolean): Promise<void> {
  const { sb, userId } = await requireUserId();
  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  // All consent writes (incl. marketing grant/withdraw) are versioned with the
  // single dated CONSENT_VERSION; withdrawal is recorded by suffixing the same
  // base version (the consents table is an append-only log with no `granted` column).
  const { error } = await sb.from("consents").insert({
    user_id: userId,
    type: "marketing",
    version: agreed ? CONSENT_VERSION : `${CONSENT_VERSION}-withdrawn`,
    ip,
  });
  if (error) throw error;
}

export async function deleteAccount(): Promise<void> {
  const { sb, userId } = await requireUserId();
  const service = createServiceSupabase();
  await deleteUserData(service, userId);
  await sb.auth.signOut();
  redirect("/");
}
```

2. - [ ] Create `components/MarketingToggle.tsx`:
```tsx
"use client";

import { useState, useTransition } from "react";
import { setMarketingConsent } from "@/app/account/actions";

export function MarketingToggle({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();
  return (
    <label className="flex items-center gap-3" data-testid="marketing-toggle">
      <input
        type="checkbox"
        checked={on}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.checked;
          setOn(next);
          start(() => {
            void setMarketingConsent(next);
          });
        }}
      />
      <span className="text-sm">마케팅 정보 수신 동의 (선택){pending ? " · 저장 중…" : ""}</span>
    </label>
  );
}
```

3. - [ ] Create `components/DeleteAccountButton.tsx`:
```tsx
"use client";

import { useState, useTransition } from "react";
import { deleteAccount } from "@/app/account/actions";

export function DeleteAccountButton() {
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  return (
    <div data-testid="delete-account">
      {!confirming ? (
        <button
          type="button"
          className="rounded-md border border-red-300 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
          onClick={() => setConfirming(true)}
        >
          회원 탈퇴 및 데이터 삭제
        </button>
      ) : (
        <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="text-sm text-red-700">
            정말 탈퇴하시겠어요? 업로드한 사진, 생성 이미지, 계정 정보가 모두 영구 삭제되며 복구할 수 없습니다.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending}
              className="rounded-md bg-red-600 px-4 py-2 text-sm text-white disabled:opacity-50"
              onClick={() =>
                start(() => {
                  void deleteAccount();
                })
              }
            >
              {pending ? "삭제 중…" : "영구 삭제 확인"}
            </button>
            <button
              type="button"
              className="rounded-md border px-4 py-2 text-sm"
              onClick={() => setConfirming(false)}
            >
              취소
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

4. - [ ] Create `app/account/page.tsx`:
```tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import type { Consent } from "@/types/db";
import { MarketingToggle } from "@/components/MarketingToggle";
import { DeleteAccountButton } from "@/components/DeleteAccountButton";

export const runtime = "nodejs";
export const metadata: Metadata = { title: "계정" };

const CONSENT_LABEL: Record<Consent["type"], string> = {
  tos: "이용약관",
  privacy: "개인정보 수집·이용",
  sensitive_face: "민감정보(얼굴) 별도 동의",
  own_face: "본인 얼굴만 업로드 확인",
  marketing: "마케팅 정보 수신(선택)",
};

export default async function AccountPage() {
  const sb = await createServerSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const { data: consentRows } = await sb
    .from("consents")
    .select("*")
    .eq("user_id", user.id)
    .order("agreed_at", { ascending: false });
  const consents = (consentRows ?? []) as Consent[];

  const latestMarketing = consents.find((c) => c.type === "marketing");
  const marketingOptedIn = !!latestMarketing && !latestMarketing.version.endsWith("withdrawn");

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="mb-8 text-2xl font-bold">계정 설정</h1>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold">동의 이력</h2>
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-gray-300 text-gray-500">
              <th className="py-2 pr-3">항목</th>
              <th className="py-2 pr-3">버전</th>
              <th className="py-2">동의 일시</th>
            </tr>
          </thead>
          <tbody>
            {consents.length === 0 ? (
              <tr>
                <td className="py-3 text-gray-400" colSpan={3}>
                  동의 이력이 없습니다.
                </td>
              </tr>
            ) : (
              consents.map((c) => (
                <tr key={c.id} className="border-b border-gray-100">
                  <td className="py-2 pr-3">{CONSENT_LABEL[c.type] ?? c.type}</td>
                  <td className="py-2 pr-3">{c.version}</td>
                  <td className="py-2">{new Date(c.agreed_at).toLocaleString("ko-KR")}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold">마케팅 수신 설정</h2>
        <MarketingToggle initial={marketingOptedIn} />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">회원 탈퇴 및 데이터 삭제</h2>
        <p className="mb-3 text-sm text-gray-500">
          탈퇴 시 업로드한 사진, 생성한 이미지, 계정 정보가 모두 영구 삭제됩니다. 법령상 보존이 필요한 결제 기록은
          관련 법령이 정한 기간 동안 분리 보관될 수 있습니다.
        </p>
        <DeleteAccountButton />
      </section>
    </main>
  );
}
```

5. - [ ] Write test `tests/app/account-page.test.tsx` (mock the cookie-bound client):
```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

const order = (asc: boolean) =>
  Promise.resolve({
    data: [
      {
        id: 1,
        user_id: "u1",
        type: "sensitive_face",
        version: "1.0",
        agreed_at: "2026-06-20T00:00:00Z",
        ip: null,
      },
      {
        id: 2,
        user_id: "u1",
        type: "marketing",
        version: "1.0",
        agreed_at: "2026-06-21T00:00:00Z",
        ip: null,
      },
    ],
    error: null,
  });

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: () =>
    Promise.resolve({
      auth: { getUser: () => Promise.resolve({ data: { user: { id: "u1" } } }) },
      from: () => ({ select: () => ({ eq: () => ({ order }) }) }),
    }),
}));
// stub client islands (they import server actions we don't exercise here)
vi.mock("@/components/MarketingToggle", () => ({
  MarketingToggle: ({ initial }: { initial: boolean }) => (
    <div data-testid="marketing-toggle">{initial ? "on" : "off"}</div>
  ),
}));
vi.mock("@/components/DeleteAccountButton", () => ({
  DeleteAccountButton: () => <div data-testid="delete-account" />,
}));

afterEach(() => cleanup());

import AccountPage from "@/app/account/page";

describe("AccountPage", () => {
  it("lists consent history and reflects marketing opt-in state", async () => {
    render(await AccountPage());
    expect(screen.getByText("민감정보(얼굴) 별도 동의")).toBeInTheDocument();
    expect(screen.getByText("마케팅 정보 수신(선택)")).toBeInTheDocument();
    expect(screen.getByTestId("marketing-toggle")).toHaveTextContent("on");
    expect(screen.getByTestId("delete-account")).toBeInTheDocument();
  });
});
```

6. - [ ] Run it — expect **PASS** (after writing impl above):
   `pnpm vitest run tests/app/account-page.test.tsx`
   Expected: `1 passed`. (If it errors on `redirect`, the mock provides a user so `redirect` is never called; ensure `next/navigation` import resolves under vitest — it does in Next 16.)

7. - [ ] Commit:
```bash
git add -A && git commit -m "feat: account page with consent history, marketing toggle, data deletion

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4.11 — Selfie-purge cron route (`/api/cron/expire`)

**Files:**
- Create: `app/api/cron/expire/route.ts`
- Test: `tests/api/cron-expire.test.ts`

**Interfaces:**
- Consumes: `createServiceSupabase()`, `purgeExpiredSelfies` (Task 4.9), `CRON_SECRET` env.
- Produces: `GET(req: Request)` handler returning `401` without bearer, else `{ ok, purged }`.

**Steps:**

1. - [ ] Write failing test `tests/api/cron-expire.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const purgeMock = vi.fn();
vi.mock("@/lib/supabase/service", () => ({ createServiceSupabase: () => ({}) }));
vi.mock("@/lib/account", () => ({ purgeExpiredSelfies: (...a: unknown[]) => purgeMock(...a) }));

import { GET } from "@/app/api/cron/expire/route";

beforeEach(() => {
  purgeMock.mockReset();
  process.env.CRON_SECRET = "s3cret";
});

describe("/api/cron/expire", () => {
  it("rejects requests without the correct bearer token", async () => {
    const res = await GET(new Request("http://x/api/cron/expire"));
    expect(res.status).toBe(401);
    expect(purgeMock).not.toHaveBeenCalled();
  });

  it("purges and returns the count when authorized", async () => {
    purgeMock.mockResolvedValue({ purged: 4 });
    const res = await GET(
      new Request("http://x/api/cron/expire", {
        headers: { authorization: "Bearer s3cret" },
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, purged: 4 });
    expect(purgeMock).toHaveBeenCalledTimes(1);
  });
});
```

2. - [ ] Run it — expect **FAIL**:
   `pnpm vitest run tests/api/cron-expire.test.ts`

3. - [ ] Create `app/api/cron/expire/route.ts`:
```ts
import { createServiceSupabase } from "@/lib/supabase/service";
import { purgeExpiredSelfies } from "@/lib/account";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const sb = createServiceSupabase();
  const { purged } = await purgeExpiredSelfies(sb);
  return Response.json({ ok: true, purged });
}
```

4. - [ ] Run it — expect **PASS**:
   `pnpm vitest run tests/api/cron-expire.test.ts`
   Expected: `2 passed`.

5. - [ ] Commit:
```bash
git add -A && git commit -m "feat: /api/cron/expire selfie purge route (CRON_SECRET guarded)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4.12 — Own/finalize cron schedules (`vercel.ts`, single deploy config)

> **NOTE:** `vercel.ts` is the **single** deployment-config source for this project. Phase 1 scaffolds a minimal `vercel.ts` (framework only, **no** crons); this task owns and finalizes all four cron schedules. There is **no `vercel.json`** — if a stray one exists, delete it (this task does). The worker function timeout is NOT set here — it is a Next.js route-segment export (`export const maxDuration = 300`) at the top of `app/api/jobs/worker/route.ts` in Phase 2. Vercel automatically attaches `Authorization: Bearer ${CRON_SECRET}` to cron invocations, which satisfies the guard in every cron route.

**Files:**
- Modify (own/finalize): `vercel.ts`
- Delete (if present): `vercel.json`
- Test: `tests/config/vercel-crons.test.ts`

**Interfaces:**
- Consumes: existing routes `/api/jobs/worker` (Phase 2), `/api/cron/reap` (Phase 2), `/api/cron/reconcile` (Phase 3), `/api/cron/expire` (Task 4.11).
- Produces: `vercel.ts` default-export config with the four authoritative `crons`.

**Steps:**

1. - [ ] Remove any stray `vercel.json` so `vercel.ts` is the only deploy config:
   `git rm --ignore-unmatch vercel.json && rm -f vercel.json`
   Expected: no `vercel.json` remains in the repo.

2. - [ ] Write failing test `tests/config/vercel-crons.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import config from "@/vercel";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

describe("vercel.ts crons", () => {
  it("is the single deploy config (no vercel.json)", () => {
    expect(existsSync(resolve(process.cwd(), "vercel.json"))).toBe(false);
  });

  it("schedules worker drain, reconcile, reap, and expire", () => {
    const byPath = Object.fromEntries(
      (config.crons ?? []).map((c: { path: string; schedule: string }) => [c.path, c.schedule]),
    );
    expect(byPath["/api/jobs/worker"]).toBe("* * * * *");
    expect(byPath["/api/cron/reconcile"]).toBe("*/10 * * * *");
    expect(byPath["/api/cron/reap"]).toBe("*/5 * * * *");
    expect(byPath["/api/cron/expire"]).toBe("0 * * * *");
    // every schedule is a 5-field cron expression
    for (const c of config.crons ?? []) {
      expect(String(c.schedule).trim().split(/\s+/)).toHaveLength(5);
    }
  });
});
```

3. - [ ] Run it — expect **FAIL** (Phase 1's scaffold `vercel.ts` has no crons yet):
   `pnpm vitest run tests/config/vercel-crons.test.ts`

4. - [ ] Finalize `vercel.ts` (own the four authoritative crons; keep the Phase 1 `framework` pin):
```ts
const config = {
  framework: "nextjs", // retained from the Phase 1 scaffold; do not drop
  crons: [
    { path: "/api/jobs/worker", schedule: "* * * * *" }, // every-minute drain backstop
    { path: "/api/cron/reconcile", schedule: "*/10 * * * *" },
    { path: "/api/cron/reap", schedule: "*/5 * * * *" },
    { path: "/api/cron/expire", schedule: "0 * * * *" },
  ],
};

export default config;
```

5. - [ ] Run it — expect **PASS**:
   `pnpm vitest run tests/config/vercel-crons.test.ts`
   Expected: `2 passed`.

6. - [ ] Commit:
```bash
git add -A && git commit -m "chore: finalize vercel.ts cron schedules (worker/reconcile/reap/expire); remove vercel.json

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4.13 — Pre-launch checklist (documented manual gate)

> This task produces a **documentation gate**, not code. It mirrors spec §12 "출시 전 검증 5건" plus the §13 ★확인필요 items, so the team signs off before going live. No automated test.

**Files:**
- Create: `docs/LAUNCH_CHECKLIST.md`

**Interfaces:**
- Consumes: nothing (manual gate).
- Produces: `docs/LAUNCH_CHECKLIST.md`.

**Steps:**

1. - [ ] Create `docs/LAUNCH_CHECKLIST.md`:
```markdown
# ProfAI 출시 전 검증 체크리스트 (수동 게이트)

> 본 문서는 코드가 아닌 **수동 검증 게이트**다. 아래 5건의 핵심 검증과 보조 확인 항목을
> 모두 통과(체크)하기 전에는 프로덕션 배포를 진행하지 않는다. (스펙 §12·§13 기준)

## A. 핵심 검증 5건 (spec §12)

- [ ] **① 단가 확정** — OpenAI calculator로 `gpt-image-2` 1장당 정확 단가 확정 + 셀카 입력 토큰 실측. 가격표(스타터/밸류/프로)가 장당 원가를 상회하는지 재확인.
- [ ] **② Gemini 모델 id 콘솔 확인** — `google/gemini-3-pro-image`(유료) / `google/gemini-3.1-flash-image-preview`(무료) GA vs preview suffix를 콘솔에서 라이브 확인하고 라우터/프리셋의 `model_key`를 핀 고정. fallback id 지정.
- [ ] **③ 페이앱 실거래 E2E** — 개인사업자 가입 + `linkkey`/`linkval` 확보 후 ₩1,000 실결제→취소 E2E(카드 + 카카오페이). 피드백 검증 게이트(시크릿 3종 + 금액 + 상태) / 멱등 적립(PENDING→PAID 1회) / 위조 피드백 차단 / 환불 클로백을 실제 트래픽으로 확인. 응답 본문이 정확히 `SUCCESS`인지 캡처.
- [ ] **④ 법무 문구 확정** — 얼굴=민감정보 분류 및 별도 동의 근거, 청약철회 제한 문구, 미사용 크레딧 환불 정책을 `legal-counsel` 검토로 확정. `/legal/terms`·`/legal/privacy`·푸터 `BUSINESS_INFO`(★ 항목)를 실제 사업자 정보로 교체. **교체 후 `pnpm test:prelaunch`가 통과해야 한다**(이 게이트 테스트는 ★ 잔존 시 실패하며 기본 `pnpm vitest run`에서는 제외된다 — 플레이스홀더가 조용히 배포되는 것을 차단).
- [ ] **⑤ 큐 부하 PoC** — pgmq vs Vercel Queues 부하 PoC. job-row + Realtime 계약은 고정한 채 transport만 비교. 워커 동시성 캡(모델 RPM) 확인.

## B. 컴플라이언스 라이브 점검 (인공지능기본법 · PIPA)

- [ ] 모든 생성 결과 화면에 가시 'AI 생성' 라벨(`<AiLabel/>`)이 노출된다(갤러리·결과 페이지).
- [ ] 무료 티어 결과물은 다운스케일(1K) + 가시 워터마크 + 라벨이 바이트에 합성되어 있다.
- [ ] 전역 AI 고지 배너(`<AiDisclosureBanner/>`)가 모든 페이지 상단에 표시된다.
- [ ] 업로드 화면에 본인 얼굴/만 14세/타인·유명인 금지 고지(`<UploadConsentNotice/>`)가 보인다.
- [ ] 가입/생성 동의가 언번들(이용약관 / 개인정보 / 민감정보 / 본인확인 / 마케팅[선택])로 분리 기록되고 `consents`에 버전·시각·IP가 저장된다.
- [ ] `/account`에서 동의 이력 열람·마케팅 토글·회원 탈퇴(데이터 영구 삭제)가 동작한다.
- [ ] 회원 탈퇴 시 Storage 객체 + DB 행(assets/jobs/ledger/orders/consents/profiles) + auth 사용자까지 삭제된다(스테이징 실데이터로 검증).
- [ ] `/api/cron/expire`가 `delete_after` 경과 셀카를 Storage+DB에서 파기한다(스테이징에서 실행 로그 확인).
- [ ] OpenAI/Google에 no-training·단기보존 요청 설정이 적용되어 있다.

## C. 보안 게이트

- [ ] `OPENAI_API_KEY` / `AI_GATEWAY_API_KEY` / `SUPABASE_SERVICE_ROLE_KEY` / `PAYAPP_USERID·LINKKEY·VALUE` / `CRON_SECRET`이 `NEXT_PUBLIC_*`에 노출되지 않는다(빌드 산출물 grep).
- [ ] 모든 `/api/cron/*` 라우트가 `Authorization: Bearer ${CRON_SECRET}` 없이는 401.
- [ ] 결제 피드백은 클라 콜백을 신뢰하지 않고 서버 검증 게이트만으로 적립한다.
- [ ] 워커는 유료 API 호출 전 job status 가드(이미 done이면 ack)로 이중 차감/이중 호출을 막는다.
- [ ] 모든 테이블 RLS(`user_id = auth.uid()`)와 셀카 프라이빗 버킷 + signed URL이 적용돼 있다.

## D. 인프라 / PWA

- [ ] `vercel.ts` 크론(worker 매분 / reconcile 10분 / reap 5분 / expire 매시) 4건이 Vercel 프로젝트에 인식된다(`vercel.json` 부재 확인).
- [ ] PWA 설치 가능(매니페스트·아이콘·standalone) — 모바일에서 "홈 화면에 추가" 동작.
- [ ] Vercel Analytics 수집 확인.
- [ ] 모델 ID 핀 고정(`gpt-image-2-2026-04-21`) 및 라우터 fallback 동작.

## E. ★확인필요 잔여 (spec §13)

- [ ] 페이앱 서버 GET 상태조회 cmd 존재 여부 / 피드백 필드 철자·대소문자 실페이로드 캡처 / `var1` UUID 길이 수용 / 발신 IP 화이트리스트 / 가상계좌 입금확인 타이밍 / `paycancel` 필수 파라미터.
- [ ] 디지털재화 통신판매업신고 면제 여부(페이앱 심사팀) / 사업자 등급별 정확 수수료.
- [ ] 레퍼런스 likeness=생체인식정보 분류 여부 / 가시 워터마크 규격·위치 / 최소 연령(14 vs 19).
- [ ] Supabase Realtime 동시접속 한도·요금 / Vercel Queues GA 시점·단가.

---
**서명:** 출시 승인자 ______  날짜 ______
```

2. - [ ] (No automated test.) Sanity-check the file renders as valid Markdown locally if desired.

3. - [ ] Commit:
```bash
git add -A && git commit -m "docs: add pre-launch checklist gate (spec §12/§13)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Phase 4 Done-When (verification before claiming complete)

- [ ] Full suite green: `pnpm vitest run` (all Phase 4 specs pass; no regressions).
- [ ] Typecheck clean: `pnpm tsc --noEmit`.
- [ ] `/account` round-trip works against a local Supabase (`supabase start`, Docker required): consent history lists rows, marketing toggle inserts a `consents` row, delete removes storage + rows + auth user.
- [ ] `/api/cron/expire` returns 401 without bearer and purges expired `source_selfie` assets with the correct bearer.
- [ ] `/legal/terms` and `/legal/privacy` render with 국외수탁 table, 보유·파기, 민감정보 근거, 환불/청약철회 문구.
- [ ] Every displayed generated image carries a visible "AI 생성" label; global disclosure banner present; PWA installable; `vercel.ts` crons present (worker/reconcile/reap/expire) and no `vercel.json`.
- [ ] `docs/LAUNCH_CHECKLIST.md` exists and the team has begun signing off the 5 manual verifications.
