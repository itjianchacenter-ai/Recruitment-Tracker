-- =====================================================================
-- Branch Sales — ยอดขายรายสาขา (กรอกในหน้า Report เพื่อเทียบกับจำนวน
-- พนักงาน + เงินเดือนรวมของสาขา). Run once in the Supabase SQL Editor.
-- Authenticated-only · key = ชื่อสาขา (ตรงกับ emp_employees.branch).
-- ไม่มี seed ข้อมูล — สร้างเฉพาะโครงสร้าง.
-- =====================================================================
create table if not exists public.branch_sales (
  branch      text primary key,                 -- ชื่อสาขา (match emp_employees.branch)
  sales       numeric not null default 0,        -- ยอดขาย (ต่อเดือน/งวด)
  updated_at  timestamptz not null default now(),
  updated_by  text
);

alter table public.branch_sales enable row level security;

drop policy if exists "auth read bs"   on public.branch_sales;
drop policy if exists "auth insert bs" on public.branch_sales;
drop policy if exists "auth update bs" on public.branch_sales;
drop policy if exists "auth delete bs" on public.branch_sales;

create policy "auth read bs"   on public.branch_sales for select to authenticated using (true);
create policy "auth insert bs" on public.branch_sales for insert to authenticated with check (true);
create policy "auth update bs" on public.branch_sales for update to authenticated using (true) with check (true);
create policy "auth delete bs" on public.branch_sales for delete to authenticated using (true);
