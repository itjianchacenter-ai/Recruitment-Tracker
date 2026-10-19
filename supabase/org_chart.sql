-- =====================================================================
-- Org Chart (JC Org Studio) — ผังองค์กรในเมนู "🏛 ผังองค์กร". Run once in the
-- Supabase SQL Editor. ไม่มี seed ข้อมูล — สร้างเฉพาะโครงสร้าง.
--
-- โมเดล: ผังทั้งบริษัท = เอกสาร JSON 1 ชุด (รูปแบบเดียวกับไฟล์ org-data.json
-- ของ Org Studio ทุกอย่าง · รวมรูปพนักงาน base64) เก็บใน org_chart แถวเดียว (id = 1).
-- เก็บเป็น text (ไม่ใช่ jsonb) เพื่อให้ได้ข้อความกลับมาตรงตัวทุกตัวอักษร —
-- Org Studio เทียบ draft กับฉบับที่บันทึกด้วยการเทียบสตริง jsonb จะสลับลำดับ key.
--
-- เขียนได้ทางเดียวคือ function org_chart_save() — ตรวจสิทธิ์ (admin Level 2),
-- ตรวจว่าเป็นผังจริง (มี nodes), กันหน้าต่างเก่าบันทึกทับ (version ต้องตรง)
-- และเก็บสำเนาก่อนหน้าไว้ใน org_chart_history (ไม่เกิน 1 ชุดต่อ 15 นาที · 20 ชุดล่าสุด).
--
-- ข้อมูลในผังเป็นข้อมูลส่วนบุคคล (ชื่อ รหัส วันเริ่มงาน รูปถ่าย) — อ่านได้เฉพาะ
-- admin (role ≠ 'user') ที่ล็อกอินแล้ว · ผู้อนุมัติ/ผู้ประเมิน (role 'user') อ่านไม่ได้.
--
-- สิทธิ์อ่านจาก app_metadata (ตั้งโดยเมนู "ผู้ใช้ & รหัสผ่าน" · ผู้ใช้แก้เองไม่ได้) เป็นหลัก.
-- user_metadata ผู้ใช้แก้เองได้ จึงใช้ได้แค่ทาง "ลดสิทธิ์" (ถ้าที่ไหนบอก 'user' / level 1 → ถือตามนั้น)
-- บัญชีเก่าที่ไม่มี metadata เลย = admin Level 2 (เหมือนที่หน้าเว็บถือ) — ควรตั้ง role/level ให้ทุกบัญชี
-- ผ่านเมนู "ผู้ใช้ & รหัสผ่าน" เพื่อให้ app_metadata ครบ.
-- =====================================================================
create table if not exists public.org_chart (
  id          int primary key default 1 check (id = 1),   -- แถวเดียวทั้งระบบ
  data        text not null,                              -- org-data.json ทั้งไฟล์
  version     bigint not null default 1,                  -- เพิ่มทีละ 1 ทุกครั้งที่บันทึก
  updated_at  timestamptz not null default now(),
  updated_by  text
);

create table if not exists public.org_chart_history (
  id          bigserial primary key,
  data        text not null,
  version     bigint,
  saved_at    timestamptz not null default now(),         -- เวลาที่ฉบับนี้ถูกแทนที่
  saved_by    text                                        -- คนที่บันทึกฉบับนี้ไว้
);
create index if not exists org_chart_history_saved_at_idx on public.org_chart_history (saved_at desc);

alter table public.org_chart         enable row level security;
alter table public.org_chart_history enable row level security;

-- อ่านได้เฉพาะ admin · ไม่มี policy insert/update/delete = เขียนตรงไม่ได้ ต้องผ่าน function
create or replace function public.org_chart_is_admin(p_need_edit boolean)
returns boolean language sql stable set search_path = public as $$
  select auth.uid() is not null
     and coalesce(auth.jwt() -> 'app_metadata'  ->> 'role', '') <> 'user'
     and coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') <> 'user'
     and (not p_need_edit or (
              coalesce(auth.jwt() -> 'app_metadata'  ->> 'level', '') <> '1'
          and coalesce(auth.jwt() -> 'user_metadata' ->> 'level', '') <> '1'))
$$;

drop policy if exists "admin read org chart" on public.org_chart;
create policy "admin read org chart" on public.org_chart for select to authenticated
  using (public.org_chart_is_admin(false));
-- org_chart_history: ไม่มี policy เลย = ไม่เปิดผ่าน API · กู้คืนผ่าน SQL Editor (ดูท้ายไฟล์)

create or replace function public.org_chart_save(p_data text, p_version bigint)
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  j       jsonb := auth.jwt();
  v_actor text  := upper(split_part(coalesce(j ->> 'email', ''), '@', 1));
  v_doc   jsonb;
  cur     public.org_chart%rowtype;
  last_at timestamptz;
begin
  -- role 'user' = approver (no access) · level 1 = read-only admin (see org_chart_is_admin)
  if not public.org_chart_is_admin(true) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  begin
    v_doc := p_data::jsonb;
  exception when others then
    raise exception 'invalid_chart: not JSON';
  end;
  if jsonb_typeof(v_doc -> 'nodes') is distinct from 'object' then
    raise exception 'invalid_chart: no nodes';
  end if;

  select * into cur from public.org_chart where id = 1 for update;

  if not found then
    insert into public.org_chart (id, data, version, updated_at, updated_by)
    values (1, p_data, 1, now(), v_actor);
    return 1;
  end if;

  -- a window that loaded an older copy must reload instead of saving over newer work
  if p_version is null or p_version <> cur.version then
    raise exception 'version_conflict';
  end if;

  -- keep the copy being replaced — at most one per 15 minutes, newest 20 kept
  select max(saved_at) into last_at from public.org_chart_history;
  if last_at is null or last_at < now() - interval '15 minutes' then
    insert into public.org_chart_history (data, version, saved_by)
    values (cur.data, cur.version, cur.updated_by);
    delete from public.org_chart_history
     where id in (select id from public.org_chart_history order by saved_at desc offset 20);
  end if;

  update public.org_chart
     set data = p_data, version = cur.version + 1, updated_at = now(), updated_by = v_actor
   where id = 1;
  return cur.version + 1;
end$$;

revoke all on function public.org_chart_save(text, bigint) from public, anon;
grant execute on function public.org_chart_save(text, bigint) to authenticated;

-- ---------------------------------------------------------------------
-- กู้คืนฉบับก่อนหน้า (รันใน SQL Editor):
--   select id, version, saved_at, saved_by, length(data) from public.org_chart_history order by saved_at desc;
--   update public.org_chart o set data = h.data, version = o.version + 1, updated_at = now(), updated_by = 'RESTORE'
--     from public.org_chart_history h where o.id = 1 and h.id = <id ที่ต้องการ>;
-- หน้าต่างที่เปิดค้างไว้จะถูกปฏิเสธการบันทึก (version เปลี่ยน) และขึ้นให้โหลดใหม่เอง
-- ---------------------------------------------------------------------
