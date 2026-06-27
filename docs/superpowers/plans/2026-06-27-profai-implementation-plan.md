# ProfAI — 구현 계획서 (마스터 인덱스)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement each phase plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 한국 B2C 소비자가 셀카로 AI 프로필 사진을 생성하고, 크레딧 팩을 페이앱(PayApp)으로 실제 결제하는 반응형 웹앱(PWA)을 Supabase + Vercel(Next.js)로 구축한다.

**Architecture:** Next.js 16 App Router(Node 런타임) 위에서 Supabase(Postgres/Auth/Storage/Realtime)를 데이터·인증·저장·실시간 채널로 사용. 이미지 생성은 즉석 레퍼런스 방식으로 GPT Image 2(직접 SDK, 얼굴보존)와 Nano Banana Pro(AI SDK v6 + Vercel AI Gateway)를 스타일별 자동매핑. 생성은 비동기 큐(pgmq)→워커→Storage→Realtime 파이프라인. 결제는 페이앱 REST + feedbackurl 검증(시크릿 3종 + 금액 + 상태) → 멱등 적립.

**Tech Stack:** Next.js 16 / TypeScript strict / Tailwind + shadcn/ui / Supabase(@supabase/ssr) / OpenAI SDK / Vercel AI SDK v6 + AI Gateway / PayApp REST / pgmq + pg_cron / Vitest + Playwright + pgTAP / pnpm / Vercel Pro.

상위 설계: [`../specs/2026-06-27-ai-profile-generator-design.md`](../specs/2026-06-27-ai-profile-generator-design.md)

---

## Global Constraints (모든 페이즈 공통)

