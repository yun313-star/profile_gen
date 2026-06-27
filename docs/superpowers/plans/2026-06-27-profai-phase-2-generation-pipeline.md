# ProfAI — Phase 2: Generation Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Ship the end-to-end async image-generation slice — a signed-in user **with credits** uploads 1–3 selfies, picks a style preset, requests N variations, and the system holds credits, enqueues N independent jobs, a worker calls the pinned image model (OpenAI `images.edit` or Gemini via AI Gateway), watermarks free-tier output, stores results in private Storage, and streams realtime progress to the result page; the gallery lists signed-URL downloads. Any generation failure refunds the held credit.

**Architecture:** Next.js 16 App Router (Node runtime) → Supabase Postgres (RLS + pgmq queue + Realtime broadcast trigger) + Supabase Storage (private `selfies`/`outputs` buckets). Producer route `/api/generate` does auth + consent gate → `debit_credits` hold ×N → `insertJobs` (queued) → `pgmq.send` per job → non-awaited kick to the worker → 202. Worker `/api/jobs/worker` (CRON_SECRET-guarded, also Vercel-Cron driven) reads the queue, status-guards each job (never re-pays a job past `queued`), routes to the model layer, uploads + (free) watermarks, inserts the asset, flips `done`; on throw it refunds the hold and flips `failed`. An `AFTER UPDATE` trigger broadcasts to `job_<id>`; the client subscribes via `useJobStream`.

**Tech Stack:** Next.js 16 + React Server Components, TypeScript strict, pnpm. OpenAI SDK (`images.edit`), Vercel AI SDK v6 (`generateText` via AI Gateway), `sharp` for watermark/downscale, Supabase JS (`@supabase/ssr`), pgmq + pg_cron, Vitest (unit/integration with `vi.mock`), Playwright (E2E), pgTAP (DB/RLS/queue tests via `supabase test db`).

## Global Constraints

Copy verbatim into every task's mental model:

- Next.js 16 App Router + React Server Components, TypeScript strict. Package manager: pnpm.
- API routes and the worker run on Node runtime: `export const runtime = "nodejs";` NEVER Edge.
- Test stack: Vitest (unit/integration, with `vi.mock` for Supabase/provider clients) + Playwright (E2E). DB migration/RLS/queue tests via pgTAP in `supabase/tests` run with `supabase test db` (requires **Docker + Supabase CLI**). State the Docker requirement where used.
- Every secret is server-only. Client may ONLY see `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. NEVER expose `OPENAI_API_KEY`, `GEMINI_API_KEY`/`AI_GATEWAY_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PAYAPP_USERID`/`LINKKEY`/`VALUE`, `CRON_SECRET`.
- Pin models: OpenAI `gpt-image-2` (snapshot `gpt-image-2-2026-04-21`); Google `google/gemini-3-pro-image`; free tier `google/gemini-3.1-flash-image-preview` or `gpt-image-1-mini`. Verify ids live before launch (manual step, do not block).
- Credit unit: 1 credit = 1 output image at 2K. 4K = 2 credits (post-MVP). Free signup = 3 credits, watermarked 1K.
- Korean UI copy. All generated outputs (free tier especially) carry a visible "AI 생성" label per 인공지능기본법.
- Frequent commits: each task ends with a commit. Conventional commit messages (`feat`/`fix`/`test`/`chore`/`docs`). End commit body with:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

**Relevant ENV VARS (`.env.example`):** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `AI_GATEWAY_API_KEY` (Gemini via Vercel AI Gateway), `APP_BASE_URL`, `CRON_SECRET`. (PayApp vars belong to Phase 3.)

## File Structure (this phase creates/modifies)

| Path | Responsibility |
|---|---|
| `supabase/migrations/0010_storage_buckets.sql` | Create private `selfies`/`outputs` buckets + per-owner storage.objects RLS policies |
| `supabase/migrations/0011_pgmq_generation.sql` | `pgmq.create('generation')` + `public.pgmq_send/read/delete/archive` wrappers granted to service_role |
| `supabase/migrations/0012_job_broadcast.sql` | `AFTER UPDATE` trigger on `generation_jobs` → `realtime.broadcast_changes('job_'||id)` + RLS on `realtime.messages` |
| `supabase/tests/storage_policies_test.sql` | pgTAP: buckets exist + private + owner-scoped policies |
| `supabase/tests/pgmq_generation_test.sql` | pgTAP: queue + wrapper round-trip (send→read→delete) |
| `supabase/tests/job_broadcast_test.sql` | pgTAP: trigger exists + realtime.messages RLS present |
| `lib/storage.ts` | Server Storage helpers: `BUCKET_SELFIES/OUTPUTS`, `uploadObject`, `createSignedUrl`, `downloadBytes`, `removeObjects` |
| `lib/queue.ts` | pgmq RPC wrappers: `queueSend`, `queueRead`, `queueDelete` |
| `lib/image-client.ts` | Client selfie validate (`validateSelfieFile`) + canvas resize (`resizeSelfie`) + limits |
| `lib/watermark.ts` | `applyWatermark(bytes, opts?)` — downscale to 1K + composite visible "AI 생성" label (sharp) |
| `lib/models/types.ts` | `GenInput`, `GenOutput`, `ModerationBlockedError` |
| `lib/models/openai.ts` | `openaiEdit(input)` — OpenAI `images.edit`, decode `b64_json` |
| `lib/models/gemini.ts` | `geminiGenerate(input)` — AI SDK v6 `generateText`, read `res.files` |
| `lib/models/router.ts` | `generateImage(input)` — switch on `model_key` |
| `lib/useJobStream.ts` | Client hook: subscribe `job_<id>` broadcast, expose per-job status |
| `app/api/generate/route.ts` | Producer: auth + consent + validate + hold ×N + insertJobs + enqueue + kick → 202 |
| `app/api/jobs/worker/route.ts` | Worker: CRON_SECRET guard + `maxDuration=300` + pgmq read + status-guard + generate + upload + watermark + done/refund + immediate batch selfie purge |
| `app/api/cron/reap/route.ts` | Reaper cron: fail `processing` jobs stuck >10min + refund their hold (CRON_SECRET guard) |
| `app/create/page.tsx` | Studio: selfie upload (resize) + style picker by family + variations → POST /api/generate |
| `app/result/[batchId]/page.tsx` | Realtime progress + finished results (signed URLs) |
| `app/gallery/page.tsx` | Signed-URL grid + download of the user's outputs |
| `tests/storage.test.ts` … `tests/worker-route.test.ts` | Vitest units (mock Supabase/providers) |
| `e2e/generate.spec.ts` | Playwright happy-path E2E with the model layer stubbed |

**Consumed from Phase 1 (do NOT redefine — exact contract signatures):**
- `lib/supabase/server.ts` → `createServerSupabase()`; `lib/supabase/service.ts` → `createServiceSupabase()`; `lib/supabase/browser.ts` → `createBrowserSupabase()`.
- `types/db.ts` → `Profile`, `Consent`, `StylePreset`, `GenerationJob`, `Asset` (+ `NewJob` insert type used by `insertJobs`).
- `lib/db.ts` → `insertJobs(sb, jobs: NewJob[]): Promise<GenerationJob[]>`, `getJob(sb, id): Promise<GenerationJob|null>`, `setJobStatus(sb, id, status, patch?): Promise<void>`, `insertAsset(sb, asset): Promise<Asset>`.
- `lib/credits.ts` → `debitCredits(sb,{user_id,amount,job_id}):Promise<number>`, `refundHold(sb,{user_id,amount,job_id}):Promise<void>`.
- `lib/consent.ts` → `REQUIRED_CONSENTS = ["tos","privacy","sensitive_face","own_face"]`, `hasRequiredConsents(types: string[]): boolean`. The producer MUST import these (never redefine a local array; never drop `"tos"`).
- `profiles.age_verified` column (set true during Phase 1 consent onboarding once age ≥ 14). The producer gates on it.
- DB RPCs `debit_credits`, `refund_hold` and tables `profiles`/`consents`/`style_presets`/`generation_jobs`/`assets` with RLS (`user_id = auth.uid()`), plus `style_presets` readable by authenticated users where `is_active` (Phase 1).

> `NewJob` fields this phase relies on: `{ id, user_id, batch_id, style_preset_id, model_key, status, is_watermarked, hold_ledger_id }`. If Phase 1's `NewJob` omits `id`/`hold_ledger_id`, add them there (they are required columns of `generation_jobs`).

---

## Task 2.1 — Private Storage buckets + owner-scoped RLS (migration + pgTAP)

**Files:**
- Create: `supabase/migrations/0010_storage_buckets.sql`
- Test: `supabase/tests/storage_policies_test.sql`

**Interfaces:**
- Consumes: Supabase `storage.buckets`, `storage.objects`, `auth.uid()`.
- Produces: buckets `selfies`, `outputs` (private) with policies scoping access to `auth.uid()::text = (storage.foldername(name))[1]`.

**Steps:**

1. - [ ] Write the failing pgTAP test `supabase/tests/storage_policies_test.sql`:
```sql
begin;
select plan(6);

-- buckets exist and are private
select is(
  (select count(*)::int from storage.buckets where id = 'selfies' and public = false),
  1, 'selfies bucket exists and is private');
select is(
  (select count(*)::int from storage.buckets where id = 'outputs' and public = false),
  1, 'outputs bucket exists and is private');

-- owner-scoped policies present on storage.objects
select ok(
  exists(select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
         and policyname = 'selfies_owner_rw'),
  'selfies owner policy exists');
select ok(
  exists(select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
         and policyname = 'outputs_owner_rw'),
  'outputs owner policy exists');

-- RLS is enabled on storage.objects
select ok(
  (select relrowsecurity from pg_class where oid = 'storage.objects'::regclass),
  'RLS enabled on storage.objects');

-- the policy text references the owner-folder check
select ok(
  exists(select 1 from pg_policies where tablename='objects'
         and policyname='outputs_owner_rw' and qual like '%foldername%'),
  'outputs policy scopes to owner folder');

