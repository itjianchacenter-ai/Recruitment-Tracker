-- =====================================================================
-- Branches Manning — staffing board per branch (F&B). Run once in the
-- Supabase SQL Editor. Authenticated-only (same lockdown as candidates).
-- manning jsonb shape:
--   { sm:[slot], asm:[slot], staff:[slot] }
--   slot = { name, nick, status:'filled'|'hold'|'vacant', badge:'', join:'' }
-- =====================================================================

create table if not exists public.branches (
  id          uuid primary key default gen_random_uuid(),
  brand       text not null,                                   -- JIAN CHA / POLLY / JAI CHAN
  name        text not null,                                   -- Central Lardprao
  target_pax  int  not null default 0,
  sort_order  int  not null default 0,
  manning     jsonb not null default '{"sm":[],"asm":[],"staff":[]}'::jsonb,
  remark      text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  text
);

comment on column public.branches.manning is 'Staffing slots per role: {sm:[],asm:[],staff:[{name,nick,status,badge,join}]}';

alter table public.branches enable row level security;

-- authenticated-only (HR). No anon access.
drop policy if exists "auth read branches"   on public.branches;
drop policy if exists "auth insert branches" on public.branches;
drop policy if exists "auth update branches" on public.branches;
drop policy if exists "auth delete branches" on public.branches;

create policy "auth read branches"   on public.branches for select to authenticated using (true);
create policy "auth insert branches" on public.branches for insert to authenticated with check (true);
create policy "auth update branches" on public.branches for update to authenticated using (true) with check (true);
create policy "auth delete branches" on public.branches for delete to authenticated using (true);

-- (optional) seed a couple of branches to start — safe to delete/edit in the app
insert into public.branches (brand, name, target_pax, sort_order, manning) values
  ('JIAN CHA', 'Central Lardprao', 16, 1, '{"sm":[{"name":"สุนันทา กระวีนทร์","nick":"ต้นน้ำ","status":"filled","badge":"รักษาการ"}],"asm":[{"name":"ธนกร ดุษฎีเดช","nick":"ดีโอ","status":"filled"},{"status":"hold"}],"staff":[{"name":"Min Zaw Khaing","nick":"ลุย","status":"filled"},{"status":"hold"},{"status":"hold"}]}'::jsonb)
on conflict do nothing;
