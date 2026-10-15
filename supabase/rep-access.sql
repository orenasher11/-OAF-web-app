-- OAF: private access for sales reps. Run this ONCE in the Supabase SQL editor,
-- after the first setup code. It is safe to run again.
--
--   owner / member : see and edit everything (you and your partners)
--   rep            : sees ONLY the jobs they are on (as the seller or a rep), those jobs'
--                    chat, notes, tasks and photos, their own leads and reports, and the
--                    contractor directory. They never see other reps' jobs, your money
--                    settings (like your 1%), the team list, or who else has an account.

alter table public.members add column if not exists rep_name text;
alter table public.invites  add column if not exists rep_name text;

create or replace function public.my_role(w uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from public.members where workspace_id = w and user_id = auth.uid() limit 1
$$;
create or replace function public.my_rep_name(w uuid) returns text
language sql stable security definer set search_path = public as $$
  select nullif(trim(rep_name), '') from public.members
  where workspace_id = w and user_id = auth.uid() and role = 'rep' limit 1
$$;
create or replace function public.i_am_rep() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members where user_id = auth.uid() and role = 'rep')
$$;

-- is this rep named on the job (seller, other rep on the sale, or rep on an upsell)?
create or replace function public.job_has_rep(d jsonb, rep text) returns boolean
language sql immutable as $$
  select rep is not null and (
    d->>'seller' = rep
    or jsonb_exists(coalesce(d->'repNames', '[]'::jsonb), rep)
    or jsonb_path_exists(coalesce(d->'upsells', '[]'::jsonb), '$[*].repNames[*] ? (@ == $r)', jsonb_build_object('r', rep))
  )
$$;
create or replace function public.rep_sees_job(w uuid, jobname text, rep text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(jobname, '') <> '' and exists (
    select 1 from public.docs d
    where d.workspace_id = w and d.id = 'job:' || jobname and not d.deleted and public.job_has_rep(d.data, rep))
$$;

-- what a rep may read. (The shared money rates are readable, nothing else in the settings.)
create or replace function public.rep_can(w uuid, k text, did text, d jsonb) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when public.my_rep_name(w) is null then false
    when k = 'job'              then public.job_has_rep(d, public.my_rep_name(w))
    when k in ('msg', 'note')   then public.rep_sees_job(w, d->>'job', public.my_rep_name(w))
    when k = 'task'             then public.rep_sees_job(w, d->>'project', public.my_rep_name(w))
    when k = 'lead'             then d->>'rep' = public.my_rep_name(w)
    when k = 'report'           then d->>'rep' = public.my_rep_name(w)
    when k = 'sub'              then true
    when k = 'cfg'              then did = 'cfg:rates'
    else false end
$$;

-- docs: staff see everything, reps see only what rep_can allows
drop policy if exists docs_all        on public.docs;
drop policy if exists docs_staff      on public.docs;
drop policy if exists docs_rep_select on public.docs;
drop policy if exists docs_rep_insert on public.docs;
drop policy if exists docs_rep_update on public.docs;

create policy docs_staff on public.docs for all
  using      (public.my_role(workspace_id) in ('owner', 'member'))
  with check (public.my_role(workspace_id) in ('owner', 'member'));

create policy docs_rep_select on public.docs for select using (
  public.my_role(workspace_id) = 'rep' and (
    public.rep_can(workspace_id, kind, id, data)
    or (kind = 'task' and coalesce(data->>'project', '') = '' and updated_by = auth.uid())));

-- a rep can write only what they can read, and never the shared settings
create policy docs_rep_insert on public.docs for insert with check (
  public.my_role(workspace_id) = 'rep' and kind <> 'cfg' and (
    public.rep_can(workspace_id, kind, id, data)
    or (kind = 'task' and coalesce(data->>'project', '') = '' and updated_by = auth.uid())));

create policy docs_rep_update on public.docs for update
  using (
    public.my_role(workspace_id) = 'rep' and kind <> 'cfg' and (
      public.rep_can(workspace_id, kind, id, data)
      or (kind = 'task' and coalesce(data->>'project', '') = '' and updated_by = auth.uid())))
  with check (
    public.my_role(workspace_id) = 'rep' and kind <> 'cfg' and (
      public.rep_can(workspace_id, kind, id, data)
      or (kind = 'task' and coalesce(data->>'project', '') = '' and updated_by = auth.uid())));

-- reps cannot see who else has an account
drop policy if exists mem_read on public.members;
create policy mem_read on public.members for select using (
  user_id = auth.uid() or (workspace_id in (select public.my_workspaces()) and not public.i_am_rep()));
drop policy if exists prof_read on public.profiles;
create policy prof_read on public.profiles for select using (
  id = auth.uid() or (not public.i_am_rep()
    and id in (select user_id from public.members where workspace_id in (select public.my_workspaces()))));

-- photos, videos and files: a rep only gets files attached to messages they can read
drop policy if exists media_read on storage.objects;
create policy media_read on storage.objects for select using (
  bucket_id = 'media'
  and (storage.foldername(name))[1] in (select w::text from public.my_workspaces() w)
  and (
    coalesce(public.my_role(((storage.foldername(name))[1])::uuid), '') <> 'rep'
    or exists (
      select 1 from public.docs d
      where d.workspace_id::text = (storage.foldername(name))[1] and d.kind = 'msg'
        and jsonb_path_exists(d.data, '$.attach[*] ? (@.id == $id)', jsonb_build_object('id', split_part(name, '/', 2)))))
);
drop policy if exists media_delete on storage.objects;
create policy media_delete on storage.objects for delete using (
  bucket_id = 'media'
  and (storage.foldername(name))[1] in (select w::text from public.my_workspaces() w)
  and coalesce(public.my_role(((storage.foldername(name))[1])::uuid), '') <> 'rep');

-- first sign-in: joins the workspace the email was invited to, with the access it was invited with
create or replace function public.bootstrap() returns uuid
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); mail text := lower(auth.jwt() ->> 'email'); ws uuid; inv record;
begin
  if uid is null then raise exception 'not signed in'; end if;
  insert into profiles (id, email) values (uid, mail)
    on conflict (id) do update set email = excluded.email;
  select workspace_id into ws from members where user_id = uid limit 1;
  if ws is not null then return ws; end if;
  select * into inv from invites where lower(email) = mail limit 1;
  if inv is null then raise exception 'This email has not been invited yet.'; end if;
  insert into members (workspace_id, user_id, role, rep_name)
    values (inv.workspace_id, uid, inv.role, case when inv.role = 'rep' then nullif(trim(inv.rep_name), '') end);
  delete from invites where workspace_id = inv.workspace_id and lower(email) = mail;
  return inv.workspace_id;
end $$;

-- a rep can read their own access settings (role and rep name) to set up the app
-- (covered by mem_read: user_id = auth.uid())