select * from finish();
rollback;
```

2. - [ ] Run it and confirm it FAILS (Docker + Supabase CLI required):
```bash
supabase test db
```
Expected: `storage_policies_test.sql ... not ok` (buckets/policies do not exist yet).

3. - [ ] Create the migration `supabase/migrations/0010_storage_buckets.sql`:
```sql
-- Private buckets for source selfies and generated outputs.
insert into storage.buckets (id, name, public)
values ('selfies', 'selfies', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('outputs', 'outputs', false)
on conflict (id) do nothing;

-- Owner-scoped access: object path is "<uid>/<...>" so first folder segment must equal auth.uid().
create policy "selfies_owner_rw" on storage.objects
  for all to authenticated
  using (bucket_id = 'selfies' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'selfies' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "outputs_owner_rw" on storage.objects
  for all to authenticated
  using (bucket_id = 'outputs' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'outputs' and (storage.foldername(name))[1] = auth.uid()::text);
```

4. - [ ] Re-run and confirm PASS:
```bash
supabase test db
```
Expected: `storage_policies_test.sql ... ok` (6/6).

5. - [ ] Commit:
```bash
git add supabase/migrations/0010_storage_buckets.sql supabase/tests/storage_policies_test.sql
git commit -m "$(printf 'feat: add private selfies/outputs storage buckets with owner RLS\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 2.2 — pgmq `generation` queue + public wrappers (migration + pgTAP)

**Files:**
- Create: `supabase/migrations/0011_pgmq_generation.sql`
- Test: `supabase/tests/pgmq_generation_test.sql`

**Interfaces:**
- Produces (SQL, `security definer`, granted to `service_role`):
  - `public.pgmq_send(p_msg jsonb) returns bigint`
  - `public.pgmq_read(p_qty int, p_vt int) returns table(msg_id bigint, message jsonb)`
  - `public.pgmq_delete(p_msg_id bigint) returns boolean`
  - `public.pgmq_archive(p_msg_id bigint) returns boolean`

**Steps:**

1. - [ ] Write failing pgTAP `supabase/tests/pgmq_generation_test.sql`:
```sql
begin;
select plan(4);

-- queue table exists (pgmq names it q_<queue>)
select ok(
  to_regclass('pgmq.q_generation') is not null,
  'pgmq generation queue created');

-- wrapper functions exist
select has_function('public', 'pgmq_send', array['jsonb'], 'pgmq_send wrapper exists');
select has_function('public', 'pgmq_read', array['integer','integer'], 'pgmq_read wrapper exists');

-- round-trip: send then read returns the message body
do $$
declare v_id bigint; v_cnt int;
begin
  perform public.pgmq_send('{"job_id":"00000000-0000-0000-0000-000000000001"}'::jsonb);
  select count(*) into v_cnt from public.pgmq_read(1, 5)
    where message->>'job_id' = '00000000-0000-0000-0000-000000000001';
  if v_cnt <> 1 then raise exception 'round-trip read failed: %', v_cnt; end if;
end $$;
select ok(true, 'send/read round-trip works');

select * from finish();
rollback;
```

2. - [ ] Run and confirm FAIL:
```bash
supabase test db
```
Expected: `pgmq_generation_test.sql ... not ok`.

3. - [ ] Create `supabase/migrations/0011_pgmq_generation.sql`:
```sql
create extension if not exists pgmq;

select pgmq.create('generation');

-- Fixed-queue wrappers so the app calls them via supabase.rpc on the public schema.
create or replace function public.pgmq_send(p_msg jsonb)
returns bigint language sql security definer
set search_path = pgmq, public as $$
  select pgmq.send('generation', p_msg);
$$;

create or replace function public.pgmq_read(p_qty int, p_vt int)
returns table(msg_id bigint, message jsonb) language sql security definer
set search_path = pgmq, public as $$
  select msg_id, message from pgmq.read('generation', p_vt, p_qty);
$$;

create or replace function public.pgmq_delete(p_msg_id bigint)
returns boolean language sql security definer
set search_path = pgmq, public as $$
  select pgmq.delete('generation', p_msg_id);
$$;

create or replace function public.pgmq_archive(p_msg_id bigint)
returns boolean language sql security definer
set search_path = pgmq, public as $$
  select pgmq.archive('generation', p_msg_id);
$$;

-- Only the service role (worker/producer) may touch the queue.
revoke all on function public.pgmq_send(jsonb) from public, anon, authenticated;
revoke all on function public.pgmq_read(int, int) from public, anon, authenticated;
revoke all on function public.pgmq_delete(bigint) from public, anon, authenticated;
revoke all on function public.pgmq_archive(bigint) from public, anon, authenticated;
grant execute on function public.pgmq_send(jsonb) to service_role;
grant execute on function public.pgmq_read(int, int) to service_role;
grant execute on function public.pgmq_delete(bigint) to service_role;
grant execute on function public.pgmq_archive(bigint) to service_role;
```

4. - [ ] Re-run and confirm PASS:
```bash
supabase test db
```
Expected: `pgmq_generation_test.sql ... ok` (4/4).

5. - [ ] Commit:
```bash
git add supabase/migrations/0011_pgmq_generation.sql supabase/tests/pgmq_generation_test.sql
git commit -m "$(printf 'feat: add pgmq generation queue with service-role wrappers\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 2.3 — Realtime broadcast trigger on `generation_jobs` (migration + pgTAP)

**Files:**
- Create: `supabase/migrations/0012_job_broadcast.sql`
- Test: `supabase/tests/job_broadcast_test.sql`

**Interfaces:**
- Produces: trigger `generation_jobs_broadcast` (AFTER UPDATE) calling `realtime.broadcast_changes('job_'||NEW.id, ...)`; RLS `SELECT` policy on `realtime.messages` scoping topic `job_<id>` to the job owner.

**Steps:**

1. - [ ] Write failing pgTAP `supabase/tests/job_broadcast_test.sql`:
```sql
begin;
select plan(3);

select ok(
  exists(select 1 from pg_trigger where tgname = 'generation_jobs_broadcast'
         and tgrelid = 'public.generation_jobs'::regclass),
  'AFTER UPDATE broadcast trigger exists');

select has_function('public', 'broadcast_job_change', 'trigger fn exists');

select ok(
  exists(select 1 from pg_policies where schemaname = 'realtime' and tablename = 'messages'
         and policyname = 'job_owner_can_read'),
  'realtime.messages owner read policy exists');

select * from finish();
rollback;
```

2. - [ ] Run and confirm FAIL:
```bash
supabase test db
```
Expected: `job_broadcast_test.sql ... not ok`.

3. - [ ] Create `supabase/migrations/0012_job_broadcast.sql`:
```sql
-- Broadcast every job UPDATE to a private per-job topic "job_<id>".
create or replace function public.broadcast_job_change()
returns trigger language plpgsql security definer
set search_path = public, realtime as $$
begin
  perform realtime.broadcast_changes(
    'job_' || new.id::text,  -- topic
    tg_op,                   -- event
    tg_op,                   -- operation
    tg_table_name,
    tg_table_schema,
    new,
    old
  );
  return new;
end $$;

create trigger generation_jobs_broadcast
  after update on public.generation_jobs
  for each row execute function public.broadcast_job_change();

-- Private channel authorization: a client may read messages for topic job_<id>
-- only when they own that job.
alter table realtime.messages enable row level security;

create policy "job_owner_can_read" on realtime.messages
  for select to authenticated
  using (
    exists (
      select 1 from public.generation_jobs j
      where 'job_' || j.id::text = realtime.topic()
        and j.user_id = auth.uid()
    )
  );
```

4. - [ ] Re-run and confirm PASS:
```bash
supabase test db
```
Expected: `job_broadcast_test.sql ... ok` (3/3).

5. - [ ] Commit:
```bash
git add supabase/migrations/0012_job_broadcast.sql supabase/tests/job_broadcast_test.sql
git commit -m "$(printf 'feat: broadcast generation_jobs updates to private realtime topics\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 2.4 — Server Storage helpers (`lib/storage.ts`)

**Files:**
- Create: `lib/storage.ts`
- Test: `tests/storage.test.ts`

**Interfaces:**
- Consumes: a `SupabaseClient` (`@supabase/supabase-js`) `.storage.from(bucket)` API.
- Produces:
  - `BUCKET_SELFIES = "selfies"`, `BUCKET_OUTPUTS = "outputs"`
  - `uploadObject(sb, bucket, path, bytes: Uint8Array, mime: string): Promise<void>`
  - `createSignedUrl(sb, bucket, path, expiresIn?: number): Promise<string>`
  - `downloadBytes(sb, bucket, path): Promise<Uint8Array>`
  - `removeObjects(sb, bucket, paths: string[]): Promise<void>` (no-op on empty list)

**Steps:**

1. - [ ] Write failing `tests/storage.test.ts`:
```ts
// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { uploadObject, createSignedUrl, downloadBytes, removeObjects, BUCKET_SELFIES, BUCKET_OUTPUTS } from "@/lib/storage";

function makeSb(over: Record<string, any> = {}) {
  const api = {
    upload: vi.fn(async () => ({ data: { path: "p" }, error: null })),
    createSignedUrl: vi.fn(async () => ({ data: { signedUrl: "https://signed/x" }, error: null })),
    download: vi.fn(async () => ({ data: new Blob([new Uint8Array([1, 2, 3])]), error: null })),
    remove: vi.fn(async () => ({ data: [], error: null })),
    ...over,
  };
  return { sb: { storage: { from: vi.fn(() => api) } } as any, api };
}

describe("lib/storage", () => {
  it("exposes bucket constants", () => {
    expect(BUCKET_SELFIES).toBe("selfies");
    expect(BUCKET_OUTPUTS).toBe("outputs");
  });

  it("uploadObject passes contentType and upsert", async () => {
    const { sb, api } = makeSb();
    await uploadObject(sb, BUCKET_OUTPUTS, "u/1.png", new Uint8Array([9]), "image/png");
    expect(sb.storage.from).toHaveBeenCalledWith("outputs");
    expect(api.upload).toHaveBeenCalledWith("u/1.png", expect.any(Uint8Array), {
      contentType: "image/png",
      upsert: true,
    });
  });

  it("uploadObject throws on error", async () => {
    const { sb } = makeSb({ upload: vi.fn(async () => ({ data: null, error: new Error("boom") })) });
    await expect(uploadObject(sb, BUCKET_SELFIES, "p", new Uint8Array(), "image/png")).rejects.toThrow("boom");
  });

  it("createSignedUrl returns the url with default 300s expiry", async () => {
    const { sb, api } = makeSb();
    const url = await createSignedUrl(sb, BUCKET_SELFIES, "u/b/0.png");
    expect(url).toBe("https://signed/x");
    expect(api.createSignedUrl).toHaveBeenCalledWith("u/b/0.png", 300);
  });

  it("downloadBytes returns a Uint8Array", async () => {
    const { sb } = makeSb();
    const bytes = await downloadBytes(sb, BUCKET_SELFIES, "p");
    expect(Array.from(bytes)).toEqual([1, 2, 3]);
  });

  it("removeObjects passes the path list to storage.remove", async () => {
    const { sb, api } = makeSb();
    await removeObjects(sb, BUCKET_SELFIES, ["u/b/0.png", "u/b/1.png"]);
    expect(sb.storage.from).toHaveBeenCalledWith("selfies");
    expect(api.remove).toHaveBeenCalledWith(["u/b/0.png", "u/b/1.png"]);
  });

  it("removeObjects is a no-op for an empty list", async () => {
    const { sb, api } = makeSb();
    await removeObjects(sb, BUCKET_SELFIES, []);
    expect(api.remove).not.toHaveBeenCalled();
  });
});
```

2. - [ ] Run and confirm FAIL:
```bash
pnpm vitest run tests/storage.test.ts
```
Expected: `Cannot find module '@/lib/storage'` / suite fails.

3. - [ ] Create `lib/storage.ts`:
```ts
import type { SupabaseClient } from "@supabase/supabase-js";

export const BUCKET_SELFIES = "selfies" as const;
export const BUCKET_OUTPUTS = "outputs" as const;

export async function uploadObject(
  sb: SupabaseClient,
  bucket: string,
  path: string,
  bytes: Uint8Array,
  mime: string,
): Promise<void> {
  const { error } = await sb.storage.from(bucket).upload(path, bytes, {
    contentType: mime,
    upsert: true,
  });
  if (error) throw error;
}

export async function createSignedUrl(
  sb: SupabaseClient,
  bucket: string,
  path: string,
  expiresIn = 300,
): Promise<string> {
  const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error || !data?.signedUrl) throw error ?? new Error("createSignedUrl failed");
  return data.signedUrl;
}

export async function downloadBytes(
  sb: SupabaseClient,
  bucket: string,
  path: string,
): Promise<Uint8Array> {
  const { data, error } = await sb.storage.from(bucket).download(path);
  if (error || !data) throw error ?? new Error("download failed");
  return new Uint8Array(await data.arrayBuffer());
}

export async function removeObjects(
  sb: SupabaseClient,
  bucket: string,
  paths: string[],
): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await sb.storage.from(bucket).remove(paths);
  if (error) throw error;
}
```

4. - [ ] Re-run and confirm PASS:
```bash
pnpm vitest run tests/storage.test.ts
```
Expected: `7 passed`.

5. - [ ] Commit:
```bash
git add lib/storage.ts tests/storage.test.ts
git commit -m "$(printf 'feat: add server Storage helpers (upload/signed-url/download/remove)\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 2.5 — pgmq RPC wrappers (`lib/queue.ts`)

**Files:**
- Create: `lib/queue.ts`
- Test: `tests/queue.test.ts`

**Interfaces:**
- Consumes: `public.pgmq_send/read/delete` RPCs (Task 2.2) via `sb.rpc(...)`.
- Produces:
  - `queueSend(sb, msg: Record<string, unknown>): Promise<void>`
  - `queueRead(sb, qty: number, vt: number): Promise<{ msgId: number; message: any }[]>`
  - `queueDelete(sb, msgId: number): Promise<void>`

**Steps:**

1. - [ ] Write failing `tests/queue.test.ts`:
```ts
// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { queueSend, queueRead, queueDelete } from "@/lib/queue";

describe("lib/queue", () => {
  it("queueSend calls pgmq_send with the message", async () => {
    const rpc = vi.fn(async () => ({ data: 1, error: null }));
    await queueSend({ rpc } as any, { job_id: "j1" });
    expect(rpc).toHaveBeenCalledWith("pgmq_send", { p_msg: { job_id: "j1" } });
  });

  it("queueRead maps rows to {msgId, message}", async () => {
    const rpc = vi.fn(async () => ({
      data: [{ msg_id: 7, message: { job_id: "j1" } }],
      error: null,
    }));
    const rows = await queueRead({ rpc } as any, 5, 60);
    expect(rpc).toHaveBeenCalledWith("pgmq_read", { p_qty: 5, p_vt: 60 });
    expect(rows).toEqual([{ msgId: 7, message: { job_id: "j1" } }]);
  });

  it("queueDelete calls pgmq_delete", async () => {
    const rpc = vi.fn(async () => ({ data: true, error: null }));
    await queueDelete({ rpc } as any, 7);
    expect(rpc).toHaveBeenCalledWith("pgmq_delete", { p_msg_id: 7 });
  });

  it("throws on rpc error", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: new Error("rpc fail") }));
    await expect(queueSend({ rpc } as any, {})).rejects.toThrow("rpc fail");
  });
});
```

2. - [ ] Run and confirm FAIL:
```bash
pnpm vitest run tests/queue.test.ts
```
Expected: module-not-found failure.

3. - [ ] Create `lib/queue.ts`:
```ts
import type { SupabaseClient } from "@supabase/supabase-js";

