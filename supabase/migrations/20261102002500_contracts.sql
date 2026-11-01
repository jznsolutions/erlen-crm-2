-- =============================================================================
-- ERLEN CRM – Digitale Vertragsunterschrift
--   * Verwaltung lädt Vertragsvorlagen (PDF) hoch und weist sie Personen zu
--     (optional automatisch allen neuen Mitarbeitenden).
--   * Die Person liest den Vertrag im Portal und unterschreibt (Name + Unterschrift
--     am Bildschirm). Der Server erzeugt daraus ein PDF mit Unterschriftsseite und
--     legt es unter „Unterlagen“ (Art: Vertrag) ab.
-- =============================================================================

create table if not exists public.contract_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 2 and 120),
  storage_path text not null unique,
  file_name text not null check (char_length(file_name) <= 200),
  auto_assign boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.contract_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  template_id uuid not null references public.contract_templates (id) on delete restrict,
  status text not null default 'offen' check (status in ('offen', 'unterschrieben', 'zurueckgezogen')),
  requested_by uuid references public.profiles (id) on delete set null,
  requested_at timestamptz not null default now(),
  signed_at timestamptz,
  signed_name text check (signed_name is null or char_length(signed_name) between 3 and 120),
  document_hash text check (document_hash is null or document_hash ~ '^[0-9a-f]{64}$'),
  employee_document_id uuid references public.employee_documents (id) on delete set null
);
create unique index if not exists contract_requests_open_idx on public.contract_requests (user_id, template_id) where status = 'offen';

drop trigger if exists contract_templates_audit on public.contract_templates;
create trigger contract_templates_audit after insert or update or delete on public.contract_templates
  for each row execute function private.audit_trigger();
drop trigger if exists contract_requests_audit on public.contract_requests;
create trigger contract_requests_audit after insert or update or delete on public.contract_requests
  for each row execute function private.audit_trigger('user_id');

alter table public.contract_templates enable row level security;
alter table public.contract_requests enable row level security;
drop policy if exists contract_templates_select on public.contract_templates;
create policy contract_templates_select on public.contract_templates for select to authenticated
  using (
    private.has_permission((select auth.uid()), 'employee_docs.manage')
    or exists (select 1 from public.contract_requests r where r.template_id = contract_templates.id and r.user_id = (select auth.uid()))
  );
drop policy if exists contract_requests_select on public.contract_requests;
create policy contract_requests_select on public.contract_requests for select to authenticated
  using (
    (user_id = (select auth.uid()) and private.is_active_user((select auth.uid())))
    or private.has_permission((select auth.uid()), 'employee_docs.manage')
  );

-- Privater Speicher für Vorlagen (nur PDF); Zugriff nur über den Server
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('contracts', 'contracts', false, 15728640, array['application/pdf'])
on conflict (id) do nothing;
drop policy if exists storage_contracts_insert on storage.objects;
create policy storage_contracts_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'contracts' and private.has_permission((select auth.uid()), 'employee_docs.manage'));
drop policy if exists storage_contracts_select on storage.objects;
create policy storage_contracts_select on storage.objects for select to authenticated
  using (bucket_id = 'contracts' and private.has_permission((select auth.uid()), 'employee_docs.manage'));

