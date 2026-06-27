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