export async function queueSend(sb: SupabaseClient, msg: Record<string, unknown>): Promise<void> {
  const { error } = await sb.rpc("pgmq_send", { p_msg: msg });
  if (error) throw error;
}

export async function queueRead(
  sb: SupabaseClient,
  qty: number,
  vt: number,
): Promise<{ msgId: number; message: any }[]> {
  const { data, error } = await sb.rpc("pgmq_read", { p_qty: qty, p_vt: vt });
  if (error) throw error;
  return (data ?? []).map((r: { msg_id: number; message: any }) => ({
    msgId: r.msg_id,
    message: r.message,
  }));
}

export async function queueDelete(sb: SupabaseClient, msgId: number): Promise<void> {
  const { error } = await sb.rpc("pgmq_delete", { p_msg_id: msgId });
  if (error) throw error;
}
```

4. - [ ] Re-run and confirm PASS:
```bash
pnpm vitest run tests/queue.test.ts
```
Expected: `4 passed`.

5. - [ ] Commit:
```bash
git add lib/queue.ts tests/queue.test.ts
git commit -m "$(printf 'feat: add pgmq RPC wrappers (send/read/delete)\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 2.6 — Client selfie validate + resize (`lib/image-client.ts`)

**Files:**
- Create: `lib/image-client.ts`
- Test: `tests/image-client.test.ts`

**Interfaces:**
- Produces:
  - `MAX_SELFIE_BYTES = 10 * 1024 * 1024`, `MAX_SELFIE_DIM = 2048`, `ALLOWED_MIME = ["image/jpeg","image/png","image/webp"]`, `MAX_SELFIE_COUNT = 3`
  - `type SelfieValidation = { ok: true } | { ok: false; reason: string }`
  - `validateSelfieFile(file: { type: string; size: number }): SelfieValidation` (pure; usable server-side too)
  - `resizeSelfie(file: File): Promise<Blob>` (browser canvas; not unit-tested)

> Note: do **not** add `"use client"` at the top — `validateSelfieFile` is reused by the server producer (Task 2.10). `resizeSelfie` only runs in the browser.

**Steps:**

1. - [ ] Write failing `tests/image-client.test.ts`:
```ts
// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  validateSelfieFile,
  MAX_SELFIE_BYTES,
  MAX_SELFIE_COUNT,
  ALLOWED_MIME,
} from "@/lib/image-client";

describe("validateSelfieFile", () => {
  it("accepts a small png", () => {
    expect(validateSelfieFile({ type: "image/png", size: 1000 })).toEqual({ ok: true });
  });

  it("rejects unsupported mime", () => {
    const r = validateSelfieFile({ type: "image/gif", size: 1000 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("형식");
  });

  it("rejects oversize files", () => {
    const r = validateSelfieFile({ type: "image/png", size: MAX_SELFIE_BYTES + 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("10MB");
  });

  it("exposes constants", () => {
    expect(MAX_SELFIE_COUNT).toBe(3);
    expect(ALLOWED_MIME).toContain("image/webp");
  });
});
```

2. - [ ] Run and confirm FAIL:
```bash
pnpm vitest run tests/image-client.test.ts
```
Expected: module-not-found failure.

3. - [ ] Create `lib/image-client.ts`:
```ts
export const MAX_SELFIE_BYTES = 10 * 1024 * 1024; // 10MB
export const MAX_SELFIE_DIM = 2048;
export const MAX_SELFIE_COUNT = 3;
export const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"] as const;

export type SelfieValidation = { ok: true } | { ok: false; reason: string };

export function validateSelfieFile(file: { type: string; size: number }): SelfieValidation {
  if (!(ALLOWED_MIME as readonly string[]).includes(file.type)) {
    return { ok: false, reason: "지원하지 않는 형식입니다 (JPG/PNG/WEBP)" };
  }
  if (file.size > MAX_SELFIE_BYTES) {
    return { ok: false, reason: "파일이 너무 큽니다 (최대 10MB)" };
  }
  return { ok: true };
}

// Browser-only: downscale longest edge to MAX_SELFIE_DIM and re-encode as PNG.
export async function resizeSelfie(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SELFIE_DIM / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d context unavailable");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))), "image/png");
  });
}
```

4. - [ ] Re-run and confirm PASS:
```bash
pnpm vitest run tests/image-client.test.ts
```
Expected: `4 passed`.

5. - [ ] Commit:
```bash
git add lib/image-client.ts tests/image-client.test.ts
git commit -m "$(printf 'feat: add client selfie validation + canvas resize helpers\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 2.7 — Model layer types + `ModerationBlockedError` (`lib/models/types.ts`)

**Files:**
- Create: `lib/models/types.ts`
- Test: `tests/models-types.test.ts`

**Interfaces:**
- Consumes: `StylePreset` from `@/types/db`.
- Produces:
  - `type GenInput = { selfies: Uint8Array[]; preset: StylePreset }`
  - `type GenOutput = { bytes: Uint8Array; mime: string; width: number; height: number }`
  - `class ModerationBlockedError extends Error`

**Steps:**

1. - [ ] Write failing `tests/models-types.test.ts`:
```ts
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { ModerationBlockedError } from "@/lib/models/types";

describe("ModerationBlockedError", () => {
  it("is an Error with the right name", () => {
    const e = new ModerationBlockedError("blocked");
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(ModerationBlockedError);
    expect(e.name).toBe("ModerationBlockedError");
    expect(e.message).toBe("blocked");
  });

  it("has a default message", () => {
    expect(new ModerationBlockedError().message).toBe("moderation blocked");
  });
});
```

2. - [ ] Run and confirm FAIL:
```bash
pnpm vitest run tests/models-types.test.ts
```
Expected: module-not-found failure.

3. - [ ] Create `lib/models/types.ts`:
```ts
import type { StylePreset } from "@/types/db";

export type GenInput = { selfies: Uint8Array[]; preset: StylePreset };

export type GenOutput = { bytes: Uint8Array; mime: string; width: number; height: number };

export class ModerationBlockedError extends Error {
  constructor(message = "moderation blocked") {
    super(message);
    this.name = "ModerationBlockedError";
  }
}
```

4. - [ ] Re-run and confirm PASS:
```bash
pnpm vitest run tests/models-types.test.ts
```
Expected: `2 passed`.

5. - [ ] Commit:
```bash
git add lib/models/types.ts tests/models-types.test.ts
git commit -m "$(printf 'feat: add model-layer types and ModerationBlockedError\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 2.8 — OpenAI edit provider (`lib/models/openai.ts`)

**Files:**
- Create: `lib/models/openai.ts`
- Test: `tests/models-openai.test.ts`
- Modify: `package.json` (add `openai`)

**Interfaces:**
- Consumes: `GenInput`, `GenOutput`, `ModerationBlockedError` from `./types`; `openai` SDK + `toFile` from `openai/uploads`.
- Produces: `openaiEdit(input: GenInput): Promise<GenOutput>`.

**Steps:**

1. - [ ] Install the SDK:
```bash
pnpm add openai
```

2. - [ ] Write failing `tests/models-openai.test.ts`:
```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const editMock = vi.fn();
vi.mock("openai", () => ({
  default: class {
    images = { edit: editMock };
  },
}));
vi.mock("openai/uploads", () => ({
  toFile: vi.fn(async (b: Uint8Array, name: string, opts: { type: string }) => ({
    name,
    type: opts.type,
    _bytes: b,
  })),
}));

import { openaiEdit } from "@/lib/models/openai";
import { ModerationBlockedError } from "@/lib/models/types";

const preset: any = {
  id: "p1",
  model_key: "gpt-image-2",
  prompt_template: "studio headshot",
  size: "1024x1536",
  quality: "high",
};

beforeEach(() => editMock.mockReset());

describe("openaiEdit", () => {
  it("sends image[], size, quality, moderation:auto, n:1 and decodes b64", async () => {
    const png = Buffer.from("PNGDATA").toString("base64");
    editMock.mockResolvedValue({ data: [{ b64_json: png }] });

    const out = await openaiEdit({
      selfies: [new Uint8Array([1]), new Uint8Array([2])],
      preset,
    });

    expect(editMock).toHaveBeenCalledTimes(1);
    const arg = editMock.mock.calls[0][0];
    expect(arg.model).toBe("gpt-image-2");
    expect(arg.prompt).toBe("studio headshot");
    expect(arg.size).toBe("1024x1536");
    expect(arg.quality).toBe("high");
    expect(arg.moderation).toBe("auto");
    expect(arg.n).toBe(1);
    expect(Array.isArray(arg.image)).toBe(true);
    expect(arg.image).toHaveLength(2);

    expect(out.mime).toBe("image/png");
    expect(out.width).toBe(1024);
    expect(out.height).toBe(1536);
    expect(Buffer.from(out.bytes).toString()).toBe("PNGDATA");
  });

  it("throws ModerationBlockedError when no image returned", async () => {
    editMock.mockResolvedValue({ data: [{}] });
    await expect(openaiEdit({ selfies: [new Uint8Array([1])], preset })).rejects.toBeInstanceOf(
      ModerationBlockedError,
    );
  });
});
```

3. - [ ] Run and confirm FAIL:
```bash
pnpm vitest run tests/models-openai.test.ts
```
Expected: module-not-found failure.

4. - [ ] Create `lib/models/openai.ts`:
```ts
import OpenAI from "openai";
import { toFile } from "openai/uploads";
import type { GenInput, GenOutput } from "./types";
import { ModerationBlockedError } from "./types";

const client = new OpenAI();

export async function openaiEdit(input: GenInput): Promise<GenOutput> {
  const { selfies, preset } = input;

  const image = await Promise.all(
    selfies.map((b, i) => toFile(b, `s${i}.png`, { type: "image/png" })),
  );

  const result = await client.images.edit({
    model: preset.model_key,
    image,
    prompt: preset.prompt_template,
    size: preset.size as "1024x1536",
    quality: preset.quality as "high",
    moderation: "auto",
    n: 1,
  });

  const b64 = result.data?.[0]?.b64_json;
  if (!b64) throw new ModerationBlockedError("openai: no image returned");

  const bytes = new Uint8Array(Buffer.from(b64, "base64"));
  const [w, h] = preset.size.split("x").map((n) => Number(n));
  return { bytes, mime: "image/png", width: w || 0, height: h || 0 };
}
```

5. - [ ] Re-run and confirm PASS:
```bash
pnpm vitest run tests/models-openai.test.ts
```
Expected: `2 passed`.

6. - [ ] Commit:
```bash
git add lib/models/openai.ts tests/models-openai.test.ts package.json pnpm-lock.yaml
git commit -m "$(printf 'feat: add OpenAI images.edit provider (face-preserving)\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 2.9 — Gemini provider via AI Gateway (`lib/models/gemini.ts`)

**Files:**
- Create: `lib/models/gemini.ts`
- Test: `tests/models-gemini.test.ts`
- Modify: `package.json` (add `ai`)

**Interfaces:**
- Consumes: `GenInput`, `GenOutput`, `ModerationBlockedError` from `./types`; `generateText` from `ai` (auth via `AI_GATEWAY_API_KEY`).
- Produces: `geminiGenerate(input: GenInput): Promise<GenOutput>`.

**Steps:**

1. - [ ] Install the AI SDK:
```bash
pnpm add ai
```

2. - [ ] Write failing `tests/models-gemini.test.ts`:
```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const generateTextMock = vi.fn();
vi.mock("ai", () => ({ generateText: (...a: any[]) => generateTextMock(...a) }));

import { geminiGenerate } from "@/lib/models/gemini";
import { ModerationBlockedError } from "@/lib/models/types";

const preset: any = {
  id: "p2",
  model_key: "google/gemini-3-pro-image",
  prompt_template: "cinematic portrait",
  size: "2K",
  quality: "high",
};

beforeEach(() => generateTextMock.mockReset());

