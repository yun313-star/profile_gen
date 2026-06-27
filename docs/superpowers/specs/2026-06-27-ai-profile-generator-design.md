# 설계 스펙 — AI 프로필 사진 생성기 (코드네임: ProfAI)

> 작성일 2026-06-27 · 상태: 설계 승인됨(구현 계획 진입 전) · 미확인 항목은 **★확인필요**로 표기
> 본 문서는 브레인스토밍에서 확정한 결정과 리서치(기술 스택·페이앱 결제)를 종합한 단일 기준 문서다.

---

## 0. 한 줄 요약

한국 B2C 소비자가 셀카 1~3장을 올리면, 최신 이미지 모델(**GPT Image 2** + **Nano Banana Pro**)이 **즉석 레퍼런스 방식**(개인 모델 학습 없음)으로 스타일 프로필 사진을 생성해 주는 **반응형 웹앱(PWA)**. **크레딧 팩**을 **페이앱(PayApp)** 실결제로 판매하며, **Supabase + Vercel(Next.js)** 위에 구축한다.

## 1. 확정 결정 요약

| 항목 | 결정 |
|---|---|
| 타깃/모델 | B2C 한국 소비자 앱, 크레딧 팩 + 가입 무료크레딧(전환 깔때기) |
| 생성 방식 | 즉석 레퍼런스(셀카=reference image, 학습 없음) |
| 모델 전략 | 스타일별 최적 모델 **자동매핑**(사용자는 모델 의식 안 함) |
| 스타일 | 비즈·증명사진 / 컨셉 화보 / SNS 감성 / 판타지·아트 (4 패밀리) |
| 결제 | **페이앱(PayApp)** — 서버 권위금액 → 피드백 검증 → 멱등 적립 |
| 로그인 | 카카오 + 구글 소셜 (Supabase Auth 기본 제공) |
| 인프라 | Supabase(Postgres/Auth/Storage/Realtime) + Vercel(Next.js App Router) |
| MVP 범위 | 풀 버티컬 슬라이스(전체 루프 + 실결제), 패밀리당 2~3 프리셋 |
| 플랫폼 | 반응형 웹앱/PWA (네이티브 앱 아님) |
| 브랜드명 | 가칭 `ProfAI` (추후 확정) |
| 무료 체험 | 가입 시 3크레딧, 워터마크 1K, 저가 모델 |

## 2. 기술 스택

| 레이어 | 결정 | 근거 |
|---|---|---|
| 프레임워크 | Next.js 16 App Router + RSC, **Node 런타임**(Edge 아님) | multipart 업로드·웹훅 raw body·긴 생성 지연. Fluid Compute로 I/O 대기 과금 저렴 |
| UI | Tailwind + shadcn/ui, react-hook-form + zod | B2C 프리미엄 UI, 폼 검증 |
| 클라 데이터 | Supabase Realtime(생성 상태) + 가벼운 폴링(주문 상태) | 폴링 최소화 |
| Auth/DB/Storage | Supabase | RLS, RPC 원자 차감, 프라이빗 버킷+signed URL, Realtime broadcast |
| AI 호출 | **하이브리드** — 얼굴보존 핵심: OpenAI 직접 SDK `images.edit` / Gemini 멀티레퍼런스: AI SDK v6 + Vercel AI Gateway | Gateway image API는 text→image만 문서화 → 셀카 레퍼런스는 직접 SDK가 안전 |
| 결제 | 페이앱 REST(`apiLoad.html`) + feedbackurl 웹훅 | §6 |
| 큐/비동기 | MVP: Supabase pgmq + pg_cron(또는 Vercel Cron 워커). 계약(job-row+Realtime) 고정 | Vercel Queues는 베타 → 결제 인접이라 GA 기판 우선, transport 후속 스왑 |
| 배포 | Vercel Pro(Fluid Compute, cron, 동시성 자동확장) | 워커 maxDuration 300s |

**비밀키 전량 서버 전용**: `OPENAI_API_KEY`, `GEMINI_API_KEY`(또는 `AI_GATEWAY_API_KEY`), `PAYAPP_USERID/LINKKEY/VALUE`, Supabase service-role. `NEXT_PUBLIC_*`엔 절대 노출 금지. 모델 스냅샷 핀 고정(재현성).

## 3. 사용자 플로우

