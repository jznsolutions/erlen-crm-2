-- =============================================================================
-- ERLEN CRM – Dokumente, Ankündigungen und private Dateiablage
-- =============================================================================

create table public.document_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create unique index document_categories_name_idx on public.document_categories (lower(name));

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 2 and 200),
  description text,
  category_id uuid references public.document_categories (id) on delete set null,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  is_published boolean not null default true,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index documents_category_idx on public.documents (category_id);
create index documents_search_idx on public.documents
  using gin (to_tsvector('german', title || ' ' || coalesce(description, '')));

-- Freigaben: Rolle, Team oder Person (genau eines). Ohne Freigabe nur Dokumentverwaltung.
create table public.document_permissions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  role_id uuid references public.roles (id) on delete cascade,
  team_id uuid references public.teams (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (num_nonnulls(role_id, team_id, user_id) = 1)
);
create unique index document_permissions_unique_idx
  on public.document_permissions (document_id, coalesce(role_id, team_id, user_id));

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 2 and 200),
  body text not null check (char_length(body) between 1 and 10000),
  audience_role_ids uuid[] not null default '{}',   -- leer = alle aktiven Mitarbeiter
  is_pinned boolean not null default false,
  published_at timestamptz not null default now(),
  expires_at timestamptz,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create trigger documents_touch before update on public.documents
  for each row execute function private.touch_updated_at();
create trigger documents_audit after insert or update or delete on public.documents
  for each row execute function private.audit_trigger();
create trigger document_permissions_audit after insert or update or delete on public.document_permissions
  for each row execute function private.audit_trigger('user_id');
create trigger announcements_audit after insert or update or delete on public.announcements
  for each row execute function private.audit_trigger();