- **런타임**: API 라우트·워커는 `export const runtime = "nodejs"` (Edge 금지). 워커는 `export const maxDuration = 300` (route segment config).
- **비밀키 서버 전용**: 클라이언트는 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`만. `OPENAI_API_KEY` / `AI_GATEWAY_API_KEY` / `SUPABASE_SERVICE_ROLE_KEY` / `PAYAPP_USERID·LINKKEY·VALUE` / `CRON_SECRET` 절대 노출 금지.
- **모델 핀**: `gpt-image-2`(snapshot `gpt-image-2-2026-04-21`), `google/gemini-3-pro-image`, 무료 `google/gemini-3.1-flash-image-preview`. 출시 직전 콘솔 라이브 확인(★).
- **라우터 계약**: `model_key`가 `google/`로 시작→Gemini, `gpt-image`/`openai/`로 시작→OpenAI, 그 외 throw.
- **크레딧**: 1크레딧 = 2K 결과 1장. 무료 가입 = 3크레딧(워터마크 1K). 4K = 2크레딧(후속).
- **결제 보안**: 서버가 권위 금액으로 `orders` PENDING 선생성 → feedback에서 `userid/linkkey/linkval` 3종 + `pay_state==='4'` + `price===expected_amount` 검증 → `UPDATE … WHERE status='PENDING' RETURNING` 멱등 적립. 클라 콜백(returnurl) 불신. 환불은 `clawback_credits`(음수 grant 금지). 항상 200 `SUCCESS` 응답.
- **error_code**(소문자 snake): `moderation_blocked` / `no_image` / `generation_failed`.
- **Storage 버킷**(프라이빗 2개): `selfies`, `outputs`. 셀카는 생성 직후 즉시 파기(+expire 크론 백스톱).
- **동의/연령**: 필수 동의 `["tos","privacy","sensitive_face","own_face"]`(+선택 marketing), `CONSENT_VERSION="2026-06-27"`. 만 14세 미만 차단(`age_verified`).
- **AI 표기**: 모든 산출물 가시 "AI 생성" 라벨(인공지능기본법).
- **테스트/커밋**: 각 태스크 = TDD(실패 테스트→실행→최소 구현→통과→커밋). DB/RLS/RPC는 pgTAP(`supabase test db`, Docker 필요). 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## 페이즈 (빌드 순서대로)

각 페이즈는 **독립적으로 동작·테스트 가능한 산출물**을 낸다. 순서대로 의존한다(1→2→3→4).

### Phase 1 — Foundation · Auth · Consent (18 태스크)
[`2026-06-27-profai-phase-1-foundation-auth-consent.md`](2026-06-27-profai-phase-1-foundation-auth-consent.md)
스캐폴드 · Supabase 클라이언트/미들웨어 · 전체 스키마+RLS+크레딧 RPC(`debit_credits`/`grant_credits`/`refund_hold`/`clawback_credits`) · 가입 트리거(프로필+무료 3크레딧) · `types/db.ts`·`lib/db.ts`·`lib/credits.ts` · 카카오/구글 로그인 · 동의 온보딩 + **연령 게이트(만14)** + 라우트 가드 · 랜딩/쉘/네비(크레딧 잔액) · `lib/styles.ts` + 12개 스타일 시드.
**산출물**: 로그인→동의/연령→무료 3크레딧→잔액 표시. 스키마·RLS·RPC 라이브+테스트.

### Phase 2 — Generation Pipeline (19 태스크)
[`2026-06-27-profai-phase-2-generation-pipeline.md`](2026-06-27-profai-phase-2-generation-pipeline.md)
프라이빗 버킷+RLS · pgmq 큐 · Realtime broadcast 트리거 · `lib/storage.ts`·`lib/queue.ts` · 클라 셀카 리사이즈/검증 · 모델 레이어(`openai.ts`/`gemini.ts`/`router.ts`/`ModerationBlockedError`) · 워터마크 · 프로듀서 `/api/generate`(동의+연령 게이트, 크레딧 hold, enqueue) · 워커 `/api/jobs/worker`(status 가드, 생성, Storage, 배치 셀카 즉시 파기, 실패 시 환불, `maxDuration=300`) · `/api/cron/reap` · Realtime 훅 · 스튜디오/결과/갤러리 UI.
**산출물**: 크레딧 보유 사용자가 셀카 업로드→스타일→N장 비동기 생성→실시간 진행→다운로드. 실패는 환불.

### Phase 3 — Credits · PayApp Payment (11 태스크)
[`2026-06-27-profai-phase-3-credits-payapp-payment.md`](2026-06-27-profai-phase-3-credits-payapp-payment.md)
`lib/payapp/client.ts`(create/cancel)·`verify.ts` · `/credits` 팩 UI · `/api/payments/payapp/create`(주문 선생성→payrequest) · `/api/payments/payapp/feedback`(검증 게이트→멱등 적립, 가상계좌/환불 분기, `clawbackCredits`) · `/credits/result` 폴링 · `/api/payments/payapp/cancel` · `/api/cron/reconcile`(누락 결제 대사).
**산출물**: 페이앱으로 팩 구매(테스트/₩1,000)→검증된 feedback에서만 정확히 1회 적립. 환불 클로백. 누락 웹훅 백스톱.

### Phase 4 — Compliance · Polish · Launch (13 태스크)
[`2026-06-27-profai-phase-4-compliance-polish-launch.md`](2026-06-27-profai-phase-4-compliance-polish-launch.md)
계정(동의이력·마케팅토글·**데이터 삭제**) · `/api/cron/expire`(셀카 파기 백스톱) · 약관/개인정보처리방침(국외수탁 고지)·사업자정보/환불정책 푸터 · AI 고지 배너 · 모더레이션 실패 UX(JobErrorCard) · PWA(manifest)·SEO·Analytics · `vercel.ts` 크론 확정(worker */1·reconcile */10·reap */5·expire 매시) · 출시 전 체크리스트.
**산출물**: 컴플라이언스·삭제·법무·AI표기 완비, 크론 스케줄, 설치형 MVP.

---

## 출시 전 수동 게이트 (코드 아님, 스펙 §12)

1. OpenAI calculator로 `gpt-image-2` 1장 단가 확정(+셀카 입력 토큰 실측).
2. Gemini 모델 id 콘솔 확인(`google/gemini-3-pro-image` GA/preview).
3. 페이앱 **개인사업자 가입** + `linkkey`/`linkval` 확보 + **₩1,000 실거래 E2E**(샌드박스 없음)로 멱등·위조차단 검증.
4. legal-counsel: 얼굴 레퍼런스=민감정보(생체) 분류, 청약철회 제한 문구.
5. `pnpm test:prelaunch`(BUSINESS_INFO ★ 제거) + pgmq vs Vercel Queues 부하 PoC.

## 환경 전제

- Docker + Supabase CLI(로컬 Postgres) — DB/RLS/RPC pgTAP 테스트, 일부 E2E.
- Vercel Pro(Fluid Compute, 분당 크론, 워커 300s).
- 노트: E2E 일부 스텝은 인증 storageState/로컬 Supabase 필요 — 그린 CI가 E2E 경로를 자동 보장하진 않음(문서화된 전제).