describe("geminiGenerate", () => {
  it("builds text+image message parts and imageConfig, reads files", async () => {
    const bytes = new Uint8Array([5, 6, 7]);
    generateTextMock.mockResolvedValue({
      files: [{ mediaType: "image/png", uint8Array: bytes }],
    });

    const out = await geminiGenerate({
      selfies: [new Uint8Array([1]), new Uint8Array([2])],
      preset,
    });

    const arg = generateTextMock.mock.calls[0][0];
    expect(arg.model).toBe("google/gemini-3-pro-image");
    const content = arg.messages[0].content;
    expect(content[0]).toEqual({ type: "text", text: "cinematic portrait" });
    expect(content[1]).toEqual({ type: "image", image: new Uint8Array([1]) });
    expect(content).toHaveLength(3);
    expect(arg.providerOptions.google.imageConfig).toEqual({ aspectRatio: "4:5", imageSize: "2K" });

    expect(out.mime).toBe("image/png");
    expect(Array.from(out.bytes)).toEqual([5, 6, 7]);
  });

  it("throws ModerationBlockedError on empty/blocked output", async () => {
    generateTextMock.mockResolvedValue({ files: [] });
    await expect(geminiGenerate({ selfies: [new Uint8Array([1])], preset })).rejects.toBeInstanceOf(
      ModerationBlockedError,
    );
  });
});
```

3. - [ ] Run and confirm FAIL:
```bash
pnpm vitest run tests/models-gemini.test.ts
```
Expected: module-not-found failure.

4. - [ ] Create `lib/models/gemini.ts`:
```ts
import { generateText } from "ai";
import type { GenInput, GenOutput } from "./types";
import { ModerationBlockedError } from "./types";

export async function geminiGenerate(input: GenInput): Promise<GenOutput> {
  const { selfies, preset } = input;

  const result = await generateText({
    model: preset.model_key,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: preset.prompt_template },
          ...selfies.map((b) => ({ type: "image" as const, image: b })),
        ],
      },
    ],
    providerOptions: {
      google: { imageConfig: { aspectRatio: "4:5", imageSize: preset.size } },
    },
  });

  const file = (result.files ?? []).find((f: { mediaType: string }) =>
    f.mediaType.startsWith("image/"),
  );
  if (!file) throw new ModerationBlockedError("gemini: blocked or empty response");

  // Gemini does not return pixel dims; the worker recomputes via sharp.metadata().
  return { bytes: new Uint8Array(file.uint8Array), mime: file.mediaType, width: 0, height: 0 };
}
```

5. - [ ] Re-run and confirm PASS:
```bash
pnpm vitest run tests/models-gemini.test.ts
```
Expected: `2 passed`.

6. - [ ] Commit:
```bash
git add lib/models/gemini.ts tests/models-gemini.test.ts package.json pnpm-lock.yaml
git commit -m "$(printf 'feat: add Gemini multi-reference provider via AI Gateway\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 2.10 — Model router (`lib/models/router.ts`)

**Files:**
- Create: `lib/models/router.ts`
- Test: `tests/models-router.test.ts`

**Interfaces:**
- Consumes: `openaiEdit` (`./openai`), `geminiGenerate` (`./gemini`), `GenInput`/`GenOutput` (`./types`).
- Produces: `generateImage(input: GenInput): Promise<GenOutput>` — switch on `input.preset.model_key`.

**Steps:**

1. - [ ] Write failing `tests/models-router.test.ts`:
```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const openaiMock = vi.fn();
const geminiMock = vi.fn();
vi.mock("@/lib/models/openai", () => ({ openaiEdit: (...a: any[]) => openaiMock(...a) }));
vi.mock("@/lib/models/gemini", () => ({ geminiGenerate: (...a: any[]) => geminiMock(...a) }));

import { generateImage } from "@/lib/models/router";

const out = { bytes: new Uint8Array([1]), mime: "image/png", width: 1, height: 1 };

beforeEach(() => {
  openaiMock.mockReset().mockResolvedValue(out);
  geminiMock.mockReset().mockResolvedValue(out);
});

describe("generateImage", () => {
  it("routes gpt-image-* to openaiEdit", async () => {
    await generateImage({ selfies: [], preset: { model_key: "gpt-image-2" } as any });
    expect(openaiMock).toHaveBeenCalledTimes(1);
    expect(geminiMock).not.toHaveBeenCalled();
  });

  it("routes gpt-image-1-mini to openaiEdit", async () => {
    await generateImage({ selfies: [], preset: { model_key: "gpt-image-1-mini" } as any });
    expect(openaiMock).toHaveBeenCalledTimes(1);
  });

  it("routes openai/* to openaiEdit", async () => {
    await generateImage({ selfies: [], preset: { model_key: "openai/gpt-image-2" } as any });
    expect(openaiMock).toHaveBeenCalledTimes(1);
    expect(geminiMock).not.toHaveBeenCalled();
  });

  it("routes google/* (gemini-3-pro-image) to geminiGenerate", async () => {
    await generateImage({ selfies: [], preset: { model_key: "google/gemini-3-pro-image" } as any });
    expect(geminiMock).toHaveBeenCalledTimes(1);
    expect(openaiMock).not.toHaveBeenCalled();
  });

  it("throws on unknown model_key", async () => {
    await expect(
      generateImage({ selfies: [], preset: { model_key: "mystery" } as any }),
    ).rejects.toThrow(/unknown model_key/);
  });
});
```

2. - [ ] Run and confirm FAIL:
```bash
pnpm vitest run tests/models-router.test.ts
```
Expected: module-not-found failure.

3. - [ ] Create `lib/models/router.ts`:
```ts
import type { GenInput, GenOutput } from "./types";
import { openaiEdit } from "./openai";
import { geminiGenerate } from "./gemini";

export async function generateImage(input: GenInput): Promise<GenOutput> {
  const key = input.preset.model_key;
  if (key.startsWith("google/")) return geminiGenerate(input);
  if (key.startsWith("gpt-image") || key.startsWith("openai/")) return openaiEdit(input);
  throw new Error(`unknown model_key: ${key}`);
}
```

4. - [ ] Re-run and confirm PASS:
```bash
pnpm vitest run tests/models-router.test.ts
```
Expected: `5 passed`.

5. - [ ] Commit:
```bash
git add lib/models/router.ts tests/models-router.test.ts
git commit -m "$(printf 'feat: add model router switching on model_key\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 2.11 — Watermark + 1K downscale (`lib/watermark.ts`)

**Files:**
- Create: `lib/watermark.ts`
- Test: `tests/watermark.test.ts`
- Modify: `package.json` (add `sharp`)

**Interfaces:**
- Produces: `applyWatermark(bytes: Uint8Array, opts?: { label?: string }): Promise<Uint8Array>` — downscale longest edge to 1024 and composite a visible "AI 생성" label band.

**Steps:**

1. - [ ] Install sharp:
```bash
pnpm add sharp
```

2. - [ ] Write failing `tests/watermark.test.ts` (uses real sharp):
```ts
// @vitest-environment node
import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { applyWatermark } from "@/lib/watermark";

async function makePng(w: number, h: number): Promise<Uint8Array> {
  const buf = await sharp({
    create: { width: w, height: h, channels: 3, background: { r: 120, g: 120, b: 120 } },
  })
    .png()
    .toBuffer();
  return new Uint8Array(buf);
}

describe("applyWatermark", () => {
  it("downscales a 3000px image so the longest edge is <= 1024", async () => {
    const src = await makePng(3000, 1500);
    const out = await applyWatermark(src);
    const meta = await sharp(Buffer.from(out)).metadata();
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(1024);
    expect(meta.format).toBe("png");
  });

  it("does not enlarge a small image", async () => {
    const src = await makePng(400, 400);
    const out = await applyWatermark(src, { label: "AI 생성" });
    const meta = await sharp(Buffer.from(out)).metadata();
    expect(meta.width).toBe(400);
    expect(meta.height).toBe(400);
  });

  it("returns a non-empty valid PNG", async () => {
    const src = await makePng(800, 600);
    const out = await applyWatermark(src);
    expect(out.byteLength).toBeGreaterThan(100);
  });
});
```

3. - [ ] Run and confirm FAIL:
```bash
pnpm vitest run tests/watermark.test.ts
```
Expected: module-not-found failure.

4. - [ ] Create `lib/watermark.ts`:
```ts
import sharp from "sharp";

export async function applyWatermark(
  bytes: Uint8Array,
  opts?: { label?: string },
): Promise<Uint8Array> {
  const label = opts?.label ?? "AI 생성";

  // 1) downscale longest edge to 1024 (never enlarge)
  const resized = await sharp(Buffer.from(bytes))
    .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();

  const meta = await sharp(resized).metadata();
  const w = meta.width ?? 1024;
  const h = meta.height ?? 1024;
  const band = Math.max(40, Math.round(h * 0.07));
  const fontSize = Math.round(band * 0.55);

  // 2) composite a visible label band (인공지능기본법: human-perceptible AI label)
  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="${h - band}" width="${w}" height="${band}" fill="rgba(0,0,0,0.45)"/>
  <text x="${Math.round(band * 0.4)}" y="${h - Math.round(band * 0.32)}"
        font-family="sans-serif" font-size="${fontSize}" fill="#ffffff">${label}</text>
</svg>`;

  const out = await sharp(resized)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png()
    .toBuffer();

  return new Uint8Array(out);
}
```

5. - [ ] Re-run and confirm PASS:
```bash
pnpm vitest run tests/watermark.test.ts
```
Expected: `3 passed`.

6. - [ ] Commit:
```bash
git add lib/watermark.ts tests/watermark.test.ts package.json pnpm-lock.yaml
git commit -m "$(printf 'feat: add 1K downscale + visible AI-label watermark (sharp)\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 2.12 — Producer route `/api/generate` (auth + consent + hold + enqueue)

**Files:**
- Create: `app/api/generate/route.ts`
- Test: `tests/generate-route.test.ts`

**Interfaces:**
- Consumes:
  - `createServerSupabase()` (auth + consent + age read), `createServiceSupabase()` (holds + writes + queue).
  - `validateSelfieFile`, `MAX_SELFIE_COUNT` (`@/lib/image-client`).
  - `uploadObject`, `BUCKET_SELFIES` (`@/lib/storage`).
  - `hasRequiredConsents` (`@/lib/consent`) — the canonical `REQUIRED_CONSENTS` (incl. `"tos"`) live there; do NOT redefine locally.
  - `profiles.age_verified` (cookie client read) — age gate (spec §9, 만 14세 미만 차단).
  - `debitCredits(sb,{user_id,amount,job_id})`, `refundHold(sb,{user_id,amount,job_id})` (`@/lib/credits`).
  - `insertJobs(sb, jobs: NewJob[])` (`@/lib/db`).
  - `queueSend(sb, msg)` (`@/lib/queue`).
  - `StylePreset` row read from `style_presets`.
- Produces: `POST(req): Response` → `202 { batchId, jobIds }`; `401` no auth; `403` missing consent (incl. `tos`) OR unverified age; `400` bad input/preset; `402` insufficient credits (with held rows rolled back).

**Steps:**

1. - [ ] Write failing `tests/generate-route.test.ts`:
```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const getUser = vi.fn();
const consentSelect = vi.fn();
const profileSingle = vi.fn();
const presetSingle = vi.fn();

// NOTE: @/lib/consent is NOT mocked — the route must consume the REAL
// REQUIRED_CONSENTS (incl. "tos") + hasRequiredConsents() from Phase 1.

// cookie-bound client: auth + consents + profiles (age) + style_presets reads
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: () => ({
    auth: { getUser },
    from: (table: string) => {
      if (table === "consents") {
        return { select: () => ({ eq: () => consentSelect() }) };
      }
      if (table === "profiles") {
        return { select: () => ({ eq: () => ({ single: () => profileSingle() }) }) };
      }
      // style_presets
      return { select: () => ({ eq: () => ({ eq: () => ({ single: () => presetSingle() }) }) }) };
    },
  }),
}));

const svc = { _tag: "svc" };
vi.mock("@/lib/supabase/service", () => ({ createServiceSupabase: () => svc }));

const debitCredits = vi.fn();
const refundHold = vi.fn();
vi.mock("@/lib/credits", () => ({
  debitCredits: (...a: any[]) => debitCredits(...a),
  refundHold: (...a: any[]) => refundHold(...a),
}));

const insertJobs = vi.fn();
vi.mock("@/lib/db", () => ({ insertJobs: (...a: any[]) => insertJobs(...a) }));

const uploadObject = vi.fn();
vi.mock("@/lib/storage", () => ({
  uploadObject: (...a: any[]) => uploadObject(...a),
  BUCKET_SELFIES: "selfies",
}));

const queueSend = vi.fn();
vi.mock("@/lib/queue", () => ({ queueSend: (...a: any[]) => queueSend(...a) }));

import { POST } from "@/app/api/generate/route";

const USER = { id: "11111111-1111-1111-1111-111111111111" };
const PRESET = {
  id: "biz_headshot",
  family: "business",
  model_key: "gpt-image-2",
  prompt_template: "x",
  size: "1024x1536",
  quality: "high",
  credit_cost: 1,
  is_active: true,
};

