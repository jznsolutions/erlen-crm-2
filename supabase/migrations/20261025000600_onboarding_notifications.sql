-- =============================================================================
-- ERLEN CRM – Benachrichtigungen, Einladungen/Onboarding, Bewerber, Rechte
-- =============================================================================

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  link text check (link is null or link ~ '^/'),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

alter table public.notifications enable row level security;
create policy notifications_select on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));

create or replace function private.notify(
  p_user uuid, p_type text, p_title text, p_body text default null, p_link text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user is null then return; end if;
  insert into public.notifications (user_id, type, title, body, link)
  values (p_user, p_type, left(p_title, 200), left(p_body, 1000), p_link);
end;
$$;

create or replace function public.notifications_mark_read(p_ids uuid[] default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.notifications
     set read_at = now()
   where user_id = auth.uid() and read_at is null
     and (p_ids is null or id = any (p_ids));
end;
$$;

-- =============================================================================
-- Einladungen
-- =============================================================================
-- Der Klartext-Token existiert nur im Einladungslink. Gespeichert wird
-- ausschließlich ein SHA-256-Hash. Einladungen sind zeitlich begrenzt und
-- einmalig verwendbar.
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null check (position('@' in email) > 1),
  first_name text not null check (char_length(first_name) between 1 and 100),
  last_name text not null check (char_length(last_name) between 1 and 100),
  role_id uuid not null references public.roles (id),
  team_id uuid references public.teams (id) on delete set null,
  supervisor_id uuid references public.profiles (id) on delete set null,
  trainer_id uuid references public.profiles (id) on delete set null,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_user_id uuid references public.profiles (id),
  revoked_at timestamptz,
  applicant_id uuid,
  invited_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create unique index invitations_open_email_idx on public.invitations (lower(email))
  where accepted_at is null and revoked_at is null;

create trigger invitations_audit after insert or update or delete on public.invitations
  for each row execute function private.audit_trigger();

alter table public.invitations enable row level security;
create policy invitations_select on public.invitations for select to authenticated
  using (private.has_permission((select auth.uid()), 'employees.invite'));

-- Einladung anlegen (Token-Hash wird serverseitig erzeugt)
create or replace function public.invitation_create(
  p_email text, p_first_name text, p_last_name text, p_role_key text,
  p_team uuid, p_supervisor uuid, p_trainer uuid, p_token_hash text,
  p_valid_hours int default 72, p_applicant uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role uuid;
  v_id uuid;
  v_email text := lower(trim(p_email));
begin
  perform private.require_permission('employees.invite');
  select id into v_role from public.roles where key = p_role_key;
  if v_role is null then raise exception 'Unbekannte Rolle'; end if;
  -- Höhere Rollen als Vertriebspartner dürfen nur mit Rechtevergabe-Berechtigung eingeladen werden
  if p_role_key <> 'vertriebspartner' then
    perform private.require_permission('roles.assign');
  end if;
  if exists (select 1 from public.profiles where lower(email) = v_email) then
    raise exception 'Für diese E-Mail-Adresse existiert bereits ein Konto.';
  end if;
  if p_valid_hours < 1 or p_valid_hours > 336 then
    raise exception 'Gültigkeit muss zwischen 1 Stunde und 14 Tagen liegen.';
  end if;
  -- Offene Einladungen an dieselbe Adresse werden ersetzt
  update public.invitations set revoked_at = now()
   where lower(email) = v_email and accepted_at is null and revoked_at is null;
  insert into public.invitations (email, first_name, last_name, role_id, team_id, supervisor_id, trainer_id,
                                  token_hash, expires_at, invited_by, applicant_id)
  values (v_email, trim(p_first_name), trim(p_last_name), v_role, p_team, p_supervisor, p_trainer,
          p_token_hash, now() + make_interval(hours => p_valid_hours), auth.uid(), p_applicant)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.invitation_revoke(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_permission('employees.invite');
  update public.invitations set revoked_at = now()
   where id = p_id and accepted_at is null and revoked_at is null;
  if not found then raise exception 'Einladung nicht gefunden oder bereits verwendet'; end if;
end;
$$;

-- Nur für den Server (service_role): gültige Einladung anhand des Token-Hashes prüfen
create or replace function public.invitation_lookup(p_token_hash text)
returns table (id uuid, email text, first_name text, last_name text, role_name text, expires_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, i.email, i.first_name, i.last_name, r.name, i.expires_at
  from public.invitations i join public.roles r on r.id = i.role_id
  where i.token_hash = p_token_hash
    and i.accepted_at is null and i.revoked_at is null and i.expires_at > now();
$$;

-- Neuer Auth-Benutzer: Einladung einlösen (einmalig, atomar) oder deaktiviertes Profil anlegen
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role uuid;
  v_inv public.invitations;
  v_inv_id uuid := nullif(new.raw_app_meta_data ->> 'invitation_id', '')::uuid;
begin
  if v_inv_id is not null then
    update public.invitations
       set accepted_at = now(), accepted_user_id = null
     where id = v_inv_id and accepted_at is null and revoked_at is null and expires_at > now()
       and lower(email) = lower(new.email)
    returning * into v_inv;
    if v_inv.id is null then
      raise exception 'Einladung ist ungültig, abgelaufen oder wurde bereits verwendet.';
    end if;

    insert into public.profiles (id, first_name, last_name, email, role_id, status)
    values (new.id, v_inv.first_name, v_inv.last_name, new.email, v_inv.role_id, 'aktiv');
    insert into public.employee_details (user_id, entry_date)
    values (new.id, private.today_berlin());
    update public.invitations set accepted_user_id = new.id where id = v_inv.id;

    if v_inv.team_id is not null then
      insert into public.team_memberships (team_id, user_id, member_role, created_by)
      values (v_inv.team_id, new.id, 'mitglied', v_inv.invited_by);
    end if;
    if v_inv.supervisor_id is not null and v_inv.supervisor_id <> new.id then
      insert into public.reporting_relationships (employee_id, manager_id, relation_type, created_by)
      values (new.id, v_inv.supervisor_id, 'vorgesetzter', v_inv.invited_by);
    end if;
    if v_inv.trainer_id is not null and v_inv.trainer_id <> new.id then
      insert into public.reporting_relationships (employee_id, manager_id, relation_type, created_by)
      values (new.id, v_inv.trainer_id, 'ausbilder', v_inv.invited_by);
    end if;
    perform private.notify(new.id, 'willkommen', 'Willkommen bei ERLEN!',
      'Dein Konto ist eingerichtet. Ergänze bitte dein Profil und starte deine Pflichtschulungen.', '/dashboard');
    perform private.notify(v_inv.invited_by, 'einladung_angenommen',
      'Einladung angenommen: ' || v_inv.first_name || ' ' || v_inv.last_name, null,
      '/mitarbeiter/' || new.id::text);
    return new;
  end if;

  select id into v_role from public.roles where key = 'vertriebspartner';
  insert into public.profiles (id, first_name, last_name, email, role_id, status, deactivated_at)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'first_name', ''), 'Neu'),
    coalesce(nullif(new.raw_user_meta_data ->> 'last_name', ''), 'Benutzer'),
    new.email, v_role, 'deaktiviert', now());
  insert into public.employee_details (user_id) values (new.id);
  return new;
end;
$$;

-- Pflichtschulungen automatisch zuweisen bei Aktivierung, Rollen- oder Teamwechsel
create or replace function private.profiles_assign_courses()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'aktiv' then
    perform private.assign_mandatory_courses(new.id);
  end if;
  return new;
end;
$$;
create trigger profiles_assign_courses after insert or update of role_id, status on public.profiles
  for each row execute function private.profiles_assign_courses();

create or replace function private.memberships_assign_courses()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.ended_at is null and private.is_active_user(new.user_id) then
    perform private.assign_mandatory_courses(new.user_id);
  end if;
  return new;
end;
$$;
create trigger team_memberships_assign_courses after insert on public.team_memberships
  for each row execute function private.memberships_assign_courses();

-- =============================================================================
-- Bewerber (Anbindung der ERLEN-Website)
-- =============================================================================
create type public.applicant_status as enum ('neu', 'kontaktiert', 'gespraech', 'angenommen', 'abgelehnt');

create table public.applicants (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(full_name) between 2 and 160),
  email text not null check (position('@' in email) > 1 and char_length(email) <= 254),
  phone text not null check (phone ~ '^[0-9 +()/-]{5,30}$'),
  message text check (message is null or char_length(message) <= 2000),
  source text not null default 'website' check (char_length(source) <= 60),
  status public.applicant_status not null default 'neu',
  notes text check (notes is null or char_length(notes) <= 5000),
  consent_at timestamptz not null,
  handled_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index applicants_status_idx on public.applicants (status, created_at desc);

alter table public.invitations
  add constraint invitations_applicant_fk foreign key (applicant_id) references public.applicants (id) on delete set null;

create trigger applicants_touch before update on public.applicants
  for each row execute function private.touch_updated_at();
create trigger applicants_audit after update or delete on public.applicants
  for each row execute function private.audit_trigger();

alter table public.applicants enable row level security;
create policy applicants_select on public.applicants for select to authenticated
  using (private.has_permission((select auth.uid()), 'applicants.read'));

create or replace function public.applicant_update(p_id uuid, p_status public.applicant_status, p_notes text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_permission('applicants.manage');
  update public.applicants
     set status = p_status, notes = nullif(trim(p_notes), ''), handled_by = auth.uid()
   where id = p_id;
  if not found then raise exception 'Bewerbung nicht gefunden'; end if;
end;
$$;

create or replace function public.applicant_delete(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_permission('applicants.manage');
  delete from public.applicants where id = p_id;
end;
$$;

-- Löschkonzept: abgeschlossene Bewerbungen nach Ablauf der Frist entfernen
create or replace function public.purge_applicants(p_days int default 180)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  delete from public.applicants
   where status in ('abgelehnt', 'angenommen', 'neu', 'kontaktiert', 'gespraech')
     and updated_at < now() - make_interval(days => greatest(p_days, 30));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Einfache Ratenbegrenzung für öffentliche Endpunkte (nur Server/service_role)
create table private.rate_limits (
  key text not null,
  window_start timestamptz not null,
  hits int not null default 0,
  primary key (key, window_start)
);

create or replace function public.rate_limit_hit(p_key text, p_window_seconds int, p_max int)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits int;
begin
  delete from private.rate_limits where window_start < now() - interval '1 day';
  insert into private.rate_limits (key, window_start, hits) values (p_key, v_window, 1)
  on conflict (key, window_start) do update set hits = private.rate_limits.hits + 1
  returning hits into v_hits;
  return v_hits <= p_max;
end;
$$;

-- Export-Protokollierung (Exporte werden serverseitig erzeugt)
create or replace function public.log_export(p_kind text, p_filters jsonb, p_rows int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_permission('reports.export');
  perform private.audit_event('export', p_kind, null, null,
    jsonb_build_object('filter', p_filters, 'zeilen', p_rows));
end;
$$;

-- =============================================================================
-- Rechtevergabe: Clients lesen nur (RLS), schreiben nur über RPCs
-- =============================================================================
revoke all on all tables in schema public from anon;
revoke insert, update, delete, truncate, references, trigger on all tables in schema public from authenticated;
grant select on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
revoke all on all sequences in schema public from anon, authenticated;

alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke insert, update, delete, truncate on tables from authenticated;
alter default privileges in schema public revoke execute on functions from public, anon;

revoke all on all tables in schema private from anon, authenticated;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;

-- Ausschließlich serverseitig (service_role) nutzbare Funktionen
revoke execute on function public.invitation_lookup(text) from authenticated;
revoke execute on function public.rate_limit_hit(text, int, int) from authenticated;
revoke execute on function public.purge_applicants(int) from authenticated;
revoke execute on function public.bootstrap_admin(text) from authenticated, service_role;

revoke execute on all functions in schema private from public, anon;
