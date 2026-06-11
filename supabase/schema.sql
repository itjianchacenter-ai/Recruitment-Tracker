-- =====================================================================
-- Recruitment 120 Days — Supabase schema
-- HR system: authenticated-only access (RLS), single candidates table, audit-friendly
-- Run this in Supabase SQL Editor (one-time setup) — includes the auth lockdown
-- =====================================================================

-- 1. Extensions ------------------------------------------------------------
create extension if not exists "pgcrypto";

-- 2. Table -----------------------------------------------------------------
create table if not exists public.candidates (
  id                  uuid          primary key default gen_random_uuid(),
  name                text,                                                   -- nullable · ใส่ภายหลังเมื่อผ่านสัมภาษณ์ (Step 6)
  position            text          not null,                                 -- ชื่อตำแหน่ง · ใช้แสดงบนการ์ดเมื่อยังไม่มีชื่อผู้สมัคร
  department          text          not null,
  type                text          not null check (type in ('replacement','new_headcount')),
  process_start_date  date          not null,
  current_step        smallint      not null default 1 check (current_step between 1 and 8),  -- 8-step workflow
  status              text          not null default 'active' check (status in ('active','passed','rejected','cancelled')),
  steps               jsonb         not null default '[]'::jsonb,   -- [{step,completedDate,completedBy,note?}]
  documents           jsonb         not null default '[]'::jsonb,   -- [{key,label,received,receivedDate}] (Step 7 pre-boarding)
  probation           jsonb         not null default '{}'::jsonb,   -- {startDate,evaluationSentDate,returnDate,passed,milestones:{day30,day60,day90,day120}}
  shortlist           jsonb         not null default '[]'::jsonb,   -- Step 3 [{id,name,addedAt,files:[],sentTo:[]}]
  generated_docs      jsonb         not null default '{}'::jsonb,   -- {1:{...},5:{...},6:{...},8:{...}} form data per step (Manpower/Scorecard/Approval/Probation)
  approval_workflows  jsonb         not null default '{}'::jsonb,   -- {1:{...},6:{...}} {status,createdAt,completedAt,approvers:[{name,email,role,status,signedAt,signature,sequence}]}
  distributions       jsonb         not null default '{}'::jsonb,   -- per-step email send log {3:[...],4:[...],5:[...],7:[...],8:[...]}
  files               jsonb         not null default '[]'::jsonb,   -- uploaded file metadata [{name,step,size,uploadedAt,uploadedBy,storagePath}]
  notes               text,
  created_by          text,         -- HR member name (free text, MVP)
  updated_by          text,         -- last editor (free text, MVP)
  created_at          timestamptz   not null default now(),
  updated_at          timestamptz   not null default now()
);

comment on table  public.candidates is 'Recruitment 120-day workflow records — one row per requisition (อัตรา); name filled after interview pass. 8-step process.';
comment on column public.candidates.name              is 'ชื่อผู้สมัคร · NULL ก่อนผ่านสัมภาษณ์ (Step 1-5) · ใส่หลังผ่าน Step 5/6';
comment on column public.candidates.status            is 'active = ดำเนินการ · passed = ผ่านโปร · cancelled = ยกเลิกตำแหน่ง · rejected = legacy (use cancelled)';
comment on column public.candidates.type              is 'replacement = ทดแทนคนลาออก, new_headcount = อัตราใหม่';
comment on column public.candidates.current_step      is '1 Requisition·2 Sourcing·3 Screening·4 Interview Sched·5 Eval·6 Offer Approval·7 Pre-Boarding·8 Probation';
comment on column public.candidates.steps             is '[{step, completedDate, completedBy, note?}] — drives Time-to-fill & per-stage timing';
comment on column public.candidates.documents         is '[{key,label,received,receivedDate}] — Step 7 pre-boarding checklist';
comment on column public.candidates.probation         is '{startDate,evaluationSentDate,returnDate,passed,milestones:{day30,day60,day90,day120:{done,date,score,note}}}';
comment on column public.candidates.shortlist         is 'Step 3 multi-candidate: [{id,name,addedAt,files,sentTo}]';
comment on column public.candidates.generated_docs    is 'Per-step form payloads keyed by step number (1,5,6,8) for doc rendering + KPI (level, salary_new, total_income…)';
comment on column public.candidates.approval_workflows is 'Sequential digital-signature workflows keyed by step (1,6): status, createdAt, completedAt, approvers[] with signature data';
comment on column public.candidates.distributions     is 'Email send log per step (3,4,5,7,8) — recipient, sentAt, attachments, subject/body';
comment on column public.candidates.files             is 'Uploaded file metadata; binary lives in Supabase Storage bucket "recruitment" at storagePath';

-- 3. Indexes ---------------------------------------------------------------
create index if not exists idx_candidates_status        on public.candidates(status);
create index if not exists idx_candidates_current_step  on public.candidates(current_step);
create index if not exists idx_candidates_department    on public.candidates(department);
create index if not exists idx_candidates_start_date    on public.candidates(process_start_date);

-- 4. Auto-update updated_at ------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end$$;

