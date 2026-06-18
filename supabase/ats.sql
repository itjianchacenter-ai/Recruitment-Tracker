-- =====================================================================
-- ATS · Candidate Database — applicants per job position + resume files.
-- Run once in the Supabase SQL Editor. Authenticated-only (same lockdown
-- as candidates / branches). Resume files go to the private "recruitment"
-- storage bucket (path: ats/{timestamp}_{filename}); only signed URLs are
-- handed out, so resumes never become public.
--
-- Resume PARSING (name / phone / email) happens 100% in the HR browser via
-- regex — no resume text is sent to any external service (PDPA-friendly).
-- =====================================================================

-- ----- Positions (job vacancies) — tabs in the UI ---------------------
create table if not exists public.ats_positions (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now()
);

-- ----- Sources (application channels) — editable in the UI ------------
create table if not exists public.ats_sources (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now()
);

-- ----- Candidates -----------------------------------------------------
create table if not exists public.ats_candidates (
  id               uuid primary key default gen_random_uuid(),
  position         text not null,                       -- matches ats_positions.name
  name             text,
  phone            text,
  email            text,
  source           text,                                -- matches ats_sources.name (free text ok)
  stage            text not null default 'Applied/Sourced',
  expected_salary  text,                                -- kept as text (manual entry, not auto-read)
  reason           text,                                -- Pre-Screen Breakdown (only when Not Passed)
  applied_date     date,
  resume           jsonb,                               -- { path, name, size, uploadedAt, uploadedBy }
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       text,
  updated_by       text
);
create index if not exists ats_candidates_position_idx on public.ats_candidates (position);

-- ----- RLS: authenticated (HR) only, no anon --------------------------
alter table public.ats_positions  enable row level security;
alter table public.ats_sources    enable row level security;
alter table public.ats_candidates enable row level security;

do $$
declare t text;
begin
  foreach t in array array['ats_positions','ats_sources','ats_candidates'] loop
    execute format('drop policy if exists "auth read %1$s"   on public.%1$s', t);
    execute format('drop policy if exists "auth insert %1$s" on public.%1$s', t);
    execute format('drop policy if exists "auth update %1$s" on public.%1$s', t);
    execute format('drop policy if exists "auth delete %1$s" on public.%1$s', t);
    execute format('create policy "auth read %1$s"   on public.%1$s for select to authenticated using (true)', t);
    execute format('create policy "auth insert %1$s" on public.%1$s for insert to authenticated with check (true)', t);
    execute format('create policy "auth update %1$s" on public.%1$s for update to authenticated using (true) with check (true)', t);
    execute format('create policy "auth delete %1$s" on public.%1$s for delete to authenticated using (true)', t);
  end loop;
end $$;

-- ----- (OPTIONAL) ค่าช่องทางเริ่มต้น 8 อัน -----------------------------
-- ปิดไว้โดย default เพื่อ "ไม่ insert ข้อมูลใด ๆ" ตอนรัน migration (กันทับซ้อน
-- ข้อมูลจริง) · ระบบยังเพิ่มช่องทางเองได้ผ่านแอป (＋ เพิ่มช่องทางใหม่)
-- ถ้าต้องการ pre-fill ช่องทางมาตรฐาน → ลบเครื่องหมาย /* */ ออกแล้วรันเฉพาะส่วนนี้:
/*
insert into public.ats_sources (name, sort_order)
select v.name, v.ord
from (values
  ('Job Thai',1),('Jobs DB',2),('Job Fin Fin',3),('Job BKK',4),
  ('Facebook',5),('LinkedIn',6),('Head-hunting',7),('Refer',8)
) as v(name, ord)
where not exists (select 1 from public.ats_sources s where s.name = v.name);
*/