function buildReq(count: number, files = 1) {
  const fd = new FormData();
  fd.set("styleId", "biz_headshot");
  fd.set("count", String(count));
  for (let i = 0; i < files; i++) {
    fd.append("selfies", new File([new Uint8Array([1, 2, 3])], `s${i}.png`, { type: "image/png" }));
  }
  return new Request("http://t/api/generate", { method: "POST", body: fd });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn(async () => new Response("ok")));
  process.env.APP_BASE_URL = "http://t";
  process.env.CRON_SECRET = "secret";
  getUser.mockResolvedValue({ data: { user: USER }, error: null });
  consentSelect.mockResolvedValue({
    data: [{ type: "tos" }, { type: "privacy" }, { type: "sensitive_face" }, { type: "own_face" }],
    error: null,
  });
  profileSingle.mockResolvedValue({ data: { age_verified: true }, error: null });
  presetSingle.mockResolvedValue({ data: PRESET, error: null });
  uploadObject.mockResolvedValue(undefined);
  debitCredits.mockImplementation(async () => 100 + Math.floor(Math.random() * 1000));
  insertJobs.mockImplementation(async (_sb: any, jobs: any[]) => jobs);
  queueSend.mockResolvedValue(undefined);
});

describe("POST /api/generate", () => {
  it("holds N credits, inserts N jobs, enqueues N messages, returns 202", async () => {
    const res = await POST(buildReq(3));
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.batchId).toBeTruthy();
    expect(body.jobIds).toHaveLength(3);
    expect(debitCredits).toHaveBeenCalledTimes(3);
    expect(insertJobs).toHaveBeenCalledTimes(1);
    const jobsArg = insertJobs.mock.calls[0][1];
    expect(jobsArg).toHaveLength(3);
    expect(jobsArg[0]).toMatchObject({
      user_id: USER.id,
      style_preset_id: "biz_headshot",
      model_key: "gpt-image-2",
      status: "queued",
      is_watermarked: false,
    });
    expect(jobsArg[0].hold_ledger_id).toBeTypeOf("number");
    expect(queueSend).toHaveBeenCalledTimes(3);
    // non-awaited worker kick
    expect((globalThis.fetch as any)).toHaveBeenCalledWith(
      "http://t/api/jobs/worker",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("returns 401 when unauthenticated", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const res = await POST(buildReq(1));
    expect(res.status).toBe(401);
  });

  it("returns 403 when a required consent is missing", async () => {
    consentSelect.mockResolvedValue({ data: [{ type: "privacy" }], error: null });
    const res = await POST(buildReq(1));
    expect(res.status).toBe(403);
    expect(debitCredits).not.toHaveBeenCalled();
  });

  it("treats 'tos' as required (missing tos → 403)", async () => {
    // all consents present EXCEPT "tos" → must still fail
    consentSelect.mockResolvedValue({
      data: [{ type: "privacy" }, { type: "sensitive_face" }, { type: "own_face" }],
      error: null,
    });
    const res = await POST(buildReq(1));
    expect(res.status).toBe(403);
    expect(debitCredits).not.toHaveBeenCalled();
  });

  it("returns 403 when age is not verified (before any hold/enqueue)", async () => {
    profileSingle.mockResolvedValue({ data: { age_verified: false }, error: null });
    const res = await POST(buildReq(1));
    expect(res.status).toBe(403);
    expect(debitCredits).not.toHaveBeenCalled();
    expect(insertJobs).not.toHaveBeenCalled();
    expect(queueSend).not.toHaveBeenCalled();
  });

  it("returns 400 for count out of range", async () => {
    const res = await POST(buildReq(9));
    expect(res.status).toBe(400);
  });

  it("rolls back holds and returns 402 on insufficient credits", async () => {
    debitCredits.mockReset();
    debitCredits.mockResolvedValueOnce(501).mockRejectedValueOnce(new Error("INSUFFICIENT_CREDITS"));
    const res = await POST(buildReq(2));
    expect(res.status).toBe(402);
    expect(refundHold).toHaveBeenCalledTimes(1); // one successful hold rolled back
    expect(insertJobs).not.toHaveBeenCalled();
    expect(queueSend).not.toHaveBeenCalled();
  });

  it("marks free-family presets as watermarked", async () => {
    presetSingle.mockResolvedValue({
      data: { ...PRESET, family: "free", model_key: "gpt-image-1-mini" },
      error: null,
    });
    const res = await POST(buildReq(1));
    expect(res.status).toBe(202);
    const jobsArg = insertJobs.mock.calls[0][1];
    expect(jobsArg[0].is_watermarked).toBe(true);
  });
});
```

2. - [ ] Run and confirm FAIL:
```bash
pnpm vitest run tests/generate-route.test.ts
```
Expected: module-not-found failure.

3. - [ ] Create `app/api/generate/route.ts`:
```ts
import { createServerSupabase } from "@/lib/supabase/server";
import { createServiceSupabase } from "@/lib/supabase/service";
import { validateSelfieFile, MAX_SELFIE_COUNT } from "@/lib/image-client";
import { uploadObject, BUCKET_SELFIES } from "@/lib/storage";
import { debitCredits, refundHold } from "@/lib/credits";
import { insertJobs } from "@/lib/db";
import { queueSend } from "@/lib/queue";
import { hasRequiredConsents } from "@/lib/consent";
import type { StylePreset } from "@/types/db";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  const server = await createServerSupabase();

  // 1) auth
  const { data: auth } = await server.auth.getUser();
  const user = auth?.user;
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  // 2) consent gate — REQUIRED_CONSENTS (incl. "tos") + hasRequiredConsents()
  //    are the canonical contract in @/lib/consent (Phase 1). Never redefine here.
  const { data: consentRows } = await server.from("consents").select("type").eq("user_id", user.id);
  const have = (consentRows ?? []).map((c: { type: string }) => c.type);
  if (!hasRequiredConsents(have)) {
    return Response.json({ error: "consent_required" }, { status: 403 });
  }

  // 3) age gate (spec §9, 만 14세 미만 차단) — must pass BEFORE any hold/enqueue
  const { data: profile } = await server
    .from("profiles")
    .select("age_verified")
    .eq("id", user.id)
    .single();
  if (!profile?.age_verified) {
    return Response.json({ error: "age_verification_required" }, { status: 403 });
  }

  // 4) parse + validate input
  const form = await req.formData();
  const styleId = String(form.get("styleId") ?? "");
  const count = Number(form.get("count") ?? 0);
  const files = form.getAll("selfies").filter((f): f is File => f instanceof File);

  if (!styleId) return Response.json({ error: "styleId required" }, { status: 400 });
  if (!Number.isInteger(count) || count < 1 || count > 4) {
    return Response.json({ error: "count must be 1..4" }, { status: 400 });
  }
  if (files.length < 1 || files.length > MAX_SELFIE_COUNT) {
    return Response.json({ error: `1..${MAX_SELFIE_COUNT} selfies required` }, { status: 400 });
  }
  for (const f of files) {
    const v = validateSelfieFile({ type: f.type, size: f.size });
    if (!v.ok) return Response.json({ error: v.reason }, { status: 400 });
  }

  // 5) load active preset (cookie client → RLS allows reading active presets)
  const { data: presetRow } = await server
    .from("style_presets")
    .select("*")
    .eq("id", styleId)
    .eq("is_active", true)
    .single();
  const preset = presetRow as StylePreset | null;
  if (!preset) return Response.json({ error: "unknown style" }, { status: 400 });

  const svc = createServiceSupabase();
  const batchId = crypto.randomUUID();
  const isWatermarked = preset.family === "free";

  // 6) upload selfies → private bucket, record source_selfie assets (purged immediately
  //    by the worker once the batch completes; expire cron backstops orphans)
  const selfiePaths: string[] = [];
  const deleteAfter = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  for (let i = 0; i < files.length; i++) {
    const path = `${user.id}/${batchId}/${i}.png`;
    const bytes = new Uint8Array(await files[i].arrayBuffer());
    await uploadObject(svc, BUCKET_SELFIES, path, bytes, files[i].type || "image/png");
    selfiePaths.push(path);
    await svc.from("assets").insert({
      job_id: null,
      user_id: user.id,
      storage_path: path,
      kind: "source_selfie",
      mime: files[i].type || "image/png",
      delete_after: deleteAfter,
    });
  }

  // 7) hold credits (1 row per job). Roll back all holds if any debit fails.
  const jobIds = Array.from({ length: count }, () => crypto.randomUUID());
  const held: { jobId: string; ledgerId: number }[] = [];
  try {
    for (const jobId of jobIds) {
      const ledgerId = await debitCredits(svc, {
        user_id: user.id,
        amount: preset.credit_cost,
        job_id: jobId,
      });
      held.push({ jobId, ledgerId });
    }
  } catch {
    for (const h of held) {
      await refundHold(svc, { user_id: user.id, amount: preset.credit_cost, job_id: h.jobId });
    }
    return Response.json({ error: "insufficient_credits" }, { status: 402 });
  }

  // 8) insert N queued jobs carrying their hold ledger id
  await insertJobs(
    svc,
    held.map((h) => ({
      id: h.jobId,
      user_id: user.id,
      batch_id: batchId,
      style_preset_id: preset.id,
      model_key: preset.model_key,
      status: "queued" as const,
      is_watermarked: isWatermarked,
      hold_ledger_id: h.ledgerId,
    })),
  );

  // 9) enqueue one message per job (idempotency key = job_id)
  for (const jobId of jobIds) {
    await queueSend(svc, { job_id: jobId, selfie_paths: selfiePaths });
  }

  // 10) non-awaited kick to the worker (best-effort; cron also drains the queue)
  void fetch(`${process.env.APP_BASE_URL}/api/jobs/worker`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
  }).catch(() => {});

  return Response.json({ batchId, jobIds }, { status: 202 });
}
```

4. - [ ] Re-run and confirm PASS:
```bash
pnpm vitest run tests/generate-route.test.ts
```
Expected: `8 passed`.

5. - [ ] Commit:
```bash
git add app/api/generate/route.ts tests/generate-route.test.ts
git commit -m "$(printf 'feat: add /api/generate producer with consent gate + credit hold + enqueue\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 2.13 — Worker route `/api/jobs/worker` (status guard + generate + refund)

**Files:**
- Create: `app/api/jobs/worker/route.ts`
- Test: `tests/worker-route.test.ts`

**Interfaces:**
- Consumes:
  - `createServiceSupabase()`; `queueRead`, `queueDelete` (`@/lib/queue`).
  - `getJob`, `setJobStatus`, `insertAsset` (`@/lib/db`).
  - `refundHold` (`@/lib/credits`).
  - `createSignedUrl`, `uploadObject`, `removeObjects`, `BUCKET_SELFIES`, `BUCKET_OUTPUTS` (`@/lib/storage`).
  - `generateImage` (`@/lib/models/router`), `ModerationBlockedError` (`@/lib/models/types`), `applyWatermark` (`@/lib/watermark`), `sharp` for dims.
  - `StylePreset`, `GenerationJob` (`@/types/db`).
- Produces: `POST(req): Response` (CRON_SECRET-guarded, `export const maxDuration = 300`). Drains up to 5 messages; **status-guard** ensures a paid model call only fires for `queued` jobs. On failure sets a lowercase `error_code` (`moderation_blocked` | `no_image` | `generation_failed`). After a job goes `done`, if no jobs for its `batch_id` remain `queued`/`processing`, immediately purges that batch's `source_selfie` objects (BUCKET_SELFIES) + asset rows (spec §7; the Phase 4 expire cron backstops orphans).

**Steps:**

