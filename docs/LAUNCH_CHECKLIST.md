# ProfAI 출시 전 검증 체크리스트 (수동 게이트)

> 본 문서는 코드가 아닌 **수동 검증 게이트**다. 아래 5건의 핵심 검증과 보조 확인 항목을
> 모두 통과(체크)하기 전에는 프로덕션 배포를 진행하지 않는다. (스펙 §12·§13 기준)
> 운영 런북은 [`launch-runbook.md`](launch-runbook.md) 참조.

## A. 핵심 검증 5건 (spec §12)

- [ ] **① 단가 확정** — OpenAI calculator로 `gpt-image-2` 1장당 정확 단가 확정 + 셀카 입력 토큰 실측. 가격표(스타터/밸류/프로)가 장당 원가를 상회하는지 재확인.
- [ ] **② Gemini 모델 id 콘솔 확인** — `google/gemini-3-pro-image`(유료) / `google/gemini-3.1-flash-image-preview`(무료) GA vs preview suffix를 콘솔에서 라이브 확인하고 라우터/프리셋의 `model_key`를 핀 고정. fallback id 지정.
- [ ] **③ 페이앱 실거래 E2E** — 개인사업자 가입 + `linkkey`/`linkval` 확보 후 ₩1,000 실결제→취소 E2E(카드 + 카카오페이). 피드백 검증 게이트(시크릿 3종 + 금액 + 상태) / 멱등 적립(PENDING→PAID 1회) / 위조 피드백 차단 / 환불 클로백을 실제 트래픽으로 확인. 응답 본문이 정확히 `SUCCESS`인지 캡처.
- [ ] **④ 법무 문구 확정** — 얼굴=민감정보 분류 및 별도 동의 근거, 청약철회 제한 문구, 미사용 크레딧 환불 정책을 `legal-counsel` 검토로 확정. `/legal/terms`·`/legal/privacy`·푸터 `BUSINESS_INFO`(★ 항목)를 실제 사업자 정보로 교체. **교체 후 `npm run test:prelaunch`가 통과해야 한다**(이 게이트 테스트는 ★ 잔존 시 실패하며 기본 `npm test`에서는 제외된다 — 플레이스홀더가 조용히 배포되는 것을 차단).
- [ ] **⑤ 큐 부하 PoC** — pgmq vs Vercel Queues 부하 PoC. job-row + Realtime 계약은 고정한 채 transport만 비교. 워커 동시성 캡(모델 RPM) 확인.

## B. 컴플라이언스 라이브 점검 (인공지능기본법 · PIPA)

- [ ] 🔴 **워터마크 한글 폰트** — `lib/watermark.ts`의 'AI 생성' 라벨이 Vercel(리눅스)에서 tofu로 렌더되지 않도록 Noto Sans KR(서브셋) 번들. **법정 가시 라벨 필수.**
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
- [ ] 모든 `/api/cron/*` 라우트가 `CRON_SECRET` 없이는 401이며, `CRON_SECRET` 미설정 시 fail-closed(500)다.
- [ ] 결제 피드백은 클라 콜백을 신뢰하지 않고 서버 검증 게이트(시크릿 3종 + 금액 + 상태)만으로 적립한다.
- [ ] 워커는 유료 API 호출 전 job status 가드(이미 done이면 ack)로 이중 차감/이중 호출을 막는다.
- [ ] `age_verified`·`consents`는 클라이언트가 직접 못 쓰며(권한층 revoke), 서버액션이 service-role로 권위 기록한다.
- [ ] 모든 테이블 RLS(`user_id = auth.uid()`)와 셀카 프라이빗 버킷 + signed URL이 적용돼 있다.

## D. 인프라 / PWA

- [ ] `vercel.ts` 크론(worker 매분 / reconcile 10분 / reap 5분 / expire 매시) 4건이 Vercel 프로젝트에 인식된다(`vercel.json` 부재 확인).
- [ ] ★ Supabase 프로덕션 프로젝트 + 마이그레이션 적용 + Kakao/Google OAuth provider 설정.
- [ ] PWA 설치 가능(매니페스트·아이콘·standalone) — 모바일에서 "홈 화면에 추가" 동작. 아이콘은 실제 아트워크로 교체.
- [ ] Vercel Analytics 수집 확인.
- [ ] 모델 ID 핀 고정(`gpt-image-2-2026-04-21`) 및 라우터 fallback 동작.

## E. ★확인필요 잔여 (spec §13)

- [ ] 페이앱 서버 GET 상태조회 cmd 존재 여부 / 피드백 필드 철자·대소문자 실페이로드 캡처 / `var1` UUID 길이 수용 / 발신 IP 화이트리스트 / 가상계좌 입금확인 타이밍 / `paycancel` 필수 파라미터.
- [ ] 디지털재화 통신판매업신고 면제 여부(페이앱 심사팀) / 사업자 등급별 정확 수수료.
- [ ] 레퍼런스 likeness=생체인식정보 분류 여부 / 가시 워터마크 규격·위치 / 최소 연령(14 vs 19).
- [ ] Supabase Realtime 동시접속 한도·요금 / Vercel Queues GA 시점·단가.

## F. 자동 게이트 (배포 전 그린)

- [ ] `npm test`(Vitest) · `npx supabase test db`(pgTAP) · `npm run build` · `npx tsc --noEmit` 전부 통과.
- [ ] `npm run test:prelaunch` — BUSINESS_INFO ★ 제거 후 통과(미제거 시 실패하여 배포 차단).
- [ ] Playwright E2E(`e2e/`): 표준 CI 셸에서 실행(로컬 Git-Bash 환경은 러너 기동 불가 — 코드 결함 아님). auth storageState 픽스처 배선 후 `test.fixme` 해제.

---
**서명:** 출시 승인자 ______  날짜 ______
