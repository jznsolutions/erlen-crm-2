-- =============================================================================
-- ERLEN CRM – Unterlagen der Mitarbeiter (Gewerbeanmeldung, Führerschein, Ausweis …)
--   Mitarbeiter laden eigene Dokumente/Fotos hoch; sichtbar nur für sie selbst und
--   für Personen mit „employee_docs.manage“ (Agenturleitung, Administration).
-- =============================================================================

insert into public.permissions (key, category, description) values
  ('employee_docs.manage', 'Mitarbeiter', 'Unterlagen der Mitarbeiter einsehen, prüfen und verwalten')
on conflict (key) do nothing;
insert into public.role_permissions (role_id, permission_key)
select r.id, 'employee_docs.manage' from public.roles r where r.key in ('agenturleiter', 'admin')
on conflict do nothing;

create type public.employee_document_status as enum ('eingereicht', 'geprueft', 'abgelehnt');

create table public.employee_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  category text not null check (category in ('gewerbeanmeldung', 'fuehrerschein', 'personalausweis', 'steuer', 'bankdaten', 'vertrag', 'nachweis', 'sonstiges')),
  title text check (title is null or char_length(title) <= 120),
  storage_path text not null unique,
  file_name text not null check (char_length(file_name) <= 200),
  mime_type text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif')),
  size_bytes int not null check (size_bytes between 1 and 15728640),
  valid_until date,
  status public.employee_document_status not null default 'eingereicht',
  review_note text check (review_note is null or char_length(review_note) <= 500),
  uploaded_by uuid references public.profiles (id) on delete set null,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index employee_documents_user_idx on public.employee_documents (user_id, created_at desc);
create index employee_documents_open_idx on public.employee_documents (created_at) where status = 'eingereicht';

create trigger employee_documents_audit after insert or update or delete on public.employee_documents
  for each row execute function private.audit_trigger('user_id');

alter table public.employee_documents enable row level security;
create policy employee_documents_select on public.employee_documents for select to authenticated
  using (
    (user_id = (select auth.uid()) and private.is_active_user((select auth.uid())))
    or private.has_permission((select auth.uid()), 'employee_docs.manage')
  );

-- Hochgeladene Datei registrieren (eigene Unterlagen oder – mit Berechtigung – für andere)
create or replace function public.employee_document_register(
  p_user uuid, p_category text, p_title text, p_storage_path text, p_file_name text, p_mime text, p_size int, p_valid_until date)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_name text;
  v_label text;
  v_manager boolean := private.has_permission(auth.uid(), 'employee_docs.manage');
begin
  if auth.uid() is null or not private.is_active_user(auth.uid()) then raise exception 'Keine Berechtigung' using errcode = '42501'; end if;
  if p_user <> auth.uid() and not v_manager then raise exception 'Keine Berechtigung' using errcode = '42501'; end if;
  if split_part(p_storage_path, '/', 1) <> p_user::text then raise exception 'Ungültiger Ablageort'; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'employee-docs' and name = p_storage_path) then
    raise exception 'Datei wurde nicht gefunden. Bitte erneut hochladen.';
  end if;
  insert into public.employee_documents (user_id, category, title, storage_path, file_name, mime_type, size_bytes, valid_until, uploaded_by,
                                         status, reviewed_by, reviewed_at)
  values (p_user, p_category, nullif(trim(p_title), ''), p_storage_path, left(p_file_name, 200), p_mime, p_size, p_valid_until, auth.uid(),
          case when v_manager and p_user <> auth.uid() then 'geprueft'::public.employee_document_status else 'eingereicht' end,
          case when v_manager and p_user <> auth.uid() then auth.uid() end,
          case when v_manager and p_user <> auth.uid() then now() end)
  returning id into v_id;

  -- Verwaltung informieren, wenn ein Mitarbeiter selbst etwas hochlädt
  if p_user = auth.uid() then
    select first_name || ' ' || last_name into v_name from public.profiles where id = p_user;
    v_label := case p_category when 'gewerbeanmeldung' then 'Gewerbeanmeldung' when 'fuehrerschein' then 'Führerschein'
                 when 'personalausweis' then 'Personalausweis' when 'steuer' then 'Steuerunterlagen' when 'bankdaten' then 'Bankdaten'
                 when 'vertrag' then 'Vertrag' when 'nachweis' then 'Nachweis' else 'Unterlage' end;
    perform private.notify(p.id, 'unterlage_neu', 'Neue Unterlage: ' || v_name, v_label || coalesce(' – ' || nullif(trim(p_title), ''), ''),
                           '/mitarbeiter/' || p_user || '#unterlagen')
    from public.profiles p
    where p.status = 'aktiv' and p.id <> p_user and private.has_permission(p.id, 'employee_docs.manage');
  end if;
  return v_id;