```
랜딩(후킹) → 카카오/구글 로그인 → [무료 3크레딧 자동지급]
 → 스튜디오: 셀카 1~3장 업로드(클라 리사이즈/검증) → 스타일 선택 → 변형수 N/해상도
 → 생성(비동기, 실시간 진행바) → 결과 갤러리(무료=워터마크 1K)
 → "고화질로 받기 / 더 만들기" → 크레딧 팩 결제(페이앱) → HD 다운로드
```
전환 핵심: 무료 워터마크 결과로 **품질 선체험** → 결제 동기 부여.

## 4. 시스템 아키텍처

```
[브라우저 (Next.js RSC + 클라)]
  │ 업로드/생성요청        │ 결제요청(payurl 리다이렉트)   │ Realtime 구독
  ▼                       ▼                              ▼
[Next.js Route Handlers / Server Actions — Vercel, Node, Fluid Compute]
  ├ /api/generate            → 크레딧 예약(RPC)+job행 INSERT+큐 enqueue → 202
  ├ /api/jobs/worker         → 큐 소비: 모델호출 → Storage → job 'done'
  ├ /api/payments/payapp/*   → create / feedback(검증·적립) / cancel
  └ /api/cron/*              → reconcile(누락결제 대사)·reap(stuck)·expire(무료 만료)
        │                          │                          │
        ▼                          ▼                          ▼
[Supabase: Postgres(RLS)+Auth(카카오/구글)+Storage(프라이빗)+Realtime]
[외부: OpenAI / Google(AI Gateway) / PayApp]
```

## 5. 데이터 모델

### 5.1 테이블

```sql
-- 사용자 프로필 (auth.users 확장) + 잔액 캐시
profiles(
  id uuid pk references auth.users,
  display_name text, phone text, age_verified bool default false,
  credit_balance int not null default 0,
  created_at timestamptz default now()
)

-- 동의 이력 (PIPA) — 언번들 동의별 1행
consents(
  id bigint pk, user_id uuid references profiles,
  type text,        -- 'tos'|'privacy'|'sensitive_face'|'own_face'|'marketing'
  version text, agreed_at timestamptz default now(), ip text
)

-- 크레딧 원장 (append-only)
credit_ledger(
  id bigint pk, user_id uuid references profiles,
  delta int not null,             -- +적립 / -차감 / +환불
  reason text,                    -- 'purchase'|'generation_hold'|'refund'|'release'|'signup_bonus'
  ref_type text, ref_id uuid,     -- order_id / job_id 연결
  created_at timestamptz default now()
)

-- 주문 (페이앱)
orders(
  id uuid pk,                     -- = 페이앱 var1 (서버 생성)
  user_id uuid references profiles,
  pack_id text, expected_amount int not null,  -- 서버 권위 금액(위변조 비교 기준)
  credits int not null,
  status text default 'PENDING',  -- PENDING|PAID|REFUNDED
  payapp_mul_no text,             -- 페이앱 거래 고유번호(대조·디듀프 키)
  payapp_pay_state text,          -- 마지막 수신 pay_state(감사)
  payapp_pay_type text,           -- 결제수단 코드
  paid_at timestamptz, created_at timestamptz default now()
)
create unique index orders_mul_no_uniq on orders(payapp_mul_no) where payapp_mul_no is not null;

-- 스타일 프리셋 (운영 제어 — 코드 배포 없이 관리)
style_presets(
  id text pk, name_ko text, family text,        -- 'business'|'editorial'|'sns'|'fantasy'|'free'
  model_key text,                               -- 'gpt-image-2'|'gemini-3-pro-image'|...
  prompt_template text, size text, quality text,
  credit_cost int default 1, is_active bool default true, sort_order int
)

-- 생성 작업 (이미지 1장 = 1행 = 1재시도 단위)
generation_jobs(
  id uuid pk, user_id uuid, batch_id uuid,
  style_preset_id text references style_presets,
  model_key text, status text default 'queued', -- queued|processing|done|failed
  is_watermarked bool default false,
  hold_ledger_id bigint,                        -- 예약 차감 원장 행
  asset_id uuid, error_code text,
  created_at timestamptz default now(), finished_at timestamptz
)

-- 산출물 / 셀카
assets(
  id uuid pk, job_id uuid, user_id uuid,
  storage_path text,                            -- Supabase Storage 경로(signed URL 제공)
  kind text,                                    -- 'source_selfie'|'output'|'watermarked'
  width int, height int, mime text,
  delete_after timestamptz,                     -- 셀카=생성 직후 파기(PIPA)
  created_at timestamptz default now()
)
```