create or replace function private.can_view_document(p_viewer uuid, p_document uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_permission(p_viewer, 'documents.manage')
    or exists (
      select 1 from public.documents d
      where d.id = p_document
        and d.is_published
        and private.has_permission(p_viewer, 'documents.read')
        and exists (
          select 1 from public.document_permissions dp
          where dp.document_id = d.id
            and (dp.user_id = p_viewer
                 or dp.role_id = (select role_id from public.profiles where id = p_viewer)
                 or dp.team_id = private.current_team_id(p_viewer)))
    );
$$;

create or replace function private.can_view_announcement(p_viewer uuid, p_audience uuid[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_active_user(p_viewer) and (
    cardinality(p_audience) = 0
    or (select role_id from public.profiles where id = p_viewer) = any (p_audience)
    or private.has_permission(p_viewer, 'announcements.manage'));
$$;

alter table public.document_categories enable row level security;
alter table public.documents enable row level security;
alter table public.document_permissions enable row level security;
alter table public.announcements enable row level security;

create policy document_categories_select on public.document_categories for select to authenticated
  using (private.is_active_user((select auth.uid())));
create policy documents_select on public.documents for select to authenticated
  using (private.can_view_document((select auth.uid()), id));
create policy document_permissions_select on public.document_permissions for select to authenticated
  using (private.has_permission((select auth.uid()), 'documents.manage'));
create policy announcements_select on public.announcements for select to authenticated
  using (
    private.can_view_announcement((select auth.uid()), audience_role_ids)
    and (published_at <= now() or private.has_permission((select auth.uid()), 'announcements.manage'))
    and (expires_at is null or expires_at > now() or private.has_permission((select auth.uid()), 'announcements.manage'))
  );

-- =============================================================================
-- RPCs
-- =============================================================================

create or replace function public.document_category_upsert(p_id uuid, p_name text, p_sort_order int default 0)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform private.require_permission('documents.manage');
  if p_id is null then
    insert into public.document_categories (name, sort_order) values (trim(p_name), coalesce(p_sort_order, 0))
    returning id into v_id;
  else
    update public.document_categories set name = trim(p_name), sort_order = coalesce(p_sort_order, 0)
     where id = p_id returning id into v_id;
  end if;
  return v_id;
end;
$$;

-- Dokument registrieren (Datei wurde zuvor in den privaten Bucket "documents" hochgeladen)
create or replace function public.document_create(
  p_title text, p_description text, p_category uuid, p_storage_path text,
  p_file_name text, p_mime_type text, p_size_bytes bigint, p_access jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform private.require_permission('documents.manage');
  if not exists (select 1 from storage.objects where bucket_id = 'documents' and name = p_storage_path) then
    raise exception 'Datei wurde nicht gefunden. Bitte erneut hochladen.';
  end if;
  insert into public.documents (title, description, category_id, storage_path, file_name, mime_type, size_bytes, created_by)
  values (trim(p_title), nullif(trim(p_description), ''), p_category, p_storage_path, p_file_name, p_mime_type,
          p_size_bytes, auth.uid())
  returning id into v_id;
  perform public.document_set_access(v_id, p_access);
  return v_id;
end;
$$;

create or replace function public.document_update(
  p_id uuid, p_title text, p_description text, p_category uuid, p_is_published boolean, p_access jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_permission('documents.manage');
  update public.documents
     set title = trim(p_title), description = nullif(trim(p_description), ''),
         category_id = p_category, is_published = coalesce(p_is_published, true)
   where id = p_id;
  if not found then raise exception 'Dokument nicht gefunden'; end if;
  perform public.document_set_access(p_id, p_access);
end;
$$;

-- p_access: [{"role_id": ...} | {"team_id": ...} | {"user_id": ...}]
create or replace function public.document_set_access(p_document uuid, p_access jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e jsonb;
begin
  perform private.require_permission('documents.manage');
  delete from public.document_permissions where document_id = p_document;
  for e in select * from jsonb_array_elements(coalesce(p_access, '[]')) loop
    insert into public.document_permissions (document_id, role_id, team_id, user_id)
    values (p_document, (e ->> 'role_id')::uuid, (e ->> 'team_id')::uuid, (e ->> 'user_id')::uuid);
  end loop;
end;
$$;

-- Löscht den Datensatz und gibt den Speicherpfad zurück (Datei wird serverseitig entfernt)
create or replace function public.document_delete(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_path text;
begin
  perform private.require_permission('documents.manage');
  delete from public.documents where id = p_id returning storage_path into v_path;
  if v_path is null then raise exception 'Dokument nicht gefunden'; end if;
  return v_path;
end;
$$;

create or replace function public.announcement_upsert(
  p_id uuid, p_title text, p_body text, p_audience_role_ids uuid[], p_is_pinned boolean,
  p_expires_at timestamptz, p_notify boolean default true)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  u record;
begin
  perform private.require_permission('announcements.manage');
  if p_id is null then
    insert into public.announcements (title, body, audience_role_ids, is_pinned, expires_at, created_by)
    values (trim(p_title), trim(p_body), coalesce(p_audience_role_ids, '{}'), coalesce(p_is_pinned, false),
            p_expires_at, auth.uid())
    returning id into v_id;
    if coalesce(p_notify, true) then
      for u in select id from public.profiles where status = 'aktiv' and id <> auth.uid() loop
        if private.can_view_announcement(u.id, coalesce(p_audience_role_ids, '{}')) then
          perform private.notify(u.id, 'ankuendigung', 'Neue Mitteilung: ' || trim(p_title), null, '/dokumente#mitteilungen');
        end if;
      end loop;
    end if;
  else
    update public.announcements
       set title = trim(p_title), body = trim(p_body), audience_role_ids = coalesce(p_audience_role_ids, '{}'),
           is_pinned = coalesce(p_is_pinned, false), expires_at = p_expires_at
     where id = p_id returning id into v_id;
    if v_id is null then raise exception 'Mitteilung nicht gefunden'; end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.announcement_delete(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_permission('announcements.manage');
  delete from public.announcements where id = p_id;
end;
$$;

-- =============================================================================
-- Private Storage-Buckets und Zugriffsrichtlinien
-- =============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('documents', 'documents', false, 52428800, null),
  ('academy', 'academy', false, 524288000,
   array['video/mp4', 'video/webm', 'application/pdf', 'image/png', 'image/jpeg', 'image/webp']),
  ('avatars', 'avatars', false, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create or replace function private.can_read_academy_object(p_viewer uuid, p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_permission(p_viewer, 'training.manage')
    or exists (select 1 from public.lessons l
               where (l.video_path = p_name or l.document_path = p_name)
                 and private.can_view_lesson(p_viewer, l.id))
    or exists (select 1 from public.courses c
               where c.cover_path = p_name and private.can_view_course(p_viewer, c.id));
$$;

create or replace function private.can_read_avatar(p_viewer uuid, p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.avatar_path = p_name
      and (p.id in (select private.visible_user_ids(p_viewer, 'employees'))
           or p.id in (select private.own_contact_ids(p_viewer)))
  ) or (private.is_active_user(p_viewer) and split_part(p_name, '/', 1) = p_viewer::text);
$$;

grant execute on all functions in schema private to authenticated, service_role;

create policy storage_documents_select on storage.objects for select to authenticated
  using (bucket_id = 'documents' and (
    private.has_permission((select auth.uid()), 'documents.manage')
    or exists (select 1 from public.documents d
               where d.storage_path = name and private.can_view_document((select auth.uid()), d.id))));
create policy storage_documents_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and private.has_permission((select auth.uid()), 'documents.manage'));
create policy storage_documents_delete on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and private.has_permission((select auth.uid()), 'documents.manage'));

create policy storage_academy_select on storage.objects for select to authenticated
  using (bucket_id = 'academy' and private.can_read_academy_object((select auth.uid()), name));
create policy storage_academy_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'academy' and private.has_permission((select auth.uid()), 'training.manage'));
create policy storage_academy_update on storage.objects for update to authenticated
  using (bucket_id = 'academy' and private.has_permission((select auth.uid()), 'training.manage'));
create policy storage_academy_delete on storage.objects for delete to authenticated
  using (bucket_id = 'academy' and private.has_permission((select auth.uid()), 'training.manage'));

create policy storage_avatars_select on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and private.can_read_avatar((select auth.uid()), name));
create policy storage_avatars_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and private.is_active_user((select auth.uid()))
              and split_part(name, '/', 1) = (select auth.uid())::text);
create policy storage_avatars_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and split_part(name, '/', 1) = (select auth.uid())::text);
create policy storage_avatars_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and split_part(name, '/', 1) = (select auth.uid())::text);