end;
$$;

create or replace function public.employee_document_review(p_id uuid, p_status public.employee_document_status, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.employee_documents;
begin
  perform private.require_permission('employee_docs.manage');
  if p_status = 'abgelehnt' and nullif(trim(p_note), '') is null then raise exception 'Bitte einen Grund für die Ablehnung angeben.'; end if;
  update public.employee_documents
     set status = p_status, review_note = nullif(trim(p_note), ''), reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_id returning * into d;
  if d.id is null then raise exception 'Unterlage nicht gefunden'; end if;
  if p_status = 'abgelehnt' then
    perform private.notify(d.user_id, 'unterlage_abgelehnt', 'Unterlage bitte erneut hochladen', trim(p_note), '/unterlagen');
  elsif p_status = 'geprueft' then
    perform private.notify(d.user_id, 'unterlage_geprueft', 'Unterlage geprüft', coalesce(d.title, d.file_name), '/unterlagen');
  end if;
end;
$$;

-- Löschen: eigene, noch nicht geprüfte Unterlagen – oder durch die Verwaltung. Gibt den Dateipfad zurück.
create or replace function public.employee_document_delete(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_path text;
begin
  delete from public.employee_documents d
   where d.id = p_id
     and (private.has_permission(auth.uid(), 'employee_docs.manage')
          or (d.user_id = auth.uid() and d.status <> 'geprueft' and private.is_active_user(auth.uid())))
  returning storage_path into v_path;
  if v_path is null then raise exception 'Unterlage nicht gefunden oder bereits geprüft (Löschen nur durch die Verwaltung).'; end if;
  -- Die Datei selbst löscht der Server über die Speicher-Schnittstelle
  return v_path;
end;
$$;

-- Privater Speicher (PDF und Fotos, max. 15 MB)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('employee-docs', 'employee-docs', false, 15728640,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do nothing;

create policy storage_employee_docs_select on storage.objects for select to authenticated
  using (bucket_id = 'employee-docs' and (
    (split_part(name, '/', 1) = (select auth.uid())::text and private.is_active_user((select auth.uid())))
    or private.has_permission((select auth.uid()), 'employee_docs.manage')));
create policy storage_employee_docs_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'employee-docs' and private.is_active_user((select auth.uid())) and (
    split_part(name, '/', 1) = (select auth.uid())::text
    or private.has_permission((select auth.uid()), 'employee_docs.manage')));
create policy storage_employee_docs_delete on storage.objects for delete to authenticated
  using (bucket_id = 'employee-docs' and (
    private.has_permission((select auth.uid()), 'employee_docs.manage')
    or (split_part(name, '/', 1) = (select auth.uid())::text
        and not exists (select 1 from public.employee_documents d where d.storage_path = name and d.status = 'geprueft'))));

-- Rechte
revoke all on all tables in schema public from anon;
revoke insert, update, delete, truncate, references, trigger on all tables in schema public from authenticated;
grant select on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
revoke execute on function public.invitation_lookup(text) from authenticated;
revoke execute on function public.invitation_accept(uuid, uuid) from authenticated;
revoke execute on function public.rate_limit_hit(text, int, int) from authenticated;
revoke execute on function public.purge_applicants(int) from authenticated;
revoke execute on function public.bootstrap_admin(text) from authenticated, service_role;
revoke execute on function public.booking_free_slots(int) from authenticated;
revoke execute on function public.booking_create(timestamptz, text, text, text, text, text) from authenticated;
revoke execute on function public.booking_cancel_by_token(text) from authenticated;
revoke execute on function public.booking_lookup_by_token(text) from authenticated;
revoke execute on function public.booking_claim_reminders() from authenticated;
revoke execute on function public.push_vapid_keys(text, text) from authenticated;
revoke execute on function public.push_claim_pending() from authenticated;
revoke execute on function public.push_subscriptions_for(uuid[]) from authenticated;
revoke execute on function public.push_subscription_remove(uuid) from authenticated;
grant execute on all functions in schema private to authenticated, service_role;
revoke execute on all functions in schema private from public, anon;

insert into private.schema_migrations (name) values ('20261031001200_employee_documents.sql') on conflict do nothing;