1. - [ ] Write failing `tests/worker-route.test.ts`:
```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const queueRead = vi.fn();
const queueDelete = vi.fn();
vi.mock("@/lib/queue", () => ({
  queueRead: (...a: any[]) => queueRead(...a),
  queueDelete: (...a: any[]) => queueDelete(...a),
}));

const getJob = vi.fn();
const setJobStatus = vi.fn();
const insertAsset = vi.fn();
vi.mock("@/lib/db", () => ({
  getJob: (...a: any[]) => getJob(...a),
  setJobStatus: (...a: any[]) => setJobStatus(...a),
  insertAsset: (...a: any[]) => insertAsset(...a),
}));

const refundHold = vi.fn();
vi.mock("@/lib/credits", () => ({ refundHold: (...a: any[]) => refundHold(...a) }));

const createSignedUrl = vi.fn();
const uploadObject = vi.fn();
const removeObjects = vi.fn();
vi.mock("@/lib/storage", () => ({
  createSignedUrl: (...a: any[]) => createSignedUrl(...a),
  uploadObject: (...a: any[]) => uploadObject(...a),
  removeObjects: (...a: any[]) => removeObjects(...a),
  BUCKET_SELFIES: "selfies",
  BUCKET_OUTPUTS: "outputs",
}));

const generateImage = vi.fn();
vi.mock("@/lib/models/router", () => ({ generateImage: (...a: any[]) => generateImage(...a) }));

const applyWatermark = vi.fn();
vi.mock("@/lib/watermark", () => ({ applyWatermark: (...a: any[]) => applyWatermark(...a) }));

import { ModerationBlockedError } from "@/lib/models/types";

const presetSingle = vi.fn();
const remainingJobs = vi.fn(); // generation_jobs active-in-batch count query
const deleteSelfieRows = vi.fn(); // assets delete (source_selfie purge)
const svc: any = {
  from: (table: string) => {
    if (table === "generation_jobs") {
      return { select: () => ({ eq: () => ({ in: () => remainingJobs() }) }) };
    }
    if (table === "assets") {
      return { delete: () => ({ eq: () => ({ eq: () => ({ in: () => deleteSelfieRows() }) }) }) };
    }
    // style_presets
    return { select: () => ({ eq: () => ({ single: () => presetSingle() }) }) };
  },
};
vi.mock("@/lib/supabase/service", () => ({ createServiceSupabase: () => svc }));

import { POST } from "@/app/api/jobs/worker/route";

const PRESET = { id: "p1", model_key: "gpt-image-2", prompt_template: "x", size: "1024x1536", quality: "high", credit_cost: 1, family: "business" };

function req() {
  return new Request("http://t/api/jobs/worker", {
    method: "POST",
    headers: { Authorization: "Bearer secret" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "secret";
  vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([1, 2, 3]))));
  presetSingle.mockResolvedValue({ data: PRESET, error: null });
  remainingJobs.mockResolvedValue({ count: 0, error: null });
  deleteSelfieRows.mockResolvedValue({ error: null });
  removeObjects.mockResolvedValue(undefined);
  createSignedUrl.mockResolvedValue("https://signed/selfie");
  generateImage.mockResolvedValue({ bytes: new Uint8Array([9, 9, 9]), mime: "image/png", width: 1024, height: 1536 });
  uploadObject.mockResolvedValue(undefined);
  insertAsset.mockResolvedValue({ id: "asset-1" });
});

describe("POST /api/jobs/worker", () => {
  it("rejects without the cron secret", async () => {
    const res = await POST(new Request("http://t/api/jobs/worker", { method: "POST" }));
    expect(res.status).toBe(401);
  });

  it("processes a queued job: generate → upload → insertAsset → done → ack", async () => {
    queueRead.mockResolvedValue([{ msgId: 1, message: { job_id: "j1", selfie_paths: ["u/b/0.png"] } }]);
    getJob.mockResolvedValue({ id: "j1", user_id: "u", status: "queued", style_preset_id: "p1", is_watermarked: false, batch_id: "b1" });

    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(generateImage).toHaveBeenCalledTimes(1);
    expect(uploadObject).toHaveBeenCalledWith(svc, "outputs", "u/j1.png", expect.any(Uint8Array), "image/png");
    expect(setJobStatus).toHaveBeenCalledWith(svc, "j1", "done", expect.objectContaining({ asset_id: "asset-1" }));
    expect(queueDelete).toHaveBeenCalledWith(svc, 1);
    expect(refundHold).not.toHaveBeenCalled();
  });

  it("IDEMPOTENCY: skips a job already past queued without paying", async () => {
    queueRead.mockResolvedValue([{ msgId: 2, message: { job_id: "jdone", selfie_paths: ["p"] } }]);
    getJob.mockResolvedValue({ id: "jdone", user_id: "u", status: "done", style_preset_id: "p1", is_watermarked: false });

    await POST(req());
    expect(generateImage).not.toHaveBeenCalled();
    expect(setJobStatus).not.toHaveBeenCalled();
    expect(queueDelete).toHaveBeenCalledWith(svc, 2); // still acked
  });

  it("watermarks free jobs and records kind=watermarked", async () => {
    queueRead.mockResolvedValue([{ msgId: 3, message: { job_id: "jf", selfie_paths: ["p"] } }]);
    getJob.mockResolvedValue({ id: "jf", user_id: "u", status: "queued", style_preset_id: "p1", is_watermarked: true });
    applyWatermark.mockResolvedValue(new Uint8Array([7, 7]));

    await POST(req());
    expect(applyWatermark).toHaveBeenCalledWith(expect.any(Uint8Array), { label: "AI 생성" });
    expect(insertAsset).toHaveBeenCalledWith(svc, expect.objectContaining({ kind: "watermarked" }));
  });

  it("REFUND: on ModerationBlockedError refunds hold and marks failed", async () => {
    queueRead.mockResolvedValue([{ msgId: 4, message: { job_id: "jb", selfie_paths: ["p"] } }]);
    getJob.mockResolvedValue({ id: "jb", user_id: "u", status: "queued", style_preset_id: "p1", is_watermarked: false });
    generateImage.mockRejectedValue(new ModerationBlockedError("blocked"));

    await POST(req());
    expect(refundHold).toHaveBeenCalledWith(svc, { user_id: "u", amount: 1, job_id: "jb" });
    expect(setJobStatus).toHaveBeenCalledWith(svc, "jb", "failed", expect.objectContaining({ error_code: "moderation_blocked" }));
    expect(queueDelete).toHaveBeenCalledWith(svc, 4);
  });

  it("ERROR CODES: a structurally-empty result → no_image, refunds + failed", async () => {
    queueRead.mockResolvedValue([{ msgId: 7, message: { job_id: "jn", selfie_paths: ["p"] } }]);
    getJob.mockResolvedValue({ id: "jn", user_id: "u", status: "queued", style_preset_id: "p1", is_watermarked: false, batch_id: "b1" });
    generateImage.mockResolvedValue({ bytes: new Uint8Array([]), mime: "image/png", width: 0, height: 0 });

    await POST(req());
    expect(refundHold).toHaveBeenCalledWith(svc, { user_id: "u", amount: 1, job_id: "jn" });
    expect(setJobStatus).toHaveBeenCalledWith(svc, "jn", "failed", expect.objectContaining({ error_code: "no_image" }));
  });

  it("PURGE: deletes the batch's source selfies once no active jobs remain", async () => {
    queueRead.mockResolvedValue([{ msgId: 5, message: { job_id: "jp", selfie_paths: ["u/b1/0.png", "u/b1/1.png"] } }]);
    getJob.mockResolvedValue({ id: "jp", user_id: "u", status: "queued", style_preset_id: "p1", is_watermarked: false, batch_id: "b1" });
    remainingJobs.mockResolvedValue({ count: 0, error: null });

    await POST(req());
    expect(removeObjects).toHaveBeenCalledWith(svc, "selfies", ["u/b1/0.png", "u/b1/1.png"]);
  });

  it("PURGE: keeps selfies while sibling jobs in the batch are still active", async () => {
    queueRead.mockResolvedValue([{ msgId: 6, message: { job_id: "jp2", selfie_paths: ["u/b1/0.png"] } }]);
    getJob.mockResolvedValue({ id: "jp2", user_id: "u", status: "queued", style_preset_id: "p1", is_watermarked: false, batch_id: "b1" });
    remainingJobs.mockResolvedValue({ count: 2, error: null });

    await POST(req());
    expect(removeObjects).not.toHaveBeenCalled();
  });
});
```

> Note: this suite stubs `generateImage` output bytes; the worker computes asset dims with `sharp` only when not mocked. To keep the unit test sharp-free, the worker derives dims from the `GenOutput.width/height` and only falls back to `sharp.metadata()` when they are `0`. The mocked output supplies `1024×1536`, so `sharp` is not exercised here (it is covered by Task 2.11 and the E2E).

2. - [ ] Run and confirm FAIL:
```bash
pnpm vitest run tests/worker-route.test.ts
```
Expected: module-not-found failure.

3. - [ ] Create `app/api/jobs/worker/route.ts`:
```ts
import sharp from "sharp";
import { createServiceSupabase } from "@/lib/supabase/service";
import { queueRead, queueDelete } from "@/lib/queue";
import { getJob, setJobStatus, insertAsset } from "@/lib/db";
import { refundHold } from "@/lib/credits";
import { createSignedUrl, uploadObject, removeObjects, BUCKET_SELFIES, BUCKET_OUTPUTS } from "@/lib/storage";
import { generateImage } from "@/lib/models/router";
import { ModerationBlockedError } from "@/lib/models/types";
import { applyWatermark } from "@/lib/watermark";
import type { StylePreset } from "@/types/db";

export const runtime = "nodejs";
// Vercel route segment config: give the worker up to 5 minutes per drain
// (set HERE, not via vercel.json). See R-CONFIG.
export const maxDuration = 300;

const BATCH = 5;
const VISIBILITY = 60; // seconds

async function loadPreset(svc: any, id: string): Promise<StylePreset | null> {
  const { data } = await svc.from("style_presets").select("*").eq("id", id).single();
  return (data as StylePreset | null) ?? null;
}

export async function POST(req: Request): Promise<Response> {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("unauthorized", { status: 401 });
  }

  const svc = createServiceSupabase();
  const messages = await queueRead(svc, BATCH, VISIBILITY);
  let processed = 0;

  for (const { msgId, message } of messages) {
    const jobId: string = message.job_id;
    const selfiePaths: string[] = message.selfie_paths ?? [];

    const job = await getJob(svc, jobId);

    // Idempotency: only a queued job may trigger a paid model call.
    if (!job || job.status !== "queued") {
      await queueDelete(svc, msgId);
      continue;
    }

    await setJobStatus(svc, jobId, "processing");

    let amount = 1;
    try {
      const preset = await loadPreset(svc, job.style_preset_id);
      if (!preset) throw new Error("preset_missing");
      amount = preset.credit_cost;

      // load selfies via signed URLs
      const selfies = await Promise.all(
        selfiePaths.map(async (p) => {
          const url = await createSignedUrl(svc, BUCKET_SELFIES, p);
          const r = await fetch(url);
          return new Uint8Array(await r.arrayBuffer());
        }),
      );

      const out = await generateImage({ selfies, preset });

      // structurally-empty (but not blocked) result → no_image error_code
      if (!out.bytes || out.bytes.byteLength === 0) {
        const err = new Error("no image bytes returned");
        (err as { code?: string }).code = "no_image";
        throw err;
      }

      // free-tier: downscale to 1K + visible "AI 생성" label
      let bytes = out.bytes;
      let mime = out.mime;
      let kind: "output" | "watermarked" = "output";
      if (job.is_watermarked) {
        bytes = await applyWatermark(out.bytes, { label: "AI 생성" });
        mime = "image/png";
        kind = "watermarked";
      }

      // authoritative dims (provider may not report them)
      let width = out.width;
      let height = out.height;
      if (!width || !height) {
        const meta = await sharp(Buffer.from(bytes)).metadata();
        width = meta.width ?? 0;
        height = meta.height ?? 0;
      }

      const path = `${job.user_id}/${job.id}.png`;
      await uploadObject(svc, BUCKET_OUTPUTS, path, bytes, mime);

      const asset = await insertAsset(svc, {
        job_id: job.id,
        user_id: job.user_id,
        storage_path: path,
        kind,
        width: width || null,
        height: height || null,
        mime,
        delete_after: null,
      });

      await setJobStatus(svc, job.id, "done", {
        asset_id: asset.id,
        finished_at: new Date().toISOString(),
      });

      // Immediate selfie purge (spec §7): once no jobs for this batch remain
      // queued/processing, delete the batch's source selfies + their asset rows.
      // Best-effort: a purge failure must NOT flip the already-done job to failed
      // (the Phase 4 expire cron backstops orphaned selfies).
      try {
        const { count } = await svc
          .from("generation_jobs")
          .select("id", { count: "exact", head: true })
          .eq("batch_id", job.batch_id)
          .in("status", ["queued", "processing"]);
        if ((count ?? 0) === 0 && selfiePaths.length > 0) {
          await removeObjects(svc, BUCKET_SELFIES, selfiePaths);
          await svc
            .from("assets")
            .delete()
            .eq("user_id", job.user_id)
            .eq("kind", "source_selfie")
            .in("storage_path", selfiePaths);
        }
      } catch {
        // swallow — orphaned selfies are reclaimed by the expire cron
      }
    } catch (e) {
      const error_code =
        e instanceof ModerationBlockedError
          ? "moderation_blocked"
          : (e as { code?: string })?.code === "no_image"
            ? "no_image"
            : "generation_failed";
      await refundHold(svc, { user_id: job.user_id, amount, job_id: job.id });
      await setJobStatus(svc, job.id, "failed", {
        error_code,
        finished_at: new Date().toISOString(),
      });
    } finally {
      await queueDelete(svc, msgId);
      processed++;
    }
  }

  return Response.json({ processed }, { status: 200 });
}
```

4. - [ ] Re-run and confirm PASS:
```bash
pnpm vitest run tests/worker-route.test.ts
```
Expected: `8 passed`.