drop trigger if exists trg_candidates_updated_at on public.candidates;
create trigger trg_candidates_updated_at
  before update on public.candidates
  for each row execute function public.set_updated_at();

-- 5. Lightweight audit log (optional but recommended) ----------------------
create table if not exists public.candidate_audit (
  id           bigserial     primary key,
  candidate_id uuid,                                       -- no FK: audit must survive candidate deletion (immutable trail)
  action       text          not null,                  -- insert | update | delete
  actor        text,                                    -- HR member name
  diff         jsonb,                                   -- new row snapshot (for update/insert)
  occurred_at  timestamptz   not null default now()
);

create index if not exists idx_audit_candidate on public.candidate_audit(candidate_id);
create index if not exists idx_audit_time      on public.candidate_audit(occurred_at desc);

create or replace function public.log_candidate_audit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'DELETE') then
    insert into public.candidate_audit(candidate_id, action, actor, diff)
    values (old.id, 'delete', old.updated_by, to_jsonb(old));
    return old;
  else
    insert into public.candidate_audit(candidate_id, action, actor, diff)
    values (new.id, lower(tg_op), new.updated_by, to_jsonb(new));
    return new;
  end if;
end$$;

drop trigger if exists trg_candidates_audit on public.candidates;
create trigger trg_candidates_audit
  after insert or update or delete on public.candidates
  for each row execute function public.log_candidate_audit();

-- 6. Row Level Security ----------------------------------------------------
-- Data is restricted to LOGGED-IN (authenticated) users only. The anon key
-- ships in the browser bundle, so anon must NOT be able to touch employee PII.
-- (This file used to grant anon full CRUD for the no-login MVP — that was the
-- old `supabase/auth-rls.sql` lockdown, now folded in here so re-running this
-- schema can never re-open the database to the public.)
alter table public.candidates      enable row level security;
alter table public.candidate_audit enable row level security;

-- drop any legacy anon-open policies (safe if they don't exist)
drop policy if exists "anon read candidates"   on public.candidates;
drop policy if exists "anon write candidates"  on public.candidates;
drop policy if exists "anon update candidates" on public.candidates;
drop policy if exists "anon delete candidates" on public.candidates;
drop policy if exists "auth read candidates"   on public.candidates;
drop policy if exists "auth insert candidates" on public.candidates;
drop policy if exists "auth update candidates" on public.candidates;
drop policy if exists "auth delete candidates" on public.candidates;

create policy "auth read candidates"   on public.candidates for select to authenticated using (true);
create policy "auth insert candidates" on public.candidates for insert to authenticated with check (true);
create policy "auth update candidates" on public.candidates for update to authenticated using (true) with check (true);
create policy "auth delete candidates" on public.candidates for delete to authenticated using (true);

drop policy if exists "anon read audit" on public.candidate_audit;
drop policy if exists "auth read audit" on public.candidate_audit;
create policy "auth read audit" on public.candidate_audit for select to authenticated using (true);
-- Inserts into candidate_audit happen via SECURITY DEFINER trigger, so no insert
-- policy is needed. No update/delete policy = the audit trail is append-only.
-- Defense-in-depth: also revoke update/delete at the privilege level, so the
-- trail stays append-only even if RLS were ever disabled. Inserts are unaffected
-- (the trigger runs SECURITY DEFINER as the table owner).
revoke update, delete on public.candidate_audit from authenticated, anon;

-- 7. Realtime publication --------------------------------------------------
-- Enables push updates so all HR users see changes live.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'candidates'
  ) then
    alter publication supabase_realtime add table public.candidates;
  end if;
end$$;

-- 8. Reporting view (KPI / dashboard) --------------------------------------
-- Flattens JSONB into columns the Reports page (and any BI tool) can query.
create or replace view public.candidate_kpi as
select
  c.id,
  c.position,
  c.department,
  c.type,
  c.status,
  c.current_step,
  c.process_start_date,
  -- Step completion dates pulled out of the steps[] array
  (select (s->>'completedDate')::date from jsonb_array_elements(c.steps) s where (s->>'step')::int = 2 limit 1) as sourcing_done_date,
  (select (s->>'completedDate')::date from jsonb_array_elements(c.steps) s where (s->>'step')::int = 6 limit 1) as offer_done_date,
  -- Offer approval workflow timing
  (c.approval_workflows->'6'->>'createdAt')   as offer_wf_created,
  (c.approval_workflows->'6'->>'completedAt') as offer_wf_completed,
  -- Compensation (from approved offer doc)
  nullif(regexp_replace(coalesce(c.generated_docs->'6'->>'salary_new',''), '[^0-9.]', '', 'g'), '')::numeric as offer_salary,
  (c.generated_docs->'6'->>'total_income')::numeric as offer_total_income,
  c.generated_docs->'6'->>'level' as offer_level,
  -- Probation
  (c.probation->>'startDate')::date  as probation_start,
  (c.probation->>'returnDate')::date as probation_passed_date,
  (c.probation->>'passed')::boolean  as probation_passed,
  c.created_by,
  c.created_at
from public.candidates c;

comment on view public.candidate_kpi is 'Flattened KPI view: time-to-fill, sourcing SLA, approval cycle, compensation, probation — for the Reports page / BI tools';
