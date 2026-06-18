-- =====================================================================
-- Employee Database — ทะเบียนพนักงานทั้งหมด (active + resign ในตารางเดียว).
-- Run once in the Supabase SQL Editor. Authenticated-only (same lockdown as
-- candidates / branches / ats). วันโปรเบชั่น (Day 30/60/90/119) และอายุ/อายุงาน
-- คำนวณฝั่งหน้าเว็บจาก join_date / birth_date — ไม่เก็บซ้ำในตาราง.
-- =====================================================================
create table if not exists public.emp_employees (
  id          uuid primary key default gen_random_uuid(),
  status      text not null default 'active',     -- 'active' | 'resign'
  dept        text,
  position    text,
  work_status text,                                -- ประเภทพนักงาน: Full time / Part time / Temp / (อื่นๆ)
  emp_id      text,
  branch      text,
  nick        text,
  name        text,
  name_en     text,
  gender      text,                                -- ชาย / หญิง (เดาจากคำนำหน้า · แก้ได้)
  join_date   date,
  birth_date  date,
  salary      text,                                -- เก็บเป็น text (กรอกเอง · มี , ได้)
  resign_date date,
  reason      text,
  detail      text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  text,
  updated_by  text
);
create index if not exists emp_employees_status_idx on public.emp_employees (status);
-- for tables created before these columns existed:
alter table public.emp_employees add column if not exists work_status text;
alter table public.emp_employees add column if not exists gender text;

alter table public.emp_employees enable row level security;

drop policy if exists "auth read emp"   on public.emp_employees;
drop policy if exists "auth insert emp" on public.emp_employees;
drop policy if exists "auth update emp" on public.emp_employees;
drop policy if exists "auth delete emp" on public.emp_employees;

create policy "auth read emp"   on public.emp_employees for select to authenticated using (true);
create policy "auth insert emp" on public.emp_employees for insert to authenticated with check (true);
create policy "auth update emp" on public.emp_employees for update to authenticated using (true) with check (true);
create policy "auth delete emp" on public.emp_employees for delete to authenticated using (true);