5. - [ ] Commit:
```bash
git add app/api/jobs/worker/route.ts tests/worker-route.test.ts
git commit -m "$(printf 'feat: add /api/jobs/worker (status-guard, watermark, lowercase error_codes, immediate batch selfie purge, refund-on-fail, maxDuration=300)\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 2.14 — Realtime client hook (`lib/useJobStream.ts`)

**Files:**
- Create: `lib/useJobStream.ts`
- Test: `tests/use-job-stream.test.tsx`

**Interfaces:**
- Consumes: `createBrowserSupabase()` (`@/lib/supabase/browser`); broadcast payload shape `{ record: { status, asset_id, error_code } }`.
- Produces:
  - `type JobStreamState = { status: GenerationJob["status"]; assetId: string | null; errorCode: string | null }`
  - `useJobStream(jobIds: string[], initial: Record<string, JobStreamState>): Record<string, JobStreamState>`

**Steps:**

1. - [ ] Write failing `tests/use-job-stream.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";

let broadcastHandler: ((p: any) => void) | null = null;
const channelObj = {
  on: vi.fn((_type: string, _filter: any, cb: (p: any) => void) => {
    broadcastHandler = cb;
    return channelObj;
  }),
  subscribe: vi.fn(() => channelObj),
};
const removeChannel = vi.fn();
vi.mock("@/lib/supabase/browser", () => ({
  createBrowserSupabase: () => ({ channel: vi.fn(() => channelObj), removeChannel }),
}));

import { useJobStream, type JobStreamState } from "@/lib/useJobStream";

function Probe({ ids, initial }: { ids: string[]; initial: Record<string, JobStreamState> }) {
  const state = useJobStream(ids, initial);
  return <div data-testid="out">{JSON.stringify(state)}</div>;
}

beforeEach(() => {
  broadcastHandler = null;
  vi.clearAllMocks();
});

describe("useJobStream", () => {
  it("subscribes and applies broadcast updates", () => {
    const initial = { j1: { status: "queued", assetId: null, errorCode: null } as JobStreamState };
    const { getByTestId } = render(<Probe ids={["j1"]} initial={initial} />);
    expect(channelObj.subscribe).toHaveBeenCalled();

    act(() => {
      broadcastHandler?.({ payload: { record: { status: "done", asset_id: "a1", error_code: null } } });
    });

    const state = JSON.parse(getByTestId("out").textContent!);
    expect(state.j1.status).toBe("done");
    expect(state.j1.assetId).toBe("a1");
  });
});
```

2. - [ ] Run and confirm FAIL:
```bash
pnpm vitest run tests/use-job-stream.test.tsx
```
Expected: module-not-found failure.

3. - [ ] Create `lib/useJobStream.ts`:
```ts
"use client";

import { useEffect, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import type { GenerationJob } from "@/types/db";

export type JobStreamState = {
  status: GenerationJob["status"];
  assetId: string | null;
  errorCode: string | null;
};

export function useJobStream(
  jobIds: string[],
  initial: Record<string, JobStreamState>,
): Record<string, JobStreamState> {
  const [state, setState] = useState<Record<string, JobStreamState>>(initial);
  const key = JSON.stringify(jobIds);

  useEffect(() => {
    const sb = createBrowserSupabase();
    const channels = jobIds.map((id) =>
      sb
        .channel(`job_${id}`)
        .on("broadcast", { event: "UPDATE" }, (payload: any) => {
          const rec = payload?.payload?.record;
          if (!rec) return;
          setState((s) => ({
            ...s,
            [id]: {
              status: rec.status,
              assetId: rec.asset_id ?? null,
              errorCode: rec.error_code ?? null,
            },
          }));
        })
        .subscribe(),
    );
    return () => {
      channels.forEach((c) => sb.removeChannel(c));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}
```

4. - [ ] Re-run and confirm PASS:
```bash
pnpm vitest run tests/use-job-stream.test.tsx
```
Expected: `1 passed`.

5. - [ ] Commit:
```bash
git add lib/useJobStream.ts tests/use-job-stream.test.tsx
git commit -m "$(printf 'feat: add useJobStream realtime hook for per-job status\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 2.15 — Studio page `/create` (upload + style picker + variations)

**Files:**
- Create: `app/create/page.tsx`

**Interfaces:**
- Consumes: `createBrowserSupabase()`; `validateSelfieFile`, `resizeSelfie`, `MAX_SELFIE_COUNT` (`@/lib/image-client`); `STYLE_FAMILIES` (`@/lib/styles`); `StylePreset` (`@/types/db`); POST `/api/generate`.
- Produces: client page that POSTs `FormData(styleId, count, selfies[])` and navigates to `/result/[batchId]`.

**Steps:**

1. - [ ] Create `app/create/page.tsx` (client page; presets are non-secret, read via browser client):
```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { validateSelfieFile, resizeSelfie, MAX_SELFIE_COUNT } from "@/lib/image-client";
import { STYLE_FAMILIES } from "@/lib/styles";
import type { StylePreset } from "@/types/db";

const FAMILY_LABEL: Record<string, string> = {
  business: "비즈·증명사진",
  editorial: "컨셉 화보",
  sns: "SNS 감성",
  fantasy: "판타지·아트",
};

export default function CreatePage() {
  const router = useRouter();
  const [presets, setPresets] = useState<StylePreset[]>([]);
  const [styleId, setStyleId] = useState<string>("");
  const [count, setCount] = useState<number>(1);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const sb = createBrowserSupabase();
    sb.from("style_presets")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .then(({ data }) => {
        const rows = (data ?? []) as StylePreset[];
        setPresets(rows);
        if (rows[0]) setStyleId(rows[0].id);
      });
  }, []);

  async function onFiles(list: FileList | null) {
    setError(null);
    if (!list) return;
    const picked = Array.from(list).slice(0, MAX_SELFIE_COUNT);
    for (const f of picked) {
      const v = validateSelfieFile({ type: f.type, size: f.size });
      if (!v.ok) {
        setError(v.reason);
        return;
      }
    }
    const resized = await Promise.all(
      picked.map(async (f) => new File([await resizeSelfie(f)], f.name.replace(/\.\w+$/, ".png"), { type: "image/png" })),
    );
    setFiles(resized);
  }

  async function onSubmit() {
    setError(null);
    if (files.length < 1) return setError("셀카를 1장 이상 업로드해 주세요.");
    if (!styleId) return setError("스타일을 선택해 주세요.");
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("styleId", styleId);
      fd.set("count", String(count));
      files.forEach((f) => fd.append("selfies", f));
      const res = await fetch("/api/generate", { method: "POST", body: fd });
      if (res.status === 402) {
        setError("크레딧이 부족합니다. 크레딧을 충전해 주세요.");
        return;
      }
      if (res.status === 403) {
        setError("생성을 위해 약관·개인정보·본인얼굴 동의가 필요합니다.");
        return;
      }
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setError(b.error ?? "생성 요청에 실패했습니다.");
        return;
      }
      const { batchId } = await res.json();
      router.push(`/result/${batchId}`);
    } finally {
      setBusy(false);
    }
  }

  const byFamily = (fam: string) => presets.filter((p) => p.family === fam);

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-bold">AI 프로필 만들기</h1>

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

      <section className="mt-6">
        <p className="text-sm font-medium">스타일</p>
        {STYLE_FAMILIES.map((fam) => (
          <div key={fam} className="mt-3">
            <p className="text-xs text-gray-500">{FAMILY_LABEL[fam] ?? fam}</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {byFamily(fam).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setStyleId(p.id)}
                  className={`rounded-full border px-3 py-1 text-sm ${
                    styleId === p.id ? "border-black bg-black text-white" : "border-gray-300"
                  }`}
                >
                  {p.name_ko}
                </button>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="mt-6">
        <label className="block text-sm font-medium">변형 수</label>
        <select
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
          className="mt-2 rounded border px-2 py-1"
        >
          {[1, 2, 3, 4].map((n) => (
            <option key={n} value={n}>
              {n}장
            </option>
          ))}
        </select>
      </section>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <button
        type="button"
        onClick={onSubmit}
        disabled={busy}
        className="mt-6 rounded-lg bg-black px-5 py-2 text-white disabled:opacity-50"
      >
        {busy ? "생성 요청 중…" : "생성하기"}
      </button>
    </main>
  );
}
```

2. - [ ] Type-check:
```bash
pnpm exec tsc --noEmit
```
Expected: no errors in `app/create/page.tsx`.

3. - [ ] Commit:
```bash
git add app/create/page.tsx
git commit -m "$(printf 'feat: add /create studio (selfie upload + style picker + variations)\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 2.16 — Result page `/result/[batchId]` (realtime progress + results)

**Files:**
- Create: `app/result/[batchId]/page.tsx`

**Interfaces:**
- Consumes: `createBrowserSupabase()`; `useJobStream` + `JobStreamState` (`@/lib/useJobStream`); `BUCKET_OUTPUTS` (`@/lib/storage`); `GenerationJob` (`@/types/db`); `useParams` (`next/navigation`).
- Produces: client page rendering per-job progress and finished images via signed URLs.

**Steps:**

1. - [ ] Create `app/result/[batchId]/page.tsx`:
```tsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { useJobStream, type JobStreamState } from "@/lib/useJobStream";
import { BUCKET_OUTPUTS } from "@/lib/storage";
import type { GenerationJob } from "@/types/db";

const STATUS_LABEL: Record<string, string> = {
  queued: "대기 중",
  processing: "생성 중…",
  done: "완료",
  failed: "실패",
};

export default function ResultPage() {
  const params = useParams<{ batchId: string }>();
  const batchId = params.batchId;
  const [jobIds, setJobIds] = useState<string[]>([]);
  const [initial, setInitial] = useState<Record<string, JobStreamState>>({});
  const [ready, setReady] = useState(false);
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    const sb = createBrowserSupabase();
    sb.from("generation_jobs")
      .select("id,status,asset_id,error_code")
      .eq("batch_id", batchId)
      .then(({ data }) => {
        const jobs = (data ?? []) as Pick<GenerationJob, "id" | "status" | "asset_id" | "error_code">[];
        setJobIds(jobs.map((j) => j.id));
        setInitial(
          Object.fromEntries(
            jobs.map((j) => [j.id, { status: j.status, assetId: j.asset_id, errorCode: j.error_code }]),
          ),
        );
        setReady(true);
      });
  }, [batchId]);

  const stream = useJobStream(jobIds, initial);

  // resolve signed URLs for finished jobs
  useEffect(() => {
    const sb = createBrowserSupabase();
    for (const [id, s] of Object.entries(stream)) {
      if (s.status === "done" && s.assetId && !urls[id]) {
        sb.from("assets")
          .select("storage_path")
          .eq("id", s.assetId)
          .single()
          .then(async ({ data }) => {
            if (!data) return;
            const { data: signed } = await sb.storage
              .from(BUCKET_OUTPUTS)
              .createSignedUrl(data.storage_path, 600);
            if (signed?.signedUrl) setUrls((u) => ({ ...u, [id]: signed.signedUrl }));
          });
      }
    }
  }, [stream, urls]);

  if (!ready) return <main className="p-6">불러오는 중…</main>;

  const entries = Object.entries(stream);
  const done = entries.filter(([, s]) => s.status === "done").length;

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-bold">생성 결과</h1>
      <p className="mt-1 text-sm text-gray-500">
        {done}/{entries.length} 완료
      </p>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
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
      </div>
    </main>
  );
}
```

2. - [ ] Type-check:
```bash
pnpm exec tsc --noEmit
```
Expected: no errors.

3. - [ ] Commit:
```bash
git add app/result/[batchId]/page.tsx
git commit -m "$(printf 'feat: add /result/[batchId] realtime progress + results\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 2.17 — Gallery page `/gallery` (signed-URL grid + download)

**Files:**
- Create: `app/gallery/page.tsx`

**Interfaces:**
- Consumes: `createBrowserSupabase()`; `BUCKET_OUTPUTS` (`@/lib/storage`); `Asset` (`@/types/db`).
- Produces: client page listing the user's `output`/`watermarked` assets as a downloadable signed-URL grid.

**Steps:**

1. - [ ] Create `app/gallery/page.tsx`:
```tsx
"use client";

import { useEffect, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { BUCKET_OUTPUTS } from "@/lib/storage";
import type { Asset } from "@/types/db";

type Tile = { id: string; url: string; watermarked: boolean };

export default function GalleryPage() {
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const sb = createBrowserSupabase();
    (async () => {
      const { data } = await sb
        .from("assets")
        .select("id,storage_path,kind,created_at")
        .in("kind", ["output", "watermarked"])
        .order("created_at", { ascending: false });
      const rows = (data ?? []) as Pick<Asset, "id" | "storage_path" | "kind">[];
      const resolved = await Promise.all(
        rows.map(async (a) => {
          const { data: signed } = await sb.storage
            .from(BUCKET_OUTPUTS)
            .createSignedUrl(a.storage_path, 600);
          return signed?.signedUrl
            ? { id: a.id, url: signed.signedUrl, watermarked: a.kind === "watermarked" }
            : null;
        }),
      );
      setTiles(resolved.filter((t): t is Tile => t !== null));
      setLoading(false);
    })();
  }, []);

  if (loading) return <main className="p-6">불러오는 중…</main>;

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="text-2xl font-bold">내 갤러리</h1>
      {tiles.length === 0 ? (
        <p className="mt-4 text-sm text-gray-500">아직 생성한 이미지가 없습니다.</p>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {tiles.map((t) => (
            <a
              key={t.id}
              href={t.url}
              download={`profai-${t.id}.png`}
              className="block overflow-hidden rounded-lg border"
            >
              <img src={t.url} alt="생성 이미지" className="w-full" />
              {t.watermarked && (
                <span className="block bg-black/60 px-2 py-1 text-center text-xs text-white">
                  AI 생성 · 워터마크
                </span>
              )}
            </a>
          ))}
        </div>
      )}
    </main>
  );
}
```

2. - [ ] Type-check:
```bash
pnpm exec tsc --noEmit
```
Expected: no errors.

3. - [ ] Commit:
```bash
git add app/gallery/page.tsx
git commit -m "$(printf 'feat: add /gallery signed-URL grid with downloads\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 2.18 — E2E happy path (Playwright, model layer stubbed)

**Files:**
- Create: `e2e/generate.spec.ts`
- Create: `e2e/fixtures/selfie.png` (any small valid PNG; generate in step 1)

**Interfaces:**
- Consumes: running app at `APP_BASE_URL`; the `/api/generate` and `/api/jobs/worker` routes.
- Produces: a deterministic E2E proving upload → generate → realtime progress → download, with the paid model stubbed via the env flag `E2E_STUB_MODEL=1`.

> The model layer must be stubbable so E2E never calls a paid provider. Add a tiny guard at the top of `generateImage` so that when `process.env.E2E_STUB_MODEL === "1"` it returns a fixed 1×1 PNG. This keeps production behavior unchanged when the flag is unset.

**Steps:**

1. - [ ] Add the E2E stub branch to `lib/models/router.ts` (top of `generateImage`):
```ts
// E2E stub: never hit a paid provider when explicitly enabled.
if (process.env.E2E_STUB_MODEL === "1") {
  const onePixelPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64",
  );
  return { bytes: new Uint8Array(onePixelPng), mime: "image/png", width: 1, height: 1 };
}
```
> Place it as the first statement inside `generateImage`, before the `model_key` switch. The unit test in Task 2.10 runs without `E2E_STUB_MODEL`, so it is unaffected.

2. - [ ] Create the fixture PNG:
```bash
mkdir -p e2e/fixtures
node -e "require('fs').writeFileSync('e2e/fixtures/selfie.png', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==','base64'))"
```

3. - [ ] Write `e2e/generate.spec.ts`:
```ts
import { test, expect } from "@playwright/test";