### 5.2 크레딧 차감 — 동시성 안전 RPC

```sql
create or replace function debit_credits(p_user uuid, p_amount int, p_job uuid)
returns bigint language plpgsql security definer as $$
declare v_bal int; v_ledger bigint;
begin
  select credit_balance into v_bal from profiles where id = p_user for update; -- 잔액행 잠금
  if v_bal < p_amount then raise exception 'INSUFFICIENT_CREDITS'; end if;
  update profiles set credit_balance = credit_balance - p_amount where id = p_user;
  insert into credit_ledger(user_id, delta, reason, ref_type, ref_id)
    values (p_user, -p_amount, 'generation_hold', 'job', p_job) returning id into v_ledger;
  return v_ledger;
end $$;
```
- enqueue 시점에 **예약(hold)** 차감. 실패/모더레이션 차단 시 cron 또는 워커가 `release/refund` 원장 추가.
- 적립(결제)도 §6의 멱등 패턴으로 정확히 1회. 서버는 **service-role**로 RPC 호출(RLS 우회), 클라 직접 호출 금지.
- **RLS**: 모든 테이블 `user_id = auth.uid()` 본인 행만. 셀카 버킷 프라이빗.

## 6. 결제 & 크레딧 — 페이앱(PayApp)

### 6.1 핵심 차이(vs PortOne)
- **단일 REST 엔드포인트** `https://api.payapp.kr/oapi/apiLoad.html` (form-urlencoded POST, UTF-8). **응답은 JSON이 아님** → `res.text()` + `URLSearchParams` 파싱.
- **공개 GET 상태조회 API 없음 ★** → PortOne식 서버 재조회 대신 **피드백 시크릿 3종 + 금액 + 상태** 검증이 게이트.
- **온보딩 장벽 낮음**: PG 마스터가맹 하위 편입, 개인사업자도 가입. 단 첫 정산은 간이심사(약 3~5영업일) 후. **공개 샌드박스 없음 ★**.

### 6.2 결제 플로우(안전 순서)
```
① [서버] orders PENDING INSERT (expected_amount=권위금액, id=var1)
② [서버] POST cmd=payrequest (userid, goodname, price=expected_amount, recvphone,
         smsuse='n', feedbackurl, returnurl, var1=order.id, var2=user.id, checkretry='y')
         → 응답: state=1, mul_no, payurl
③ [서버] orders.payapp_mul_no = mul_no 저장 → 클라에 payurl 반환
④ [클라] payurl 오픈 (모바일=window.location 전체 리다이렉트 / PC=window.open 팝업+리다이렉트 폴백)
⑤ [페이앱→서버] feedbackurl POST (pay_state, price, var1, mul_no, userid, linkkey, linkval, pay_type…)
⑥ [서버] 검증 게이트(4종 전부 통과 시에만 적립):
        ⓐ userid==env.USERID && linkkey==env.LINKKEY && linkval==env.VALUE  (위조 차단)
        ⓑ pay_state == '4'  (결제완료. 10=가상계좌 입금대기는 적립 금지)
        ⓒ Number(price) == orders.expected_amount  (var1로 조회한 권위 금액)
        ⓓ 멱등: UPDATE orders SET status='PAID', paid_at=now() WHERE id=var1 AND status='PENDING'
                RETURNING → 행이 전이됐을 때만 grant_credits RPC 호출
⑦ [서버] **반드시 HTTP 200 + 본문 정확히 `SUCCESS`** (아니면 페이앱 최대 ~10회 재시도).
   returnurl 페이지는 주문상태 **읽기 전용 폴링만**, 적립 절대 금지.
```

### 6.3 보안·검증 (타협 불가)
- `PAYAPP_USERID/LINKKEY/VALUE` 서버 전용. **HMAC 서명 없음** → linkval은 공유 시크릿. 유출 대비 **금액·주문상태 게이트가 과지급 최후 방어선**.
- 위조 피드백이 들어와도 ⓒ 금액 불일치 / 주문 PENDING 아님 → 적립 불가.
- 멱등: 중복 피드백(최대 ~10회)은 `WHERE status='PENDING'` 0행 → 적립 스킵. `mul_no` 디듀프 키 병행.
- 검증 실패여도 재시도 폭주 방지 위해 200 `SUCCESS` 반환하되 **DB 미변경+로깅**. 인증 실패는 위조 의심 → 적립 금지+로깅.
- **누락 웹훅 대비**: `/api/cron/reconcile`이 PENDING 장기 잔존 주문을 mul_no로 대사(조회 API 있으면 적립 전 재조회 1회 추가 ★).

