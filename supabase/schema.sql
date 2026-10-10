-- OAF shared workspace: run this ONCE in the Supabase SQL editor.
-- Before running, replace YOUR_EMAIL_HERE (last section) with your own email.

create extension if not exists pgcrypto;

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'My company',
  created_at timestamptz default now()
);
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text, name text, created_at timestamptz default now()
);
create table if not exists public.members (
  workspace_id uuid references public.workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role text not null default 'member',
  primary key (workspace_id, user_id)
);
create table if not exists public.invites (
  workspace_id uuid references public.workspaces(id) on delete cascade,
  email text not null, role text not null default 'member',
  created_at timestamptz default now(),
  primary key (workspace_id, email)
);
-- every task, job, message, note and team contact is one row here
create table if not exists public.docs (
  workspace_id uuid references public.workspaces(id) on delete cascade,
  id text, kind text not null,
  data jsonb not null default '{}'::jsonb,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  primary key (workspace_id, id)
);
create index if not exists docs_updated on public.docs (workspace_id, updated_at);

create or replace function public.touch() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  new.updated_by = coalesce(auth.uid(), new.updated_by);
  return new;
end $$;
drop trigger if exists docs_touch on public.docs;
create trigger docs_touch before insert or update on public.docs
  for each row execute function public.touch();

create or replace function public.my_workspaces() returns setof uuid
language sql stable security definer set search_path = public as $$
  select workspace_id from public.members where user_id = auth.uid()
$$;
create or replace function public.owner_workspaces() returns setof uuid
language sql stable security definer set search_path = public as $$
  select workspace_id from public.members where user_id = auth.uid() and role = 'owner'
$$;

alter table public.workspaces enable row level security;
alter table public.profiles   enable row level security;
alter table public.members    enable row level security;
alter table public.invites    enable row level security;
alter table public.docs       enable row level security;

drop policy if exists ws_read on public.workspaces;
create policy ws_read on public.workspaces for select using (id in (select public.my_workspaces()));

drop policy if exists prof_read on public.profiles;
create policy prof_read on public.profiles for select using (
  id = auth.uid() or id in (select user_id from public.members where workspace_id in (select public.my_workspaces())));
drop policy if exists prof_write on public.profiles;
create policy prof_write on public.profiles for insert with check (id = auth.uid());
drop policy if exists prof_update on public.profiles;
create policy prof_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists mem_read on public.members;
create policy mem_read on public.members for select using (workspace_id in (select public.my_workspaces()));

drop policy if exists inv_all on public.invites;
create policy inv_all on public.invites for all
  using (workspace_id in (select public.owner_workspaces()))
  with check (workspace_id in (select public.owner_workspaces()));

drop policy if exists docs_all on public.docs;
create policy docs_all on public.docs for all
  using (workspace_id in (select public.my_workspaces()))
  with check (workspace_id in (select public.my_workspaces()));

-- first sign-in: joins the workspace the email was invited to
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
  insert into members (workspace_id, user_id, role) values (inv.workspace_id, uid, inv.role);
  delete from invites where workspace_id = inv.workspace_id and lower(email) = mail;
  return inv.workspace_id;
end $$;

-- private file storage for photos, videos and documents
insert into storage.buckets (id, name, public) values ('media', 'media', false) on conflict (id) do nothing;
drop policy if exists media_read on storage.objects;
create policy media_read on storage.objects for select using (
  bucket_id = 'media' and (storage.foldername(name))[1] in (select w::text from public.my_workspaces() w));
drop policy if exists media_insert on storage.objects;
create policy media_insert on storage.objects for insert with check (
  bucket_id = 'media' and (storage.foldername(name))[1] in (select w::text from public.my_workspaces() w));
drop policy if exists media_update on storage.objects;
create policy media_update on storage.objects for update using (
  bucket_id = 'media' and (storage.foldername(name))[1] in (select w::text from public.my_workspaces() w));
drop policy if exists media_delete on storage.objects;
create policy media_delete on storage.objects for delete using (
  bucket_id = 'media' and (storage.foldername(name))[1] in (select w::text from public.my_workspaces() w));

-- live updates
do $$ begin
  alter publication supabase_realtime add table public.docs;
exception when duplicate_object then null; end $$;

-- you: the first person allowed in (the owner). Replace YOUR_EMAIL_HERE.
do $$
declare w uuid;
begin
  if not exists (select 1 from public.workspaces) then
    insert into public.workspaces (name) values ('My company') returning id into w;
    insert into public.invites (workspace_id, email, role) values (w, lower('YOUR_EMAIL_HERE'), 'owner');
  end if;
end $$;