// Requires the dev server started with E2E_STUB_MODEL=1 and a logged-in,
// consented test user with credits (seeded by global setup). See playwright.config.ts.
test("with credits: upload → generate → progress → download", async ({ page }) => {
  await page.goto("/create");

  // upload a selfie
  await page.setInputFiles('input[type="file"]', "e2e/fixtures/selfie.png");
  await expect(page.getByText(/장 선택됨/)).toBeVisible();

  // pick the first style chip
  await page.getByRole("button").filter({ hasText: /.+/ }).first().click();

  // generate
  await page.getByRole("button", { name: "생성하기" }).click();

  // routed to result page
  await expect(page).toHaveURL(/\/result\//);

  // realtime (or initial fetch) shows completion; worker is kicked + cron drains
  await expect(page.getByText(/\d+\/\d+ 완료/)).toBeVisible();
  await expect(page.locator('img[alt="결과"]').first()).toBeVisible({ timeout: 30_000 });

  // result image is wrapped in a download anchor
  const dl = page.locator('a[download^="profai-"]').first();
  await expect(dl).toBeVisible();
});
```

4. - [ ] Run E2E (dev server must be launched with the stub flag; webServer config in `playwright.config.ts` should pass `E2E_STUB_MODEL=1` and `command: "pnpm dev"`):
```bash
E2E_STUB_MODEL=1 pnpm exec playwright test e2e/generate.spec.ts
```
Expected: `1 passed`. (If the seeded test user / Supabase local stack is unavailable, document it as an environment prerequisite — Docker + `supabase start` + seeded credited user.)

5. - [ ] Run the full Vitest suite to confirm no regressions:
```bash
pnpm vitest run
```
Expected: all Phase 2 unit suites pass.

6. - [ ] Commit:
```bash
git add lib/models/router.ts e2e/generate.spec.ts e2e/fixtures/selfie.png
git commit -m "$(printf 'test: add E2E happy path with stubbed model layer\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 2.19 — Reaper cron `/api/cron/reap` (fail stuck `processing` jobs + refund)

**Files:**
- Create: `app/api/cron/reap/route.ts`
- Test: `tests/reap-route.test.ts`

**Interfaces:**
- Consumes: `createServiceSupabase()`; `setJobStatus` (`@/lib/db`); `refundHold` (`@/lib/credits`).
- Produces: `GET(req): Response` (CRON_SECRET-guarded). Selects `generation_jobs` where `status = "processing"` AND `finished_at IS NULL` AND `created_at < now() - interval '10 minutes'`; for each stuck job: `refundHold(user_id, credit_cost, job_id)` then `setJobStatus(failed, { error_code: "generation_failed" })`. This recovers credits when a worker crashes mid-flight (the visibility-timeout requeue can otherwise leave a job wedged in `processing`). Returns `{ reaped }`.

> Authoritative scheduling for this route lives in the Phase 4 `vercel.ts` crons (`/api/cron/reap` at `*/5 * * * *`); this task only ships the handler + guard + logic. The Phase 4 plan must NOT claim reap already exists.

**Steps:**

1. - [ ] Write failing `tests/reap-route.test.ts`:
```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const setJobStatus = vi.fn();
vi.mock("@/lib/db", () => ({ setJobStatus: (...a: any[]) => setJobStatus(...a) }));

const refundHold = vi.fn();
vi.mock("@/lib/credits", () => ({ refundHold: (...a: any[]) => refundHold(...a) }));

const stuckSelect = vi.fn();
const svc: any = {
  from: () => ({
    select: () => ({ eq: () => ({ is: () => ({ lt: () => stuckSelect() }) }) }),
  }),
};
vi.mock("@/lib/supabase/service", () => ({ createServiceSupabase: () => svc }));

import { GET } from "@/app/api/cron/reap/route";

function req(secret = "secret") {
  return new Request("http://t/api/cron/reap", {
    headers: { Authorization: `Bearer ${secret}` },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "secret";
  stuckSelect.mockResolvedValue({ data: [], error: null });
});

describe("GET /api/cron/reap", () => {
  it("rejects without the cron secret", async () => {
    const res = await GET(new Request("http://t/api/cron/reap"));
    expect(res.status).toBe(401);
  });

  it("refunds + fails each stuck processing job", async () => {
    stuckSelect.mockResolvedValue({
      data: [
        { id: "j1", user_id: "u1", style_presets: { credit_cost: 2 } },
        { id: "j2", user_id: "u2", style_presets: { credit_cost: 1 } },
      ],
      error: null,
    });

    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ reaped: 2 });

    expect(refundHold).toHaveBeenCalledWith(svc, { user_id: "u1", amount: 2, job_id: "j1" });
    expect(refundHold).toHaveBeenCalledWith(svc, { user_id: "u2", amount: 1, job_id: "j2" });
    expect(setJobStatus).toHaveBeenCalledWith(
      svc,
      "j1",
      "failed",
      expect.objectContaining({ error_code: "generation_failed" }),
    );
  });

  it("does nothing when no jobs are stuck", async () => {
    const res = await GET(req());
    expect(await res.json()).toEqual({ reaped: 0 });
    expect(refundHold).not.toHaveBeenCalled();
    expect(setJobStatus).not.toHaveBeenCalled();
  });
});
```

2. - [ ] Run and confirm FAIL:
```bash
pnpm vitest run tests/reap-route.test.ts
```
Expected: module-not-found failure.

3. - [ ] Create `app/api/cron/reap/route.ts`:
```ts
import { createServiceSupabase } from "@/lib/supabase/service";
import { setJobStatus } from "@/lib/db";
import { refundHold } from "@/lib/credits";

export const runtime = "nodejs";

const STUCK_MINUTES = 10;

export async function GET(req: Request): Promise<Response> {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("unauthorized", { status: 401 });
  }

  const svc = createServiceSupabase();
  const cutoff = new Date(Date.now() - STUCK_MINUTES * 60 * 1000).toISOString();

  // jobs wedged in `processing` past the cutoff (worker crashed mid-flight)
  const { data: stuck, error } = await svc
    .from("generation_jobs")
    .select("id,user_id,style_preset_id,style_presets(credit_cost)")
    .eq("status", "processing")
    .is("finished_at", null)
    .lt("created_at", cutoff);
  if (error) throw error;

  let reaped = 0;
  for (const j of (stuck ?? []) as Array<{
    id: string;
    user_id: string;
    style_presets?: { credit_cost?: number } | null;
  }>) {
    const amount = j.style_presets?.credit_cost ?? 1;
    await refundHold(svc, { user_id: j.user_id, amount, job_id: j.id });
    await setJobStatus(svc, j.id, "failed", {
      error_code: "generation_failed",
      finished_at: new Date().toISOString(),
    });
    reaped++;
  }

  return Response.json({ reaped }, { status: 200 });
}
```

4. - [ ] Re-run and confirm PASS:
```bash
pnpm vitest run tests/reap-route.test.ts
```
Expected: `3 passed`.

> Integration coverage (real stuck-job → refund) belongs to a Supabase-backed integration test: **Docker + Supabase CLI required** (`supabase start`, seed a `processing` job with an old `created_at`, hit the route). Track as a follow-up; the Vitest unit above is the gate for this task.

5. - [ ] Commit:
```bash
git add app/api/cron/reap/route.ts tests/reap-route.test.ts
git commit -m "$(printf 'feat: add /api/cron/reap to fail stuck processing jobs and refund holds\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Phase 2 Done Criteria

- [ ] `supabase test db` passes the three new pgTAP suites (buckets/policies, pgmq round-trip, broadcast trigger + realtime RLS). **Docker + Supabase CLI required.**
- [ ] `pnpm vitest run` is green for: storage, queue, image-client, model types/openai/gemini/router, watermark, generate-route, worker-route, reap-route, use-job-stream.
- [ ] A credited+consented user can: upload selfies on `/create`, generate N variations, watch `/result/[batchId]` progress flip to done via Realtime, and download from `/result` and `/gallery`.
- [ ] Failure path: a throw refunds the held credit (`refund_hold`) and marks the job `failed` with a **lowercase** `error_code` (`moderation_blocked` / `no_image` / `generation_failed`); the producer rolls back partial holds and returns **402** on insufficient credits.
- [ ] Gating: the producer returns **403** when any `REQUIRED_CONSENTS` (incl. `tos`, from `@/lib/consent`) is missing, and **403** when `profiles.age_verified` is not true — both before any hold/enqueue.
- [ ] Selfie purge: once a batch's last job goes `done`, the worker deletes that batch's `source_selfie` objects + asset rows; `/api/cron/reap` fails + refunds jobs stuck in `processing` >10min.
- [ ] Idempotency: the worker never calls a paid model for a job whose status is not `queued`; every consumed message is acked (`pgmq_delete`).
- [ ] Secrets stay server-only; client touches only `NEXT_PUBLIC_*`; all routes export `runtime = "nodejs"`; free-tier outputs carry the visible "AI 생성" label.

## Manual / launch-blocking notes (do NOT block this phase)

- Verify live model ids before launch: `gpt-image-2` (snapshot `gpt-image-2-2026-04-21`), `google/gemini-3-pro-image`, free `google/gemini-3.1-flash-image-preview` / `gpt-image-1-mini`.
- `/api/cron/reap` is created in THIS phase (Task 2.19). Source selfies are purged immediately by the worker when a batch completes; the Phase 4 `expire` cron only backstops orphaned `source_selfie` assets past `delete_after`. The worker function timeout is set in-route via `export const maxDuration = 300` (there is NO `vercel.json`). The authoritative `vercel.ts` cron schedule (worker `* * * * *`, reconcile `*/10 * * * *`, reap `*/5 * * * *`, expire `0 * * * *`, each guarded by `Authorization: Bearer CRON_SECRET`) is owned/finalized in Phase 4; this phase relies on the producer's worker kick + the every-minute worker cron for draining during testing.