### 6.4 환불
- `cmd=paycancel` (mul_no, memo) → 환불 피드백(pay_state 9/64/70/71)에서 `UPDATE … WHERE status='PAID'` 멱등 전이 후 크레딧 클로백 RPC 1회.

### 6.5 코드 스케치(핵심)
```ts
// app/api/payments/payapp/create/route.ts (runtime='nodejs')
const order = await db.insertOrder({ user_id, status:'PENDING', expected_amount: pack.price, credits: pack.credits });
const body = new URLSearchParams({ cmd:'payrequest', userid: env.PAYAPP_USERID, goodname: pack.name,
  price:String(pack.price), recvphone: user.phone ?? '01000000000', smsuse:'n',
  feedbackurl:`${env.APP_BASE_URL}/api/payments/payapp/feedback`,
  returnurl:`${env.APP_BASE_URL}/credits/result?order=${order.id}`, var1: order.id, var2:String(user.id), checkretry:'y' });
const p = new URLSearchParams(await (await fetch('https://api.payapp.kr/oapi/apiLoad.html',
  { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded; charset=utf-8'}, body })).text());
if (p.get('state')!=='1') return Response.json({ error: p.get('errorMessage') }, { status:502 });
await db.updateOrder(order.id, { payapp_mul_no: p.get('mul_no') });
return Response.json({ payurl: p.get('payurl') });

// app/api/payments/payapp/feedback/route.ts (runtime='nodejs')
const p = new URLSearchParams(await req.text());
if (p.get('userid')!==env.PAYAPP_USERID || p.get('linkkey')!==env.PAYAPP_LINKKEY || p.get('linkval')!==env.PAYAPP_VALUE)
  return new Response('FAIL',{status:200});
if (p.get('pay_state')!=='4') { await handleNonPaid(p); return new Response('SUCCESS',{status:200}); }
const order = await db.getOrder(p.get('var1'));
if (!order || order.expected_amount !== Number(p.get('price'))) return new Response('SUCCESS',{status:200});
const flipped = await db.markOrderPaidIfPending(order.id, { payapp_mul_no: p.get('mul_no') });
if (flipped) await db.grantCreditsRpc(order.user_id, order.credits, order.id);
return new Response('SUCCESS',{status:200});
```

## 7. 비동기 생성 파이프라인

원칙: **배치 전체 동기 생성 금지** → 이미지 1장 = job 1행 = 큐 메시지 1개 = 독립 재시도 단위.

```
POST /api/generate (auth, styleId, 변형수 N, 해상도, selfie[])
  → [Producer] debit_credits×N(예약) + jobs N행 INSERT(queued) + 큐 enqueue(이미지당 1, idempotencyKey=job_id)
  → 202 { batchId, jobIds } 즉시 반환
[Worker] (큐 소비, Node, maxDuration 300s, 동시성 캡=모델 RPM)
  ① job status 가드(이미 done이면 ack — 유료 API 이중호출/이중차감 방지)
  ② status='processing' → 셀카 signed URL 로드 → style→model 라우팅
       · 얼굴보존 핵심 → OpenAI images.edit(직접 SDK), image=[셀카…], size, quality, moderation='auto'
       · Gemini 멀티레퍼런스 → AI SDK v6 generateText(model:'google/gemini-3-pro-image', 메시지 image 파트, imageConfig)
  ③ 결과 → Supabase Storage 업로드(경로만 반환, 바이트 프록시 금지 / 함수 4.5MB 한도)
  ④ 무료면 다운스케일 + 가시 워터마크
  ⑤ jobs status='done', asset_id UPDATE → AFTER UPDATE 트리거 realtime.broadcast('job_<id>')
  실패 시 throw → visibility timeout 자동 재시도(N회 후 'failed' + 크레딧 환불)
[클라] supabase.channel('job_<id>').on('broadcast',…) → 실시간 진행/결과(폴링 없음)
[Cron] reap(stuck processing 회수) · 영구실패 환불 · expire(무료 워터마크 만료) · reconcile(누락 결제 대사)
```
- **at-least-once 멱등 가드**: 유료 API 호출 전 status 체크 필수. `waitUntil/after`는 비내구성 → 로깅 전용, 본작업 금지.
- 모더레이션/안전 차단(특히 Gemini silent block=빈 응답) → no-image 핸들링 + 친절 한국어 안내 + 크레딧 환불.