create or replace function public.contract_template_register(p_title text, p_storage_path text, p_file_name text, p_auto_assign boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform private.require_permission('employee_docs.manage');
  if not exists (select 1 from storage.objects where bucket_id = 'contracts' and name = p_storage_path) then
    raise exception 'Datei wurde nicht gefunden. Bitte erneut hochladen.';
  end if;
  insert into public.contract_templates (title, storage_path, file_name, auto_assign, created_by)
  values (trim(p_title), p_storage_path, left(p_file_name, 200), coalesce(p_auto_assign, false), auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.contract_template_update(p_id uuid, p_auto_assign boolean, p_is_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_permission('employee_docs.manage');
  update public.contract_templates set auto_assign = coalesce(p_auto_assign, false), is_active = coalesce(p_is_active, true) where id = p_id;
  if not found then raise exception 'Vorlage nicht gefunden'; end if;
end;
$$;

create or replace function private.contract_request_insert(p_user uuid, p_template uuid, p_by uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_title text;
begin
  select title into v_title from public.contract_templates where id = p_template and is_active;
  if v_title is null then raise exception 'Vorlage nicht gefunden oder inaktiv'; end if;
  if exists (select 1 from public.contract_requests where user_id = p_user and template_id = p_template and status in ('offen', 'unterschrieben')) then
    raise exception 'Dieser Vertrag ist der Person bereits zugewiesen.';
  end if;
  insert into public.contract_requests (user_id, template_id, requested_by) values (p_user, p_template, p_by) returning id into v_id;
  perform private.notify(p_user, 'vertrag', 'Vertrag zum Unterschreiben: ' || v_title, 'Bitte lesen und direkt im Portal unterschreiben.', '/vertrag/' || v_id);
  return v_id;
end;
$$;

create or replace function public.contract_request_create(p_user uuid, p_template uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_permission('employee_docs.manage');
  if not private.is_active_user(p_user) then raise exception 'Nur aktive Mitarbeitende können Verträge erhalten.'; end if;
  return private.contract_request_insert(p_user, p_template, auth.uid());
end;
$$;

create or replace function public.contract_request_withdraw(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_permission('employee_docs.manage');
  update public.contract_requests set status = 'zurueckgezogen' where id = p_id and status = 'offen';
  if not found then raise exception 'Nur offene Anfragen können zurückgezogen werden.'; end if;
end;
$$;

-- Abschluss der Unterschrift (vom Server aufgerufen, im Namen der unterschreibenden Person)
create or replace function public.contract_sign_complete(p_request uuid, p_signed_name text, p_document_path text, p_document_hash text, p_size int)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.contract_requests;
  v_title text;
  v_doc uuid;
  v_name text;
begin
  if auth.uid() is null or not private.is_active_user(auth.uid()) then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  select * into r from public.contract_requests where id = p_request for update;
  if r.id is null or r.user_id <> auth.uid() then raise exception 'Vertrag nicht gefunden'; end if;
  if r.status <> 'offen' then raise exception 'Dieser Vertrag ist nicht mehr offen.'; end if;
  if split_part(p_document_path, '/', 1) <> auth.uid()::text
     or not exists (select 1 from storage.objects where bucket_id = 'employee-docs' and name = p_document_path) then
    raise exception 'Unterschriebenes Dokument fehlt';
  end if;
  select title into v_title from public.contract_templates where id = r.template_id;
  insert into public.employee_documents (user_id, category, title, storage_path, file_name, mime_type, size_bytes, uploaded_by, status, reviewed_at)
  values (auth.uid(), 'vertrag', left(v_title || ' (digital unterschrieben)', 120), p_document_path,
          left(regexp_replace(v_title, '[^A-Za-z0-9ÄÖÜäöüß _-]', '', 'g'), 150) || ' - unterschrieben.pdf',
          'application/pdf', p_size, auth.uid(), 'geprueft', now())
  returning id into v_doc;
  update public.contract_requests
     set status = 'unterschrieben', signed_at = now(), signed_name = trim(p_signed_name), document_hash = p_document_hash, employee_document_id = v_doc
   where id = r.id;
  select first_name || ' ' || last_name into v_name from public.profiles where id = auth.uid();
  perform private.notify(p.id, 'vertrag', 'Vertrag unterschrieben: ' || v_name, v_title, '/mitarbeiter/' || auth.uid() || '#unterlagen')
  from public.profiles p
  where p.status = 'aktiv' and p.id <> auth.uid() and private.has_permission(p.id, 'employee_docs.manage');
  return v_doc;
end;
$$;

-- Neue Mitarbeitende: Vorlagen mit „automatisch zuweisen“ beim Aktivwerden zuweisen
create or replace function private.contract_auto_assign()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  t record;
begin
  if new.status = 'aktiv' and (tg_op = 'INSERT' or old.status is distinct from 'aktiv') then
    for t in select id from public.contract_templates where auto_assign and is_active loop
      if not exists (select 1 from public.contract_requests where user_id = new.id and template_id = t.id) then
        perform private.contract_request_insert(new.id, t.id, null);
      end if;
    end loop;
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_contract_auto_assign on public.profiles;
create trigger profiles_contract_auto_assign after insert or update of status on public.profiles
  for each row execute function private.contract_auto_assign();

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
revoke execute on function public.competition_watch() from authenticated;
revoke execute on function public.document_expiry_watch() from authenticated;
revoke execute on function public.monthly_report_data(date, date) from authenticated;
revoke execute on function public.monthly_report_recipients() from authenticated;
revoke execute on function public.monthly_report_claim(text) from authenticated;
revoke execute on function public.referral_resolve(text) from authenticated;
revoke execute on function public.career_watch() from authenticated;
revoke execute on function public.badge_watch() from authenticated;
revoke execute on function public.weekly_review_run(timestamptz) from authenticated;
grant execute on all functions in schema private to authenticated, service_role;
revoke execute on all functions in schema private from public, anon;

insert into private.schema_migrations (name) values ('20261102002500_contracts.sql') on conflict do nothing;
