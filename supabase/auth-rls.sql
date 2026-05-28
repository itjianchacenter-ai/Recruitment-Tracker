-- =====================================================================
-- Auth lockdown — restrict all data to logged-in (authenticated) HR users
-- Run in Supabase SQL Editor AFTER creating the HR users + deploying the
-- login frontend. (Do NOT add real employee data until this has run.)
-- =====================================================================

-- 1) Audit trigger must run as owner so it can write candidate_audit
--    regardless of the caller's RLS (required once RLS is tightened).
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

-- 2) candidates: replace anon-open policies with authenticated-only
drop policy if exists "anon read candidates"   on public.candidates;
drop policy if exists "anon write candidates"  on public.candidates;
drop policy if exists "anon update candidates" on public.candidates;
drop policy if exists "anon delete candidates" on public.candidates;

create policy "auth read candidates"   on public.candidates for select to authenticated using (true);
create policy "auth insert candidates" on public.candidates for insert to authenticated with check (true);
create policy "auth update candidates" on public.candidates for update to authenticated using (true) with check (true);
create policy "auth delete candidates" on public.candidates for delete to authenticated using (true);

-- 3) audit log: readable by authenticated only
drop policy if exists "anon read audit" on public.candidate_audit;
create policy "auth read audit" on public.candidate_audit for select to authenticated using (true);

-- 4) storage bucket "recruitment": authenticated users only (private)
drop policy if exists "auth read recruitment"   on storage.objects;
drop policy if exists "auth write recruitment"  on storage.objects;
drop policy if exists "auth update recruitment" on storage.objects;
drop policy if exists "auth delete recruitment" on storage.objects;

create policy "auth read recruitment"   on storage.objects for select to authenticated using (bucket_id = 'recruitment');
create policy "auth write recruitment"  on storage.objects for insert to authenticated with check (bucket_id = 'recruitment');
create policy "auth update recruitment" on storage.objects for update to authenticated using (bucket_id = 'recruitment');
create policy "auth delete recruitment" on storage.objects for delete to authenticated using (bucket_id = 'recruitment');
