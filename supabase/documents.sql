-- =====================================================================
-- Document Signing — เอกสารเซ็นออนไลน์ (อัปโหลด → เลือกผู้เซ็นตามลำดับ →
-- e-sign/อัปโหลดลายเซ็น → ไฟล์ประกอบ). Run once in the Supabase SQL Editor.
-- Authenticated-only (เหมือนตารางอื่นทั้งระบบ). ไม่มี seed ข้อมูล.
--
-- โมเดล: เอกสาร 1 ใบ = ไฟล์หลัก 1 ไฟล์ + ไฟล์ประกอบหลายไฟล์ + ผู้เซ็นเรียง
-- ตามลำดับ (sequence). ระบบให้เซ็นทีละคนตาม current_seq (คนถัดไปจะ active
-- เมื่อคนก่อนหน้าเซ็นเสร็จ) — ใช้ลอจิกลำดับเดียวกับ approvers ในงานสรรหา.
--
-- ไฟล์จริงเก็บใน Storage bucket "recruitment" (path: documents/...) — ตาราง
-- นี้เก็บแค่ metadata + path + สถานะการเซ็น + audit (signedAt/ip/ลายเซ็น).
-- =====================================================================
create table if not exists public.documents (
  id           uuid primary key default gen_random_uuid(),
  doc_number   text,                                 -- เลขที่เอกสาร (กรอกเอง/ออกอัตโนมัติ)
  title        text not null,                        -- ชื่อเอกสาร
  description  text,                                 -- รายละเอียด/บริบทของเอกสาร
  category     text,                                 -- ประเภท (สัญญาจ้าง/NDA/Memo/อื่นๆ)
  main_file    jsonb,                                -- {path,name,size,type,uploadedAt,uploadedBy}
  attachments  jsonb not null default '[]'::jsonb,   -- [{path,name,size,type,...}] ไฟล์ประกอบ
  approvers    jsonb not null default '[]'::jsonb,   -- [{id,name,email,role,sequence,status,signedAt,ip,signature_data,mode,note}]
  status       text  not null default 'pending',     -- pending | completed | rejected | canceled
  current_seq  int   not null default 1,             -- ลำดับที่กำลังรอเซ็น (1-based)
  note         text,                                 -- หมายเหตุรวมของเอกสาร
  created_by   text,
  created_at   timestamptz not null default now(),
  updated_by   text,
  updated_at   timestamptz not null default now()
);
create index if not exists documents_status_idx     on public.documents (status);
create index if not exists documents_created_at_idx  on public.documents (created_at desc);

alter table public.documents enable row level security;

drop policy if exists "auth read doc"   on public.documents;
drop policy if exists "auth insert doc" on public.documents;
drop policy if exists "auth update doc" on public.documents;
drop policy if exists "auth delete doc" on public.documents;

-- อ่าน/แก้ได้ทุก authenticated (แอปกรองฝั่งหน้าเว็บว่าใครเห็น "งานของฉัน") —
-- แนวเดียวกับตารางอื่นในระบบ (internal HR tool, login-only). ผู้เซ็น (role user)
-- ต้อง update ได้เพื่อบันทึกลายเซ็นของตัวเอง.
create policy "auth read doc"   on public.documents for select to authenticated using (true);
create policy "auth insert doc" on public.documents for insert to authenticated with check (true);
create policy "auth update doc" on public.documents for update to authenticated using (true) with check (true);
create policy "auth delete doc" on public.documents for delete to authenticated using (true);
