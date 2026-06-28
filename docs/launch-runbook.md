# ProfAI — 출시 전 수동 게이트 (Launch Runbook)

> 코드로 자동화할 수 없는 **수동 확인 항목**. 빌드/테스트 게이트(vitest·pgTAP·build·tsc)는 그린이어야 하고, 아래는 실제 출시(실결제·실생성·실로그인) 전에 사람이 처리해야 한다. `★` = 외부 계정/키/심의 필요.

## 1) 결제 — PayApp (Phase 3)
- [ ] ★ **PayApp 개인사업자 가입** → 실 `PAYAPP_USERID` / `PAYAPP_LINKKEY` / `PAYAPP_VALUE` 발급. Vercel env(Production+Preview)에 설정. (관리자 `설정 > 연동정보`)
- [ ] ★ **₩1,000 실거래 E2E**(카드 + 카카오페이): 크레딧이 **정확히 1회** 적립되는지 확인 → `paycancel` 후 환불 피드백으로 **클로백** 확인. (PayApp은 공개 샌드박스 없음)
- [ ] ★ 실제 피드백 페이로드 캡처 → `card_name`/`pay_type` 등 **필드 철자**가 `lib/payapp/verify.ts`/feedback 파서와 일치하는지 확인(불일치 시에만 조정). 발신 IP 화이트리스트 제공 여부 확인.
- [ ] ★ PayApp이 상태조회 `cmd`를 제공하는지 확인 → 제공 시 `/api/cron/reconcile`에 "적립 전 재조회 + 금액 게이트" 추가.
- [ ] `CRON_SECRET` 설정 → Vercel Cron의 `Authorization: Bearer` 헤더와 일치.
- [ ] ★ 통신판매업 신고(디지털재화 면제 여부 PayApp 심사팀 확인), 구매안전/현금영수증 처리 확인.

## 2) AI 모델 (Phase 2)
- [ ] ★ 콘솔에서 모델 id 라이브 확인: `google/gemini-3-pro-image`(GA vs `-preview`), `gpt-image-2`(핀 `-2026-04-21`). seed/router의 `model_key`와 일치.
- [ ] ★ OpenAI calculator로 `gpt-image-2` **1장당 정확 단가** + 셀카 입력 토큰 실측 → 크레딧 팩 가격 최종 검증(원가 미달 방지).
- [ ] `OPENAI_API_KEY`, `AI_GATEWAY_API_KEY`(Gemini via Vercel AI Gateway) Vercel env 설정. provider no-training/단기보존 옵션 확인.

## 3) 컴플라이언스 블로커 (법정)
- [ ] 🔴 **워터마크 한글 폰트**: `lib/watermark.ts`의 SVG `<text>`가 리눅스/Vercel에서 "AI 생성"을 **tofu로 렌더**(KR 폰트 부재) → **Noto Sans KR(서브셋, base64 @font-face)** 번들 필요. 인공지능기본법상 가시 라벨이 안 보이면 위반. **출시 전 필수.**
- [ ] ★ legal-counsel 검토: 셀카 레퍼런스 = **생체정보(민감정보)** 분류 여부, 가시 워터마크 규격, **청약철회 제한 문구**.
- [ ] **이용약관 + 개인정보처리방침** 게시(국외수탁 OpenAI/Google/Supabase/Vercel/PayApp 명시), 사업자정보(상호·대표·사업자번호·통신판매신고번호·연락처) 표시.
- [ ] `BUSINESS_INFO`의 `★` 플레이스홀더 제거(`npm run test:prelaunch` 통과 — Phase 4).

## 4) 인증 (Phase 1)
- [ ] ★ Supabase 대시보드에서 **Kakao + Google** OAuth provider 활성화(실 client id/secret), redirect URL `${APP_BASE_URL}/auth/callback` 등록.

## 5) 인프라 / 배포
- [ ] ★ **프로덕션 Supabase 프로젝트** 생성, env 키 설정, 마이그레이션 적용(`supabase db push`). RLS·트리거·RPC·pgmq·Realtime 확인.
- [ ] Vercel **Pro**(Fluid Compute, 분당 cron, 워커 maxDuration), env(Production+Preview) 전량 설정.
- [ ] `vercel.ts` 크론(worker `* * * * *` / reconcile `*/10` / reap `*/5` / expire `0 * * * *`) 적용(Phase 4).
- [ ] **만 14세 미만 차단**·동의 언번들·셀카 즉시 파기 동작 최종 확인.

## 6) 테스트 (자동, 그린 유지)
- [ ] `npm test`(Vitest), `npx supabase test db`(pgTAP), `npm run build`, `npx tsc --noEmit` 전부 통과.
- [ ] Playwright E2E: 표준 CI 셸에서 실행(로컬 Git-Bash 환경은 러너 기동 불가 exit 127 — 코드 결함 아님). auth storageState 픽스처 배선 후 `test.fixme` 해제.

---
*이 런북은 추적해온 ★확인필요/출시 블로커를 통합한 것. 진행 원장: `.superpowers/sdd/progress.md`.*
