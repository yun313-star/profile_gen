# ProfAI 실제 출시(GO-LIVE) 가이드 — 순서대로

> 코드는 **출시 준비 100%**입니다(워터마크 한글폰트까지 해결). 남은 건 전부 **계정·키·사업자·법률·배포** —
> 상당수는 **사장님(★)만 할 수 있는 일**(제 안전규칙상 계정개설·결제·사업자등록 대리 불가)입니다.
> 🤖 = 제가 옆에서 같이/대신 해드릴 수 있는 부분. **리드타임 긴 것부터(0단계) 오늘 시작하세요.**

질문 답변: **"1·2·4만 하면 되나?" → 아니요.**
- **1(데모 더 보기)** = 출시와 무관, 그냥 확인용.
- **2(GitHub 푸시)** = ✅ 방금 완료.
- **4(OAuth 연결)** = 필요. 단, 그 외에 **사업자등록·PayApp·AI키·프로덕션 인프라·법률검토·배포**가 더 필요합니다.

---

## 0단계 — 리드타임 긴 것 (오늘 시작 / 며칠~몇 주) ★
| # | 할 일 | 어디서 | 왜 |
|---|---|---|---|
| 0-1 | **사업자등록** (개인사업자 권장) | 홈택스/세무서 | PayApp·통신판매업의 전제. ~1일 |
| 0-2 | **통신판매업 신고** | 정부24/관할 구청 | 온라인 유료 판매 필수(디지털재화 면제 여부는 PayApp/구청 확인) |
| 0-3 | **PayApp 가맹점 가입** | payapp.kr | 0-1 사업자등록증 필요. 승인 며칠. → 실 `userid/linkkey/linkval` 수령 |
| 0-4 | **법률 검토** 🤖 | legal-counsel | 얼굴=민감정보/생체정보 분류, 청약철회 문구, 약관/개인정보처리방침 확정 |

## 1단계 — 계정·키 발급 (병렬 가능 / 몇 시간) ★ (🤖 안내)
| # | 할 일 | 결과물(키) | 들어갈 곳 |
|---|---|---|---|
| 1-1 | OpenAI 가입+결제등록 | `OPENAI_API_KEY` (gpt-image-2 접근) | Vercel env |
| 1-2 | Vercel AI Gateway 키 | `AI_GATEWAY_API_KEY` (Gemini용) | Vercel env |
| 1-3 | **Kakao Developers** 앱 생성 | REST 키/시크릿 | Supabase Auth 대시보드 |
| 1-4 | **Google Cloud** OAuth 클라이언트 | client id/secret | Supabase Auth 대시보드 |
| 1-5 | **Supabase** 프로덕션 프로젝트 | URL/anon/service_role 키 | Vercel env |
| 1-6 | **Vercel** 계정/프로젝트 | — | 배포 대상 |

## 2단계 — 배선 & 배포 (🤖 제가 주도) — 몇 시간
- [ ] 프로덕션 Supabase에 마이그레이션 적용: `npx supabase link` → `npx supabase db push` (0001~0006 전부 — **0006 service_role 권한 포함**)
- [ ] Supabase Auth에서 **Kakao·Google provider 활성화** + redirect URL `https://<도메인>/auth/callback` 등록
- [ ] Vercel env(Production+Preview)에 키 전량 입력: `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `AI_GATEWAY_API_KEY`, `PAYAPP_USERID/LINKKEY/VALUE`, `APP_BASE_URL`, `CRON_SECRET`(랜덤 생성)
- [ ] `lib/legal.ts`의 `BUSINESS_INFO` ★ → 실제 사업자정보로 교체 → **`npm run test:prelaunch` 통과**(★ 남으면 실패해서 배포 차단)
- [ ] GitHub 연결로 Vercel 배포 → **vercel.ts 크론 4종**(worker 매분/reconcile 10분/reap 5분/expire 매시) 자동 인식
- [ ] PayApp 관리자: 피드백 URL = `https://<도메인>/api/payments/payapp/feedback`, 발신 IP 화이트리스트·필드 철자 확인

## 3단계 — 실거래 검증 (🤖 같이) — 몇 시간
- [ ] **카카오·구글 실로그인** 동작
- [ ] **₩1,000 실결제**(카드+카카오페이) → 크레딧 정확히 1회 적립 → `paycancel` 후 클로백 확인
- [ ] **실생성 1장씩**(GPT Image 2 / Nano Banana) → 워터마크 'AI 생성' 라벨·다운스케일 확인
- [ ] 회원탈퇴 → Storage+DB+auth 완전 삭제(스테이징 실데이터)
- [ ] `docs/LAUNCH_CHECKLIST.md` 5대 검증 사인오프 → **오픈**

---

## 지금 당장 할 수 있는 것
- **사장님**: 0-1 사업자등록 + 0-3 PayApp 가입 신청(가장 오래 걸림) → **오늘 착수 권장**.
- **저(🤖)**: 0-4 법률 문안 초안, 1단계 각 계정 가입 화면 단계별 안내, 2단계 배선은 키를 받는 즉시 진행.

> 코드 상태(2026-06-29 기준): master `4128bd6`, origin 동기화 완료. Vitest 152 · pgTAP 46 · build/tsc 0. 출시 차단 코드 이슈 **없음**.