## 8. 스타일 카탈로그 & 모델 라우팅 (MVP ~12 프리셋)

| 패밀리 | MVP 프리셋(2~3) | 기본 모델 | 해상도/품질 |
|---|---|---|---|
| 비즈·증명사진(동일성 critical) | 링크드인 헤드샷 / 한국 증명사진(흰배경 정장) / 컬러배경 프로필 | Nano Banana Pro | 2K |
| 컨셉 화보 | 시네마틱 필름 / 빈티지 / 계절(벚꽃·단풍) | GPT Image 2 high ↔ Nano Banana Pro (A/B) | 1024×1536 |
| SNS 감성 | 인스타 데일리 / 카페 무드 / 흑백 | GPT Image 2 high | 1024×1536 |
| 판타지·아트(동일성 덜 중요) | 사이버펑크 / 애니풍 / 르네상스 유화 | GPT Image 2 | medium |
| 무료 퍼널 | 위 스타일 저해상 체험 | Nano Banana 2(1K) / gpt-image-1-mini | 1K + 워터마크 |

- 라우팅은 `style_presets.model_key`로 **DB 제어**(코드 배포 없이 모델/프롬프트/단가 조정).
- **크레딧 단위**: 1크레딧 = 결과 이미지 1장(2K). 변형 4장=4크레딧. **4K=2크레딧**(후속).
- 모델 ID: `gpt-image-2`(핀 `gpt-image-2-2026-04-21`) / `gemini-3-pro-image`. **출시 직전 콘솔에서 GA/preview suffix 재확인 ★**.

## 9. 컴플라이언스 & 보안 (출시 전 필수)

- **인공지능기본법(2026-01-22 시행)**: 사전 고지 + **모든 산출물에 사람이 인지 가능한 가시 'AI 생성' 라벨/워터마크**(SynthID 비가시만으론 불충분). 위반·시정불이행 시 과태료 최대 3,000만원(계도기간 존재).
- **PIPA**: 언번들 별도 동의 — [필수]이용약관 / [필수]개인정보 수집·이용(항목=셀카·얼굴, 목적=AI 프로필 생성, 보유=생성 직후/N일 파기) / [필수]**얼굴=민감정보 준함 별도 동의** / [필수]**본인 얼굴만 업로드** 확인 / [선택]마케팅. 동의 레코드(버전·시각·IP) 저장. **원본 셀카·provider 아티팩트 생성 직후 즉시 파기**, OpenAI/Google에 no-training/단기보존 요청. 국외수탁(OpenAI·Google·Supabase·Vercel·PayApp) 처리방침 명시.
- **초상권/딥페이크**: 서버에서 본인 얼굴만(단일 피사체) 강제, 타인/유명인 금지(약관+기술). NSFW/불법 필터, 신고·테이크다운 채널.
- **미성년자**: 만 14세 미만 차단(권장 19세+).
- **전자상거래법/환불**: 통신판매업 신고(디지털재화 면제 여부 페이앱 심사팀 ★확인), 사업자정보·환불정책 고지, **미사용 크레딧 환불 가능**(청약철회 제한은 결제 전 고지+동의 시 유효), 이용약관·개인정보처리방침 게시.
- **보안**: 전 외부 키·페이앱 linkval 서버 전용. RLS 강제. 셀카 프라이빗 버킷 + signed URL.

## 10. 가격 · 원가

- **생성원가** ≈ 190~350원/장(2K, 환율·정확단가 ★확인). GPT Image 2 edit는 셀카 입력 토큰이 출력비 위에 가산 → 동일성 스타일 기본을 셀카 입력 저렴한 Nano Banana Pro로.
- **페이앱 수수료**(VAT 별도): 사업자 카드/간편결제 **1.9~3.4%**, 휴대폰 3.8%, 계좌이체 2.3%, 가상계좌 220원/건. **비사업자 개인 카드 4.0% → 개인사업자 가입 권장**. 정산 D+5(빠른정산 D+1/D+3 옵션). 최소 결제 ₩1,000.
- **권장 시작가(★사업 결정)**: 스타터 10장 ₩9,900 / 밸류 30장 ₩24,900 / 프로 60장 ₩44,900. 흔한 "40장 9,900"은 원가 미달 위험 → 장당 ~990원대로 시작.
- 무료 3크레딧(워터마크 1K, 저가 모델) → 체험 후 전환.

## 11. MVP 범위 & 라우트

**IN**: 카카오/구글 로그인 · 셀카 업로드(클라 리사이즈/검증) · 4패밀리×2~3 프리셋 · 무료체험 · 비동기 생성+Realtime · 갤러리/다운로드 · 페이앱 실결제+크레딧 원장 · 동의/파기 · 약관·개인정보 · 기본 운영(Supabase 대시보드로 `style_presets` 관리).

**OUT(후속)**: 개인 모델 학습 · 4K 프리미엄팩 확장 · 구독(페이앱 rebillRegist) · 별도 어드민 UI · 다국어 · 네이티브 앱.

**라우트**:
- 페이지: `/`(랜딩) · `/login` · `/auth/callback` · `/create`(스튜디오) · `/result/[batchId]`(Realtime) · `/gallery` · `/credits`(팩) · `/credits/result`(returnurl 폴링) · `/account`(동의·삭제) · `/legal/terms` · `/legal/privacy`
- API: `/api/generate` · `/api/jobs/worker` · `/api/payments/payapp/{create,feedback,cancel}` · `/api/cron/{reconcile,reap,expire}`

## 12. 리스크 & 출시 전 검증

| 리스크 | 대응 |
|---|---|
| 모델 id/단가 변동(`-preview` 등) | 출시 직전 콘솔 라이브 확인 + 핀 고정 + 라우터 fallback id |
| 페이앱 GET 조회 부재 ★ | linkval+금액+상태 게이트 + 누락 대사 크론(조회 API 있으면 적립 전 재조회 추가) |
| 페이앱 샌드박스 없음 ★ | ₩1,000 실거래+취소로 E2E(카드+카카오페이), 멱등·위조차단 검증 |
| at-least-once 이중과금 | 유료호출 전 status 가드 + 예약차감 |
| 모더레이션 오탐(얼굴 차단) | 큐+백오프, 두 모델 분산, 차단 시 환불+친절 안내 |
| 레이트리밋(OpenAI Tier1 5 IPM) | 큐+동시성 캡, 두 모델 분산, 티어 업그레이드 |

**출시 전 검증 5건**: ① OpenAI calculator로 1장 단가 확정(+셀카 입력 토큰 실측) ② Gemini 모델 id 콘솔 확인(GA/preview) ③ 페이앱 개인사업자 가입 + linkkey/linkval 확보 + ₩1,000 E2E ④ legal: 얼굴=민감정보 분류·청약철회 제한 문구 ⑤ pgmq vs Vercel Queues 부하 PoC(job-row+Realtime 계약 고정).

## 13. 미확인 항목 종합 (★확인필요)

- **모델/단가**: gpt-image-2 1장당 정확 센트(calculator) + 셀카 입력 토큰 실측; gemini canonical id(GA vs `-preview`); 레퍼런스 이미지 최대 수; Gateway 4K imageConfig 실제 반영; Gateway per-image 마크업.
- **페이앱**: 서버 GET 상태조회(cmd) 존재 여부; 피드백 필드 철자/대소문자(card_name 등) 실페이로드 캡처; var1 길이 한도(UUID 수용); openpaytype 토큰/구분자; 발신 IP 화이트리스트; 가상계좌 입금확인 피드백 타이밍; paycancel 필수 파라미터; 디지털재화 통신판매업신고 면제 여부; 사업자 등급별 정확 수수료.
- **인프라**: Vercel Queues GA 시점·단가; Supabase Realtime 동시접속 한도/요금.
- **컴플라이언스(legal-counsel)**: 레퍼런스 likeness=생체인식정보 분류 여부; 가시 워터마크 규격/위치; 청약철회 제한 문구; 최소 연령(14 vs 19).

## 14. 다음 단계

본 스펙 사용자 검토 통과 후 → `writing-plans` 스킬로 **구현 계획서** 작성(작업 단위 분해, 빌드 순서, 검증 체크포인트). 구현은 풀 버티컬 슬라이스 우선순위로 진행.
