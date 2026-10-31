-- =============================================================================
-- ERLEN – Einrichtung der Produktionsdatenbank (automatisch erzeugt)
-- =============================================================================
-- Anleitung: Supabase → SQL Editor → New query → gesamten Inhalt dieser Datei
-- einfügen → "Run". NUR EINMAL in einer leeren Datenbank ausführen.
-- Bereits eingerichtet? Dann stattdessen die Seite /einrichtung → „Update einspielen“ nutzen.
-- Enthält: 20261025000100_core.sql, 20261025000200_core_seed_and_rpc.sql, 20261025000300_performance.sql, 20261025000400_academy.sql, 20261025000500_documents_storage.sql, 20261025000600_onboarding_notifications.sql, 20261026000700_commissions_statements.sql, 20261029000800_booking_overhead.sql, 20261030000900_statement_templates.sql, 20261030001000_fixed_overhead_recruiter.sql, 20261031001100_push_notifications.sql, 20261031001200_employee_documents.sql, 20261101001300_onboarding_checklist.sql, 20261101001400_statement_manual_number.sql, 20261101001500_two_factor.sql, 20261101001600_competition_live.sql, 20261101001700_applicant_pipeline.sql, 20261101001800_document_expiry.sql, 20261101001900_monthly_report.sql, 20261102002000_avatar_by_admin.sql, 20261102002100_referral_career.sql, 20261102002200_sales_trainer.sql, 20261102002300_gong.sql, 20261102002400_badges_weekly.sql
-- =============================================================================

begin;

-- ----- 20261025000100_core.sql -----
-- =============================================================================
-- ERLEN CRM – Kern: Rollen, Berechtigungen, Profile, Teams, Hierarchie, Audit
-- =============================================================================
-- Grundprinzipien
--  * Clients (Rolle "authenticated") dürfen Tabellen nur LESEN, gefiltert durch RLS.
--  * Alle schreibenden Vorgänge laufen über RPC-Funktionen (SECURITY DEFINER),
--    die Berechtigungen und Geschäftsregeln serverseitig in der Datenbank prüfen.
--  * Interne Hilfsfunktionen liegen im Schema "private", das nicht über die
--    REST-API veröffentlicht wird.
--  * Alle Zeitpunkte als timestamptz (UTC gespeichert), Geschäftstage als date
--    in der Zeitzone Europe/Berlin.
-- =============================================================================

create schema if not exists private;
grant usage on schema private to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Aufzählungstypen
-- -----------------------------------------------------------------------------
create type public.user_status as enum ('eingeladen', 'aktiv', 'deaktiviert');
create type public.team_member_role as enum ('mitglied', 'teamleiter');
create type public.relationship_type as enum ('vorgesetzter', 'ausbilder');
create type public.permission_effect as enum ('grant', 'deny');
create type public.partner_status as enum ('in_ausbildung', 'aktiv', 'pausiert', 'beendet');

-- -----------------------------------------------------------------------------
-- Hilfsfunktion: aktuelles Geschäftsdatum (Europe/Berlin)
-- -----------------------------------------------------------------------------
create or replace function private.today_berlin()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Europe/Berlin')::date;
$$;

-- -----------------------------------------------------------------------------
-- Rollen und Berechtigungen
-- -----------------------------------------------------------------------------
create table public.roles (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z_]+$'),
  name text not null,
  description text,
  hierarchy_level int not null,
  created_at timestamptz not null default now()
);

create table public.permissions (
  key text primary key check (key ~ '^[a-z_]+(\.[a-z_]+)+$'),
  category text not null,
  description text not null
);

create table public.role_permissions (
  role_id uuid not null references public.roles (id) on delete cascade,
  permission_key text not null references public.permissions (key) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_key)
);

-- -----------------------------------------------------------------------------
-- Profile (Basisdaten, 1:1 zu auth.users)
-- -----------------------------------------------------------------------------
create sequence public.employee_number_seq start 1001;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete restrict,
  employee_number text not null unique
    default ('E' || lpad(nextval('public.employee_number_seq')::text, 5, '0')),
  first_name text not null check (char_length(first_name) between 1 and 100),
  last_name text not null check (char_length(last_name) between 1 and 100),
  email text not null check (position('@' in email) > 1),
  avatar_path text,
  role_id uuid not null references public.roles (id),
  status public.user_status not null default 'aktiv',
  deactivated_at timestamptz,
  anonymized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index profiles_email_lower_idx on public.profiles (lower(email));
create index profiles_role_idx on public.profiles (role_id);
create index profiles_status_idx on public.profiles (status);

-- Sensible bzw. berufliche Zusatzdaten (getrennt, damit sie gezielt geschützt sind)
create table public.employee_details (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  phone text check (phone is null or phone ~ '^[0-9 +()/-]{5,30}$'),
  entry_date date,
  sales_start_date date,
  sales_region text check (sales_region is null or char_length(sales_region) <= 120),
  partner_status public.partner_status not null default 'in_ausbildung',
  updated_at timestamptz not null default now()
);

-- Individuelle Berechtigungen (Ergänzung oder Einschränkung der Rolle)
create table public.user_permissions (
  user_id uuid not null references public.profiles (id) on delete cascade,
  permission_key text not null references public.permissions (key) on delete cascade,
  effect public.permission_effect not null,
  reason text,
  granted_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  primary key (user_id, permission_key)
);

-- -----------------------------------------------------------------------------
-- Teams und Organisationsstruktur
-- -----------------------------------------------------------------------------
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  description text,
  parent_team_id uuid references public.teams (id) on delete restrict,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (parent_team_id is null or parent_team_id <> id)
);
create unique index teams_name_lower_idx on public.teams (lower(name));
create index teams_parent_idx on public.teams (parent_team_id);

-- Mitgliedschaften werden nie gelöscht, sondern beendet (ended_at) -> Teamhistorie
create table public.team_memberships (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete restrict,
  user_id uuid not null references public.profiles (id) on delete cascade,
  member_role public.team_member_role not null default 'mitglied',
  includes_subteams boolean not null default false,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  end_reason text,
  created_by uuid references public.profiles (id),
  check (ended_at is null or ended_at >= started_at),
  check (member_role = 'teamleiter' or includes_subteams = false)
);
-- Ein Mitarbeiter ist gleichzeitig höchstens in einem Team reguläres Mitglied
create unique index team_memberships_one_active_member_idx
  on public.team_memberships (user_id) where ended_at is null and member_role = 'mitglied';
create unique index team_memberships_active_unique_idx
  on public.team_memberships (team_id, user_id, member_role) where ended_at is null;
create index team_memberships_team_idx on public.team_memberships (team_id) where ended_at is null;
create index team_memberships_user_idx on public.team_memberships (user_id);

-- Vorgesetzten- und Ausbilderzuordnung (mit Historie)
create table public.reporting_relationships (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles (id) on delete cascade,
  manager_id uuid not null references public.profiles (id) on delete cascade,
  relation_type public.relationship_type not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_by uuid references public.profiles (id),
  check (employee_id <> manager_id),
  check (ended_at is null or ended_at >= started_at)
);
create unique index reporting_one_active_idx
  on public.reporting_relationships (employee_id, relation_type) where ended_at is null;
create index reporting_manager_idx
  on public.reporting_relationships (manager_id, relation_type) where ended_at is null;

-- -----------------------------------------------------------------------------
-- Systemeinstellungen
-- -----------------------------------------------------------------------------
create table public.organization_settings (
  key text primary key check (key ~ '^[a-z_]+$'),
  value jsonb not null,
  description text,
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Audit-Log (nur anhängen, niemals ändern)
-- -----------------------------------------------------------------------------
create table public.audit_logs (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_id uuid,
  action text not null,
  table_name text not null,
  record_id text,
  subject_user_id uuid,
  old_data jsonb,
  new_data jsonb
);
create index audit_logs_occurred_idx on public.audit_logs (occurred_at desc);
create index audit_logs_subject_idx on public.audit_logs (subject_user_id, occurred_at desc);
create index audit_logs_table_idx on public.audit_logs (table_name, record_id);

create or replace function private.audit_logs_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Audit-Logs sind unveränderlich';
end;
$$;
create trigger audit_logs_no_update before update or delete on public.audit_logs
  for each row execute function private.audit_logs_immutable();

-- Generischer Audit-Trigger. TG_ARGV[0] = Spalte, die den betroffenen Mitarbeiter enthält.
create or replace function private.audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_subject uuid;
  v_record text;
  v_subject_col text := tg_argv[0];
begin
  if tg_op in ('UPDATE', 'DELETE') then v_old := to_jsonb(old); end if;
  if tg_op in ('INSERT', 'UPDATE') then v_new := to_jsonb(new); end if;
  -- Geheimnisse niemals protokollieren
  v_old := v_old - 'token_hash';
  v_new := v_new - 'token_hash';
  if tg_op = 'UPDATE' and v_old = v_new then
    return new;
  end if;
  if v_subject_col is not null then
    v_subject := coalesce(v_new ->> v_subject_col, v_old ->> v_subject_col)::uuid;
  end if;
  v_record := coalesce(v_new ->> 'id', v_old ->> 'id',
                       coalesce(v_new, v_old) ->> 'key',
                       coalesce(v_new, v_old) ->> 'user_id');
  insert into public.audit_logs (actor_id, action, table_name, record_id, subject_user_id, old_data, new_data)
  values (auth.uid(), lower(tg_op), tg_table_name, v_record, v_subject, v_old, v_new);
  return coalesce(new, old);
end;
$$;

-- Explizite Audit-Einträge aus RPCs (z. B. Exporte)
create or replace function private.audit_event(
  p_action text, p_table text, p_record text, p_subject uuid, p_data jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_logs (actor_id, action, table_name, record_id, subject_user_id, new_data)
  values (auth.uid(), p_action, p_table, p_record, p_subject, p_data);
$$;

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function private.touch_updated_at();
create trigger employee_details_touch before update on public.employee_details
  for each row execute function private.touch_updated_at();
create trigger teams_touch before update on public.teams
  for each row execute function private.touch_updated_at();

create trigger profiles_audit after insert or update or delete on public.profiles
  for each row execute function private.audit_trigger('id');
create trigger employee_details_audit after insert or update or delete on public.employee_details
  for each row execute function private.audit_trigger('user_id');
create trigger user_permissions_audit after insert or update or delete on public.user_permissions
  for each row execute function private.audit_trigger('user_id');
create trigger role_permissions_audit after insert or update or delete on public.role_permissions
  for each row execute function private.audit_trigger();
create trigger teams_audit after insert or update or delete on public.teams
  for each row execute function private.audit_trigger();
create trigger team_memberships_audit after insert or update or delete on public.team_memberships
  for each row execute function private.audit_trigger('user_id');
create trigger reporting_relationships_audit after insert or update or delete on public.reporting_relationships
  for each row execute function private.audit_trigger('employee_id');
create trigger organization_settings_audit after insert or update or delete on public.organization_settings
  for each row execute function private.audit_trigger();

-- Zyklen in der Teamhierarchie verhindern
create or replace function private.prevent_team_cycle()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.parent_team_id is not null and exists (
    with recursive ancestors(id) as (
      select new.parent_team_id
      union
      select t.parent_team_id from public.teams t join ancestors a on t.id = a.id
      where t.parent_team_id is not null
    )
    select 1 from ancestors where id = new.id
  ) then
    raise exception 'Ungültige Teamhierarchie: Zyklus erkannt';
  end if;
  return new;
end;
$$;
create trigger teams_prevent_cycle before insert or update of parent_team_id on public.teams
  for each row execute function private.prevent_team_cycle();

-- =============================================================================
-- Berechtigungslogik
-- =============================================================================

-- Effektive Berechtigung: Rolle + individuelle Freigabe − individuelle Sperre.
-- Inaktive Konten haben grundsätzlich keine Berechtigungen.
create or replace function private.has_permission(p_user uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_user
      and p.status = 'aktiv'
      and (
        exists (
          select 1 from public.user_permissions up
          where up.user_id = p.id and up.permission_key = p_permission and up.effect = 'grant'
        )
        or (
          exists (
            select 1 from public.role_permissions rp
            where rp.role_id = p.role_id and rp.permission_key = p_permission
          )
          and not exists (
            select 1 from public.user_permissions up
            where up.user_id = p.id and up.permission_key = p_permission and up.effect = 'deny'
          )
        )
      )
  );
$$;

create or replace function private.is_active_user(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = p_user and status = 'aktiv');
$$;

-- Teams, die ein Teamleiter aktuell führt (inkl. Unterteams, falls ausdrücklich freigegeben)
create or replace function private.led_team_ids(p_user uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  with recursive scope(team_id, deep) as (
    select tm.team_id, tm.includes_subteams
    from public.team_memberships tm
    where tm.user_id = p_user and tm.member_role = 'teamleiter' and tm.ended_at is null
    union
    select t.id, true
    from public.teams t
    join scope s on t.parent_team_id = s.team_id
    where s.deep
  )
  select distinct team_id from scope;
$$;

-- Aktuelles Team (reguläre Mitgliedschaft) eines Mitarbeiters
create or replace function private.current_team_id(p_user uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select team_id from public.team_memberships
  where user_id = p_user and member_role = 'mitglied' and ended_at is null
  limit 1;
$$;

-- Zentrale Sichtbarkeitsfunktion.
-- p_domain: 'employees' | 'performance' | 'training.progress'
-- Liefert alle Benutzer-IDs, deren Daten des Bereichs der Betrachter sehen darf.
create or replace function private.visible_user_ids(p_viewer uuid, p_domain text)
returns setof uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_viewer is null or not private.is_active_user(p_viewer) then
    return;
  end if;

  if private.has_permission(p_viewer, p_domain || '.read.all') then
    return query select id from public.profiles;
    return;
  end if;

  if private.has_permission(p_viewer, p_domain || '.read.self') then
    return next p_viewer;
  end if;

  if private.has_permission(p_viewer, p_domain || '.read.team') then
    -- Mitglieder geführter Teams
    return query
      select tm.user_id
      from public.team_memberships tm
      where tm.ended_at is null
        and tm.member_role = 'mitglied'
        and tm.team_id in (select private.led_team_ids(p_viewer));
    -- direkt unterstellte Mitarbeiter
    return query
      select rr.employee_id
      from public.reporting_relationships rr
      where rr.manager_id = p_viewer and rr.relation_type = 'vorgesetzter' and rr.ended_at is null;
  end if;

  if private.has_permission(p_viewer, p_domain || '.read.assigned') then
    return query
      select rr.employee_id
      from public.reporting_relationships rr
      where rr.manager_id = p_viewer and rr.relation_type = 'ausbilder' and rr.ended_at is null;
  end if;
end;
$$;

create or replace function private.can_access_user(p_viewer uuid, p_target uuid, p_domain text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_target in (select private.visible_user_ids(p_viewer, p_domain));
$$;

-- Personen, deren Basisprofil (Name, Rolle) ein Benutzer immer sehen darf:
-- eigene Vorgesetzte, eigener Ausbilder und Leiter des eigenen Teams.
create or replace function private.own_contact_ids(p_viewer uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select rr.manager_id from public.reporting_relationships rr
  where rr.employee_id = p_viewer and rr.ended_at is null
  union
  select tl.user_id from public.team_memberships tl
  where tl.member_role = 'teamleiter' and tl.ended_at is null
    and tl.team_id = private.current_team_id(p_viewer);
$$;

-- Gehört ein Team in den Verwaltungs-/Sichtbereich des Betrachters?
create or replace function private.can_view_team(p_viewer uuid, p_team uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_active_user(p_viewer) and (
    private.has_permission(p_viewer, 'employees.read.all')
    or private.has_permission(p_viewer, 'teams.manage')
    or p_team in (select private.led_team_ids(p_viewer))
    or p_team = private.current_team_id(p_viewer)
  );
$$;

-- Hilfsfunktion für RPCs: Berechtigung prüfen oder abbrechen
create or replace function private.require_permission(p_permission text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.has_permission(auth.uid(), p_permission) then
    raise exception 'Keine Berechtigung (%)', p_permission using errcode = '42501';
  end if;
end;
$$;

grant execute on all functions in schema private to authenticated, service_role;

-- =============================================================================
-- Öffentliche Lese-Hilfen für die Oberfläche
-- =============================================================================

create or replace function public.my_permissions()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(p.key order by p.key), '{}')
  from public.permissions p
  where private.has_permission(auth.uid(), p.key);
$$;

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.profiles enable row level security;
alter table public.employee_details enable row level security;
alter table public.user_permissions enable row level security;
alter table public.teams enable row level security;
alter table public.team_memberships enable row level security;
alter table public.reporting_relationships enable row level security;
alter table public.organization_settings enable row level security;
alter table public.audit_logs enable row level security;

-- Rollen- und Berechtigungskatalog: für aktive Benutzer lesbar (keine Personendaten)
create policy roles_select on public.roles for select to authenticated
  using (private.is_active_user((select auth.uid())));
create policy permissions_select on public.permissions for select to authenticated
  using (private.is_active_user((select auth.uid())));
create policy role_permissions_select on public.role_permissions for select to authenticated
  using (private.is_active_user((select auth.uid())));

create policy profiles_select on public.profiles for select to authenticated
  using (
    id in (select private.visible_user_ids((select auth.uid()), 'employees'))
    or (private.is_active_user((select auth.uid()))
        and id in (select private.own_contact_ids((select auth.uid()))))
  );

create policy employee_details_select on public.employee_details for select to authenticated
  using (user_id in (select private.visible_user_ids((select auth.uid()), 'employees')));

create policy user_permissions_select on public.user_permissions for select to authenticated
  using (
    user_id = (select auth.uid())
    or private.has_permission((select auth.uid()), 'roles.assign')
  );

create policy teams_select on public.teams for select to authenticated
  using (private.can_view_team((select auth.uid()), id));

create policy team_memberships_select on public.team_memberships for select to authenticated
  using (
    user_id in (select private.visible_user_ids((select auth.uid()), 'employees'))
    or (private.can_view_team((select auth.uid()), team_id) and member_role = 'teamleiter')
  );

create policy reporting_relationships_select on public.reporting_relationships for select to authenticated
  using (
    employee_id in (select private.visible_user_ids((select auth.uid()), 'employees'))
  );

create policy organization_settings_select on public.organization_settings for select to authenticated
  using (private.is_active_user((select auth.uid())));

create policy audit_logs_select on public.audit_logs for select to authenticated
  using (private.has_permission((select auth.uid()), 'audit.read'));

-- =============================================================================
-- Neue Benutzer: Profil automatisch anlegen
-- =============================================================================
-- Konten werden ausschließlich über Einladungen angelegt (siehe Onboarding-Migration).
-- Benutzer, die ohne gültige Einladung entstehen (z. B. manuell im Supabase-Dashboard),
-- erhalten die Rolle "vertriebspartner" im Status "deaktiviert" und müssen von
-- einem Administrator freigeschaltet werden.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role uuid;
begin
  select id into v_role from public.roles where key = 'vertriebspartner';
  insert into public.profiles (id, first_name, last_name, email, role_id, status, deactivated_at)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'first_name', ''), 'Neu'),
    coalesce(nullif(new.raw_user_meta_data ->> 'last_name', ''), 'Benutzer'),
    new.email,
    v_role,
    'deaktiviert',
    now()
  );
  insert into public.employee_details (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- E-Mail-Änderungen im Auth-System in das Profil übernehmen
create or replace function private.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function private.handle_user_email_change();

-- Ersten Systemadministrator festlegen. Nur über den SQL-Editor (Rolle postgres)
-- ausführbar und nur, solange noch kein aktiver Administrator existiert.
create or replace function public.bootstrap_admin(p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_role uuid;
  v_user uuid;
begin
  select id into v_admin_role from public.roles where key = 'admin';
  if exists (select 1 from public.profiles where role_id = v_admin_role and status = 'aktiv') then
    raise exception 'Es existiert bereits ein aktiver Administrator.';
  end if;
  select id into v_user from public.profiles where lower(email) = lower(p_email);
  if v_user is null then
    raise exception 'Kein Benutzer mit dieser E-Mail-Adresse gefunden.';
  end if;
  update public.profiles
     set role_id = v_admin_role, status = 'aktiv', deactivated_at = null
   where id = v_user;
end;
$$;
revoke execute on function public.bootstrap_admin(text) from public, anon, authenticated, service_role;


-- ----- 20261025000200_core_seed_and_rpc.sql -----
-- =============================================================================
-- ERLEN CRM – Stammdaten (Rollen, Berechtigungen) und Verwaltungs-RPCs
-- Diese Stammdaten sind Teil des Systems (keine Beispieldaten).
-- =============================================================================

insert into public.roles (key, name, description, hierarchy_level) values
  ('vertriebspartner', 'Vertriebspartner', 'Sieht eigene Daten, Schulungen und Dokumente.', 10),
  ('ausbilder', 'Ausbilder', 'Betreut zugewiesene Auszubildende.', 20),
  ('teamleiter', 'Teamleiter', 'Führt ein oder mehrere Teams.', 30),
  ('agenturleiter', 'Agenturleiter', 'Agenturweite Steuerung und Auswertung.', 40),
  ('admin', 'Systemadministrator', 'Technische und organisatorische Systemverwaltung.', 50);

insert into public.permissions (key, category, description) values
  ('employees.read.self', 'Mitarbeiter', 'Eigenes Profil einsehen'),
  ('employees.read.assigned', 'Mitarbeiter', 'Profile zugewiesener Auszubildender einsehen'),
  ('employees.read.team', 'Mitarbeiter', 'Profile der eigenen Teammitglieder einsehen'),
  ('employees.read.all', 'Mitarbeiter', 'Alle Mitarbeiterprofile einsehen'),
  ('employees.update', 'Mitarbeiter', 'Stammdaten von Mitarbeitern bearbeiten'),
  ('employees.invite', 'Mitarbeiter', 'Mitarbeiter einladen'),
  ('employees.deactivate', 'Mitarbeiter', 'Konten deaktivieren und reaktivieren'),
  ('roles.assign', 'Administration', 'Rollen und individuelle Berechtigungen vergeben'),
  ('teams.manage', 'Organisation', 'Teams, Teamzuordnungen und Hierarchie verwalten'),
  ('performance.read.self', 'Leistung', 'Eigene Leistungsdaten einsehen'),
  ('performance.read.assigned', 'Leistung', 'Leistungsdaten zugewiesener Auszubildender einsehen'),
  ('performance.read.team', 'Leistung', 'Leistungsdaten des eigenen Teams einsehen'),
  ('performance.read.all', 'Leistung', 'Agenturweite Leistungsdaten einsehen'),
  ('performance.create', 'Leistung', 'Eigene Leistungen erfassen'),
  ('performance.update', 'Leistung', 'Leistungen für Mitarbeiter im eigenen Bereich erfassen und bearbeiten'),
  ('performance.approve', 'Leistung', 'Leistungen bestätigen, ablehnen, stornieren und korrigieren'),
  ('products.manage', 'Leistung', 'Produkte und Leistungsarten verwalten'),
  ('targets.manage', 'Ziele', 'Ziele im eigenen Bereich verwalten'),
  ('competitions.manage', 'Ziele', 'Wettbewerbe verwalten'),
  ('rankings.read', 'Ziele', 'Freigegebene Bestenlisten einsehen'),
  ('training.read', 'Academy', 'Freigegebene Schulungen nutzen'),
  ('training.manage', 'Academy', 'Kurse, Lektionen und Quizze verwalten'),
  ('training.progress.read.self', 'Academy', 'Eigenen Lernfortschritt einsehen'),
  ('training.progress.read.assigned', 'Academy', 'Lernfortschritt zugewiesener Auszubildender einsehen'),
  ('training.progress.read.team', 'Academy', 'Lernfortschritt des Teams einsehen'),
  ('training.progress.read.all', 'Academy', 'Lernfortschritt aller Mitarbeiter einsehen'),
  ('training.progress.manage', 'Academy', 'Lernfortschritt im eigenen Bereich dokumentieren und Kurse zuweisen'),
  ('training.notes.write', 'Academy', 'Feedback und Ausbildungsnotizen hinterlegen'),
  ('documents.read', 'Dokumente', 'Freigegebene Dokumente lesen'),
  ('documents.manage', 'Dokumente', 'Dokumente hochladen, freigeben und löschen'),
  ('announcements.manage', 'Dokumente', 'Interne Ankündigungen veröffentlichen'),
  ('reports.read.team', 'Berichte', 'Teamberichte einsehen'),
  ('reports.read.all', 'Berichte', 'Agenturberichte einsehen'),
  ('reports.export', 'Berichte', 'Berichte im eigenen Sichtbereich exportieren'),
  ('applicants.read', 'Bewerber', 'Bewerbungen einsehen'),
  ('applicants.manage', 'Bewerber', 'Bewerbungen bearbeiten und in Einladungen überführen'),
  ('settings.manage', 'Administration', 'Systemeinstellungen bearbeiten'),
  ('audit.read', 'Administration', 'Audit-Logs einsehen');

-- Berechtigungsvorlagen je Rolle
with matrix(role_key, perms) as (
  values
  ('vertriebspartner', array[
    'employees.read.self', 'performance.read.self', 'performance.create',
    'training.read', 'training.progress.read.self', 'documents.read', 'rankings.read']),
  ('ausbilder', array[
    'employees.read.self', 'performance.read.self', 'performance.create',
    'training.read', 'training.progress.read.self', 'documents.read', 'rankings.read',
    'employees.read.assigned', 'performance.read.assigned', 'training.progress.read.assigned',
    'training.progress.manage', 'training.notes.write']),
  ('teamleiter', array[
    'employees.read.self', 'performance.read.self', 'performance.create',
    'training.read', 'training.progress.read.self', 'documents.read', 'rankings.read',
    'employees.read.assigned', 'performance.read.assigned', 'training.progress.read.assigned',
    'employees.read.team', 'performance.read.team', 'training.progress.read.team',
    'training.progress.manage', 'training.notes.write',
    'performance.update', 'performance.approve', 'targets.manage',
    'reports.read.team', 'reports.export']),
  ('agenturleiter', array[
    'employees.read.self', 'employees.read.all', 'employees.update',
    'teams.manage',
    'performance.read.self', 'performance.read.all', 'performance.create',
    'performance.update', 'performance.approve', 'products.manage',
    'targets.manage', 'competitions.manage', 'rankings.read',
    'training.read', 'training.manage', 'training.progress.read.self', 'training.progress.read.all',
    'training.progress.manage', 'training.notes.write',
    'documents.read', 'documents.manage', 'announcements.manage',
    'reports.read.team', 'reports.read.all', 'reports.export',
    'applicants.read', 'applicants.manage'])
)
insert into public.role_permissions (role_id, permission_key)
select r.id, unnest(m.perms)
from matrix m join public.roles r on r.key = m.role_key;

-- Administrator: sämtliche Berechtigungen
insert into public.role_permissions (role_id, permission_key)
select r.id, p.key from public.roles r cross join public.permissions p where r.key = 'admin';

insert into public.organization_settings (key, value, description) values
  ('agency', '{"name": "ERLEN Vertriebsagentur"}', 'Allgemeine Angaben zur Agentur'),
  ('performance', '{"require_approval": true}',
   'Leistungen müssen von einer berechtigten Person bestätigt werden'),
  ('rankings', '{"enabled": true, "agency_roles": ["vertriebspartner","ausbilder","teamleiter","agenturleiter","admin"], "team_roles": ["vertriebspartner","ausbilder","teamleiter","agenturleiter","admin"]}',
   'Sichtbarkeit der Bestenlisten je Rolle');

-- =============================================================================
-- RPCs: Benutzer- und Rechteverwaltung
-- =============================================================================

create or replace function private.active_admin_count()
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int from public.profiles p join public.roles r on r.id = p.role_id
  where r.key = 'admin' and p.status = 'aktiv';
$$;

create or replace function private.is_admin(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p join public.roles r on r.id = p.role_id
    where p.id = p_user and r.key = 'admin'
  );
$$;

create or replace function private.notify(
  p_user uuid, p_type text, p_title text, p_body text default null, p_link text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Tabelle wird in der Onboarding-Migration angelegt; Funktion wird dort ersetzt.
  return;
end;
$$;

create or replace function public.admin_set_user_role(p_user uuid, p_role_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role uuid;
  v_old_admin boolean;
begin
  perform private.require_permission('roles.assign');
  if p_user = auth.uid() then
    raise exception 'Die eigene Rolle kann nicht geändert werden.' using errcode = '42501';
  end if;
  select id into v_role from public.roles where key = p_role_key;
  if v_role is null then
    raise exception 'Unbekannte Rolle';
  end if;
  v_old_admin := private.is_admin(p_user);
  update public.profiles set role_id = v_role where id = p_user;
  if not found then
    raise exception 'Benutzer nicht gefunden';
  end if;
  if v_old_admin and p_role_key <> 'admin' and private.active_admin_count() < 1 then
    raise exception 'Der letzte aktive Administrator kann nicht entfernt werden.';
  end if;
  perform private.notify(p_user, 'rolle_geaendert', 'Deine Rolle wurde geändert',
    'Neue Rolle: ' || (select name from public.roles where id = v_role), '/profil');
end;
$$;

create or replace function public.admin_set_user_permission(
  p_user uuid, p_permission text, p_effect public.permission_effect, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_permission('roles.assign');
  if p_user = auth.uid() then
    raise exception 'Eigene Berechtigungen können nicht geändert werden.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.permissions where key = p_permission) then
    raise exception 'Unbekannte Berechtigung';
  end if;
  insert into public.user_permissions (user_id, permission_key, effect, reason, granted_by)
  values (p_user, p_permission, p_effect, nullif(trim(p_reason), ''), auth.uid())
  on conflict (user_id, permission_key)
  do update set effect = excluded.effect, reason = excluded.reason,
                granted_by = excluded.granted_by, created_at = now();
end;
$$;

create or replace function public.admin_remove_user_permission(p_user uuid, p_permission text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_permission('roles.assign');
  if p_user = auth.uid() then
    raise exception 'Eigene Berechtigungen können nicht geändert werden.' using errcode = '42501';
  end if;
  delete from public.user_permissions where user_id = p_user and permission_key = p_permission;
end;
$$;

-- Berechtigungsvorlage einer Rolle anpassen
create or replace function public.admin_set_role_permission(
  p_role_key text, p_permission text, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role uuid;
begin
  perform private.require_permission('roles.assign');
  if p_role_key = 'admin' then
    raise exception 'Die Administratorrolle besitzt immer alle Berechtigungen.';
  end if;
  select id into v_role from public.roles where key = p_role_key;
  if v_role is null then raise exception 'Unbekannte Rolle'; end if;
  if p_enabled then
    insert into public.role_permissions (role_id, permission_key)
    values (v_role, p_permission) on conflict do nothing;
  else
    delete from public.role_permissions where role_id = v_role and permission_key = p_permission;
  end if;
end;
$$;

create or replace function public.admin_set_user_status(p_user uuid, p_status public.user_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_permission('employees.deactivate');
  if p_user = auth.uid() then
    raise exception 'Das eigene Konto kann nicht deaktiviert werden.' using errcode = '42501';
  end if;
  if p_status = 'eingeladen' then
    raise exception 'Ungültiger Status';
  end if;
  -- Nur Administratoren dürfen andere Administratoren (de)aktivieren
  if private.is_admin(p_user) and not private.is_admin(auth.uid()) then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  update public.profiles
     set status = p_status,
         deactivated_at = case when p_status = 'deaktiviert' then now() else null end
   where id = p_user and anonymized_at is null;
  if not found then raise exception 'Benutzer nicht gefunden'; end if;
  if private.active_admin_count() < 1 then
    raise exception 'Der letzte aktive Administrator kann nicht deaktiviert werden.';
  end if;
end;
$$;

-- Stammdaten durch berechtigte Personen (Admin/Agenturleitung)
create or replace function public.admin_update_employee(
  p_user uuid,
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_entry_date date,
  p_sales_start_date date,
  p_sales_region text,
  p_partner_status public.partner_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_permission('employees.update');
  if not private.can_access_user(auth.uid(), p_user, 'employees') then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  update public.profiles
     set first_name = trim(p_first_name), last_name = trim(p_last_name)
   where id = p_user and anonymized_at is null;
  if not found then raise exception 'Benutzer nicht gefunden'; end if;
  insert into public.employee_details (user_id, phone, entry_date, sales_start_date, sales_region, partner_status)
  values (p_user, nullif(trim(p_phone), ''), p_entry_date, p_sales_start_date, nullif(trim(p_sales_region), ''), p_partner_status)
  on conflict (user_id) do update
    set phone = excluded.phone, entry_date = excluded.entry_date,
        sales_start_date = excluded.sales_start_date, sales_region = excluded.sales_region,
        partner_status = excluded.partner_status;
end;
$$;

-- Selbst bearbeitbare Angaben
create or replace function public.update_own_profile(p_phone text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_active_user(auth.uid()) then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  insert into public.employee_details (user_id, phone) values (auth.uid(), nullif(trim(p_phone), ''))
  on conflict (user_id) do update set phone = excluded.phone;
end;
$$;

create or replace function public.set_own_avatar(p_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_active_user(auth.uid()) then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  if p_path is not null and p_path not like (auth.uid()::text || '/%') then
    raise exception 'Ungültiger Dateipfad';
  end if;
  update public.profiles set avatar_path = p_path where id = auth.uid();
end;
$$;

-- Kontrollierte Löschung: personenbezogene Daten entfernen, Geschäftsdaten anonym erhalten
create or replace function public.admin_anonymize_user(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_permission('roles.assign');
  perform private.require_permission('employees.deactivate');
  if p_user = auth.uid() then
    raise exception 'Das eigene Konto kann nicht anonymisiert werden.';
  end if;
  if exists (select 1 from public.profiles where id = p_user and status <> 'deaktiviert') then
    raise exception 'Das Konto muss vor der Anonymisierung deaktiviert werden.';
  end if;
  update public.profiles
     set first_name = 'Gelöschter', last_name = 'Benutzer',
         email = 'geloescht+' || id::text || '@invalid.local',
         avatar_path = null, anonymized_at = now()
   where id = p_user;
  update public.employee_details
     set phone = null, sales_region = null
   where user_id = p_user;
end;
$$;

-- =============================================================================
-- RPCs: Teams und Hierarchie
-- =============================================================================

create or replace function public.team_upsert(
  p_id uuid, p_name text, p_description text, p_parent_team_id uuid, p_is_active boolean default true)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform private.require_permission('teams.manage');
  if p_id is null then
    insert into public.teams (name, description, parent_team_id, is_active)
    values (trim(p_name), nullif(trim(p_description), ''), p_parent_team_id, coalesce(p_is_active, true))
    returning id into v_id;
  else
    update public.teams
       set name = trim(p_name), description = nullif(trim(p_description), ''),
           parent_team_id = p_parent_team_id, is_active = coalesce(p_is_active, true)
     where id = p_id
    returning id into v_id;
    if v_id is null then raise exception 'Team nicht gefunden'; end if;
  end if;
  return v_id;
end;
$$;

-- Mitarbeiter einem Team zuordnen. Bei regulärer Mitgliedschaft wird eine
-- bestehende Mitgliedschaft in einem anderen Team beendet (Teamwechsel).
create or replace function public.team_assign_member(
  p_team uuid, p_user uuid, p_member_role public.team_member_role default 'mitglied',
  p_includes_subteams boolean default false)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_team_name text;
begin
  perform private.require_permission('teams.manage');
  select name into v_team_name from public.teams where id = p_team and is_active;
  if v_team_name is null then raise exception 'Team nicht gefunden oder inaktiv'; end if;
  if not exists (select 1 from public.profiles where id = p_user and anonymized_at is null) then
    raise exception 'Benutzer nicht gefunden';
  end if;

  if exists (
    select 1 from public.team_memberships
    where team_id = p_team and user_id = p_user and member_role = p_member_role and ended_at is null
  ) then
    update public.team_memberships
       set includes_subteams = (p_member_role = 'teamleiter' and coalesce(p_includes_subteams, false))
     where team_id = p_team and user_id = p_user and member_role = p_member_role and ended_at is null
    returning id into v_id;
    return v_id;
  end if;

  if p_member_role = 'mitglied' then
    update public.team_memberships
       set ended_at = now(), end_reason = 'Teamwechsel'
     where user_id = p_user and member_role = 'mitglied' and ended_at is null;
  end if;

  insert into public.team_memberships (team_id, user_id, member_role, includes_subteams, created_by)
  values (p_team, p_user, p_member_role,
          p_member_role = 'teamleiter' and coalesce(p_includes_subteams, false), auth.uid())
  returning id into v_id;

  perform private.notify(p_user, 'team_geaendert',
    case when p_member_role = 'teamleiter' then 'Du leitest jetzt ein Team' else 'Neue Teamzuordnung' end,
    'Team: ' || v_team_name, '/teams/' || p_team::text);
  return v_id;
end;
$$;

create or replace function public.team_end_membership(p_membership uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_permission('teams.manage');
  update public.team_memberships
     set ended_at = now(), end_reason = coalesce(nullif(trim(p_reason), ''), 'Beendet')
   where id = p_membership and ended_at is null;
  if not found then raise exception 'Zuordnung nicht gefunden oder bereits beendet'; end if;
end;
$$;

-- Vorgesetzten oder Ausbilder setzen (p_manager = null beendet die Zuordnung)
create or replace function public.set_reporting_relationship(
  p_employee uuid, p_manager uuid, p_type public.relationship_type)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_permission('teams.manage');
  if p_employee = p_manager then
    raise exception 'Ein Mitarbeiter kann sich nicht selbst zugeordnet werden.';
  end if;
  if p_manager is not null and not exists (
    select 1 from public.profiles where id = p_manager and status = 'aktiv') then
    raise exception 'Die gewählte Führungskraft ist nicht aktiv.';
  end if;
  if exists (
    select 1 from public.reporting_relationships
    where employee_id = p_employee and relation_type = p_type and ended_at is null
      and manager_id is not distinct from p_manager) then
    return;
  end if;
  update public.reporting_relationships
     set ended_at = now()
   where employee_id = p_employee and relation_type = p_type and ended_at is null;
  if p_manager is not null then
    insert into public.reporting_relationships (employee_id, manager_id, relation_type, created_by)
    values (p_employee, p_manager, p_type, auth.uid());
    perform private.notify(p_employee, 'team_geaendert',
      case when p_type = 'ausbilder' then 'Neuer Ausbilder zugeordnet' else 'Neue Führungskraft zugeordnet' end,
      (select first_name || ' ' || last_name from public.profiles where id = p_manager), '/profil');
  end if;
end;
$$;

create or replace function public.admin_update_setting(p_key text, p_value jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_permission('settings.manage');
  update public.organization_settings
     set value = p_value, updated_by = auth.uid(), updated_at = now()
   where key = p_key;
  if not found then raise exception 'Unbekannte Einstellung'; end if;
end;
$$;

-- Historie eines Mitarbeiters (Rollen-, Team-, Status- und Zuordnungsänderungen)
create or replace function public.get_profile_history(p_user uuid, p_limit int default 100)
returns table (
  occurred_at timestamptz,
  table_name text,
  action text,
  actor_name text,
  old_data jsonb,
  new_data jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.can_access_user(auth.uid(), p_user, 'employees') then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  return query
    select a.occurred_at, a.table_name, a.action,
           coalesce(ap.first_name || ' ' || ap.last_name, 'System'),
           a.old_data, a.new_data
    from public.audit_logs a
    left join public.profiles ap on ap.id = a.actor_id
    where a.subject_user_id = p_user
      and a.table_name in ('profiles', 'team_memberships', 'reporting_relationships',
                           'performance_records', 'lesson_progress')
    order by a.occurred_at desc
    limit least(greatest(p_limit, 1), 500);
end;
$$;


-- ----- 20261025000300_performance.sql -----
-- =============================================================================
-- ERLEN CRM – Leistungserfassung, Freigaben, Stornos, Ziele, Wettbewerbe
-- =============================================================================
-- Zählregeln (verbindlich, siehe docs/KENNZAHLEN.md):
--  * Offizielle Leistung, Zielerreichung, Rankings, Team- und Agenturwerte:
--    ausschließlich Status 'bestaetigt'.
--  * "Offen" (zur Prüfung): Status 'eingereicht' – separat ausgewiesen, nie addiert.
--  * 'entwurf', 'abgelehnt', 'storniert', 'korrigiert' zählen nie.
--  * Eine Korrektur ersetzt den Ursprungsdatensatz (Status 'korrigiert') durch
--    einen neuen, verknüpften Datensatz -> keine Doppelzählung.
-- =============================================================================

create type public.performance_status as enum
  ('entwurf', 'eingereicht', 'bestaetigt', 'abgelehnt', 'storniert', 'korrigiert');
create type public.target_scope as enum ('mitarbeiter', 'team', 'agentur');
create type public.target_period as enum ('tag', 'woche', 'monat', 'zeitraum');

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  description text,
  unit_label text not null default 'Verträge' check (char_length(unit_label) between 1 and 40),
  requires_external_ref boolean not null default false,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index products_name_lower_idx on public.products (lower(name));

create table public.performance_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete restrict,
  team_id uuid references public.teams (id) on delete set null,   -- Team zum Zeitpunkt der Erfassung
  product_id uuid not null references public.products (id) on delete restrict,
  occurred_on date not null,
  quantity int not null check (quantity between 1 and 1000),
  external_ref text check (external_ref is null or char_length(external_ref) between 1 and 120),
  note text check (note is null or char_length(note) <= 1000),
  status public.performance_status not null default 'entwurf',
  corrects_record_id uuid references public.performance_records (id),
  created_by uuid not null references public.profiles (id),
  submitted_at timestamptz,
  confirmed_at timestamptz,
  confirmed_by uuid references public.profiles (id),
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles (id),
  status_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (occurred_on >= date '2000-01-01')
);
create index performance_user_date_idx on public.performance_records (user_id, occurred_on);
create index performance_team_date_idx on public.performance_records (team_id, occurred_on);
create index performance_status_date_idx on public.performance_records (status, occurred_on);
create index performance_product_idx on public.performance_records (product_id);
-- Vorgangs-ID je Produkt nur einmal in aktiven Datensätzen
create unique index performance_external_ref_unique_idx
  on public.performance_records (product_id, lower(external_ref))
  where external_ref is not null and status in ('entwurf', 'eingereicht', 'bestaetigt');

-- Protokoll von Stornos, Korrekturen und Bearbeitungen
create table public.performance_adjustments (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.performance_records (id) on delete cascade,
  action text not null check (action in ('bearbeitet', 'eingereicht', 'zurueckgezogen', 'storniert', 'korrigiert')),
  from_status public.performance_status,
  to_status public.performance_status,
  reason text,
  changes jsonb,
  replacement_record_id uuid references public.performance_records (id),
  actor_id uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create index performance_adjustments_record_idx on public.performance_adjustments (record_id);

-- Freigabeentscheidungen
create table public.performance_approvals (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.performance_records (id) on delete cascade,
  decision text not null check (decision in ('bestaetigt', 'abgelehnt')),
  comment text,
  actor_id uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);
create index performance_approvals_record_idx on public.performance_approvals (record_id);

create table public.targets (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 2 and 120),
  scope public.target_scope not null,
  user_id uuid references public.profiles (id) on delete cascade,
  team_id uuid references public.teams (id) on delete cascade,
  product_id uuid references public.products (id) on delete restrict,   -- null = alle Produkte
  period public.target_period not null,
  starts_on date not null,
  ends_on date not null,
  target_value int not null check (target_value between 1 and 1000000),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on >= starts_on),
  check (
    (scope = 'mitarbeiter' and user_id is not null and team_id is null) or
    (scope = 'team' and team_id is not null and user_id is null) or
    (scope = 'agentur' and user_id is null and team_id is null)
  )
);
create index targets_user_idx on public.targets (user_id);
create index targets_team_idx on public.targets (team_id);

-- Bereits gemeldete Zielerreichungen (verhindert doppelte Benachrichtigungen)
create table public.target_achievements (
  target_id uuid not null references public.targets (id) on delete cascade,
  period_start date not null,
  achieved_at timestamptz not null default now(),
  primary key (target_id, period_start)
);

create table public.competitions (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 2 and 120),
  description text,
  product_id uuid references public.products (id) on delete restrict,
  team_id uuid references public.teams (id) on delete cascade,   -- null = agenturweit
  starts_on date not null,
  ends_on date not null,
  is_active boolean not null default true,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);

create trigger products_touch before update on public.products
  for each row execute function private.touch_updated_at();
create trigger performance_records_touch before update on public.performance_records
  for each row execute function private.touch_updated_at();
create trigger targets_touch before update on public.targets
  for each row execute function private.touch_updated_at();

create trigger products_audit after insert or update or delete on public.products
  for each row execute function private.audit_trigger();
create trigger performance_records_audit after insert or update or delete on public.performance_records
  for each row execute function private.audit_trigger('user_id');
create trigger targets_audit after insert or update or delete on public.targets
  for each row execute function private.audit_trigger('user_id');
create trigger competitions_audit after insert or update or delete on public.competitions
  for each row execute function private.audit_trigger();

-- =============================================================================
-- Sichtbarkeit
-- =============================================================================

create or replace function private.can_view_target(p_viewer uuid, p_target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.targets t
    where t.id = p_target
      and private.is_active_user(p_viewer)
      and (
        private.has_permission(p_viewer, 'performance.read.all')
        or (t.scope = 'agentur')
        or (t.scope = 'mitarbeiter' and private.can_access_user(p_viewer, t.user_id, 'performance'))
        or (t.scope = 'team' and (
              t.team_id = private.current_team_id(p_viewer)
              or t.team_id in (select private.led_team_ids(p_viewer))))
      )
  );
$$;

-- Darf der Betrachter Ziele für diesen Bereich verwalten?
create or replace function private.can_manage_target(
  p_viewer uuid, p_scope public.target_scope, p_user uuid, p_team uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_permission(p_viewer, 'targets.manage') and (
    private.has_permission(p_viewer, 'performance.read.all')
    or (p_scope = 'mitarbeiter' and p_user <> p_viewer
        and private.can_access_user(p_viewer, p_user, 'performance'))
    or (p_scope = 'team' and p_team in (select private.led_team_ids(p_viewer)))
  );
$$;

alter table public.products enable row level security;
alter table public.performance_records enable row level security;
alter table public.performance_adjustments enable row level security;
alter table public.performance_approvals enable row level security;
alter table public.targets enable row level security;
alter table public.target_achievements enable row level security;
alter table public.competitions enable row level security;

create policy products_select on public.products for select to authenticated
  using (private.is_active_user((select auth.uid())));

create policy performance_records_select on public.performance_records for select to authenticated
  using (user_id in (select private.visible_user_ids((select auth.uid()), 'performance')));

create policy performance_adjustments_select on public.performance_adjustments for select to authenticated
  using (exists (
    select 1 from public.performance_records r
    where r.id = record_id
      and r.user_id in (select private.visible_user_ids((select auth.uid()), 'performance'))));

create policy performance_approvals_select on public.performance_approvals for select to authenticated
  using (exists (
    select 1 from public.performance_records r
    where r.id = record_id
      and r.user_id in (select private.visible_user_ids((select auth.uid()), 'performance'))));

create policy targets_select on public.targets for select to authenticated
  using (private.can_view_target((select auth.uid()), id));

create policy target_achievements_select on public.target_achievements for select to authenticated
  using (private.can_view_target((select auth.uid()), target_id));

create policy competitions_select on public.competitions for select to authenticated
  using (
    private.has_permission((select auth.uid()), 'rankings.read')
    and (team_id is null
         or team_id = private.current_team_id((select auth.uid()))
         or team_id in (select private.led_team_ids((select auth.uid())))
         or private.has_permission((select auth.uid()), 'competitions.manage'))
  );

-- =============================================================================
-- Hilfsfunktionen
-- =============================================================================

create or replace function private.setting(p_key text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select value from public.organization_settings where key = p_key;
$$;

-- Darf der Betrachter Leistungen dieses Mitarbeiters bestätigen/stornieren?
create or replace function private.can_approve_for(p_viewer uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_viewer <> p_user
     and private.has_permission(p_viewer, 'performance.approve')
     and private.can_access_user(p_viewer, p_user, 'performance');
$$;

-- Zeitraum (Beginn, Ende) der aktuellen Periode eines Ziels zu einem Stichtag
create or replace function private.target_window(
  p_period public.target_period, p_starts date, p_ends date, p_day date)
returns table (window_start date, window_end date)
language sql
immutable
set search_path = ''
as $$
  select greatest(p_starts, w.s), least(p_ends, w.e)
  from (
    select
      case p_period
        when 'tag' then p_day
        when 'woche' then date_trunc('week', p_day)::date
        when 'monat' then date_trunc('month', p_day)::date
        else p_starts end as s,
      case p_period
        when 'tag' then p_day
        when 'woche' then (date_trunc('week', p_day) + interval '6 days')::date
        when 'monat' then (date_trunc('month', p_day) + interval '1 month - 1 day')::date
        else p_ends end as e
  ) w;
$$;

-- Bestätigte Menge für ein Ziel in einem Zeitraum
create or replace function private.target_actual(p_target uuid, p_from date, p_to date)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(r.quantity), 0)
  from public.targets t
  join public.performance_records r
    on r.status = 'bestaetigt'
   and r.occurred_on between p_from and p_to
   and (t.product_id is null or r.product_id = t.product_id)
  where t.id = p_target
    and case t.scope
          when 'mitarbeiter' then r.user_id = t.user_id
          when 'team' then r.team_id = t.team_id
          else true end;
$$;

-- Nach einer Bestätigung prüfen, ob Ziele erreicht wurden, und benachrichtigen
create or replace function private.check_target_achievements(p_user uuid, p_day date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t record;
  w record;
begin
  for t in
    select * from public.targets
    where scope = 'mitarbeiter' and user_id = p_user and p_day between starts_on and ends_on
  loop
    select * into w from private.target_window(t.period, t.starts_on, t.ends_on, p_day);
    if private.target_actual(t.id, w.window_start, w.window_end) >= t.target_value then
      insert into public.target_achievements (target_id, period_start)
      values (t.id, w.window_start) on conflict do nothing;
      if found then
        perform private.notify(p_user, 'ziel_erreicht', 'Ziel erreicht: ' || t.title,
          'Glückwunsch! Du hast dein Ziel von ' || t.target_value || ' erreicht.', '/ziele');
      end if;
    end if;
  end loop;
end;
$$;

-- =============================================================================
-- RPCs: Leistungserfassung
-- =============================================================================

-- Neue Leistung anlegen.
-- p_submit: sofort einreichen (sonst Entwurf)
-- p_confirm_duplicate: bewusste Bestätigung eines Duplikatverdachts
create or replace function public.performance_create(
  p_user uuid,
  p_product uuid,
  p_occurred_on date,
  p_quantity int,
  p_external_ref text default null,
  p_note text default null,
  p_submit boolean default true,
  p_confirm_duplicate boolean default false)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_id uuid;
  v_status public.performance_status := 'entwurf';
  v_product public.products;
  v_ref text := nullif(trim(p_external_ref), '');
  v_auto_confirm boolean := false;
begin
  if v_actor is null or not private.is_active_user(v_actor) then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  if p_user = v_actor then
    perform private.require_permission('performance.create');
  else
    perform private.require_permission('performance.update');
    if not private.can_access_user(v_actor, p_user, 'performance') then
      raise exception 'Keine Berechtigung für diesen Mitarbeiter' using errcode = '42501';
    end if;
  end if;
  if not private.is_active_user(p_user) then
    raise exception 'Für inaktive Mitarbeiter können keine Leistungen erfasst werden.';
  end if;

  select * into v_product from public.products where id = p_product;
  if v_product.id is null or not v_product.is_active then
    raise exception 'Produkt nicht gefunden oder inaktiv';
  end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 1000 then
    raise exception 'Ungültige Menge (1 bis 1000)';
  end if;
  if p_occurred_on is null or p_occurred_on > private.today_berlin() then
    raise exception 'Das Datum darf nicht in der Zukunft liegen.';
  end if;
  if p_occurred_on < private.today_berlin() - 400 then
    raise exception 'Das Datum liegt zu weit in der Vergangenheit.';
  end if;
  if v_product.requires_external_ref and v_ref is null then
    raise exception 'Für dieses Produkt ist eine Vorgangs-ID erforderlich.';
  end if;

  if v_ref is not null and exists (
    select 1 from public.performance_records
    where product_id = p_product and lower(external_ref) = lower(v_ref)
      and status in ('entwurf', 'eingereicht', 'bestaetigt')) then
    raise exception 'DUPLIKAT_REFERENZ: Diese Vorgangs-ID wurde für dieses Produkt bereits erfasst.'
      using errcode = '23505';
  end if;

  if not coalesce(p_confirm_duplicate, false) and exists (
    select 1 from public.performance_records
    where user_id = p_user and product_id = p_product and occurred_on = p_occurred_on
      and quantity = p_quantity and status in ('entwurf', 'eingereicht', 'bestaetigt')
      and (v_ref is null or external_ref is null)) then
    raise exception 'DUPLIKAT_VERDACHT: Eine identische Leistung (Mitarbeiter, Produkt, Datum, Menge) existiert bereits.'
      using errcode = 'P0001';
  end if;

  if coalesce(p_submit, true) then
    v_status := 'eingereicht';
    v_auto_confirm := not coalesce((private.setting('performance') ->> 'require_approval')::boolean, true)
                      or private.can_approve_for(v_actor, p_user);
    if v_auto_confirm then v_status := 'bestaetigt'; end if;
  end if;

  insert into public.performance_records (
    user_id, team_id, product_id, occurred_on, quantity, external_ref, note, status,
    created_by, submitted_at, confirmed_at, confirmed_by)
  values (
    p_user, private.current_team_id(p_user), p_product, p_occurred_on, p_quantity, v_ref,
    nullif(trim(p_note), ''), v_status, v_actor,
    case when v_status <> 'entwurf' then now() end,
    case when v_status = 'bestaetigt' then now() end,
    case when v_status = 'bestaetigt' then v_actor end)
  returning id into v_id;

  if v_status = 'bestaetigt' then
    insert into public.performance_approvals (record_id, decision, comment, actor_id)
    values (v_id, 'bestaetigt', 'Bei Erfassung bestätigt', v_actor);
    perform private.check_target_achievements(p_user, p_occurred_on);
  end if;
  return v_id;
end;
$$;

-- Entwurf oder abgelehnten Datensatz bearbeiten
create or replace function public.performance_update_draft(
  p_id uuid, p_product uuid, p_occurred_on date, p_quantity int,
  p_external_ref text default null, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.performance_records;
  v_actor uuid := auth.uid();
  v_ref text := nullif(trim(p_external_ref), '');
begin
  select * into r from public.performance_records where id = p_id for update;
  if r.id is null then raise exception 'Datensatz nicht gefunden'; end if;
  if not ((r.user_id = v_actor and private.has_permission(v_actor, 'performance.create'))
          or (r.user_id <> v_actor and private.has_permission(v_actor, 'performance.update')
              and private.can_access_user(v_actor, r.user_id, 'performance'))) then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  if r.status not in ('entwurf', 'abgelehnt') then
    raise exception 'Nur Entwürfe und abgelehnte Leistungen können bearbeitet werden. Bestätigte Leistungen werden über eine Korrektur geändert.';
  end if;
  if p_quantity < 1 or p_quantity > 1000 then raise exception 'Ungültige Menge (1 bis 1000)'; end if;
  if p_occurred_on > private.today_berlin() then raise exception 'Das Datum darf nicht in der Zukunft liegen.'; end if;
  if not exists (select 1 from public.products where id = p_product and is_active) then
    raise exception 'Produkt nicht gefunden oder inaktiv';
  end if;
  if v_ref is not null and exists (
    select 1 from public.performance_records
    where id <> p_id and product_id = p_product and lower(external_ref) = lower(v_ref)
      and status in ('entwurf', 'eingereicht', 'bestaetigt')) then
    raise exception 'DUPLIKAT_REFERENZ: Diese Vorgangs-ID wurde für dieses Produkt bereits erfasst.'
      using errcode = '23505';
  end if;

  update public.performance_records
     set product_id = p_product, occurred_on = p_occurred_on, quantity = p_quantity,
         external_ref = v_ref, note = nullif(trim(p_note), ''),
         status = 'entwurf', status_reason = null
   where id = p_id;

  insert into public.performance_adjustments (record_id, action, from_status, to_status, changes, actor_id)
  values (p_id, 'bearbeitet', r.status, 'entwurf',
          jsonb_build_object('product_id', p_product, 'occurred_on', p_occurred_on,
                             'quantity', p_quantity, 'external_ref', v_ref), v_actor);
end;
$$;

-- Statuswechsel: einreichen, zurückziehen, bestätigen, ablehnen, stornieren, löschen (nur Entwurf)
create or replace function public.performance_transition(p_id uuid, p_action text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.performance_records;
  v_actor uuid := auth.uid();
  v_reason text := nullif(trim(p_reason), '');
  v_is_owner_side boolean;
  v_auto_confirm boolean;
begin
  select * into r from public.performance_records where id = p_id for update;
  if r.id is null then raise exception 'Datensatz nicht gefunden'; end if;
  if v_actor is null or not private.can_access_user(v_actor, r.user_id, 'performance') then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;

  v_is_owner_side := (r.user_id = v_actor and private.has_permission(v_actor, 'performance.create'))
                  or (r.user_id <> v_actor and private.has_permission(v_actor, 'performance.update'));

  case p_action
    when 'einreichen' then
      if not v_is_owner_side then raise exception 'Keine Berechtigung' using errcode = '42501'; end if;
      if r.status not in ('entwurf', 'abgelehnt') then raise exception 'Nur Entwürfe können eingereicht werden.'; end if;
      v_auto_confirm := not coalesce((private.setting('performance') ->> 'require_approval')::boolean, true)
                        or private.can_approve_for(v_actor, r.user_id);
      update public.performance_records
         set status = case when v_auto_confirm then 'bestaetigt'::public.performance_status else 'eingereicht' end,
             submitted_at = now(), status_reason = null,
             confirmed_at = case when v_auto_confirm then now() end,
             confirmed_by = case when v_auto_confirm then v_actor end
       where id = p_id;
      insert into public.performance_adjustments (record_id, action, from_status, to_status, actor_id)
      values (p_id, 'eingereicht', r.status,
              case when v_auto_confirm then 'bestaetigt'::public.performance_status else 'eingereicht' end, v_actor);
      if v_auto_confirm then
        insert into public.performance_approvals (record_id, decision, comment, actor_id)
        values (p_id, 'bestaetigt', 'Bei Einreichung bestätigt', v_actor);
      end if;
      if v_auto_confirm then
        perform private.check_target_achievements(r.user_id, r.occurred_on);
      end if;

    when 'zurueckziehen' then
      if not v_is_owner_side then raise exception 'Keine Berechtigung' using errcode = '42501'; end if;
      if r.status <> 'eingereicht' then raise exception 'Nur eingereichte Leistungen können zurückgezogen werden.'; end if;
      update public.performance_records set status = 'entwurf', submitted_at = null where id = p_id;
      insert into public.performance_adjustments (record_id, action, from_status, to_status, reason, actor_id)
      values (p_id, 'zurueckgezogen', r.status, 'entwurf', v_reason, v_actor);

    when 'loeschen' then
      if not v_is_owner_side then raise exception 'Keine Berechtigung' using errcode = '42501'; end if;
      if r.status <> 'entwurf' or r.submitted_at is not null or r.confirmed_at is not null then
        raise exception 'Nur nie eingereichte Entwürfe können gelöscht werden.';
      end if;
      if exists (select 1 from public.performance_adjustments where record_id = p_id and action = 'eingereicht') then
        raise exception 'Bereits eingereichte Leistungen können nicht gelöscht werden.';
      end if;
      delete from public.performance_records where id = p_id;

    when 'bestaetigen' then
      if not private.can_approve_for(v_actor, r.user_id) then
        raise exception 'Keine Berechtigung (eigene Leistungen können nicht selbst bestätigt werden)' using errcode = '42501';
      end if;
      if r.status <> 'eingereicht' then raise exception 'Nur eingereichte Leistungen können bestätigt werden.'; end if;
      update public.performance_records
         set status = 'bestaetigt', confirmed_at = now(), confirmed_by = v_actor, status_reason = v_reason
       where id = p_id;
      insert into public.performance_approvals (record_id, decision, comment, actor_id)
      values (p_id, 'bestaetigt', v_reason, v_actor);
      perform private.check_target_achievements(r.user_id, r.occurred_on);

    when 'ablehnen' then
      if not private.can_approve_for(v_actor, r.user_id) then
        raise exception 'Keine Berechtigung' using errcode = '42501';
      end if;
      if r.status <> 'eingereicht' then raise exception 'Nur eingereichte Leistungen können abgelehnt werden.'; end if;
      if v_reason is null then raise exception 'Bitte eine Begründung angeben.'; end if;
      update public.performance_records set status = 'abgelehnt', status_reason = v_reason where id = p_id;
      insert into public.performance_approvals (record_id, decision, comment, actor_id)
      values (p_id, 'abgelehnt', v_reason, v_actor);
      perform private.notify(r.user_id, 'leistung_abgelehnt', 'Leistung abgelehnt', v_reason, '/leistungen');

    when 'stornieren' then
      if not private.can_approve_for(v_actor, r.user_id) then
        raise exception 'Keine Berechtigung' using errcode = '42501';
      end if;
      if r.status not in ('eingereicht', 'bestaetigt') then
        raise exception 'Nur eingereichte oder bestätigte Leistungen können storniert werden.';
      end if;
      if v_reason is null then raise exception 'Bitte eine Begründung angeben.'; end if;
      update public.performance_records
         set status = 'storniert', cancelled_at = now(), cancelled_by = v_actor, status_reason = v_reason
       where id = p_id;
      insert into public.performance_adjustments (record_id, action, from_status, to_status, reason, actor_id)
      values (p_id, 'storniert', r.status, 'storniert', v_reason, v_actor);
      perform private.notify(r.user_id, 'leistung_storniert', 'Leistung storniert', v_reason, '/leistungen');

    else
      raise exception 'Unbekannte Aktion';
  end case;
end;
$$;

-- Korrektur einer bestätigten Leistung: Ursprung -> 'korrigiert', neuer Datensatz -> 'bestaetigt'
create or replace function public.performance_correct(
  p_id uuid, p_product uuid, p_occurred_on date, p_quantity int, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.performance_records;
  v_actor uuid := auth.uid();
  v_new uuid;
  v_reason text := nullif(trim(p_reason), '');
begin
  select * into r from public.performance_records where id = p_id for update;
  if r.id is null then raise exception 'Datensatz nicht gefunden'; end if;
  if not private.can_approve_for(v_actor, r.user_id) then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  if r.status <> 'bestaetigt' then raise exception 'Nur bestätigte Leistungen können korrigiert werden.'; end if;
  if v_reason is null then raise exception 'Bitte eine Begründung angeben.'; end if;
  if p_quantity < 1 or p_quantity > 1000 then raise exception 'Ungültige Menge (1 bis 1000)'; end if;
  if p_occurred_on > private.today_berlin() then raise exception 'Das Datum darf nicht in der Zukunft liegen.'; end if;
  if not exists (select 1 from public.products where id = p_product and is_active) then
    raise exception 'Produkt nicht gefunden oder inaktiv';
  end if;

  update public.performance_records
     set status = 'korrigiert', status_reason = v_reason
   where id = p_id;

  insert into public.performance_records (
    user_id, team_id, product_id, occurred_on, quantity, external_ref, note, status,
    corrects_record_id, created_by, submitted_at, confirmed_at, confirmed_by, status_reason)
  values (
    r.user_id, r.team_id, p_product, p_occurred_on, p_quantity, r.external_ref, r.note, 'bestaetigt',
    r.id, v_actor, now(), now(), v_actor, 'Korrektur: ' || v_reason)
  returning id into v_new;

  insert into public.performance_adjustments (
    record_id, action, from_status, to_status, reason, changes, replacement_record_id, actor_id)
  values (p_id, 'korrigiert', 'bestaetigt', 'korrigiert', v_reason,
          jsonb_build_object(
            'vorher', jsonb_build_object('product_id', r.product_id, 'occurred_on', r.occurred_on, 'quantity', r.quantity),
            'nachher', jsonb_build_object('product_id', p_product, 'occurred_on', p_occurred_on, 'quantity', p_quantity)),
          v_new, v_actor);
  insert into public.performance_approvals (record_id, decision, comment, actor_id)
  values (v_new, 'bestaetigt', 'Korrektur: ' || v_reason, v_actor);
  perform private.notify(r.user_id, 'leistung_korrigiert', 'Leistung korrigiert', v_reason, '/leistungen');
  perform private.check_target_achievements(r.user_id, p_occurred_on);
  return v_new;
end;
$$;

-- =============================================================================
-- Auswertungen (SECURITY INVOKER: RLS begrenzt automatisch den Sichtbereich)
-- =============================================================================

-- Tageswerte je Mitarbeiter, Team (zum Erfassungszeitpunkt), Produkt und Status
create or replace function public.performance_daily(
  p_from date, p_to date,
  p_user_ids uuid[] default null,
  p_team_id uuid default null,
  p_product_id uuid default null)
returns table (
  day date, user_id uuid, team_id uuid, product_id uuid,
  status public.performance_status, quantity bigint, records bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select r.occurred_on, r.user_id, r.team_id, r.product_id, r.status,
         sum(r.quantity), count(*)
  from public.performance_records r
  where r.occurred_on between p_from and p_to
    and (p_to - p_from) <= 1100
    and (p_user_ids is null or r.user_id = any (p_user_ids))
    and (p_team_id is null or r.team_id = p_team_id)
    and (p_product_id is null or r.product_id = p_product_id)
  group by 1, 2, 3, 4, 5;
$$;

-- Fortschritt sichtbarer Ziele (aktuelle Periode zum Stichtag)
create or replace function public.get_target_progress(p_day date default null)
returns table (
  target_id uuid, title text, scope public.target_scope, user_id uuid, team_id uuid,
  product_id uuid, period public.target_period, target_value int,
  window_start date, window_end date, actual bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_day date := coalesce(p_day, private.today_berlin());
begin
  if not private.is_active_user(auth.uid()) then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  return query
    select t.id, t.title, t.scope, t.user_id, t.team_id, t.product_id, t.period, t.target_value,
           w.window_start, w.window_end,
           private.target_actual(t.id, w.window_start, w.window_end)
    from public.targets t
    cross join lateral private.target_window(t.period, t.starts_on, t.ends_on, v_day) w
    where v_day between t.starts_on and t.ends_on
      and private.can_view_target(auth.uid(), t.id)
    order by t.scope, t.title;
end;
$$;

-- Bestenliste (nur bestätigte Leistungen, nur aktive Mitarbeiter).
-- Sichtbarkeit wird über organization_settings.rankings gesteuert.
create or replace function public.get_leaderboard(
  p_from date, p_to date, p_product_id uuid default null, p_team_id uuid default null)
returns table (
  rank bigint, user_id uuid, display_name text, team_name text, total bigint, is_me boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer uuid := auth.uid();
  v_settings jsonb := private.setting('rankings');
  v_role text;
begin
  if not private.has_permission(v_viewer, 'rankings.read') then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  if not coalesce((v_settings ->> 'enabled')::boolean, false) then
    raise exception 'Rankings sind deaktiviert.';
  end if;
  if p_to < p_from or (p_to - p_from) > 400 then
    raise exception 'Ungültiger Zeitraum';
  end if;
  select r.key into v_role from public.profiles p join public.roles r on r.id = p.role_id where p.id = v_viewer;

  if p_team_id is null then
    if not (v_settings -> 'agency_roles') ? v_role then
      raise exception 'Das Agenturranking ist für deine Rolle nicht freigegeben.' using errcode = '42501';
    end if;
  else
    if not (v_settings -> 'team_roles') ? v_role then
      raise exception 'Das Teamranking ist für deine Rolle nicht freigegeben.' using errcode = '42501';
    end if;
    if not (p_team_id = private.current_team_id(v_viewer)
            or p_team_id in (select private.led_team_ids(v_viewer))
            or private.has_permission(v_viewer, 'performance.read.all')) then
      raise exception 'Keine Berechtigung für dieses Team' using errcode = '42501';
    end if;
  end if;

  return query
    with totals as (
      select r.user_id, sum(r.quantity)::bigint as total
      from public.performance_records r
      where r.status = 'bestaetigt'
        and r.occurred_on between p_from and p_to
        and (p_product_id is null or r.product_id = p_product_id)
        and (p_team_id is null or r.team_id = p_team_id)
      group by r.user_id
    )
    select rank() over (order by t.total desc), p.id, p.first_name || ' ' || left(p.last_name, 1) || '.',
           tm.name, t.total, p.id = v_viewer
    from totals t
    join public.profiles p on p.id = t.user_id and p.status = 'aktiv'
    left join public.teams tm on tm.id = private.current_team_id(p.id)
    order by 1, 3
    limit 200;
end;
$$;

-- =============================================================================
-- RPCs: Produkte, Ziele, Wettbewerbe
-- =============================================================================

create or replace function public.product_upsert(
  p_id uuid, p_name text, p_description text, p_unit_label text,
  p_requires_external_ref boolean, p_is_active boolean, p_sort_order int default 0)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform private.require_permission('products.manage');
  if p_id is null then
    insert into public.products (name, description, unit_label, requires_external_ref, is_active, sort_order)
    values (trim(p_name), nullif(trim(p_description), ''), coalesce(nullif(trim(p_unit_label), ''), 'Verträge'),
            coalesce(p_requires_external_ref, false), coalesce(p_is_active, true), coalesce(p_sort_order, 0))
    returning id into v_id;
  else
    update public.products
       set name = trim(p_name), description = nullif(trim(p_description), ''),
           unit_label = coalesce(nullif(trim(p_unit_label), ''), 'Verträge'),
           requires_external_ref = coalesce(p_requires_external_ref, false),
           is_active = coalesce(p_is_active, true), sort_order = coalesce(p_sort_order, 0)
     where id = p_id
    returning id into v_id;
    if v_id is null then raise exception 'Produkt nicht gefunden'; end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.target_upsert(
  p_id uuid, p_title text, p_scope public.target_scope, p_user uuid, p_team uuid,
  p_product uuid, p_period public.target_period, p_starts_on date, p_ends_on date, p_target_value int)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_existing public.targets;
begin
  if p_id is not null then
    select * into v_existing from public.targets where id = p_id;
    if v_existing.id is null then raise exception 'Ziel nicht gefunden'; end if;
    if not private.can_manage_target(auth.uid(), v_existing.scope, v_existing.user_id, v_existing.team_id) then
      raise exception 'Keine Berechtigung' using errcode = '42501';
    end if;
  end if;
  if not private.can_manage_target(auth.uid(), p_scope, p_user, p_team) then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;

  if p_id is null then
    insert into public.targets (title, scope, user_id, team_id, product_id, period,
                                starts_on, ends_on, target_value, created_by)
    values (trim(p_title), p_scope,
            case when p_scope = 'mitarbeiter' then p_user end,
            case when p_scope = 'team' then p_team end,
            p_product, p_period, p_starts_on, p_ends_on, p_target_value, auth.uid())
    returning id into v_id;
    if p_scope = 'mitarbeiter' then
      perform private.notify(p_user, 'ziel_neu', 'Neues Ziel: ' || trim(p_title), null, '/ziele');
    end if;
  else
    update public.targets
       set title = trim(p_title), scope = p_scope,
           user_id = case when p_scope = 'mitarbeiter' then p_user end,
           team_id = case when p_scope = 'team' then p_team end,
           product_id = p_product, period = p_period, starts_on = p_starts_on,
           ends_on = p_ends_on, target_value = p_target_value
     where id = p_id
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.target_delete(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.targets;
begin
  select * into t from public.targets where id = p_id;
  if t.id is null then raise exception 'Ziel nicht gefunden'; end if;
  if not private.can_manage_target(auth.uid(), t.scope, t.user_id, t.team_id) then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  delete from public.targets where id = p_id;
end;
$$;

create or replace function public.competition_upsert(
  p_id uuid, p_title text, p_description text, p_product uuid, p_team uuid,
  p_starts_on date, p_ends_on date, p_is_active boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform private.require_permission('competitions.manage');
  if p_ends_on - p_starts_on > 400 then
    raise exception 'Ein Wettbewerb darf höchstens 400 Tage dauern.';
  end if;
  if p_id is null then
    insert into public.competitions (title, description, product_id, team_id, starts_on, ends_on, is_active, created_by)
    values (trim(p_title), nullif(trim(p_description), ''), p_product, p_team, p_starts_on, p_ends_on,
            coalesce(p_is_active, true), auth.uid())
    returning id into v_id;
  else
    update public.competitions
       set title = trim(p_title), description = nullif(trim(p_description), ''), product_id = p_product,
           team_id = p_team, starts_on = p_starts_on, ends_on = p_ends_on, is_active = coalesce(p_is_active, true)
     where id = p_id
    returning id into v_id;
    if v_id is null then raise exception 'Wettbewerb nicht gefunden'; end if;
  end if;
  return v_id;
end;
$$;


-- ----- 20261025000400_academy.sql -----
-- =============================================================================
-- ERLEN CRM – ERLEN Academy (Kurse, Module, Lektionen, Quizze, Lernfortschritt)
-- =============================================================================
-- Fortschrittsregeln:
--  * Das Öffnen einer Lektion setzt nur "in_bearbeitung".
--  * Text-/Dokumentlektionen: Abschluss nur durch ausdrückliche Bestätigung,
--    frühestens nach der Mindestlesezeit (min_seconds) seit dem Start.
--  * Videolektionen: Abschluss, wenn mindestens 90 % der Videolänge als
--    angesehen gemeldet wurden.
--  * Quizlektionen: Abschluss ausschließlich durch ein bestandenes Quiz
--    (Auswertung serverseitig; richtige Antworten werden nie an Lernende gesendet).
--  * Ausbilder/Teamleiter können Fortschritt dokumentieren (Quelle "ausbilder").
-- =============================================================================

create type public.course_status as enum ('entwurf', 'veroeffentlicht', 'archiviert');
create type public.lesson_type as enum ('text', 'video', 'dokument', 'quiz');
create type public.progress_status as enum ('nicht_begonnen', 'in_bearbeitung', 'abgeschlossen');
create type public.completion_source as enum ('selbst', 'video', 'quiz', 'ausbilder');

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 2 and 160),
  description text,
  cover_path text,
  status public.course_status not null default 'entwurf',
  sort_order int not null default 0,
  created_by uuid references public.profiles (id),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.course_modules (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  title text not null check (char_length(title) between 2 and 160),
  description text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index course_modules_course_idx on public.course_modules (course_id, sort_order);

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.course_modules (id) on delete cascade,
  title text not null check (char_length(title) between 2 and 160),
  lesson_type public.lesson_type not null,
  content text,                       -- Markdown-Text
  video_path text,                    -- Pfad im privaten Bucket "academy"
  video_url text check (video_url is null or video_url ~ '^https://'),  -- optional: externer Player (z. B. Vimeo privat)
  document_path text,                 -- Pfad im privaten Bucket "academy"
  duration_minutes int check (duration_minutes is null or duration_minutes between 0 and 600),
  min_seconds int not null default 30 check (min_seconds between 0 and 3600),
  sort_order int not null default 0,
  is_published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index lessons_module_idx on public.lessons (module_id, sort_order);

-- Freigabe eines Kurses für Rolle, Team oder einzelne Person (genau eines davon)
create table public.course_access (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  role_id uuid references public.roles (id) on delete cascade,
  team_id uuid references public.teams (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete cascade,
  is_mandatory boolean not null default false,  -- Pflichtschulung für diese Zielgruppe
  created_at timestamptz not null default now(),
  check (num_nonnulls(role_id, team_id, user_id) = 1)
);
create unique index course_access_unique_idx
  on public.course_access (course_id, coalesce(role_id, team_id, user_id));

-- Persönliche Zuweisungen (Pflichtschulungen mit optionaler Frist)
create table public.course_assignments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  assigned_by uuid references public.profiles (id),
  due_on date,
  is_mandatory boolean not null default true,
  assigned_at timestamptz not null default now(),
  unique (course_id, user_id)
);
create index course_assignments_user_idx on public.course_assignments (user_id);

create table public.lesson_progress (
  user_id uuid not null references public.profiles (id) on delete cascade,
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  status public.progress_status not null default 'in_bearbeitung',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  completion_source public.completion_source,
  video_position_seconds int not null default 0,
  video_duration_seconds int,
  confirmed_by uuid references public.profiles (id),
  note text,
  updated_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);
create index lesson_progress_lesson_idx on public.lesson_progress (lesson_id);

create table public.quizzes (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null unique references public.lessons (id) on delete cascade,
  pass_percent int not null default 80 check (pass_percent between 1 and 100),
  max_attempts int check (max_attempts is null or max_attempts between 1 and 50),
  created_at timestamptz not null default now()
);

create table public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes (id) on delete cascade,
  question text not null check (char_length(question) between 3 and 1000),
  allows_multiple boolean not null default false,
  sort_order int not null default 0
);
create index quiz_questions_quiz_idx on public.quiz_questions (quiz_id, sort_order);

create table public.quiz_answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.quiz_questions (id) on delete cascade,
  answer text not null check (char_length(answer) between 1 and 500),
  is_correct boolean not null default false,
  sort_order int not null default 0
);
create index quiz_answers_question_idx on public.quiz_answers (question_id, sort_order);

create table public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  score_percent int not null,
  passed boolean not null,
  answers jsonb not null,
  created_at timestamptz not null default now()
);
create index quiz_attempts_user_idx on public.quiz_attempts (user_id, quiz_id);

-- Feedback und Ausbildungsnotizen
create table public.training_notes (
  id uuid primary key default gen_random_uuid(),
  trainee_id uuid not null references public.profiles (id) on delete cascade,
  author_id uuid not null references public.profiles (id),
  body text not null check (char_length(body) between 1 and 5000),
  shared_with_trainee boolean not null default false,
  created_at timestamptz not null default now()
);
create index training_notes_trainee_idx on public.training_notes (trainee_id, created_at desc);

create trigger courses_touch before update on public.courses
  for each row execute function private.touch_updated_at();
create trigger lessons_touch before update on public.lessons
  for each row execute function private.touch_updated_at();
create trigger lesson_progress_touch before update on public.lesson_progress
  for each row execute function private.touch_updated_at();

create trigger courses_audit after insert or update or delete on public.courses
  for each row execute function private.audit_trigger();
create trigger course_access_audit after insert or update or delete on public.course_access
  for each row execute function private.audit_trigger('user_id');
create trigger course_assignments_audit after insert or update or delete on public.course_assignments
  for each row execute function private.audit_trigger('user_id');
create trigger lesson_progress_audit after insert or update or delete on public.lesson_progress
  for each row execute function private.audit_trigger('user_id');

-- =============================================================================
-- Sichtbarkeit
-- =============================================================================

-- Darf p_user den Kurs nutzen? (unabhängig davon, wer fragt)
create or replace function private.course_available_to(p_user uuid, p_course uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.courses c
    where c.id = p_course
      and c.status = 'veroeffentlicht'
      and private.has_permission(p_user, 'training.read')
      and (
        exists (select 1 from public.course_assignments ca where ca.course_id = c.id and ca.user_id = p_user)
        or exists (
          select 1 from public.course_access a
          where a.course_id = c.id
            and (a.user_id = p_user
                 or a.role_id = (select role_id from public.profiles where id = p_user)
                 or a.team_id = private.current_team_id(p_user)))
      )
  );
$$;

create or replace function private.can_view_course(p_viewer uuid, p_course uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_permission(p_viewer, 'training.manage')
      or private.course_available_to(p_viewer, p_course);
$$;

create or replace function private.can_view_lesson(p_viewer uuid, p_lesson uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.lessons l
    join public.course_modules m on m.id = l.module_id
    where l.id = p_lesson
      and (private.has_permission(p_viewer, 'training.manage')
           or (l.is_published and private.course_available_to(p_viewer, m.course_id)))
  );
$$;

-- Mandatory-Kurse für einen Benutzer automatisch zuweisen (Rolle/Team)
create or replace function private.assign_mandatory_courses(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record;
begin
  for c in
    select distinct a.course_id, co.title
    from public.course_access a
    join public.courses co on co.id = a.course_id and co.status = 'veroeffentlicht'
    where a.is_mandatory
      and (a.user_id = p_user
           or a.role_id = (select role_id from public.profiles where id = p_user)
           or a.team_id = private.current_team_id(p_user))
      and not exists (select 1 from public.course_assignments x where x.course_id = a.course_id and x.user_id = p_user)
  loop
    insert into public.course_assignments (course_id, user_id, assigned_by, is_mandatory)
    values (c.course_id, p_user, auth.uid(), true);
    perform private.notify(p_user, 'schulung_zugewiesen', 'Neue Pflichtschulung: ' || c.title, null,
      '/academy/kurs/' || c.course_id::text);
  end loop;
end;
$$;

alter table public.courses enable row level security;
alter table public.course_modules enable row level security;
alter table public.lessons enable row level security;
alter table public.course_access enable row level security;
alter table public.course_assignments enable row level security;
alter table public.lesson_progress enable row level security;
alter table public.quizzes enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.quiz_answers enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.training_notes enable row level security;

create policy courses_select on public.courses for select to authenticated
  using (private.can_view_course((select auth.uid()), id));
create policy course_modules_select on public.course_modules for select to authenticated
  using (private.can_view_course((select auth.uid()), course_id));
create policy lessons_select on public.lessons for select to authenticated
  using (private.can_view_lesson((select auth.uid()), id));
create policy course_access_select on public.course_access for select to authenticated
  using (private.has_permission((select auth.uid()), 'training.manage'));
create policy course_assignments_select on public.course_assignments for select to authenticated
  using (user_id in (select private.visible_user_ids((select auth.uid()), 'training.progress')));
create policy lesson_progress_select on public.lesson_progress for select to authenticated
  using (user_id in (select private.visible_user_ids((select auth.uid()), 'training.progress')));
create policy quizzes_select on public.quizzes for select to authenticated
  using (private.can_view_lesson((select auth.uid()), lesson_id));
-- Fragen/Antworten (inkl. Lösung) nur für Kursverwaltung; Lernende nutzen get_quiz()
create policy quiz_questions_select on public.quiz_questions for select to authenticated
  using (private.has_permission((select auth.uid()), 'training.manage'));
create policy quiz_answers_select on public.quiz_answers for select to authenticated
  using (private.has_permission((select auth.uid()), 'training.manage'));
create policy quiz_attempts_select on public.quiz_attempts for select to authenticated
  using (user_id in (select private.visible_user_ids((select auth.uid()), 'training.progress')));
create policy training_notes_select on public.training_notes for select to authenticated
  using (
    author_id = (select auth.uid())
    or (trainee_id = (select auth.uid()) and shared_with_trainee)
    or (trainee_id <> (select auth.uid())
        and private.has_permission((select auth.uid()), 'training.notes.write')
        and trainee_id in (select private.visible_user_ids((select auth.uid()), 'training.progress')))
  );

-- =============================================================================
-- RPCs: Lernende
-- =============================================================================

create or replace function public.lesson_start(p_lesson uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.can_view_lesson(auth.uid(), p_lesson)
     or not private.has_permission(auth.uid(), 'training.read') then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  insert into public.lesson_progress (user_id, lesson_id, status)
  values (auth.uid(), p_lesson, 'in_bearbeitung')
  on conflict (user_id, lesson_id) do nothing;
end;
$$;

-- Text- und Dokumentlektionen ausdrücklich abschließen
create or replace function public.lesson_complete(p_lesson uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.lessons;
  p public.lesson_progress;
begin
  if not private.can_view_lesson(auth.uid(), p_lesson)
     or not private.has_permission(auth.uid(), 'training.read') then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  select * into l from public.lessons where id = p_lesson;
  -- Externe Videos (ohne eigene Datei) können nicht gemessen werden -> ausdrückliche Bestätigung
  if l.lesson_type not in ('text', 'dokument') and not (l.lesson_type = 'video' and l.video_path is null) then
    raise exception 'Diese Lektion wird über Video bzw. Quiz abgeschlossen.';
  end if;
  select * into p from public.lesson_progress where user_id = auth.uid() and lesson_id = p_lesson;
  if p.user_id is null then
    raise exception 'Bitte öffne die Lektion zuerst.';
  end if;
  if p.status = 'abgeschlossen' then return; end if;
  if now() < p.started_at + make_interval(secs => l.min_seconds) then
    raise exception 'MINDESTZEIT: Bitte nimm dir etwas mehr Zeit für diese Lektion.';
  end if;
  update public.lesson_progress
     set status = 'abgeschlossen', completed_at = now(), completion_source = 'selbst'
   where user_id = auth.uid() and lesson_id = p_lesson;
end;
$$;

-- Videofortschritt melden. Abschluss ab 90 % der Videolänge.
create or replace function public.lesson_video_progress(p_lesson uuid, p_position int, p_duration int)
returns public.progress_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.lessons;
  v_status public.progress_status;
begin
  if not private.can_view_lesson(auth.uid(), p_lesson)
     or not private.has_permission(auth.uid(), 'training.read') then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  select * into l from public.lessons where id = p_lesson;
  if l.lesson_type <> 'video' then raise exception 'Keine Videolektion'; end if;
  if p_duration is null or p_duration <= 0 or p_position < 0 or p_position > p_duration + 5 then
    raise exception 'Ungültige Videodaten';
  end if;
  insert into public.lesson_progress (user_id, lesson_id, status, video_position_seconds, video_duration_seconds)
  values (auth.uid(), p_lesson, 'in_bearbeitung', p_position, p_duration)
  on conflict (user_id, lesson_id) do update
    set video_position_seconds = greatest(public.lesson_progress.video_position_seconds, excluded.video_position_seconds),
        video_duration_seconds = excluded.video_duration_seconds;

  update public.lesson_progress
     set status = 'abgeschlossen', completed_at = now(), completion_source = 'video'
   where user_id = auth.uid() and lesson_id = p_lesson
     and status <> 'abgeschlossen'
     and video_position_seconds >= 0.9 * video_duration_seconds
     -- Plausibilität: Abschluss frühestens nach 50 % der Videolänge in Echtzeit
     and now() >= started_at + make_interval(secs => (0.5 * video_duration_seconds)::int);

  select status into v_status from public.lesson_progress where user_id = auth.uid() and lesson_id = p_lesson;
  return v_status;
end;
$$;

-- Quiz ohne Lösungen abrufen
create or replace function public.get_quiz(p_lesson uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_quiz public.quizzes;
  v_attempts int;
begin
  if not private.can_view_lesson(auth.uid(), p_lesson) then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  select * into v_quiz from public.quizzes where lesson_id = p_lesson;
  if v_quiz.id is null then return null; end if;
  select count(*) into v_attempts from public.quiz_attempts where quiz_id = v_quiz.id and user_id = auth.uid();
  return jsonb_build_object(
    'quiz_id', v_quiz.id,
    'pass_percent', v_quiz.pass_percent,
    'max_attempts', v_quiz.max_attempts,
    'attempts_used', v_attempts,
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', q.id, 'question', q.question, 'allows_multiple', q.allows_multiple,
        'answers', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'answer', a.answer) order by a.sort_order), '[]')
                    from public.quiz_answers a where a.question_id = q.id)
      ) order by q.sort_order)
      from public.quiz_questions q where q.quiz_id = v_quiz.id), '[]'));
end;
$$;

-- Quiz einreichen und serverseitig auswerten.
-- p_answers: {"<question_id>": ["<answer_id>", ...], ...}
create or replace function public.submit_quiz(p_lesson uuid, p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quiz public.quizzes;
  v_total int;
  v_correct int := 0;
  v_score int;
  v_passed boolean;
  v_attempts int;
  q record;
  v_given uuid[];
  v_expected uuid[];
begin
  if not private.can_view_lesson(auth.uid(), p_lesson)
     or not private.has_permission(auth.uid(), 'training.read') then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  select * into v_quiz from public.quizzes where lesson_id = p_lesson;
  if v_quiz.id is null then raise exception 'Kein Quiz vorhanden'; end if;
  select count(*) into v_attempts from public.quiz_attempts where quiz_id = v_quiz.id and user_id = auth.uid();
  if v_quiz.max_attempts is not null and v_attempts >= v_quiz.max_attempts then
    raise exception 'Maximale Anzahl an Versuchen erreicht.';
  end if;
  select count(*) into v_total from public.quiz_questions where quiz_id = v_quiz.id;
  if v_total = 0 then raise exception 'Das Quiz enthält keine Fragen.'; end if;

  for q in select id from public.quiz_questions where quiz_id = v_quiz.id loop
    select coalesce(array_agg(x::uuid order by x), '{}') into v_given
      from jsonb_array_elements_text(coalesce(p_answers -> q.id::text, '[]'::jsonb)) x;
    select coalesce(array_agg(a.id order by a.id), '{}') into v_expected
      from public.quiz_answers a where a.question_id = q.id and a.is_correct;
    if v_given = v_expected then v_correct := v_correct + 1; end if;
  end loop;

  v_score := round(100.0 * v_correct / v_total);
  v_passed := v_score >= v_quiz.pass_percent;
  insert into public.quiz_attempts (quiz_id, user_id, score_percent, passed, answers)
  values (v_quiz.id, auth.uid(), v_score, v_passed, coalesce(p_answers, '{}'));

  insert into public.lesson_progress (user_id, lesson_id, status)
  values (auth.uid(), p_lesson, 'in_bearbeitung')
  on conflict (user_id, lesson_id) do nothing;
  if v_passed then
    update public.lesson_progress
       set status = 'abgeschlossen', completed_at = coalesce(completed_at, now()), completion_source = 'quiz'
     where user_id = auth.uid() and lesson_id = p_lesson and status <> 'abgeschlossen';
  end if;
  return jsonb_build_object('score_percent', v_score, 'passed', v_passed,
                            'correct', v_correct, 'total', v_total, 'pass_percent', v_quiz.pass_percent);
end;
$$;

-- Kursfortschritt eines Mitarbeiters (für ihn selbst oder berechtigte Führungskräfte)
create or replace function public.get_training_overview(p_user uuid default null)
returns table (
  course_id uuid, title text, is_mandatory boolean, due_on date,
  total_lessons bigint, completed_lessons bigint, last_activity timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := coalesce(p_user, auth.uid());
begin
  if not private.can_access_user(auth.uid(), v_user, 'training.progress') then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  return query
    select c.id, c.title,
           coalesce(ca.is_mandatory, false),
           ca.due_on,
           (select count(*) from public.lessons l join public.course_modules m on m.id = l.module_id
             where m.course_id = c.id and l.is_published),
           (select count(*) from public.lesson_progress lp
              join public.lessons l on l.id = lp.lesson_id
              join public.course_modules m on m.id = l.module_id
             where m.course_id = c.id and l.is_published and lp.user_id = v_user and lp.status = 'abgeschlossen'),
           (select max(lp.updated_at) from public.lesson_progress lp
              join public.lessons l on l.id = lp.lesson_id
              join public.course_modules m on m.id = l.module_id
             where m.course_id = c.id and lp.user_id = v_user)
    from public.courses c
    left join public.course_assignments ca on ca.course_id = c.id and ca.user_id = v_user
    where private.course_available_to(v_user, c.id)
    order by coalesce(ca.is_mandatory, false) desc, c.sort_order, c.title;
end;
$$;

-- =============================================================================
-- RPCs: Ausbilder / Führungskräfte
-- =============================================================================

create or replace function public.trainer_set_lesson_progress(
  p_user uuid, p_lesson uuid, p_status public.progress_status, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_permission('training.progress.manage');
  if p_user = auth.uid() or not private.can_access_user(auth.uid(), p_user, 'training.progress') then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.lessons l join public.course_modules m on m.id = l.module_id
    where l.id = p_lesson and private.course_available_to(p_user, m.course_id)) then
    raise exception 'Die Lektion ist für diesen Mitarbeiter nicht freigegeben.';
  end if;
  if p_status = 'nicht_begonnen' then
    delete from public.lesson_progress where user_id = p_user and lesson_id = p_lesson;
    return;
  end if;
  insert into public.lesson_progress (user_id, lesson_id, status, completed_at, completion_source, confirmed_by, note)
  values (p_user, p_lesson, p_status,
          case when p_status = 'abgeschlossen' then now() end,
          case when p_status = 'abgeschlossen' then 'ausbilder'::public.completion_source end,
          auth.uid(), nullif(trim(p_note), ''))
  on conflict (user_id, lesson_id) do update
    set status = excluded.status, completed_at = excluded.completed_at,
        completion_source = excluded.completion_source, confirmed_by = excluded.confirmed_by,
        note = excluded.note;
end;
$$;

create or replace function public.training_note_add(p_trainee uuid, p_body text, p_shared boolean default false)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform private.require_permission('training.notes.write');
  if p_trainee = auth.uid() or not private.can_access_user(auth.uid(), p_trainee, 'training.progress') then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  insert into public.training_notes (trainee_id, author_id, body, shared_with_trainee)
  values (p_trainee, auth.uid(), trim(p_body), coalesce(p_shared, false))
  returning id into v_id;
  if coalesce(p_shared, false) then
    perform private.notify(p_trainee, 'feedback', 'Neues Feedback von deinem Ausbilder', null, '/academy');
  end if;
  return v_id;
end;
$$;

-- Kurs persönlich zuweisen (Pflichtschulung)
create or replace function public.course_assign(p_course uuid, p_user uuid, p_due_on date default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
begin
  if not (private.has_permission(auth.uid(), 'training.manage')
          or (private.has_permission(auth.uid(), 'training.progress.manage')
              and p_user <> auth.uid()
              and private.can_access_user(auth.uid(), p_user, 'training.progress'))) then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  select title into v_title from public.courses where id = p_course and status = 'veroeffentlicht';
  if v_title is null then raise exception 'Kurs nicht gefunden oder nicht veröffentlicht'; end if;
  insert into public.course_assignments (course_id, user_id, assigned_by, due_on, is_mandatory)
  values (p_course, p_user, auth.uid(), p_due_on, true)
  on conflict (course_id, user_id) do update set due_on = excluded.due_on, is_mandatory = true;
  perform private.notify(p_user, 'schulung_zugewiesen', 'Neue Schulung zugewiesen: ' || v_title,
    case when p_due_on is not null then 'Fällig bis ' || to_char(p_due_on, 'DD.MM.YYYY') end,
    '/academy/kurs/' || p_course::text);
end;
$$;

create or replace function public.course_unassign(p_course uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (private.has_permission(auth.uid(), 'training.manage')
          or (private.has_permission(auth.uid(), 'training.progress.manage')
              and private.can_access_user(auth.uid(), p_user, 'training.progress'))) then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  delete from public.course_assignments where course_id = p_course and user_id = p_user;
end;
$$;

-- =============================================================================
-- RPCs: Kursverwaltung (training.manage)
-- =============================================================================

create or replace function public.course_upsert(
  p_id uuid, p_title text, p_description text, p_status public.course_status, p_sort_order int default 0)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform private.require_permission('training.manage');
  if p_id is null then
    insert into public.courses (title, description, status, sort_order, created_by, published_at)
    values (trim(p_title), nullif(trim(p_description), ''), p_status, coalesce(p_sort_order, 0), auth.uid(),
            case when p_status = 'veroeffentlicht' then now() end)
    returning id into v_id;
  else
    update public.courses
       set title = trim(p_title), description = nullif(trim(p_description), ''), status = p_status,
           sort_order = coalesce(p_sort_order, 0),
           published_at = case when p_status = 'veroeffentlicht' then coalesce(published_at, now()) else published_at end
     where id = p_id
    returning id into v_id;
    if v_id is null then raise exception 'Kurs nicht gefunden'; end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.course_set_cover(p_course uuid, p_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_permission('training.manage');
  update public.courses set cover_path = p_path where id = p_course;
end;
$$;

create or replace function public.course_delete(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_permission('training.manage');
  if exists (select 1 from public.lesson_progress lp join public.lessons l on l.id = lp.lesson_id
             join public.course_modules m on m.id = l.module_id where m.course_id = p_id) then
    raise exception 'Kurs hat bereits Lernfortschritte. Bitte archivieren statt löschen.';
  end if;
  delete from public.courses where id = p_id;
end;
$$;

-- Freigaben eines Kurses vollständig setzen.
-- p_entries: [{"role_id":..}|{"team_id":..}|{"user_id":..}, "is_mandatory": bool]
create or replace function public.course_set_access(p_course uuid, p_entries jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e jsonb;
  u record;
begin
  perform private.require_permission('training.manage');
  delete from public.course_access where course_id = p_course;
  for e in select * from jsonb_array_elements(coalesce(p_entries, '[]')) loop
    insert into public.course_access (course_id, role_id, team_id, user_id, is_mandatory)
    values (p_course, (e ->> 'role_id')::uuid, (e ->> 'team_id')::uuid, (e ->> 'user_id')::uuid,
            coalesce((e ->> 'is_mandatory')::boolean, false));
  end loop;
  -- Pflichtschulungen sofort für betroffene aktive Benutzer zuweisen
  for u in select id from public.profiles where status = 'aktiv' loop
    perform private.assign_mandatory_courses(u.id);
  end loop;
end;
$$;

create or replace function public.module_upsert(
  p_id uuid, p_course uuid, p_title text, p_description text, p_sort_order int)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform private.require_permission('training.manage');
  if p_id is null then
    insert into public.course_modules (course_id, title, description, sort_order)
    values (p_course, trim(p_title), nullif(trim(p_description), ''), coalesce(p_sort_order, 0))
    returning id into v_id;
  else
    update public.course_modules
       set title = trim(p_title), description = nullif(trim(p_description), ''), sort_order = coalesce(p_sort_order, 0)
     where id = p_id
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.module_delete(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_permission('training.manage');
  if exists (select 1 from public.lesson_progress lp join public.lessons l on l.id = lp.lesson_id where l.module_id = p_id) then
    raise exception 'Modul hat bereits Lernfortschritte und kann nicht gelöscht werden.';
  end if;
  delete from public.course_modules where id = p_id;
end;
$$;

create or replace function public.lesson_upsert(
  p_id uuid, p_module uuid, p_title text, p_type public.lesson_type, p_content text,
  p_video_url text, p_duration_minutes int, p_min_seconds int, p_sort_order int, p_is_published boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_was_published boolean := false;
  v_course uuid;
  v_course_title text;
  u record;
begin
  perform private.require_permission('training.manage');
  if p_id is null then
    insert into public.lessons (module_id, title, lesson_type, content, video_url, duration_minutes,
                                min_seconds, sort_order, is_published, published_at)
    values (p_module, trim(p_title), p_type, p_content, nullif(trim(p_video_url), ''), p_duration_minutes,
            coalesce(p_min_seconds, 30), coalesce(p_sort_order, 0), coalesce(p_is_published, false),
            case when coalesce(p_is_published, false) then now() end)
    returning id into v_id;
  else
    select is_published into v_was_published from public.lessons where id = p_id;
    update public.lessons
       set title = trim(p_title), lesson_type = p_type, content = p_content,
           video_url = nullif(trim(p_video_url), ''), duration_minutes = p_duration_minutes,
           min_seconds = coalesce(p_min_seconds, 30), sort_order = coalesce(p_sort_order, 0),
           is_published = coalesce(p_is_published, false),
           published_at = case when coalesce(p_is_published, false) then coalesce(published_at, now()) end
     where id = p_id
    returning id into v_id;
    if v_id is null then raise exception 'Lektion nicht gefunden'; end if;
  end if;

  if p_type = 'quiz' then
    insert into public.quizzes (lesson_id) values (v_id) on conflict (lesson_id) do nothing;
  end if;

  -- Benachrichtigung bei Neuveröffentlichung
  if coalesce(p_is_published, false) and not coalesce(v_was_published, false) then
    select c.id, c.title into v_course, v_course_title
      from public.course_modules m join public.courses c on c.id = m.course_id
     where m.id = (select module_id from public.lessons where id = v_id);
    for u in select id from public.profiles where status = 'aktiv' loop
      if private.course_available_to(u.id, v_course) then
        perform private.notify(u.id, 'lektion_neu', 'Neue Lektion in „' || v_course_title || '“',
          trim(p_title), '/academy/lektion/' || v_id::text);
      end if;
    end loop;
  end if;
  return v_id;
end;
$$;

create or replace function public.lesson_set_media(p_lesson uuid, p_kind text, p_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_permission('training.manage');
  if p_kind = 'video' then
    update public.lessons set video_path = p_path where id = p_lesson;
  elsif p_kind = 'dokument' then
    update public.lessons set document_path = p_path where id = p_lesson;
  else
    raise exception 'Ungültiger Medientyp';
  end if;
end;
$$;

create or replace function public.lesson_delete(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_permission('training.manage');
  if exists (select 1 from public.lesson_progress where lesson_id = p_id and status = 'abgeschlossen') then
    raise exception 'Lektion wurde bereits abgeschlossen. Bitte stattdessen die Veröffentlichung aufheben.';
  end if;
  delete from public.lessons where id = p_id;
end;
$$;

-- Quiz vollständig speichern.
-- p_questions: [{"question": "...", "allows_multiple": bool, "answers": [{"answer": "...", "is_correct": bool}]}]
create or replace function public.quiz_save(p_lesson uuid, p_pass_percent int, p_max_attempts int, p_questions jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quiz uuid;
  q jsonb;
  a jsonb;
  v_q uuid;
  i int := 0;
  j int;
begin
  perform private.require_permission('training.manage');
  if not exists (select 1 from public.lessons where id = p_lesson and lesson_type = 'quiz') then
    raise exception 'Keine Quizlektion';
  end if;
  insert into public.quizzes (lesson_id, pass_percent, max_attempts)
  values (p_lesson, coalesce(p_pass_percent, 80), p_max_attempts)
  on conflict (lesson_id) do update set pass_percent = excluded.pass_percent, max_attempts = excluded.max_attempts
  returning id into v_quiz;
  delete from public.quiz_questions where quiz_id = v_quiz;
  for q in select * from jsonb_array_elements(coalesce(p_questions, '[]')) loop
    i := i + 1;
    if not exists (select 1 from jsonb_array_elements(q -> 'answers') x where (x ->> 'is_correct')::boolean) then
      raise exception 'Jede Frage benötigt mindestens eine richtige Antwort (Frage %).', i;
    end if;
    insert into public.quiz_questions (quiz_id, question, allows_multiple, sort_order)
    values (v_quiz, trim(q ->> 'question'), coalesce((q ->> 'allows_multiple')::boolean, false), i)
    returning id into v_q;
    j := 0;
    for a in select * from jsonb_array_elements(q -> 'answers') loop
      j := j + 1;
      insert into public.quiz_answers (question_id, answer, is_correct, sort_order)
      values (v_q, trim(a ->> 'answer'), coalesce((a ->> 'is_correct')::boolean, false), j);
    end loop;
  end loop;
end;
$$;


-- ----- 20261025000500_documents_storage.sql -----
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


-- ----- 20261025000600_onboarding_notifications.sql -----
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

-- Einladung für einen (neu angelegten) Auth-Benutzer einlösen – einmalig und atomar.
-- Legt das Profil an bzw. aktiviert das beim Anlegen entstandene, deaktivierte Profil.
create or replace function private.apply_invitation(p_invitation uuid, p_user uuid, p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.invitations;
begin
  update public.invitations
     set accepted_at = now()
   where id = p_invitation and accepted_at is null and revoked_at is null and expires_at > now()
     and lower(email) = lower(p_email)
  returning * into v_inv;
  if v_inv.id is null then
    raise exception 'Einladung ist ungültig, abgelaufen oder wurde bereits verwendet.';
  end if;

  insert into public.profiles (id, first_name, last_name, email, role_id, status)
  values (p_user, v_inv.first_name, v_inv.last_name, p_email, v_inv.role_id, 'aktiv')
  on conflict (id) do update
    set first_name = excluded.first_name, last_name = excluded.last_name, role_id = excluded.role_id,
        status = 'aktiv', deactivated_at = null;
  insert into public.employee_details (user_id, entry_date) values (p_user, private.today_berlin())
  on conflict (user_id) do update set entry_date = coalesce(public.employee_details.entry_date, excluded.entry_date);
  update public.invitations set accepted_user_id = p_user where id = v_inv.id;

  if v_inv.team_id is not null then
    insert into public.team_memberships (team_id, user_id, member_role, created_by)
    values (v_inv.team_id, p_user, 'mitglied', v_inv.invited_by);
  end if;
  if v_inv.supervisor_id is not null and v_inv.supervisor_id <> p_user then
    insert into public.reporting_relationships (employee_id, manager_id, relation_type, created_by)
    values (p_user, v_inv.supervisor_id, 'vorgesetzter', v_inv.invited_by);
  end if;
  if v_inv.trainer_id is not null and v_inv.trainer_id <> p_user then
    insert into public.reporting_relationships (employee_id, manager_id, relation_type, created_by)
    values (p_user, v_inv.trainer_id, 'ausbilder', v_inv.invited_by);
  end if;
  perform private.notify(p_user, 'willkommen', 'Willkommen bei ERLEN!',
    'Dein Konto ist eingerichtet. Ergänze bitte dein Profil und starte deine Pflichtschulungen.', '/dashboard');
  perform private.notify(v_inv.invited_by, 'einladung_angenommen',
    'Einladung angenommen: ' || v_inv.first_name || ' ' || v_inv.last_name, null, '/mitarbeiter/' || p_user::text);
end;
$$;

-- Neuer Auth-Benutzer: deaktiviertes Profil anlegen bzw. Einladung direkt einlösen,
-- falls die Einladungs-ID bereits beim Anlegen in den App-Metadaten steht.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role uuid;
  v_inv_id uuid := nullif(new.raw_app_meta_data ->> 'invitation_id', '')::uuid;
begin
  if v_inv_id is not null then
    perform private.apply_invitation(v_inv_id, new.id, new.email);
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

-- Nur für den Server (service_role): Einladung nach dem Anlegen des Kontos einlösen.
create or replace function public.invitation_accept(p_invitation uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
begin
  select email into v_email from auth.users where id = p_user;
  if v_email is null then raise exception 'Benutzer nicht gefunden'; end if;
  if exists (select 1 from public.invitations where id = p_invitation and accepted_user_id = p_user) then
    return; -- bereits durch den Trigger eingelöst
  end if;
  perform private.apply_invitation(p_invitation, p_user, v_email);
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
revoke execute on function public.invitation_accept(uuid, uuid) from authenticated;
revoke execute on function public.rate_limit_hit(text, int, int) from authenticated;
revoke execute on function public.purge_applicants(int) from authenticated;
revoke execute on function public.bootstrap_admin(text) from authenticated, service_role;

revoke execute on all functions in schema private from public, anon;


-- ----- 20261026000700_commissions_statements.sql -----
-- =============================================================================
-- ERLEN CRM – Produktfreigaben, Provisionen, Abrechnungen & Gutschriften
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Versionsverwaltung der Datenbank (für Updates über /einrichtung)
-- -----------------------------------------------------------------------------
create table if not exists private.schema_migrations (
  name text primary key,
  applied_at timestamptz not null default now()
);
insert into private.schema_migrations (name) values
  ('20261025000100_core.sql'), ('20261025000200_core_seed_and_rpc.sql'), ('20261025000300_performance.sql'),
  ('20261025000400_academy.sql'), ('20261025000500_documents_storage.sql'), ('20261025000600_onboarding_notifications.sql')
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Neue Berechtigungen
-- -----------------------------------------------------------------------------
insert into public.permissions (key, category, description) values
  ('products.assign', 'Leistung', 'Mitarbeiter für Produkte freischalten'),
  ('commissions.manage', 'Abrechnung', 'Provisionsstufen und Provisionssätze verwalten'),
  ('statements.read.self', 'Abrechnung', 'Eigene Abrechnungen und Gutschriften abrufen'),
  ('statements.manage', 'Abrechnung', 'Abrechnungen und Gutschriften erstellen, hochladen und verwalten')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_key)
select r.id, p.perm
from public.roles r
cross join lateral (values ('statements.read.self')) p(perm)
on conflict do nothing;

insert into public.role_permissions (role_id, permission_key)
select r.id, p.perm
from public.roles r
cross join lateral (values ('products.assign'), ('commissions.manage'), ('statements.manage')) p(perm)
where r.key in ('agenturleiter', 'admin')
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Produktfreigaben je Mitarbeiter
-- -----------------------------------------------------------------------------
create table public.user_products (
  user_id uuid not null references public.profiles (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  granted_by uuid references public.profiles (id),
  granted_at timestamptz not null default now(),
  primary key (user_id, product_id)
);
create index user_products_product_idx on public.user_products (product_id);

-- Bestehende Mitarbeiter behalten Zugriff auf alle aktiven Produkte (bisheriges Verhalten)
insert into public.user_products (user_id, product_id)
select p.id, pr.id from public.profiles p cross join public.products pr where pr.is_active
on conflict do nothing;

create trigger user_products_audit after insert or update or delete on public.user_products
  for each row execute function private.audit_trigger('user_id');

alter table public.user_products enable row level security;
create policy user_products_select on public.user_products for select to authenticated
  using (
    user_id in (select private.visible_user_ids((select auth.uid()), 'performance'))
    or private.has_permission((select auth.uid()), 'products.assign')
  );

create or replace function private.has_product(p_user uuid, p_product uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.user_products where user_id = p_user and product_id = p_product);
$$;

-- Freigaben eines Mitarbeiters vollständig setzen
create or replace function public.user_products_set(p_user uuid, p_products uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_added text;
begin
  perform private.require_permission('products.assign');
  if not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'Benutzer nicht gefunden';
  end if;
  delete from public.user_products where user_id = p_user and not (product_id = any (coalesce(p_products, '{}')));
  select string_agg(pr.name, ', ') into v_added
  from unnest(coalesce(p_products, '{}')) x(id)
  join public.products pr on pr.id = x.id
  where not exists (select 1 from public.user_products up where up.user_id = p_user and up.product_id = x.id);
  insert into public.user_products (user_id, product_id, granted_by)
  select p_user, x.id, auth.uid() from unnest(coalesce(p_products, '{}')) x(id)
  join public.products pr on pr.id = x.id
  on conflict do nothing;
  if v_added is not null then
    perform private.notify(p_user, 'produkt_freigeschaltet', 'Neue Produktfreigabe', 'Freigeschaltet: ' || v_added, '/leistungen/neu');
  end if;
end;
$$;

-- Neue Produkte: niemand automatisch freigeschaltet (bewusste Freigabe)

-- Leistungserfassung: nur für freigeschaltete Produkte
create or replace function private.check_product_clearance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.product_id is distinct from old.product_id then
    if not private.has_product(new.user_id, new.product_id) then
      raise exception 'PRODUKT_GESPERRT: Dieser Mitarbeiter ist für das Produkt nicht freigeschaltet.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;
create trigger performance_records_product_clearance
  before insert or update of product_id on public.performance_records
  for each row execute function private.check_product_clearance();

-- Produktfreigaben schon bei der Einladung festlegen; werden beim Einlösen übernommen
alter table public.invitations add column product_ids uuid[] not null default '{}';

create or replace function public.invitation_set_products(p_id uuid, p_products uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_permission('employees.invite');
  perform private.require_permission('products.assign');
  update public.invitations set product_ids = coalesce(p_products, '{}')
   where id = p_id and accepted_at is null and revoked_at is null;
  if not found then raise exception 'Einladung nicht gefunden oder bereits verwendet'; end if;
end;
$$;

create or replace function private.invitation_grant_products()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.accepted_user_id is not null and old.accepted_user_id is null then
    insert into public.user_products (user_id, product_id, granted_by)
    select new.accepted_user_id, pr.id, new.invited_by
    from public.products pr where pr.id = any (new.product_ids)
    on conflict do nothing;
  end if;
  return new;
end;
$$;
create trigger invitations_grant_products after update of accepted_user_id on public.invitations
  for each row execute function private.invitation_grant_products();

-- Einladung erneut versenden: neuer Token, neue Gültigkeit (alter Link wird ungültig)
create or replace function public.invitation_renew(p_id uuid, p_token_hash text, p_valid_hours int default 72)
returns table (email text, first_name text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_permission('employees.invite');
  if p_valid_hours < 1 or p_valid_hours > 336 then
    raise exception 'Gültigkeit muss zwischen 1 Stunde und 14 Tagen liegen.';
  end if;
  return query
    update public.invitations i set token_hash = p_token_hash, expires_at = now() + make_interval(hours => p_valid_hours)
     where i.id = p_id and i.accepted_at is null and i.revoked_at is null
    returning i.email, i.first_name;
  if not found then raise exception 'Einladung nicht gefunden oder bereits verwendet'; end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Provisionen: Stufen × Produkte
-- -----------------------------------------------------------------------------
create table public.commission_levels (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  description text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index commission_levels_name_idx on public.commission_levels (lower(name));

create table public.commission_rates (
  level_id uuid not null references public.commission_levels (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  amount_cents int not null check (amount_cents between 0 and 10000000),
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  primary key (level_id, product_id)
);

-- Abrechnungsdaten je Mitarbeiter (getrennt, da sensibel: Anschrift, Steuer, Bank)
create table public.employee_billing (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  commission_level_id uuid references public.commission_levels (id) on delete set null,
  street text check (street is null or char_length(street) <= 160),
  postal_code text check (postal_code is null or postal_code ~ '^[0-9A-Za-z -]{3,10}$'),
  city text check (city is null or char_length(city) <= 120),
  tax_number text check (tax_number is null or char_length(tax_number) <= 40),
  vat_id text check (vat_id is null or vat_id ~ '^[A-Z]{2}[0-9A-Za-z]{2,13}$'),
  vat_liable boolean not null default false,        -- umsatzsteuerpflichtig (sonst Kleinunternehmer § 19 UStG)
  iban text check (iban is null or iban ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$'),
  updated_at timestamptz not null default now()
);

create trigger employee_billing_touch before update on public.employee_billing
  for each row execute function private.touch_updated_at();
create trigger commission_levels_audit after insert or update or delete on public.commission_levels
  for each row execute function private.audit_trigger();
create trigger commission_rates_audit after insert or update or delete on public.commission_rates
  for each row execute function private.audit_trigger();
create trigger employee_billing_audit after insert or update or delete on public.employee_billing
  for each row execute function private.audit_trigger('user_id');

create or replace function private.own_commission_level(p_user uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select commission_level_id from public.employee_billing where user_id = p_user;
$$;

alter table public.commission_levels enable row level security;
alter table public.commission_rates enable row level security;
alter table public.employee_billing enable row level security;

create policy commission_levels_select on public.commission_levels for select to authenticated
  using (
    private.has_permission((select auth.uid()), 'commissions.manage')
    or private.has_permission((select auth.uid()), 'statements.manage')
    or (private.is_active_user((select auth.uid())) and id = private.own_commission_level((select auth.uid())))
  );
create policy commission_rates_select on public.commission_rates for select to authenticated
  using (
    private.has_permission((select auth.uid()), 'commissions.manage')
    or private.has_permission((select auth.uid()), 'statements.manage')
    or (private.is_active_user((select auth.uid())) and level_id = private.own_commission_level((select auth.uid())))
  );
create policy employee_billing_select on public.employee_billing for select to authenticated
  using (
    (user_id = (select auth.uid()) and private.is_active_user((select auth.uid())))
    or private.has_permission((select auth.uid()), 'statements.manage')
    or private.has_permission((select auth.uid()), 'commissions.manage')
  );

create or replace function public.commission_level_upsert(p_id uuid, p_name text, p_description text, p_sort_order int, p_is_active boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform private.require_permission('commissions.manage');
  if p_id is null then
    insert into public.commission_levels (name, description, sort_order, is_active)
    values (trim(p_name), nullif(trim(p_description), ''), coalesce(p_sort_order, 0), coalesce(p_is_active, true))
    returning id into v_id;
  else
    update public.commission_levels
       set name = trim(p_name), description = nullif(trim(p_description), ''), sort_order = coalesce(p_sort_order, 0),
           is_active = coalesce(p_is_active, true)
     where id = p_id returning id into v_id;
    if v_id is null then raise exception 'Stufe nicht gefunden'; end if;
  end if;
  return v_id;
end;
$$;

-- p_rates: [{"level_id": "...", "product_id": "...", "amount_cents": 1500}, ...] – null/leer = Satz entfernen
create or replace function public.commission_rates_save(p_rates jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e jsonb;
begin
  perform private.require_permission('commissions.manage');
  for e in select * from jsonb_array_elements(coalesce(p_rates, '[]')) loop
    if e ->> 'amount_cents' is null then
      delete from public.commission_rates where level_id = (e ->> 'level_id')::uuid and product_id = (e ->> 'product_id')::uuid;
    else
      insert into public.commission_rates (level_id, product_id, amount_cents, updated_by, updated_at)
      values ((e ->> 'level_id')::uuid, (e ->> 'product_id')::uuid, (e ->> 'amount_cents')::int, auth.uid(), now())
      on conflict (level_id, product_id) do update
        set amount_cents = excluded.amount_cents, updated_by = excluded.updated_by, updated_at = now()
        where public.commission_rates.amount_cents is distinct from excluded.amount_cents;
    end if;
  end loop;
end;
$$;

create or replace function public.employee_set_commission_level(p_user uuid, p_level uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_permission('commissions.manage');
  insert into public.employee_billing (user_id, commission_level_id) values (p_user, p_level)
  on conflict (user_id) do update set commission_level_id = excluded.commission_level_id;
end;
$$;

-- Abrechnungsdaten: selbst oder durch Abrechnungsverwaltung
create or replace function public.employee_billing_save(
  p_user uuid, p_street text, p_postal_code text, p_city text, p_tax_number text, p_vat_id text,
  p_vat_liable boolean, p_iban text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not ((p_user = auth.uid() and private.is_active_user(auth.uid()))
          or private.has_permission(auth.uid(), 'statements.manage')) then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  insert into public.employee_billing (user_id, street, postal_code, city, tax_number, vat_id, vat_liable, iban)
  values (p_user, nullif(trim(p_street), ''), nullif(trim(p_postal_code), ''), nullif(trim(p_city), ''),
          nullif(trim(p_tax_number), ''), nullif(upper(replace(p_vat_id, ' ', '')), ''), coalesce(p_vat_liable, false),
          nullif(upper(replace(p_iban, ' ', '')), ''))
  on conflict (user_id) do update
    set street = excluded.street, postal_code = excluded.postal_code, city = excluded.city,
        tax_number = excluded.tax_number, vat_id = excluded.vat_id, vat_liable = excluded.vat_liable, iban = excluded.iban;
end;
$$;

-- -----------------------------------------------------------------------------
-- Abrechnungen & Gutschriften
-- -----------------------------------------------------------------------------
create type public.statement_kind as enum ('abrechnung', 'gutschrift');
create type public.statement_status as enum ('entwurf', 'veroeffentlicht', 'storniert');

create table private.statement_counters (
  kind public.statement_kind not null,
  year int not null,
  last_number int not null default 0,
  primary key (kind, year)
);

create table public.statements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete restrict,
  kind public.statement_kind not null,
  number text unique,
  title text not null check (char_length(title) between 2 and 200),
  period_from date,
  period_to date,
  issue_date date not null default (now() at time zone 'Europe/Berlin')::date,
  net_cents bigint not null default 0,
  vat_rate numeric(4, 2) not null default 0,
  vat_cents bigint not null default 0,
  gross_cents bigint not null default 0,
  note text check (note is null or char_length(note) <= 2000),
  recipient jsonb,                              -- Anschrift/Steuerdaten zum Ausstellungszeitpunkt
  storage_path text unique,
  file_name text,
  is_upload boolean not null default false,     -- hochgeladenes Dokument statt erzeugt
  status public.statement_status not null default 'entwurf',
  status_reason text,
  created_by uuid references public.profiles (id),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  check (period_to is null or period_from is null or period_to >= period_from)
);
create index statements_user_idx on public.statements (user_id, issue_date desc);

create table public.statement_items (
  id uuid primary key default gen_random_uuid(),
  statement_id uuid not null references public.statements (id) on delete cascade,
  position int not null,
  description text not null check (char_length(description) between 1 and 300),
  product_id uuid references public.products (id) on delete set null,
  quantity numeric(12, 2) not null default 1,
  unit_cents bigint not null,
  total_cents bigint not null
);
create index statement_items_statement_idx on public.statement_items (statement_id, position);

create trigger statements_audit after insert or update or delete on public.statements
  for each row execute function private.audit_trigger('user_id');

alter table public.statements enable row level security;
alter table public.statement_items enable row level security;

create policy statements_select on public.statements for select to authenticated
  using (
    private.has_permission((select auth.uid()), 'statements.manage')
    or (user_id = (select auth.uid()) and status <> 'entwurf'
        and private.has_permission((select auth.uid()), 'statements.read.self'))
  );
create policy statement_items_select on public.statement_items for select to authenticated
  using (exists (select 1 from public.statements s where s.id = statement_id));

-- Vorschau einer Provisionsabrechnung: bestätigte Leistungen × Provisionssatz der Stufe
create or replace function public.statement_preview(p_user uuid, p_from date, p_to date)
returns table (product_id uuid, product_name text, unit_label text, quantity bigint, unit_cents int, total_cents bigint, has_rate boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_level uuid;
begin
  perform private.require_permission('statements.manage');
  select commission_level_id into v_level from public.employee_billing where user_id = p_user;
  return query
    select pr.id, pr.name, pr.unit_label, sum(r.quantity)::bigint,
           coalesce(cr.amount_cents, 0), (sum(r.quantity) * coalesce(cr.amount_cents, 0))::bigint, cr.amount_cents is not null
    from public.performance_records r
    join public.products pr on pr.id = r.product_id
    left join public.commission_rates cr on cr.product_id = pr.id and cr.level_id = v_level
    where r.user_id = p_user and r.status = 'bestaetigt' and r.occurred_on between p_from and p_to
    group by pr.id, pr.name, pr.unit_label, cr.amount_cents, pr.sort_order
    order by pr.sort_order, pr.name;
end;
$$;

-- Abrechnung/Gutschrift anlegen (Entwurf). Positionen werden serverseitig summiert.
-- p_items: [{"description": "...", "product_id": null, "quantity": 2, "unit_cents": 1500}]
create or replace function public.statement_create(
  p_user uuid, p_kind public.statement_kind, p_title text, p_from date, p_to date, p_items jsonb, p_note text,
  p_issuer_vat_rate numeric default 19)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_billing public.employee_billing;
  v_profile public.profiles;
  v_net bigint := 0;
  v_rate numeric := 0;
  e jsonb;
  i int := 0;
  v_total bigint;
begin
  perform private.require_permission('statements.manage');
  select * into v_profile from public.profiles where id = p_user;
  if v_profile.id is null then raise exception 'Mitarbeiter nicht gefunden'; end if;
  if jsonb_array_length(coalesce(p_items, '[]')) = 0 then raise exception 'Bitte mindestens eine Position angeben.'; end if;
  if p_kind = 'abrechnung' and (p_from is null or p_to is null) then raise exception 'Bitte einen Abrechnungszeitraum angeben.'; end if;
  if p_kind = 'abrechnung' and exists (
    select 1 from public.statements s
    where s.user_id = p_user and s.kind = 'abrechnung' and s.status = 'veroeffentlicht' and not s.is_upload
      and s.period_from <= p_to and s.period_to >= p_from) then
    raise exception 'DOPPELTE_ABRECHNUNG: Für diesen Zeitraum existiert bereits eine veröffentlichte Abrechnung. Bitte zuerst stornieren oder eine Gutschrift erstellen.';
  end if;
  select * into v_billing from public.employee_billing where user_id = p_user;
  if coalesce(v_billing.vat_liable, false) then v_rate := coalesce(p_issuer_vat_rate, 19); end if;

  insert into public.statements (user_id, kind, title, period_from, period_to, note, created_by, recipient, vat_rate)
  values (p_user, p_kind, trim(p_title), p_from, p_to, nullif(trim(p_note), ''), auth.uid(),
          jsonb_build_object('name', v_profile.first_name || ' ' || v_profile.last_name, 'employee_number', v_profile.employee_number,
                             'street', v_billing.street, 'postal_code', v_billing.postal_code, 'city', v_billing.city,
                             'tax_number', v_billing.tax_number, 'vat_id', v_billing.vat_id, 'vat_liable', coalesce(v_billing.vat_liable, false),
                             'iban', v_billing.iban),
          v_rate)
  returning id into v_id;

  for e in select * from jsonb_array_elements(p_items) loop
    i := i + 1;
    if coalesce(trim(e ->> 'description'), '') = '' then raise exception 'Position % ohne Beschreibung', i; end if;
    v_total := round(coalesce((e ->> 'quantity')::numeric, 1) * (e ->> 'unit_cents')::bigint);
    insert into public.statement_items (statement_id, position, description, product_id, quantity, unit_cents, total_cents)
    values (v_id, i, trim(e ->> 'description'), (e ->> 'product_id')::uuid, coalesce((e ->> 'quantity')::numeric, 1), (e ->> 'unit_cents')::bigint, v_total);
    v_net := v_net + v_total;
  end loop;

  update public.statements
     set net_cents = v_net, vat_cents = round(v_net * v_rate / 100), gross_cents = v_net + round(v_net * v_rate / 100)
   where id = v_id;
  return v_id;
end;
$$;

-- Hochgeladenes Dokument registrieren (Datei liegt bereits im Bucket "statements")
create or replace function public.statement_register_upload(
  p_user uuid, p_kind public.statement_kind, p_title text, p_from date, p_to date, p_gross_cents bigint,
  p_storage_path text, p_file_name text, p_note text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform private.require_permission('statements.manage');
  if not exists (select 1 from storage.objects where bucket_id = 'statements' and name = p_storage_path) then
    raise exception 'Datei wurde nicht gefunden. Bitte erneut hochladen.';
  end if;
  insert into public.statements (user_id, kind, title, period_from, period_to, gross_cents, net_cents, note,
                                 storage_path, file_name, is_upload, created_by)
  values (p_user, p_kind, trim(p_title), p_from, p_to, coalesce(p_gross_cents, 0), coalesce(p_gross_cents, 0),
          nullif(trim(p_note), ''), p_storage_path, p_file_name, true, auth.uid())
  returning id into v_id;
  perform public.statement_publish(v_id, null, null);
  return v_id;
end;
$$;

-- Veröffentlichen: vergibt die fortlaufende Nummer, hinterlegt die PDF-Datei, benachrichtigt
create or replace function public.statement_publish(p_id uuid, p_storage_path text, p_file_name text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.statements;
  v_year int := extract(year from (now() at time zone 'Europe/Berlin'))::int;
  v_no int;
  v_number text;
begin
  perform private.require_permission('statements.manage');
  select * into s from public.statements where id = p_id for update;
  if s.id is null then raise exception 'Dokument nicht gefunden'; end if;
  if s.status <> 'entwurf' then raise exception 'Nur Entwürfe können veröffentlicht werden.'; end if;
  insert into private.statement_counters (kind, year, last_number) values (s.kind, v_year, 1)
  on conflict (kind, year) do update set last_number = private.statement_counters.last_number + 1
  returning last_number into v_no;
  v_number := (case s.kind when 'abrechnung' then 'A' else 'G' end) || '-' || v_year || '-' || lpad(v_no::text, 4, '0');
  update public.statements
     set number = v_number, status = 'veroeffentlicht', published_at = now(),
         storage_path = coalesce(p_storage_path, storage_path), file_name = coalesce(p_file_name, file_name)
   where id = p_id;
  perform private.notify(s.user_id, 'abrechnung_neu',
    case s.kind when 'abrechnung' then 'Neue Abrechnung verfügbar' else 'Neue Gutschrift verfügbar' end,
    s.title, '/abrechnungen');
  return v_number;
end;
$$;

-- Nummer vorab reservieren ist nicht nötig: das PDF wird nach dem Veröffentlichen erzeugt
create or replace function public.statement_set_file(p_id uuid, p_storage_path text, p_file_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_permission('statements.manage');
  update public.statements set storage_path = p_storage_path, file_name = p_file_name where id = p_id;
  if not found then raise exception 'Dokument nicht gefunden'; end if;
end;
$$;

create or replace function public.statement_cancel(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_permission('statements.manage');
  if nullif(trim(p_reason), '') is null then raise exception 'Bitte eine Begründung angeben.'; end if;
  update public.statements set status = 'storniert', status_reason = trim(p_reason)
   where id = p_id and status = 'veroeffentlicht';
  if not found then raise exception 'Nur veröffentlichte Dokumente können storniert werden.'; end if;
end;
$$;

create or replace function public.statement_delete_draft(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_path text;
begin
  perform private.require_permission('statements.manage');
  delete from public.statements where id = p_id and status = 'entwurf' returning storage_path into v_path;
  if not found then raise exception 'Nur Entwürfe können gelöscht werden.'; end if;
  return v_path;
end;
$$;

-- Privater Bucket für Abrechnungen
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('statements', 'statements', false, 20971520, array['application/pdf'])
on conflict (id) do nothing;

create policy storage_statements_select on storage.objects for select to authenticated
  using (bucket_id = 'statements' and (
    private.has_permission((select auth.uid()), 'statements.manage')
    or exists (select 1 from public.statements s
               where s.storage_path = name and s.user_id = (select auth.uid()) and s.status <> 'entwurf'
                 and private.has_permission((select auth.uid()), 'statements.read.self'))));
create policy storage_statements_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'statements' and private.has_permission((select auth.uid()), 'statements.manage'));
create policy storage_statements_update on storage.objects for update to authenticated
  using (bucket_id = 'statements' and private.has_permission((select auth.uid()), 'statements.manage'))
  with check (bucket_id = 'statements' and private.has_permission((select auth.uid()), 'statements.manage'));
create policy storage_statements_delete on storage.objects for delete to authenticated
  using (bucket_id = 'statements' and private.has_permission((select auth.uid()), 'statements.manage'));

-- Rechte wie in den übrigen Migrationen
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
grant execute on all functions in schema private to authenticated, service_role;
revoke execute on all functions in schema private from public, anon;

insert into private.schema_migrations (name) values ('20261026000700_commissions_statements.sql') on conflict do nothing;


-- ----- 20261029000800_booking_overhead.sql -----
-- =============================================================================
-- ERLEN CRM – Terminbuchung, Provisionen je Stufe (Vertriebspartner/Ausbilder/
-- Teamleiter/Agentur) mit Overhead, Zusatzpositionen, Nummernkreise, Umsatz
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Feste Provisionsstufen
-- -----------------------------------------------------------------------------
alter table public.commission_levels add column key text unique
  check (key is null or key in ('vertriebspartner', 'ausbilder', 'teamleiter', 'agentur'));

-- Gleichnamige bestehende Stufen übernehmen, fehlende anlegen
update public.commission_levels l set key = v.key, sort_order = v.ord, is_active = true
from (values ('vertriebspartner', 'Vertriebspartner', 1), ('ausbilder', 'Ausbilder', 2),
             ('teamleiter', 'Teamleiter', 3), ('agentur', 'Agentur', 4)) v(key, name, ord)
where lower(l.name) = lower(v.name) and l.key is null;
insert into public.commission_levels (key, name, sort_order)
select v.key, v.name, v.ord
from (values ('vertriebspartner', 'Vertriebspartner', 1), ('ausbilder', 'Ausbilder', 2),
             ('teamleiter', 'Teamleiter', 3), ('agentur', 'Agentur', 4)) v(key, name, ord)
where not exists (select 1 from public.commission_levels l where l.key = v.key);
-- Frei angelegte Stufen aus der Vorversion werden nicht mehr verwendet (bleiben zur Historie erhalten)
update public.commission_levels set is_active = false where key is null;
-- Zuordnungen zu alten Stufen lösen: es gilt dann die Stufe der Rolle
update public.employee_billing b set commission_level_id = null
where commission_level_id in (select id from public.commission_levels where key is null);

-- Rangfolge der Stufen
create or replace function private.level_rank(p_key text)
returns int
language sql
immutable
set search_path = ''
as $$
  select case p_key when 'vertriebspartner' then 1 when 'ausbilder' then 2 when 'teamleiter' then 3 when 'agentur' then 4 end;
$$;

-- Stufe eines Mitarbeiters: individuelle Zuordnung, sonst aus der Rolle
create or replace function private.level_key_of(p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select l.key from public.employee_billing b join public.commission_levels l on l.id = b.commission_level_id
      where b.user_id = p_user and l.key is not null),
    (select case r.key when 'vertriebspartner' then 'vertriebspartner' when 'ausbilder' then 'ausbilder'
                       when 'teamleiter' then 'teamleiter' when 'agenturleiter' then 'agentur' end
       from public.profiles p join public.roles r on r.id = p.role_id where p.id = p_user));
$$;

create or replace function private.rate_cents(p_level_key text, p_product uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select cr.amount_cents from public.commission_rates cr
  join public.commission_levels l on l.id = cr.level_id
  where l.key = p_level_key and cr.product_id = p_product;
$$;

-- Sichtbarkeit: Mitarbeiter sehen die Sätze ihrer eigenen Stufe (auch ohne individuelle Zuordnung)
create or replace function private.own_commission_level(p_user uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.commission_levels where key = private.level_key_of(p_user);
$$;

-- Einzelnen Provisionssatz setzen/entfernen (Zeile „Produkt | Stufe | Provision“)
create or replace function public.commission_rate_set(p_product uuid, p_level_key text, p_amount_cents int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_level uuid;
begin
  perform private.require_permission('commissions.manage');
  select id into v_level from public.commission_levels where key = p_level_key;
  if v_level is null then raise exception 'Unbekannte Stufe'; end if;
  if not exists (select 1 from public.products where id = p_product) then raise exception 'Produkt nicht gefunden'; end if;
  if p_amount_cents is null then
    delete from public.commission_rates where level_id = v_level and product_id = p_product;
  else
    insert into public.commission_rates (level_id, product_id, amount_cents, updated_by, updated_at)
    values (v_level, p_product, p_amount_cents, auth.uid(), now())
    on conflict (level_id, product_id) do update
      set amount_cents = excluded.amount_cents, updated_by = excluded.updated_by, updated_at = now();
  end if;
end;
$$;

create or replace function public.commission_settings_save(p_overhead_mode text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_permission('commissions.manage');
  if p_overhead_mode not in ('differenz', 'fest') then raise exception 'Ungültige Berechnungsart'; end if;
  update public.organization_settings set value = jsonb_build_object('overhead_mode', p_overhead_mode), updated_by = auth.uid(), updated_at = now()
   where key = 'commission';
end;
$$;

insert into public.organization_settings (key, value, description) values
  ('commission', '{"overhead_mode": "differenz"}',
   'Overhead: "differenz" = Satz der eigenen Stufe minus Satz der Stufe darunter; "fest" = Satz der Stufe wird voll gezahlt'),
  ('statement_numbering', '{"gutschrift": {"format": "GS{JAHR}{NR}", "pad": 2}, "abrechnung": {"format": "AB{JAHR}{NR}", "pad": 2}}',
   'Aufbau der Belegnummern ({JAHR}, {NR})'),
  ('booking', '{"enabled": true, "slot_minutes": 30, "min_notice_hours": 12, "horizon_days": 28, "title": "Bewerbungsgespräch", "location": "Telefon oder Video-Call – wir melden uns zur vereinbarten Zeit", "notify_email": "kontakt@erlen-sales.de", "reminder_minutes": 120}',
   'Online-Terminbuchung für Bewerber')
on conflict (key) do nothing;

-- -----------------------------------------------------------------------------
-- Provisionszeilen (Vermittlung + Overhead) für einen Zeitraum
-- -----------------------------------------------------------------------------
-- Kette je bestätigter Leistung: Verkäufer → Ausbilder → Teamleiter des Teams der Leistung
-- (Zuordnung zum Ende des Zeitraums, sonst die aktuelle). Jede höhere Person erhält im Modus „differenz“ den Satz ihrer Stufe abzüglich des
-- höchsten Satzes darunter (nie negativ), im Modus „fest“ den vollen Satz ihrer Stufe.
create or replace function private.commission_lines(p_from date, p_to date)
returns table (beneficiary uuid, kind text, product_id uuid, seller_id uuid, quantity bigint, unit_cents int)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_mode text := coalesce((select value ->> 'overhead_mode' from public.organization_settings where key = 'commission'), 'differenz');
begin
  return query
  with recs as (
    select r.user_id as seller, r.product_id as product, r.quantity::bigint as qty, r.occurred_on, r.team_id
    from public.performance_records r
    where r.status = 'bestaetigt' and r.occurred_on between p_from and p_to
  ),
  chain as (
    select rc.*,
      private.rate_cents(private.level_key_of(rc.seller), rc.product) as seller_rate,
      coalesce(
        (select rr.manager_id from public.reporting_relationships rr
          where rr.employee_id = rc.seller and rr.relation_type = 'ausbilder'
            and rr.started_at::date <= p_to and (rr.ended_at is null or rr.ended_at::date > p_to)
          order by rr.started_at desc limit 1),
        (select rr.manager_id from public.reporting_relationships rr
          where rr.employee_id = rc.seller and rr.relation_type = 'ausbilder' and rr.ended_at is null limit 1)) as trainer,
      coalesce(
        (select tm.user_id from public.team_memberships tm
          where tm.team_id = rc.team_id and tm.member_role = 'teamleiter' and tm.user_id <> rc.seller
            and tm.started_at::date <= p_to and (tm.ended_at is null or tm.ended_at::date > p_to)
          order by tm.started_at desc limit 1),
        (select tm.user_id from public.team_memberships tm
          where tm.team_id = rc.team_id and tm.member_role = 'teamleiter' and tm.user_id <> rc.seller and tm.ended_at is null
          order by tm.started_at desc limit 1)) as leader
    from recs rc
  ),
  rates as (
    select c.*,
      case when c.trainer is not null and c.trainer <> c.seller
           then private.rate_cents(private.level_key_of(c.trainer), c.product) end as trainer_rate,
      case when c.leader is not null then private.rate_cents(private.level_key_of(c.leader), c.product) end as leader_rate
    from chain c
  )
  select x.beneficiary, x.kind, x.product, x.seller, x.qty, x.unit
  from (
    select seller as beneficiary, 'vermittlung'::text as kind, product, seller, qty, seller_rate as unit from rates where seller_rate is not null
    union all
    select trainer, 'overhead_ausbilder', product, seller, qty,
      case when v_mode = 'fest' then trainer_rate else greatest(trainer_rate - coalesce(seller_rate, 0), 0) end
    from rates where trainer_rate is not null and trainer <> seller
    union all
    select leader, 'overhead_teamleiter', product, seller, qty,
      case when v_mode = 'fest' then leader_rate
           else greatest(leader_rate - greatest(coalesce(seller_rate, 0),
                         case when trainer is not null and trainer <> leader then coalesce(trainer_rate, 0) else 0 end), 0) end
    from rates where leader_rate is not null and leader <> coalesce(trainer, '00000000-0000-0000-0000-000000000000'::uuid)
  ) x
  where x.unit > 0;
end;
$$;

-- Vorschau (ersetzt die Vorversion): Vermittlungsprovision + Overhead Ausbilder/Teamleiter
drop function if exists public.statement_preview(uuid, date, date);
create or replace function public.statement_preview(p_user uuid, p_from date, p_to date)
returns table (kind text, product_id uuid, product_name text, unit_label text, quantity bigint, unit_cents int, total_cents bigint, has_rate boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_permission('statements.manage');
  return query
    select l.kind, pr.id, pr.name, pr.unit_label, sum(l.quantity)::bigint, l.unit_cents,
           (sum(l.quantity) * l.unit_cents)::bigint, true
    from private.commission_lines(p_from, p_to) l
    join public.products pr on pr.id = l.product_id
    where l.beneficiary = p_user
    group by l.kind, pr.id, pr.name, pr.unit_label, l.unit_cents, pr.sort_order
    union all
    -- Eigene Leistungen ohne hinterlegten Satz (Hinweis für die Verwaltung)
    select 'vermittlung', pr.id, pr.name, pr.unit_label, sum(r.quantity)::bigint, 0, 0::bigint, false
    from public.performance_records r join public.products pr on pr.id = r.product_id
    where r.user_id = p_user and r.status = 'bestaetigt' and r.occurred_on between p_from and p_to
      and private.rate_cents(private.level_key_of(p_user), r.product_id) is null
    group by pr.id, pr.name, pr.unit_label, pr.sort_order
    order by 1 desc, 3;
end;
$$;

-- Geldkennzahlen fürs Dashboard: Umsatz (Agentur-Sätze, nur mit Gesamtsicht) und eigene Provision
create or replace function public.get_money_kpis(p_from date, p_to date)
returns table (revenue_cents bigint, own_commission_cents bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not private.is_active_user(v_uid) then raise exception 'Keine Berechtigung' using errcode = '42501'; end if;
  return query select
    case when private.has_permission(v_uid, 'performance.read.all') then
      (select coalesce(sum(r.quantity * coalesce(private.rate_cents('agentur', r.product_id), 0)), 0)::bigint
         from public.performance_records r where r.status = 'bestaetigt' and r.occurred_on between p_from and p_to)
    end,
    (select coalesce(sum(l.quantity * l.unit_cents), 0)::bigint from private.commission_lines(p_from, p_to) l where l.beneficiary = v_uid);
end;
$$;

-- -----------------------------------------------------------------------------
-- Zusatzpositionen je Mitarbeiter (z. B. Fahrzeugrate, Tankkarte, Bonus)
-- -----------------------------------------------------------------------------
create table public.statement_extras (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  description text not null check (char_length(description) between 2 and 200),
  amount_cents bigint not null check (amount_cents between -100000000 and 100000000), -- negativ = Abzug
  recurring boolean not null default true,          -- bei jeder Gutschrift vorausgewählt
  is_active boolean not null default true,
  note text check (note is null or char_length(note) <= 500),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create index statement_extras_user_idx on public.statement_extras (user_id) where is_active;
create trigger statement_extras_audit after insert or update or delete on public.statement_extras
  for each row execute function private.audit_trigger('user_id');
alter table public.statement_extras enable row level security;
create policy statement_extras_select on public.statement_extras for select to authenticated
  using (private.has_permission((select auth.uid()), 'statements.manage'));

create or replace function public.statement_extra_upsert(
  p_id uuid, p_user uuid, p_description text, p_amount_cents bigint, p_recurring boolean, p_is_active boolean, p_note text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform private.require_permission('statements.manage');
  if p_id is null then
    insert into public.statement_extras (user_id, description, amount_cents, recurring, is_active, note, created_by)
    values (p_user, trim(p_description), p_amount_cents, coalesce(p_recurring, true), coalesce(p_is_active, true), nullif(trim(p_note), ''), auth.uid())
    returning id into v_id;
  else
    update public.statement_extras
       set description = trim(p_description), amount_cents = p_amount_cents, recurring = coalesce(p_recurring, true),
           is_active = coalesce(p_is_active, true), note = nullif(trim(p_note), '')
     where id = p_id returning id into v_id;
    if v_id is null then raise exception 'Position nicht gefunden'; end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.statement_extra_delete(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_permission('statements.manage');
  delete from public.statement_extras where id = p_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Nummernkreise: Format und nächste Nummer einstellbar (Fortführung der bisherigen Nummern)
-- -----------------------------------------------------------------------------
create or replace function private.format_statement_number(p_kind public.statement_kind, p_year int, p_no int)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select replace(replace(
    coalesce(s.value -> p_kind::text ->> 'format', case p_kind when 'gutschrift' then 'GS{JAHR}{NR}' else 'AB{JAHR}{NR}' end),
    '{JAHR}', p_year::text),
    '{NR}', lpad(p_no::text, greatest(coalesce((s.value -> p_kind::text ->> 'pad')::int, 1), length(p_no::text)), '0'))
  from (select (select value from public.organization_settings where key = 'statement_numbering') as value) s;
$$;

create or replace function public.statement_numbering_get()
returns table (kind public.statement_kind, format text, pad int, next_number int, example text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_year int := extract(year from (now() at time zone 'Europe/Berlin'))::int;
begin
  perform private.require_permission('statements.manage');
  return query
    select k.kind,
           coalesce((select value -> k.kind::text ->> 'format' from public.organization_settings where key = 'statement_numbering'), ''),
           coalesce((select (value -> k.kind::text ->> 'pad')::int from public.organization_settings where key = 'statement_numbering'), 1),
           coalesce((select c.last_number from private.statement_counters c where c.kind = k.kind and c.year = v_year), 0) + 1,
           private.format_statement_number(k.kind, v_year,
             coalesce((select c.last_number from private.statement_counters c where c.kind = k.kind and c.year = v_year), 0) + 1)
    from (values ('gutschrift'::public.statement_kind), ('abrechnung'::public.statement_kind)) k(kind);
end;
$$;

create or replace function public.statement_numbering_set(p_kind public.statement_kind, p_format text, p_pad int, p_next_number int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_year int := extract(year from (now() at time zone 'Europe/Berlin'))::int;
  v_cfg jsonb;
begin
  perform private.require_permission('statements.manage');
  if p_format is null or position('{NR}' in p_format) = 0 or char_length(p_format) > 40 then
    raise exception 'Das Format muss {NR} enthalten (z. B. GS{JAHR}{NR}).';
  end if;
  if p_next_number < 1 or p_next_number > 999999 then raise exception 'Ungültige nächste Nummer'; end if;
  if exists (select 1 from public.statements
              where kind = p_kind and number = private.format_statement_number(p_kind, v_year, p_next_number)) then
    raise exception 'Diese Nummer wurde bereits vergeben.';
  end if;
  select value into v_cfg from public.organization_settings where key = 'statement_numbering';
  v_cfg := jsonb_set(coalesce(v_cfg, '{}'), array[p_kind::text],
                     jsonb_build_object('format', trim(p_format), 'pad', greatest(least(coalesce(p_pad, 1), 8), 1)));
  update public.organization_settings set value = v_cfg, updated_by = auth.uid(), updated_at = now() where key = 'statement_numbering';
  insert into private.statement_counters (kind, year, last_number) values (p_kind, v_year, p_next_number - 1)
  on conflict (kind, year) do update set last_number = excluded.last_number;
end;
$$;

-- Veröffentlichen mit konfigurierbarem Nummernformat (ersetzt die Vorversion)
create or replace function public.statement_publish(p_id uuid, p_storage_path text, p_file_name text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.statements;
  v_year int := extract(year from (now() at time zone 'Europe/Berlin'))::int;
  v_no int;
  v_number text;
begin
  perform private.require_permission('statements.manage');
  select * into s from public.statements where id = p_id for update;
  if s.id is null then raise exception 'Dokument nicht gefunden'; end if;
  if s.status <> 'entwurf' then raise exception 'Nur Entwürfe können veröffentlicht werden.'; end if;
  loop
    insert into private.statement_counters (kind, year, last_number) values (s.kind, v_year, 1)
    on conflict (kind, year) do update set last_number = private.statement_counters.last_number + 1
    returning last_number into v_no;
    v_number := private.format_statement_number(s.kind, v_year, v_no);
    exit when not exists (select 1 from public.statements where number = v_number);
  end loop;
  update public.statements
     set number = v_number, status = 'veroeffentlicht', published_at = now(),
         storage_path = coalesce(p_storage_path, storage_path), file_name = coalesce(p_file_name, file_name)
   where id = p_id;
  perform private.notify(s.user_id, 'abrechnung_neu',
    case s.kind when 'abrechnung' then 'Neue Abrechnung verfügbar' else 'Neue Gutschrift verfügbar' end,
    s.title, '/abrechnungen');
  return v_number;
end;
$$;

-- Positionen tragen eine Kategorie (für die Gliederung im PDF)
alter table public.statement_items add column category text not null default 'sonstiges'
  check (category in ('vermittlung', 'overhead_ausbilder', 'overhead_teamleiter', 'zusatz', 'sonstiges'));

create or replace function public.statement_create(
  p_user uuid, p_kind public.statement_kind, p_title text, p_from date, p_to date, p_items jsonb, p_note text,
  p_issuer_vat_rate numeric default 19)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_billing public.employee_billing;
  v_profile public.profiles;
  v_net bigint := 0;
  v_rate numeric := 0;
  e jsonb;
  i int := 0;
  v_total bigint;
  v_cat text;
begin
  perform private.require_permission('statements.manage');
  select * into v_profile from public.profiles where id = p_user;
  if v_profile.id is null then raise exception 'Mitarbeiter nicht gefunden'; end if;
  if jsonb_array_length(coalesce(p_items, '[]')) = 0 then raise exception 'Bitte mindestens eine Position angeben.'; end if;
  if p_kind = 'abrechnung' and (p_from is null or p_to is null) then raise exception 'Bitte einen Abrechnungszeitraum angeben.'; end if;
  if p_from is not null and p_to is not null and exists (
    select 1 from public.statements s
    where s.user_id = p_user and s.kind = p_kind and s.status = 'veroeffentlicht' and not s.is_upload
      and s.period_from <= p_to and s.period_to >= p_from
      and exists (select 1 from public.statement_items it where it.statement_id = s.id and it.category in ('vermittlung', 'overhead_ausbilder', 'overhead_teamleiter'))) then
    raise exception 'DOPPELTE_ABRECHNUNG: Für diesen Zeitraum existiert bereits ein veröffentlichter Beleg mit Provisionen. Bitte zuerst stornieren.';
  end if;
  select * into v_billing from public.employee_billing where user_id = p_user;
  if coalesce(v_billing.vat_liable, false) then v_rate := coalesce(p_issuer_vat_rate, 19); end if;

  insert into public.statements (user_id, kind, title, period_from, period_to, note, created_by, recipient, vat_rate)
  values (p_user, p_kind, trim(p_title), p_from, p_to, nullif(trim(p_note), ''), auth.uid(),
          jsonb_build_object('name', v_profile.first_name || ' ' || v_profile.last_name, 'employee_number', v_profile.employee_number,
                             'street', v_billing.street, 'postal_code', v_billing.postal_code, 'city', v_billing.city,
                             'tax_number', v_billing.tax_number, 'vat_id', v_billing.vat_id, 'vat_liable', coalesce(v_billing.vat_liable, false),
                             'iban', v_billing.iban),
          v_rate)
  returning id into v_id;

  for e in select * from jsonb_array_elements(p_items) loop
    i := i + 1;
    if coalesce(trim(e ->> 'description'), '') = '' then raise exception 'Position % ohne Beschreibung', i; end if;
    v_cat := coalesce(e ->> 'category', 'sonstiges');
    if v_cat not in ('vermittlung', 'overhead_ausbilder', 'overhead_teamleiter', 'zusatz', 'sonstiges') then v_cat := 'sonstiges'; end if;
    v_total := round(coalesce((e ->> 'quantity')::numeric, 1) * (e ->> 'unit_cents')::bigint);
    insert into public.statement_items (statement_id, position, description, product_id, quantity, unit_cents, total_cents, category)
    values (v_id, i, trim(e ->> 'description'), (e ->> 'product_id')::uuid, coalesce((e ->> 'quantity')::numeric, 1),
            (e ->> 'unit_cents')::bigint, v_total, v_cat);
    v_net := v_net + v_total;
  end loop;

  update public.statements
     set net_cents = v_net, vat_cents = round(v_net * v_rate / 100), gross_cents = v_net + round(v_net * v_rate / 100)
   where id = v_id;
  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Terminbuchung für Bewerber
-- -----------------------------------------------------------------------------
create extension if not exists btree_gist with schema extensions;

create table public.booking_availability (
  id uuid primary key default gen_random_uuid(),
  weekday int not null check (weekday between 1 and 7),       -- 1 = Montag … 7 = Sonntag
  start_time time not null,
  end_time time not null,
  check (end_time > start_time)
);
insert into public.booking_availability (weekday, start_time, end_time)
select d, '10:00', '18:00' from generate_series(1, 5) d;

create table public.booking_blocks (
  id uuid primary key default gen_random_uuid(),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text check (reason is null or char_length(reason) <= 200),
  created_by uuid references public.profiles (id),
  check (ends_at > starts_at)
);

create type public.booking_status as enum ('gebucht', 'storniert');

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  full_name text not null check (char_length(full_name) between 2 and 160),
  email text not null check (position('@' in email) > 1 and char_length(email) <= 254),
  phone text not null check (phone ~ '^[0-9 +()/-]{5,30}$'),
  message text check (message is null or char_length(message) <= 2000),
  status public.booking_status not null default 'gebucht',
  cancel_token_hash text unique check (cancel_token_hash ~ '^[0-9a-f]{64}$'),
  applicant_id uuid references public.applicants (id) on delete set null,
  cancelled_at timestamptz,
  cancel_reason text,
  reminder_sent_at timestamptz,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  -- Kein Doppeltermin: aktive Buchungen dürfen sich nicht überschneiden
  constraint bookings_no_overlap exclude using gist (tstzrange(starts_at, ends_at) with &&) where (status = 'gebucht')
);
create index bookings_starts_idx on public.bookings (starts_at);

create trigger bookings_audit after insert or update or delete on public.bookings
  for each row execute function private.audit_trigger();
create trigger booking_availability_audit after insert or update or delete on public.booking_availability
  for each row execute function private.audit_trigger();

alter table public.booking_availability enable row level security;
alter table public.booking_blocks enable row level security;
alter table public.bookings enable row level security;
create policy booking_availability_select on public.booking_availability for select to authenticated
  using (private.has_permission((select auth.uid()), 'applicants.read'));
create policy booking_blocks_select on public.booking_blocks for select to authenticated
  using (private.has_permission((select auth.uid()), 'applicants.read'));
create policy bookings_select on public.bookings for select to authenticated
  using (private.has_permission((select auth.uid()), 'applicants.read'));

-- Freie Termine (für die öffentliche Website, Aufruf nur über den Server)
create or replace function public.booking_free_slots(p_days int default null)
returns table (starts_at timestamptz, ends_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  cfg jsonb := (select value from public.organization_settings where key = 'booking');
  v_len interval := make_interval(mins => coalesce((cfg ->> 'slot_minutes')::int, 30));
  v_notice interval := make_interval(hours => coalesce((cfg ->> 'min_notice_hours')::int, 12));
  v_days int := least(coalesce(p_days, (cfg ->> 'horizon_days')::int, 28), 90);
  v_today date := (now() at time zone 'Europe/Berlin')::date;
begin
  if not coalesce((cfg ->> 'enabled')::boolean, true) then return; end if;
  return query
    with days as (select (v_today + g)::date as d from generate_series(0, v_days) g),
    windows as (
      select (d + a.start_time) at time zone 'Europe/Berlin' as w_start, (d + a.end_time) at time zone 'Europe/Berlin' as w_end
      from days join public.booking_availability a on a.weekday = extract(isodow from d)::int
    ),
    slots as (
      select s as s_start, s + v_len as s_end
      from windows, generate_series(w_start, w_end - v_len, v_len) s
    )
    select sl.s_start, sl.s_end from slots sl
    where sl.s_start >= now() + v_notice
      and not exists (select 1 from public.bookings b where b.status = 'gebucht' and tstzrange(b.starts_at, b.ends_at) && tstzrange(sl.s_start, sl.s_end))
      and not exists (select 1 from public.booking_blocks k where tstzrange(k.starts_at, k.ends_at) && tstzrange(sl.s_start, sl.s_end))
    order by sl.s_start;
end;
$$;

-- Buchung anlegen (nur Server/service_role). Der Ausschluss-Constraint verhindert Doppelbuchungen auch bei
-- gleichzeitigen Anfragen.
create or replace function public.booking_create(
  p_starts_at timestamptz, p_full_name text, p_email text, p_phone text, p_message text, p_cancel_token_hash text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_end timestamptz;
  v_applicant uuid;
  v_id uuid;
  v_email text := lower(trim(p_email));
begin
  select s.ends_at into v_end from public.booking_free_slots() s where s.starts_at = p_starts_at;
  if v_end is null then
    raise exception 'TERMIN_VERGEBEN: Dieser Termin ist leider nicht mehr verfügbar. Bitte wähle einen anderen.';
  end if;
  select id into v_applicant from public.applicants
   where lower(email) = v_email and status not in ('abgelehnt') order by created_at desc limit 1;
  if v_applicant is null then
    insert into public.applicants (full_name, email, phone, message, source, consent_at)
    values (trim(p_full_name), v_email, trim(p_phone), nullif(trim(p_message), ''), 'terminbuchung', now())
    returning id into v_applicant;
  end if;
  begin
    insert into public.bookings (starts_at, ends_at, full_name, email, phone, message, cancel_token_hash, applicant_id)
    values (p_starts_at, v_end, trim(p_full_name), v_email, trim(p_phone), nullif(trim(p_message), ''), p_cancel_token_hash, v_applicant)
    returning id into v_id;
  exception when exclusion_violation then
    raise exception 'TERMIN_VERGEBEN: Dieser Termin wurde gerade vergeben. Bitte wähle einen anderen.';
  end;
  -- Interne Benachrichtigung an alle mit Bewerberverwaltung
  perform private.notify(p.id, 'termin_neu', 'Neuer Bewerbungstermin',
    trim(p_full_name) || ' – ' || to_char(p_starts_at at time zone 'Europe/Berlin', 'DD.MM.YYYY HH24:MI') || ' Uhr', '/termine')
  from public.profiles p where p.status = 'aktiv' and private.has_permission(p.id, 'applicants.manage');
  return v_id;
end;
$$;

create or replace function public.booking_cancel_by_token(p_token_hash text)
returns table (id uuid, starts_at timestamptz, full_name text, email text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
    update public.bookings b set status = 'storniert', cancelled_at = now(), cancel_reason = 'Vom Bewerber abgesagt'
     where b.cancel_token_hash = p_token_hash and b.status = 'gebucht' and b.starts_at > now()
    returning b.id, b.starts_at, b.full_name, b.email;
end;
$$;

create or replace function public.booking_lookup_by_token(p_token_hash text)
returns table (id uuid, starts_at timestamptz, ends_at timestamptz, full_name text, status public.booking_status)
language sql
stable
security definer
set search_path = ''
as $$
  select b.id, b.starts_at, b.ends_at, b.full_name, b.status from public.bookings b where b.cancel_token_hash = p_token_hash;
$$;

-- Verwaltung
create or replace function public.booking_cancel(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_permission('applicants.manage');
  update public.bookings set status = 'storniert', cancelled_at = now(), cancel_reason = nullif(trim(p_reason), '')
   where id = p_id and status = 'gebucht';
  if not found then raise exception 'Termin nicht gefunden oder bereits storniert'; end if;
end;
$$;

create or replace function public.booking_availability_save(p_rows jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e jsonb;
begin
  perform private.require_permission('applicants.manage');
  delete from public.booking_availability where true;
  for e in select * from jsonb_array_elements(coalesce(p_rows, '[]')) loop
    insert into public.booking_availability (weekday, start_time, end_time)
    values ((e ->> 'weekday')::int, (e ->> 'start_time')::time, (e ->> 'end_time')::time);
  end loop;
end;
$$;

create or replace function public.booking_block_add(p_starts_at timestamptz, p_ends_at timestamptz, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform private.require_permission('applicants.manage');
  insert into public.booking_blocks (starts_at, ends_at, reason, created_by)
  values (p_starts_at, p_ends_at, nullif(trim(p_reason), ''), auth.uid()) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.booking_block_delete(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_permission('applicants.manage');
  delete from public.booking_blocks where id = p_id;
end;
$$;

create or replace function public.booking_settings_save(p_value jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_permission('applicants.manage');
  update public.organization_settings
     set value = value || (p_value - array(select k from jsonb_object_keys(p_value) k
                                         where k not in ('enabled', 'slot_minutes', 'min_notice_hours', 'horizon_days', 'title', 'location', 'notify_email', 'reminder_minutes'))),
         updated_by = auth.uid(), updated_at = now()
   where key = 'booking';
end;
$$;

-- Erinnerungen: fällige Termine einmalig „beanspruchen“ (nur Server/service_role)
create or replace function public.booking_claim_reminders()
returns table (id uuid, starts_at timestamptz, ends_at timestamptz, full_name text, email text, phone text, cancel_token_hash text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_minutes int := coalesce((select (value ->> 'reminder_minutes')::int from public.organization_settings where key = 'booking'), 120);
begin
  return query
    update public.bookings b set reminder_sent_at = now()
     where b.status = 'gebucht' and b.reminder_sent_at is null
       and b.starts_at > now() and b.starts_at <= now() + make_interval(mins => v_minutes)
       -- Kurzfristige Buchungen (innerhalb des Erinnerungsfensters) erhalten keine zusätzliche Erinnerung
       and b.created_at < b.starts_at - make_interval(mins => v_minutes)
    returning b.id, b.starts_at, b.ends_at, b.full_name, b.email, b.phone, b.cancel_token_hash;
end;
$$;

-- -----------------------------------------------------------------------------
-- Rechte
-- -----------------------------------------------------------------------------
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
grant execute on all functions in schema private to authenticated, service_role;
revoke execute on all functions in schema private from public, anon;

insert into private.schema_migrations (name) values ('20261029000800_booking_overhead.sql') on conflict do nothing;


-- ----- 20261030000900_statement_templates.sql -----
-- =============================================================================
-- ERLEN CRM – Provisionsabrechnung und Gutschrift nach den Vorlagen der Agentur
--   Provisionsabrechnung: Produkte × Anzahl × Satz, Stornos als Minuszeilen, Zwischensumme
--   Gutschrift: Provisionen gem. Abrechnung + Stornoeinbehalt Vormonat + Differenzprovision
--               = Zwischensumme − Stornobehalt (%) − Abzüge (z. B. KFZ) + USt = Gesamtsumme
-- =============================================================================

-- Kundennummer je Mitarbeiter (z. B. VPSS001 = Stufe + Initialen + laufende Nummer)
alter table public.employee_billing add column customer_number text unique
  check (customer_number is null or customer_number ~ '^[A-Z0-9-]{3,20}$');
create sequence private.customer_number_seq;

create or replace function private.level_abbr(p_key text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_key when 'vertriebspartner' then 'VP' when 'ausbilder' then 'AB' when 'teamleiter' then 'TL' when 'agentur' then 'AG' else 'MA' end;
$$;

-- Vergibt eine Kundennummer, falls noch keine existiert
create or replace function private.ensure_customer_number(p_user uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nr text;
  v_initials text;
begin
  select customer_number into v_nr from public.employee_billing where user_id = p_user;
  if v_nr is not null then return v_nr; end if;
  select upper(left(regexp_replace(first_name, '[^A-Za-zÄÖÜäöü]', '', 'g'), 1) || left(regexp_replace(last_name, '[^A-Za-zÄÖÜäöü]', '', 'g'), 1))
    into v_initials from public.profiles where id = p_user;
  v_initials := translate(coalesce(v_initials, 'XX'), 'ÄÖÜ', 'AOU');
  loop
    v_nr := private.level_abbr(private.level_key_of(p_user)) || v_initials || lpad(nextval('private.customer_number_seq')::text, 3, '0');
    exit when not exists (select 1 from public.employee_billing where customer_number = v_nr);
  end loop;
  insert into public.employee_billing (user_id, customer_number) values (p_user, v_nr)
  on conflict (user_id) do update set customer_number = excluded.customer_number;
  return v_nr;
end;
$$;

create or replace function public.employee_set_customer_number(p_user uuid, p_number text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_permission('statements.manage');
  if nullif(trim(p_number), '') is null then
    update public.employee_billing set customer_number = null where user_id = p_user;
    return;
  end if;
  if exists (select 1 from public.employee_billing where customer_number = upper(trim(p_number)) and user_id <> p_user) then
    raise exception 'Diese Kundennummer ist bereits vergeben.';
  end if;
  insert into public.employee_billing (user_id, customer_number) values (p_user, upper(trim(p_number)))
  on conflict (user_id) do update set customer_number = excluded.customer_number;
end;
$$;

-- Nächste laufende Nummer der Kundennummern (zur Fortführung, z. B. 8 nach VPNC007)
create or replace function public.customer_number_next_set(p_next int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_permission('statements.manage');
  if p_next < 1 or p_next > 99999 then raise exception 'Ungültige Nummer'; end if;
  perform setval('private.customer_number_seq', p_next, false);
end;
$$;

create or replace function public.customer_number_next_get()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_last bigint;
  v_called boolean;
begin
  perform private.require_permission('statements.manage');
  select last_value, is_called into v_last, v_called from private.customer_number_seq;
  return case when v_called then v_last + 1 else v_last end;
end;
$$;

-- Positionsarten der Vorlagen
alter table public.statement_items drop constraint if exists statement_items_category_check;
alter table public.statement_items add constraint statement_items_category_check
  check (category in ('vermittlung', 'storno', 'overhead_ausbilder', 'overhead_teamleiter', 'overhead',
                      'abrechnung', 'einbehalt_freigabe', 'zusatz', 'abzug', 'sonstiges'));
alter table public.statement_items add column source_statement_id uuid references public.statements (id) on delete set null;

-- Summenfelder der Gutschrift
alter table public.statements
  add column subtotal_cents bigint not null default 0,          -- Zwischensumme
  add column retention_rate numeric(5, 2) not null default 0,   -- Stornobehalt in %
  add column retention_cents bigint not null default 0,         -- einbehaltener Betrag
  add column deductions_cents bigint not null default 0,        -- Abzüge nach Einbehalt (z. B. KFZ), positiv gespeichert
  add column retention_released_by uuid references public.statements (id) on delete set null, -- Gutschrift, die den Einbehalt auszahlt
  add column settled_by uuid references public.statements (id) on delete set null;            -- Provisionsabrechnung: in Gutschrift übernommen

insert into public.organization_settings (key, value, description) values
  ('statement_defaults', '{"retention_rate": 10}', 'Voreinstellungen für Gutschriften (Stornobehalt in %)')
on conflict (key) do nothing;

create or replace function public.statement_defaults_save(p_retention_rate numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_permission('statements.manage');
  if p_retention_rate < 0 or p_retention_rate > 100 then raise exception 'Ungültiger Prozentsatz'; end if;
  update public.organization_settings set value = jsonb_build_object('retention_rate', p_retention_rate), updated_by = auth.uid(), updated_at = now()
   where key = 'statement_defaults';
end;
$$;

-- -----------------------------------------------------------------------------
-- Vorschau Provisionsabrechnung: eigene Leistungen + Stornos früher abgerechneter Leistungen
-- -----------------------------------------------------------------------------
drop function if exists public.statement_preview(uuid, date, date);
create or replace function public.statement_preview(p_user uuid, p_from date, p_to date)
returns table (kind text, product_id uuid, product_name text, unit_label text, quantity bigint, unit_cents int, total_cents bigint, has_rate boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_permission('statements.manage');
  return query
    select x.kind, x.product_id, x.product_name, x.unit_label, x.quantity, x.unit_cents, x.total_cents, x.has_rate
    from (
      select l.kind, pr.id as product_id, pr.name as product_name, pr.unit_label, sum(l.quantity)::bigint as quantity, l.unit_cents,
             (sum(l.quantity) * l.unit_cents)::bigint as total_cents, true as has_rate, pr.sort_order
      from private.commission_lines(p_from, p_to) l
      join public.products pr on pr.id = l.product_id
      where l.beneficiary = p_user
      group by l.kind, pr.id, pr.name, pr.unit_label, l.unit_cents, pr.sort_order
      union all
      -- Stornos: früher bestätigte (und damit abgerechnete) Leistungen, die im Zeitraum storniert wurden
      select 'storno', pr.id, pr.name, pr.unit_label, -sum(r.quantity)::bigint,
             coalesce(private.rate_cents(private.level_key_of(p_user), pr.id), 0),
             (-sum(r.quantity) * coalesce(private.rate_cents(private.level_key_of(p_user), pr.id), 0))::bigint, true, pr.sort_order
      from public.performance_records r join public.products pr on pr.id = r.product_id
      where r.user_id = p_user and r.status = 'storniert' and r.confirmed_at is not null
        and (r.cancelled_at at time zone 'Europe/Berlin')::date between p_from and p_to and r.occurred_on < p_from
      group by pr.id, pr.name, pr.unit_label, pr.sort_order
      union all
      select 'vermittlung', pr.id, pr.name, pr.unit_label, sum(r.quantity)::bigint, 0, 0::bigint, false, pr.sort_order
      from public.performance_records r join public.products pr on pr.id = r.product_id
      where r.user_id = p_user and r.status = 'bestaetigt' and r.occurred_on between p_from and p_to
        and private.rate_cents(private.level_key_of(p_user), r.product_id) is null
      group by pr.id, pr.name, pr.unit_label, pr.sort_order
    ) x
    order by case x.kind when 'vermittlung' then 1 when 'storno' then 2 when 'overhead_ausbilder' then 3 else 4 end, x.sort_order, x.product_name;
end;
$$;

-- Vorschlag für die Gutschrift: offene Provisionsabrechnungen, offener Einbehalt, Differenzprovision
create or replace function public.gutschrift_suggestion(p_user uuid, p_from date, p_to date)
returns table (line text, source_id uuid, description text, amount_cents bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_permission('statements.manage');
  return query
    select 'abrechnung', s.id,
           'Provisionen gem. Abrechnung' || case when s.period_from is not null then ' (' || to_char(s.period_from, 'DD.MM.') || '–' || to_char(s.period_to, 'DD.MM.YYYY') || ')' else '' end,
           s.net_cents
    from public.statements s
    where s.user_id = p_user and s.kind = 'abrechnung' and s.status = 'veroeffentlicht' and s.settled_by is null
    union all
    select 'einbehalt_freigabe', s.id, 'Stornoeinbehalt Vormonat', s.retention_cents
    from public.statements s
    where s.user_id = p_user and s.kind = 'gutschrift' and s.status = 'veroeffentlicht'
      and s.retention_cents > 0 and s.retention_released_by is null
    union all
    select 'overhead', null, 'Differenzprovision', sum(l.quantity * l.unit_cents)::bigint
    from private.commission_lines(p_from, p_to) l
    where l.beneficiary = p_user and l.kind in ('overhead_ausbilder', 'overhead_teamleiter')
    having sum(l.quantity * l.unit_cents) > 0;
end;
$$;

-- -----------------------------------------------------------------------------
-- Anlegen (ersetzt die Vorversion): Gutschrift mit Stornobehalt und Abzügen
-- -----------------------------------------------------------------------------
drop function if exists public.statement_create(uuid, public.statement_kind, text, date, date, jsonb, text, numeric);
create or replace function public.statement_create(
  p_user uuid, p_kind public.statement_kind, p_title text, p_from date, p_to date, p_items jsonb, p_note text,
  p_retention_rate numeric default 0, p_issuer_vat_rate numeric default 19)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_billing public.employee_billing;
  v_profile public.profiles;
  v_rate numeric := 0;
  v_retention_rate numeric := 0;
  e jsonb;
  i int := 0;
  v_total bigint;
  v_cat text;
  v_subtotal bigint := 0;
  v_deductions bigint := 0;
  v_retention bigint;
  v_net bigint;
  v_customer text;
  v_level text;
  v_source uuid;
begin
  perform private.require_permission('statements.manage');
  select * into v_profile from public.profiles where id = p_user;
  if v_profile.id is null then raise exception 'Mitarbeiter nicht gefunden'; end if;
  if jsonb_array_length(coalesce(p_items, '[]')) = 0 then raise exception 'Bitte mindestens eine Position angeben.'; end if;
  if p_kind = 'abrechnung' and (p_from is null or p_to is null) then raise exception 'Bitte einen Abrechnungszeitraum angeben.'; end if;
  -- Doppelte Abrechnung derselben Leistungen verhindern
  if p_from is not null and p_to is not null and exists (
    select 1 from public.statements s
    where s.user_id = p_user and s.kind = p_kind and s.status = 'veroeffentlicht' and not s.is_upload
      and s.period_from <= p_to and s.period_to >= p_from
      and exists (select 1 from public.statement_items it where it.statement_id = s.id
                  and it.category in ('vermittlung', 'storno', 'overhead_ausbilder', 'overhead_teamleiter', 'overhead'))) then
    raise exception 'DOPPELTE_ABRECHNUNG: Für diesen Zeitraum existiert bereits ein veröffentlichter Beleg mit Provisionen. Bitte zuerst stornieren.';
  end if;

  select * into v_billing from public.employee_billing where user_id = p_user;
  if p_kind = 'gutschrift' then
    if coalesce(v_billing.vat_liable, false) then v_rate := coalesce(p_issuer_vat_rate, 19); end if;
    v_retention_rate := greatest(least(coalesce(p_retention_rate, 0), 100), 0);
  end if;
  v_customer := private.ensure_customer_number(p_user);
  select * into v_billing from public.employee_billing where user_id = p_user;
  v_level := private.level_abbr(private.level_key_of(p_user));

  insert into public.statements (user_id, kind, title, period_from, period_to, note, created_by, recipient, vat_rate, retention_rate)
  values (p_user, p_kind, trim(p_title), p_from, p_to, nullif(trim(p_note), ''), auth.uid(),
          jsonb_build_object('name', v_profile.first_name || ' ' || v_profile.last_name, 'employee_number', v_profile.employee_number,
                             'customer_number', v_customer, 'level', v_level,
                             'street', v_billing.street, 'postal_code', v_billing.postal_code, 'city', v_billing.city,
                             'tax_number', v_billing.tax_number, 'vat_id', v_billing.vat_id, 'vat_liable', coalesce(v_billing.vat_liable, false),
                             'iban', v_billing.iban),
          v_rate, v_retention_rate)
  returning id into v_id;

  for e in select * from jsonb_array_elements(p_items) loop
    i := i + 1;
    if coalesce(trim(e ->> 'description'), '') = '' then raise exception 'Position % ohne Beschreibung', i; end if;
    v_cat := coalesce(e ->> 'category', 'sonstiges');
    if v_cat not in ('vermittlung', 'storno', 'overhead_ausbilder', 'overhead_teamleiter', 'overhead', 'abrechnung',
                     'einbehalt_freigabe', 'zusatz', 'abzug', 'sonstiges') then v_cat := 'sonstiges'; end if;
    v_total := round(coalesce((e ->> 'quantity')::numeric, 1) * (e ->> 'unit_cents')::bigint);
    v_source := nullif(e ->> 'source_id', '')::uuid;
    if v_source is not null and not exists (select 1 from public.statements where id = v_source and user_id = p_user) then
      raise exception 'Ungültiger Bezug in Position %', i;
    end if;
    insert into public.statement_items (statement_id, position, description, product_id, quantity, unit_cents, total_cents, category, source_statement_id)
    values (v_id, i, trim(e ->> 'description'), (e ->> 'product_id')::uuid, coalesce((e ->> 'quantity')::numeric, 1),
            (e ->> 'unit_cents')::bigint, v_total, v_cat, v_source);
    if v_cat = 'abzug' then v_deductions := v_deductions + abs(v_total);
    else v_subtotal := v_subtotal + v_total;
    end if;
  end loop;

  v_retention := round(v_subtotal * v_retention_rate / 100);
  v_net := v_subtotal - v_retention - v_deductions;
  update public.statements
     set subtotal_cents = v_subtotal, retention_cents = v_retention, deductions_cents = v_deductions,
         net_cents = v_net, vat_cents = round(v_net * v_rate / 100), gross_cents = v_net + round(v_net * v_rate / 100)
   where id = v_id;
  return v_id;
end;
$$;

-- Beim Veröffentlichen: übernommene Abrechnungen und ausgezahlte Einbehalte markieren
create or replace function private.statement_mark_links()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'veroeffentlicht' and old.status = 'entwurf' and new.kind = 'gutschrift' then
    update public.statements s set settled_by = new.id
     where s.id in (select it.source_statement_id from public.statement_items it where it.statement_id = new.id and it.category = 'abrechnung')
       and s.settled_by is null;
    update public.statements s set retention_released_by = new.id
     where s.id in (select it.source_statement_id from public.statement_items it where it.statement_id = new.id and it.category = 'einbehalt_freigabe')
       and s.retention_released_by is null;
  elsif new.status = 'storniert' and old.status = 'veroeffentlicht' then
    -- Storno einer Gutschrift gibt die Bezüge wieder frei
    update public.statements set settled_by = null where settled_by = new.id;
    update public.statements set retention_released_by = null where retention_released_by = new.id;
  end if;
  return new;
end;
$$;
create trigger statements_mark_links after update of status on public.statements
  for each row execute function private.statement_mark_links();

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
grant execute on all functions in schema private to authenticated, service_role;
revoke execute on all functions in schema private from public, anon;
grant usage, select on sequence private.customer_number_seq to authenticated, service_role;

insert into private.schema_migrations (name) values ('20261030000900_statement_templates.sql') on conflict do nothing;


-- ----- 20261030001000_fixed_overhead_recruiter.sql -----
-- =============================================================================
-- ERLEN CRM – Feste Overhead-Beträge und „Geworben von“ (Vermittlungsprovision)
--   je bestätigter Einheit: Werber 5 €, Ausbilder 10 €, Teamleiter 30 €, Agentur –
--   Kundennummern beginnen immer mit „VP“
-- =============================================================================

-- Werber (wer den Mitarbeiter in die Agentur gebracht hat)
alter table public.employee_details add column recruited_by uuid references public.profiles (id) on delete set null;
alter table public.employee_details add constraint employee_details_recruiter_not_self check (recruited_by is null or recruited_by <> user_id);
alter table public.invitations add column recruited_by uuid references public.profiles (id) on delete set null;

create or replace function public.employee_set_recruiter(p_user uuid, p_recruiter uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (private.has_permission(auth.uid(), 'teams.manage') or private.has_permission(auth.uid(), 'statements.manage')) then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  if p_user = p_recruiter then raise exception 'Ein Mitarbeiter kann sich nicht selbst geworben haben.'; end if;
  if p_recruiter is not null and not exists (select 1 from public.profiles where id = p_recruiter) then
    raise exception 'Werber nicht gefunden';
  end if;
  insert into public.employee_details (user_id, recruited_by) values (p_user, p_recruiter)
  on conflict (user_id) do update set recruited_by = excluded.recruited_by;
end;
$$;

create or replace function public.invitation_set_recruiter(p_id uuid, p_recruiter uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_permission('employees.invite');
  update public.invitations set recruited_by = p_recruiter
   where id = p_id and accepted_at is null and revoked_at is null;
  if not found then raise exception 'Einladung nicht gefunden oder bereits verwendet'; end if;
end;
$$;

-- Beim Einlösen der Einladung: Produkte freischalten und Werber übernehmen
create or replace function private.invitation_grant_products()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.accepted_user_id is not null and old.accepted_user_id is null then
    insert into public.user_products (user_id, product_id, granted_by)
    select new.accepted_user_id, pr.id, new.invited_by
    from public.products pr where pr.id = any (new.product_ids)
    on conflict do nothing;
    if new.recruited_by is not null and new.recruited_by <> new.accepted_user_id then
      insert into public.employee_details (user_id, recruited_by) values (new.accepted_user_id, new.recruited_by)
      on conflict (user_id) do update set recruited_by = excluded.recruited_by;
    end if;
  end if;
  return new;
end;
$$;

-- Einstellung: Overhead fest, Beträge in Cent je bestätigter Einheit (alle Produkte)
update public.organization_settings
   set value = jsonb_build_object('overhead_mode', 'fest', 'fixed', jsonb_build_object('werbung', 500, 'ausbilder', 1000, 'teamleiter', 3000))
 where key = 'commission';

drop function if exists public.commission_settings_save(text);
create or replace function public.commission_settings_save(p_overhead_mode text, p_werbung_cents int, p_ausbilder_cents int, p_teamleiter_cents int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_permission('commissions.manage');
  if p_overhead_mode not in ('differenz', 'fest') then raise exception 'Ungültige Berechnungsart'; end if;
  if least(coalesce(p_werbung_cents, 0), coalesce(p_ausbilder_cents, 0), coalesce(p_teamleiter_cents, 0)) < 0 then
    raise exception 'Beträge dürfen nicht negativ sein';
  end if;
  update public.organization_settings
     set value = jsonb_build_object('overhead_mode', p_overhead_mode,
                                    'fixed', jsonb_build_object('werbung', coalesce(p_werbung_cents, 0),
                                                                'ausbilder', coalesce(p_ausbilder_cents, 0),
                                                                'teamleiter', coalesce(p_teamleiter_cents, 0))),
         updated_by = auth.uid(), updated_at = now()
   where key = 'commission';
end;
$$;

-- Provisionszeilen: Vermittlung (eigene Leistung), Werbung (Werber), Overhead Ausbilder/Teamleiter
create or replace function private.commission_lines(p_from date, p_to date)
returns table (beneficiary uuid, kind text, product_id uuid, seller_id uuid, quantity bigint, unit_cents int)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cfg jsonb := (select value from public.organization_settings where key = 'commission');
  v_mode text := coalesce(v_cfg ->> 'overhead_mode', 'differenz');
  v_werbung int := coalesce((v_cfg -> 'fixed' ->> 'werbung')::int, 0);
  v_ausbilder int := coalesce((v_cfg -> 'fixed' ->> 'ausbilder')::int, 0);
  v_teamleiter int := coalesce((v_cfg -> 'fixed' ->> 'teamleiter')::int, 0);
begin
  return query
  with recs as (
    select r.user_id as seller, r.product_id as product, r.quantity::bigint as qty, r.occurred_on, r.team_id
    from public.performance_records r
    where r.status = 'bestaetigt' and r.occurred_on between p_from and p_to
  ),
  chain as (
    select rc.*,
      private.rate_cents(private.level_key_of(rc.seller), rc.product) as seller_rate,
      (select d.recruited_by from public.employee_details d where d.user_id = rc.seller) as recruiter,
      coalesce(
        (select rr.manager_id from public.reporting_relationships rr
          where rr.employee_id = rc.seller and rr.relation_type = 'ausbilder'
            and rr.started_at::date <= p_to and (rr.ended_at is null or rr.ended_at::date > p_to)
          order by rr.started_at desc limit 1),
        (select rr.manager_id from public.reporting_relationships rr
          where rr.employee_id = rc.seller and rr.relation_type = 'ausbilder' and rr.ended_at is null limit 1)) as trainer,
      coalesce(
        (select tm.user_id from public.team_memberships tm
          where tm.team_id = rc.team_id and tm.member_role = 'teamleiter' and tm.user_id <> rc.seller
            and tm.started_at::date <= p_to and (tm.ended_at is null or tm.ended_at::date > p_to)
          order by tm.started_at desc limit 1),
        (select tm.user_id from public.team_memberships tm
          where tm.team_id = rc.team_id and tm.member_role = 'teamleiter' and tm.user_id <> rc.seller and tm.ended_at is null
          order by tm.started_at desc limit 1)) as leader
    from recs rc
  ),
  rates as (
    select c.*,
      case when c.trainer is not null and c.trainer <> c.seller
           then private.rate_cents(private.level_key_of(c.trainer), c.product) end as trainer_rate,
      case when c.leader is not null then private.rate_cents(private.level_key_of(c.leader), c.product) end as leader_rate
    from chain c
  )
  select x.beneficiary, x.kind, x.product, x.seller, x.qty, x.unit
  from (
    -- eigene Leistung
    select seller as beneficiary, 'vermittlung'::text as kind, product, seller, qty, seller_rate as unit from rates where seller_rate is not null
    union all
    -- Vermittlungsprovision für den Werber
    select recruiter, 'werbung', product, seller, qty, v_werbung
    from rates where recruiter is not null and recruiter <> seller and v_werbung > 0
    union all
    -- Overhead Ausbilder (ist der Ausbilder zugleich Teamleiter, erhält er nur den Teamleiter-Overhead)
    select trainer, 'overhead_ausbilder', product, seller, qty,
      case when v_mode = 'fest' then v_ausbilder else greatest(trainer_rate - coalesce(seller_rate, 0), 0) end
    from rates
    where trainer is not null and trainer <> seller
      and (v_mode <> 'fest' or trainer is distinct from leader)
      and (v_mode = 'fest' or trainer_rate is not null)
    union all
    -- Overhead Teamleiter
    select leader, 'overhead_teamleiter', product, seller, qty,
      case when v_mode = 'fest' then v_teamleiter
           else greatest(leader_rate - greatest(coalesce(seller_rate, 0),
                         case when trainer is not null and trainer <> leader then coalesce(trainer_rate, 0) else 0 end), 0) end
    from rates
    where leader is not null
      and (v_mode = 'fest' or (leader_rate is not null and leader <> coalesce(trainer, '00000000-0000-0000-0000-000000000000'::uuid)))
  ) x
  where x.unit > 0;
end;
$$;

-- Positionsart „Vermittlungsprovision“ (Werbung)
alter table public.statement_items drop constraint if exists statement_items_category_check;
alter table public.statement_items add constraint statement_items_category_check
  check (category in ('vermittlung', 'storno', 'overhead_ausbilder', 'overhead_teamleiter', 'overhead', 'werbung',
                      'abrechnung', 'einbehalt_freigabe', 'zusatz', 'abzug', 'sonstiges'));

create or replace function public.gutschrift_suggestion(p_user uuid, p_from date, p_to date)
returns table (line text, source_id uuid, description text, amount_cents bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_permission('statements.manage');
  return query
    select 'abrechnung', s.id,
           'Provisionen gem. Abrechnung' || case when s.period_from is not null then ' (' || to_char(s.period_from, 'DD.MM.') || '–' || to_char(s.period_to, 'DD.MM.YYYY') || ')' else '' end,
           s.net_cents
    from public.statements s
    where s.user_id = p_user and s.kind = 'abrechnung' and s.status = 'veroeffentlicht' and s.settled_by is null
    union all
    select 'einbehalt_freigabe', s.id, 'Stornoeinbehalt Vormonat', s.retention_cents
    from public.statements s
    where s.user_id = p_user and s.kind = 'gutschrift' and s.status = 'veroeffentlicht'
      and s.retention_cents > 0 and s.retention_released_by is null
    union all
    select 'overhead', null, 'Differenzprovision', sum(l.quantity * l.unit_cents)::bigint
    from private.commission_lines(p_from, p_to) l
    where l.beneficiary = p_user and l.kind in ('overhead_ausbilder', 'overhead_teamleiter')
    having sum(l.quantity * l.unit_cents) > 0
    union all
    select 'werbung', null, 'Vermittlungsprovision', sum(l.quantity * l.unit_cents)::bigint
    from private.commission_lines(p_from, p_to) l
    where l.beneficiary = p_user and l.kind = 'werbung'
    having sum(l.quantity * l.unit_cents) > 0;
end;
$$;

-- statement_create akzeptiert die neue Positionsart „werbung“
create or replace function public.statement_create(
  p_user uuid, p_kind public.statement_kind, p_title text, p_from date, p_to date, p_items jsonb, p_note text,
  p_retention_rate numeric default 0, p_issuer_vat_rate numeric default 19)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_billing public.employee_billing;
  v_profile public.profiles;
  v_rate numeric := 0;
  v_retention_rate numeric := 0;
  e jsonb;
  i int := 0;
  v_total bigint;
  v_cat text;
  v_subtotal bigint := 0;
  v_deductions bigint := 0;
  v_retention bigint;
  v_net bigint;
  v_customer text;
  v_level text;
  v_source uuid;
begin
  perform private.require_permission('statements.manage');
  select * into v_profile from public.profiles where id = p_user;
  if v_profile.id is null then raise exception 'Mitarbeiter nicht gefunden'; end if;
  if jsonb_array_length(coalesce(p_items, '[]')) = 0 then raise exception 'Bitte mindestens eine Position angeben.'; end if;
  if p_kind = 'abrechnung' and (p_from is null or p_to is null) then raise exception 'Bitte einen Abrechnungszeitraum angeben.'; end if;
  -- Doppelte Abrechnung derselben Leistungen verhindern
  if p_from is not null and p_to is not null and exists (
    select 1 from public.statements s
    where s.user_id = p_user and s.kind = p_kind and s.status = 'veroeffentlicht' and not s.is_upload
      and s.period_from <= p_to and s.period_to >= p_from
      and exists (select 1 from public.statement_items it where it.statement_id = s.id
                  and it.category in ('vermittlung', 'storno', 'overhead_ausbilder', 'overhead_teamleiter', 'overhead', 'werbung'))) then
    raise exception 'DOPPELTE_ABRECHNUNG: Für diesen Zeitraum existiert bereits ein veröffentlichter Beleg mit Provisionen. Bitte zuerst stornieren.';
  end if;

  select * into v_billing from public.employee_billing where user_id = p_user;
  if p_kind = 'gutschrift' then
    if coalesce(v_billing.vat_liable, false) then v_rate := coalesce(p_issuer_vat_rate, 19); end if;
    v_retention_rate := greatest(least(coalesce(p_retention_rate, 0), 100), 0);
  end if;
  v_customer := private.ensure_customer_number(p_user);
  select * into v_billing from public.employee_billing where user_id = p_user;
  v_level := private.level_abbr(private.level_key_of(p_user));

  insert into public.statements (user_id, kind, title, period_from, period_to, note, created_by, recipient, vat_rate, retention_rate)
  values (p_user, p_kind, trim(p_title), p_from, p_to, nullif(trim(p_note), ''), auth.uid(),
          jsonb_build_object('name', v_profile.first_name || ' ' || v_profile.last_name, 'employee_number', v_profile.employee_number,
                             'customer_number', v_customer, 'level', v_level,
                             'street', v_billing.street, 'postal_code', v_billing.postal_code, 'city', v_billing.city,
                             'tax_number', v_billing.tax_number, 'vat_id', v_billing.vat_id, 'vat_liable', coalesce(v_billing.vat_liable, false),
                             'iban', v_billing.iban),
          v_rate, v_retention_rate)
  returning id into v_id;

  for e in select * from jsonb_array_elements(p_items) loop
    i := i + 1;
    if coalesce(trim(e ->> 'description'), '') = '' then raise exception 'Position % ohne Beschreibung', i; end if;
    v_cat := coalesce(e ->> 'category', 'sonstiges');
    if v_cat not in ('vermittlung', 'storno', 'overhead_ausbilder', 'overhead_teamleiter', 'overhead', 'werbung', 'abrechnung',
                     'einbehalt_freigabe', 'zusatz', 'abzug', 'sonstiges') then v_cat := 'sonstiges'; end if;
    v_total := round(coalesce((e ->> 'quantity')::numeric, 1) * (e ->> 'unit_cents')::bigint);
    v_source := nullif(e ->> 'source_id', '')::uuid;
    if v_source is not null and not exists (select 1 from public.statements where id = v_source and user_id = p_user) then
      raise exception 'Ungültiger Bezug in Position %', i;
    end if;
    insert into public.statement_items (statement_id, position, description, product_id, quantity, unit_cents, total_cents, category, source_statement_id)
    values (v_id, i, trim(e ->> 'description'), (e ->> 'product_id')::uuid, coalesce((e ->> 'quantity')::numeric, 1),
            (e ->> 'unit_cents')::bigint, v_total, v_cat, v_source);
    if v_cat = 'abzug' then v_deductions := v_deductions + abs(v_total);
    else v_subtotal := v_subtotal + v_total;
    end if;
  end loop;

  v_retention := round(v_subtotal * v_retention_rate / 100);
  v_net := v_subtotal - v_retention - v_deductions;
  update public.statements
     set subtotal_cents = v_subtotal, retention_cents = v_retention, deductions_cents = v_deductions,
         net_cents = v_net, vat_cents = round(v_net * v_rate / 100), gross_cents = v_net + round(v_net * v_rate / 100)
   where id = v_id;
  return v_id;
end;
$$;

-- Kundennummern immer mit „VP“ beginnen
create or replace function private.ensure_customer_number(p_user uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nr text;
  v_initials text;
begin
  select customer_number into v_nr from public.employee_billing where user_id = p_user;
  if v_nr is not null then return v_nr; end if;
  select upper(left(regexp_replace(first_name, '[^A-Za-zÄÖÜäöü]', '', 'g'), 1) || left(regexp_replace(last_name, '[^A-Za-zÄÖÜäöü]', '', 'g'), 1))
    into v_initials from public.profiles where id = p_user;
  v_initials := translate(coalesce(v_initials, 'XX'), 'ÄÖÜ', 'AOU');
  loop
    v_nr := 'VP' || v_initials || lpad(nextval('private.customer_number_seq')::text, 3, '0');
    exit when not exists (select 1 from public.employee_billing where customer_number = v_nr);
  end loop;
  insert into public.employee_billing (user_id, customer_number) values (p_user, v_nr)
  on conflict (user_id) do update set customer_number = excluded.customer_number;
  return v_nr;
end;
$$;

-- Rechte
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
grant execute on all functions in schema private to authenticated, service_role;
revoke execute on all functions in schema private from public, anon;

insert into private.schema_migrations (name) values ('20261030001000_fixed_overhead_recruiter.sql') on conflict do nothing;


-- ----- 20261031001100_push_notifications.sql -----
-- =============================================================================
-- ERLEN CRM – Push-Benachrichtigungen aufs Handy (Web Push)
--   Jede neue Benachrichtigung im Portal wird zusätzlich an die Geräte des
--   Mitarbeiters geschickt, auf denen er Push-Benachrichtigungen aktiviert hat.
-- =============================================================================

-- Geräte (Browser) eines Mitarbeiters
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  user_agent text check (user_agent is null or char_length(user_agent) <= 300),
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
create policy push_subscriptions_select on public.push_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.push_subscribe(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.is_active_user(auth.uid()) then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent;
end;
$$;

create or replace function public.push_unsubscribe(p_endpoint text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
end;
$$;

-- Schlüsselpaar (VAPID) für den Versand – wird beim ersten Gebrauch erzeugt und nur serverseitig gelesen
create table private.app_secrets (
  key text primary key,
  value text not null,
  created_at timestamptz not null default now()
);

create or replace function public.push_vapid_keys(p_public text default null, p_private text default null)
returns table (public_key text, private_key text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_public is not null and p_private is not null then
    insert into private.app_secrets (key, value) values ('vapid_public', p_public), ('vapid_private', p_private)
    on conflict (key) do nothing;
  end if;
  return query
    select (select value from private.app_secrets where key = 'vapid_public'),
           (select value from private.app_secrets where key = 'vapid_private');
end;
$$;

-- Versandstatus je Benachrichtigung; bestehende gelten als bereits zugestellt
alter table public.notifications add column pushed_at timestamptz;
update public.notifications set pushed_at = now() where pushed_at is null;

-- Offene Benachrichtigungen für den Versand „beanspruchen“ (nur Server)
create or replace function public.push_claim_pending()
returns table (notification_id uuid, user_id uuid, title text, body text, link text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
    update public.notifications n set pushed_at = now()
     where n.pushed_at is null and n.created_at > now() - interval '1 day'
    returning n.id, n.user_id, n.title, n.body, n.link;
end;
$$;

create or replace function public.push_subscriptions_for(p_users uuid[])
returns table (id uuid, user_id uuid, endpoint text, p256dh text, auth text)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.user_id, s.endpoint, s.p256dh, s.auth
  from public.push_subscriptions s join public.profiles p on p.id = s.user_id
  where s.user_id = any (p_users) and p.status = 'aktiv';
$$;

create or replace function public.push_subscription_remove(p_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_subscriptions where id = p_id;
$$;

-- Sofortzustellung: Bei neuer Benachrichtigung ruft die Datenbank (pg_net) den Versand-Endpunkt auf.
-- Adresse und Schlüssel werden über „Automatische Erinnerungen & Push aktivieren“ hinterlegt.
create or replace function private.push_hook()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text := (select value from private.app_secrets where key = 'push_hook_url');
  v_secret text := (select value from private.app_secrets where key = 'push_hook_secret');
begin
  if v_url is null or v_secret is null or to_regproc('net.http_post') is null then
    return null;
  end if;
  begin
    execute 'select net.http_post(url := $1, headers := jsonb_build_object(''Authorization'', $2, ''Content-Type'', ''application/json''), body := ''{}''::jsonb, timeout_milliseconds := 20000)'
      using v_url, 'Bearer ' || v_secret;
  exception when others then
    -- Versand darf das Anlegen der Benachrichtigung nie verhindern (Zeitplaner stellt nach)
    null;
  end;
  return null;
end;
$$;
create trigger notifications_push_hook after insert on public.notifications
  for each statement execute function private.push_hook();

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

insert into private.schema_migrations (name) values ('20261031001100_push_notifications.sql') on conflict do nothing;


-- ----- 20261031001200_employee_documents.sql -----
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


-- ----- 20261101001300_onboarding_checklist.sql -----
-- =============================================================================
-- ERLEN CRM – Start-Checkliste für neue Mitarbeiter
--   Profil vervollständigen, Abrechnungsdaten, Pflicht-Unterlagen, Pflichtschulungen,
--   Push-Benachrichtigungen. Welche Unterlagen Pflicht sind, legt die Verwaltung fest.
-- =============================================================================

insert into public.organization_settings (key, value, description) values
  ('onboarding', '{"required_documents": ["gewerbeanmeldung", "personalausweis"]}',
   'Start-Checkliste: Pflicht-Unterlagen neuer Mitarbeiter')
on conflict (key) do nothing;

create or replace function public.onboarding_settings_save(p_required_documents text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_permission('settings.manage');
  if exists (select 1 from unnest(coalesce(p_required_documents, '{}')) d
              where d not in ('gewerbeanmeldung', 'fuehrerschein', 'personalausweis', 'steuer', 'bankdaten', 'vertrag', 'nachweis')) then
    raise exception 'Unbekannte Unterlage';
  end if;
  update public.organization_settings
     set value = jsonb_build_object('required_documents', to_jsonb(coalesce(p_required_documents, '{}'))), updated_by = auth.uid(), updated_at = now()
   where key = 'onboarding';
end;
$$;

-- Stand der Checkliste einer Person (selbst oder mit Verwaltungsrechten)
create or replace function public.onboarding_status(p_user uuid default null)
returns table (key text, label text, done boolean, required boolean, link text, sort int)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := coalesce(p_user, auth.uid());
  v_profile public.profiles;
  v_details public.employee_details;
  v_billing public.employee_billing;
  v_docs text[] := coalesce(
    (select array_agg(x) from jsonb_array_elements_text(
       (select os.value -> 'required_documents' from public.organization_settings os where os.key = 'onboarding')) x),
    '{}');
begin
  if auth.uid() is null or not (
       (v_user = auth.uid() and private.is_active_user(auth.uid()))
       or private.has_permission(auth.uid(), 'employee_docs.manage')
       or private.has_permission(auth.uid(), 'employees.update')) then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  select * into v_profile from public.profiles where id = v_user;
  select * into v_details from public.employee_details where user_id = v_user;
  select * into v_billing from public.employee_billing where user_id = v_user;

  return query
    select 'foto', 'Profilbild hochladen', v_profile.avatar_path is not null, true, '/profil', 1
    union all
    select 'telefon', 'Telefonnummer eintragen', v_details.phone is not null, true, '/profil', 2
    union all
    select 'anschrift', 'Anschrift für Gutschriften eintragen',
           v_billing.street is not null and v_billing.postal_code is not null and v_billing.city is not null, true, '/profil#abrechnungsdaten', 3
    union all
    select 'iban', 'IBAN für Auszahlungen eintragen', v_billing.iban is not null, true, '/profil#abrechnungsdaten', 4
    union all
    select 'steuer', 'Steuernummer oder USt-IdNr. eintragen',
           v_billing.tax_number is not null or v_billing.vat_id is not null, true, '/profil#abrechnungsdaten', 5
    union all
    select 'unterlage_' || d,
           (case d when 'gewerbeanmeldung' then 'Gewerbeanmeldung' when 'fuehrerschein' then 'Führerschein'
                   when 'personalausweis' then 'Personalausweis oder Reisepass' when 'steuer' then 'Steuerunterlagen'
                   when 'bankdaten' then 'Bankdaten' when 'vertrag' then 'Unterschriebenen Vertrag' else 'Nachweis' end) || ' hochladen',
           exists (select 1 from public.employee_documents ed where ed.user_id = v_user and ed.category = d and ed.status <> 'abgelehnt'),
           true, '/unterlagen', 10 + ordinality::int
    from unnest(v_docs) with ordinality d
    union all
    select 'schulungen', 'Pflichtschulungen abschließen',
           not exists (
             select 1 from public.course_assignments ca
             where ca.user_id = v_user and ca.is_mandatory
               and exists (select 1 from public.lessons l join public.course_modules m on m.id = l.module_id
                            where m.course_id = ca.course_id and l.is_published
                              and not exists (select 1 from public.lesson_progress lp
                                               where lp.lesson_id = l.id and lp.user_id = v_user and lp.status = 'abgeschlossen'))),
           true, '/academy', 30
    union all
    select 'push', 'Benachrichtigungen aufs Handy aktivieren (empfohlen)',
           exists (select 1 from public.push_subscriptions s where s.user_id = v_user), false, '/benachrichtigungen', 40
    order by 6;
end;
$$;

-- Rechte
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

insert into private.schema_migrations (name) values ('20261101001300_onboarding_checklist.sql') on conflict do nothing;


-- ----- 20261101001400_statement_manual_number.sql -----
-- =============================================================================
-- ERLEN CRM – Belegnummer selbst festlegen (beim Veröffentlichen) und nachträglich ändern
-- =============================================================================

drop function if exists public.statement_publish(uuid, text, text);
create or replace function public.statement_publish(p_id uuid, p_storage_path text, p_file_name text, p_number text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.statements;
  v_year int := extract(year from (now() at time zone 'Europe/Berlin'))::int;
  v_no int;
  v_number text := upper(nullif(trim(p_number), ''));
begin
  perform private.require_permission('statements.manage');
  select * into s from public.statements where id = p_id for update;
  if s.id is null then raise exception 'Dokument nicht gefunden'; end if;
  if s.status <> 'entwurf' then raise exception 'Nur Entwürfe können veröffentlicht werden.'; end if;
  if v_number is not null then
    -- Selbst gewählte Nummer
    if v_number !~ '^[A-Z0-9][A-Z0-9/_-]{1,39}$' then
      raise exception 'Ungültige Nummer (erlaubt: Buchstaben, Ziffern, - / _; max. 40 Zeichen).';
    end if;
    if exists (select 1 from public.statements where number = v_number) then
      raise exception 'NUMMER_VERGEBEN: Die Nummer % ist bereits vergeben.', v_number;
    end if;
  else
    loop
      insert into private.statement_counters (kind, year, last_number) values (s.kind, v_year, 1)
      on conflict (kind, year) do update set last_number = private.statement_counters.last_number + 1
      returning last_number into v_no;
      v_number := private.format_statement_number(s.kind, v_year, v_no);
      exit when not exists (select 1 from public.statements where number = v_number);
    end loop;
  end if;
  update public.statements
     set number = v_number, status = 'veroeffentlicht', published_at = now(),
         storage_path = coalesce(p_storage_path, storage_path), file_name = coalesce(p_file_name, file_name)
   where id = p_id;
  perform private.notify(s.user_id, 'abrechnung_neu',
    case s.kind when 'abrechnung' then 'Neue Abrechnung verfügbar' else 'Neue Gutschrift verfügbar' end,
    s.title, '/abrechnungen');
  return v_number;
end;
$$;

-- Nummer eines veröffentlichten Belegs ändern (die App erzeugt danach das PDF neu)
create or replace function public.statement_renumber(p_id uuid, p_number text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_number text := upper(nullif(trim(p_number), ''));
begin
  perform private.require_permission('statements.manage');
  if v_number is null or v_number !~ '^[A-Z0-9][A-Z0-9/_-]{1,39}$' then
    raise exception 'Ungültige Nummer (erlaubt: Buchstaben, Ziffern, - / _; max. 40 Zeichen).';
  end if;
  if exists (select 1 from public.statements where number = v_number and id <> p_id) then
    raise exception 'NUMMER_VERGEBEN: Die Nummer % ist bereits vergeben.', v_number;
  end if;
  update public.statements set number = v_number where id = p_id and status <> 'entwurf';
  if not found then raise exception 'Nur veröffentlichte oder stornierte Belege haben eine Nummer.'; end if;
  return v_number;
end;
$$;

-- Rechte
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

insert into private.schema_migrations (name) values ('20261101001400_statement_manual_number.sql') on conflict do nothing;


-- ----- 20261101001500_two_factor.sql -----
-- =============================================================================
-- ERLEN CRM – Zwei-Faktor-Anmeldung (Code aus einer Authenticator-App, TOTP)
--   * Wer einen zweiten Faktor eingerichtet hat, erhält erst nach Eingabe des Codes
--     (Sitzungsstufe „aal2“) Zugriff auf Daten – das prüft die Datenbank selbst.
--   * Die Verwaltung kann die Zwei-Faktor-Anmeldung für Rollen verpflichtend machen.
-- =============================================================================

insert into public.organization_settings (key, value, description) values
  ('security', '{"mfa_required_roles": []}', 'Sicherheit: Rollen mit verpflichtender Zwei-Faktor-Anmeldung')
on conflict (key) do nothing;

-- Ist die Zwei-Faktor-Pflicht für die angemeldete Person erfüllt?
-- Für andere Personen (z. B. Benachrichtigungen an Kollegen) und Server-Vorgänge immer erfüllt.
create or replace function private.mfa_satisfied(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user is distinct from auth.uid()
      or coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or (
        not exists (select 1 from auth.mfa_factors f where f.user_id = p_user and f.status = 'verified')
        and not exists (
          select 1
          from public.profiles p
          join public.roles r on r.id = p.role_id
          join public.organization_settings os on os.key = 'security'
          where p.id = p_user and coalesce(os.value -> 'mfa_required_roles', '[]'::jsonb) ? r.key)
      );
$$;

create or replace function private.has_permission(p_user uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_user
      and p.status = 'aktiv'
      and (
        exists (
          select 1 from public.user_permissions up
          where up.user_id = p.id and up.permission_key = p_permission and up.effect = 'grant'
        )
        or (
          exists (
            select 1 from public.role_permissions rp
            where rp.role_id = p.role_id and rp.permission_key = p_permission
          )
          and not exists (
            select 1 from public.user_permissions up
            where up.user_id = p.id and up.permission_key = p_permission and up.effect = 'deny'
          )
        )
      )
  ) and private.mfa_satisfied(p_user);
$$;

create or replace function private.is_active_user(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = p_user and status = 'aktiv')
     and private.mfa_satisfied(p_user);
$$;

-- Stand der Zwei-Faktor-Anmeldung der angemeldeten Person (für die Weiterleitung im Portal)
create or replace function public.mfa_status()
returns table (has_factor boolean, required boolean, aal text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified'),
    exists (
      select 1
      from public.profiles p
      join public.roles r on r.id = p.role_id
      join public.organization_settings os on os.key = 'security'
      where p.id = auth.uid() and p.status = 'aktiv'
        and coalesce(os.value -> 'mfa_required_roles', '[]'::jsonb) ? r.key),
    coalesce(auth.jwt() ->> 'aal', 'aal1')
  where auth.uid() is not null;
$$;

-- Zwei-Faktor-Stand mehrerer Personen (für Mitarbeiterprofile der Verwaltung)
create or replace function public.mfa_enrolled(p_users uuid[])
returns table (user_id uuid, enrolled boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (private.has_permission(auth.uid(), 'roles.assign') or private.has_permission(auth.uid(), 'settings.manage')) then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  return query
    select u, exists (select 1 from auth.mfa_factors f where f.user_id = u and f.status = 'verified')
    from unnest(p_users) u;
end;
$$;

create or replace function public.security_settings_save(p_mfa_required_roles text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_permission('settings.manage');
  if exists (select 1 from unnest(coalesce(p_mfa_required_roles, '{}')) r
              where r not in (select key from public.roles)) then
    raise exception 'Unbekannte Rolle';
  end if;
  update public.organization_settings
     set value = jsonb_build_object('mfa_required_roles', to_jsonb(coalesce(p_mfa_required_roles, '{}'))), updated_by = auth.uid(), updated_at = now()
   where key = 'security';
end;
$$;

-- Rechte
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

insert into private.schema_migrations (name) values ('20261101001500_two_factor.sql') on conflict do nothing;


-- ----- 20261101001600_competition_live.sql -----
-- =============================================================================
-- ERLEN CRM – Wettbewerbe live: Platzierungen merken und bei Änderungen benachrichtigen
--   * „Du wurdest überholt“ (wer einen Platz unter den ersten 3 verliert)
--   * „Du bist auf Platz 1“
--   * Nach Ende: Ergebnis an die ersten 3
--   Läuft über den Zeitplaner (alle 5 Minuten), nur serverseitig.
-- =============================================================================

alter table public.competitions add column if not exists finished_notified_at timestamptz;

create table if not exists private.competition_standings (
  competition_id uuid not null references public.competitions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  rank int not null,
  total bigint not null,
  updated_at timestamptz not null default now(),
  primary key (competition_id, user_id)
);

-- Rangliste eines Wettbewerbs (gleiche Regeln wie das Ranking: nur bestätigte Leistungen, aktive Personen)
create or replace function private.competition_ranking(p_competition uuid, p_to date)
returns table (user_id uuid, rank int, total bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with c as (select * from public.competitions where id = p_competition),
  totals as (
    select r.user_id, sum(r.quantity)::bigint as total
    from public.performance_records r, c
    where r.status = 'bestaetigt'
      and r.occurred_on between c.starts_on and least(c.ends_on, p_to)
      and (c.product_id is null or r.product_id = c.product_id)
      and (c.team_id is null or r.team_id = c.team_id)
    group by r.user_id
  )
  select t.user_id, (rank() over (order by t.total desc))::int, t.total
  from totals t
  join public.profiles p on p.id = t.user_id and p.status = 'aktiv';
$$;

-- Darf die Person Wettbewerbs-Platzierungen sehen? (Rankings an, Recht und Rolle freigegeben)
create or replace function private.may_see_competition(p_user uuid, p_team uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((private.setting('rankings') ->> 'enabled')::boolean, false)
     and private.has_permission(p_user, 'rankings.read')
     and exists (
       select 1 from public.profiles p join public.roles r on r.id = p.role_id
       where p.id = p_user
         and (private.setting('rankings') -> (case when p_team is null then 'agency_roles' else 'team_roles' end)) ? r.key);
$$;

create or replace function public.competition_watch()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.competitions;
  s record;
  v_today date := private.today_berlin();
  v_first boolean;
  v_sent int := 0;
begin
  if not coalesce((private.setting('rankings') ->> 'enabled')::boolean, false) then
    return 0;
  end if;

  -- Laufende Wettbewerbe
  for c in select * from public.competitions where is_active and v_today between starts_on and ends_on loop
    v_first := not exists (select 1 from private.competition_standings cs where cs.competition_id = c.id);
    for s in
      select n.user_id, n.rank, n.total, o.rank as old_rank
      from private.competition_ranking(c.id, v_today) n
      left join private.competition_standings o on o.competition_id = c.id and o.user_id = n.user_id
    loop
      if not v_first and private.may_see_competition(s.user_id, c.team_id) then
        if s.rank = 1 and coalesce(s.old_rank, 0) <> 1 then
          perform private.notify(s.user_id, 'wettbewerb', 'Du bist auf Platz 1! 🏆', c.title || ' – weiter so!', '/ziele');
          v_sent := v_sent + 1;
        elsif s.old_rank is not null and s.old_rank <= 3 and s.rank > s.old_rank then
          perform private.notify(s.user_id, 'wettbewerb', 'Du wurdest überholt', c.title || ': jetzt Platz ' || s.rank || ' (vorher ' || s.old_rank || ').', '/ziele');
          v_sent := v_sent + 1;
        end if;
      end if;
      insert into private.competition_standings (competition_id, user_id, rank, total, updated_at)
      values (c.id, s.user_id, s.rank, s.total, now())
      on conflict (competition_id, user_id) do update set rank = excluded.rank, total = excluded.total, updated_at = now();
    end loop;
    -- Wer aus der Wertung gefallen ist (z. B. Storno auf 0), verliert den gespeicherten Platz
    delete from private.competition_standings cs
     where cs.competition_id = c.id
       and not exists (select 1 from private.competition_ranking(c.id, v_today) n where n.user_id = cs.user_id);
  end loop;

  -- Beendete Wettbewerbe: Ergebnis an die ersten 3 (einmalig, bis 7 Tage nach Ende)
  for c in select * from public.competitions
            where is_active and ends_on < v_today and ends_on >= v_today - 7 and finished_notified_at is null loop
    for s in select * from private.competition_ranking(c.id, c.ends_on) n where n.rank <= 3 loop
      if private.may_see_competition(s.user_id, c.team_id) then
        perform private.notify(s.user_id, 'wettbewerb',
          case s.rank when 1 then 'Gewonnen! 🏆 ' else 'Platz ' || s.rank || ' 🎉 ' end || c.title,
          'Der Wettbewerb ist beendet. Du hast Platz ' || s.rank || ' mit ' || s.total || ' erreicht.', '/ziele');
        v_sent := v_sent + 1;
      end if;
    end loop;
    update public.competitions set finished_notified_at = now() where id = c.id;
  end loop;
  return v_sent;
end;
$$;

-- Rechte
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
grant execute on all functions in schema private to authenticated, service_role;
revoke execute on all functions in schema private from public, anon;
revoke all on private.competition_standings from public, anon, authenticated;

insert into private.schema_migrations (name) values ('20261101001600_competition_live.sql') on conflict do nothing;


-- ----- 20261101001700_applicant_pipeline.sql -----
-- =============================================================================
-- ERLEN CRM – Bewerber-Pipeline (Kanban): zusätzlicher Schritt „Probetag“
--   und Verschieben einer Bewerbung ohne die Notiz zu verändern.
-- =============================================================================

alter type public.applicant_status add value if not exists 'probetag' after 'gespraech';

create or replace function public.applicant_move(p_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_permission('applicants.manage');
  if p_status not in ('neu', 'kontaktiert', 'gespraech', 'probetag', 'angenommen', 'abgelehnt') then
    raise exception 'Unbekannter Status';
  end if;
  update public.applicants
     set status = p_status::public.applicant_status, handled_by = auth.uid()
   where id = p_id;
  if not found then raise exception 'Bewerbung nicht gefunden'; end if;
end;
$$;

-- Löschkonzept: alle Status inkl. Probetag
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
   where updated_at < now() - make_interval(days => greatest(p_days, 30));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Rechte
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
grant execute on all functions in schema private to authenticated, service_role;
revoke execute on all functions in schema private from public, anon;

insert into private.schema_migrations (name) values ('20261101001700_applicant_pipeline.sql') on conflict do nothing;


-- ----- 20261101001800_document_expiry.sql -----
-- =============================================================================
-- ERLEN CRM – Erinnerung an ablaufende Unterlagen (Feld „gültig bis“)
--   30 Tage vorher und nach Ablauf (Tag nach „gültig bis“): Benachrichtigung an die Person und an die
--   Verwaltung (employee_docs.manage). Jede Erinnerung nur einmal. Nur serverseitig.
-- =============================================================================

alter table public.employee_documents
  add column if not exists expiry_warned_at timestamptz,
  add column if not exists expired_notified_at timestamptz;

create or replace function public.document_expiry_watch()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  d record;
  v_today date := private.today_berlin();
  v_sent int := 0;
  v_label text;
  v_expired boolean;
begin
  for d in
    select ed.*, p.first_name || ' ' || p.last_name as person
    from public.employee_documents ed
    join public.profiles p on p.id = ed.user_id and p.status = 'aktiv'
    where ed.valid_until is not null
      and ed.status <> 'abgelehnt'
      and ((ed.valid_until < v_today and ed.expired_notified_at is null)
           or (ed.valid_until >= v_today and ed.valid_until <= v_today + 30 and ed.expiry_warned_at is null))
      -- Nur die neueste Unterlage je Art: wer schon eine neuere hochgeladen hat, wird nicht erinnert
      and not exists (
        select 1 from public.employee_documents n
        where n.user_id = ed.user_id and n.category = ed.category and n.status <> 'abgelehnt'
          and n.id <> ed.id and coalesce(n.valid_until, 'infinity'::date) > ed.valid_until)
  loop
    v_expired := d.valid_until < v_today;
    v_label := case d.category when 'gewerbeanmeldung' then 'Gewerbeanmeldung' when 'fuehrerschein' then 'Führerschein'
                 when 'personalausweis' then 'Personalausweis' when 'steuer' then 'Steuerunterlagen' when 'bankdaten' then 'Bankdaten'
                 when 'vertrag' then 'Vertrag' when 'nachweis' then 'Nachweis' else 'Unterlage' end
               || coalesce(' (' || d.title || ')', '');
    perform private.notify(d.user_id, 'unterlage_ablauf',
      case when v_expired then v_label || ' ist abgelaufen' else v_label || ' läuft bald ab' end,
      case when v_expired then 'Gültig bis ' || to_char(d.valid_until, 'DD.MM.YYYY') || '. Bitte lade eine aktuelle Version hoch.'
           else 'Gültig bis ' || to_char(d.valid_until, 'DD.MM.YYYY') || '. Bitte rechtzeitig eine neue Version hochladen.' end,
      '/unterlagen');
    perform private.notify(p.id, 'unterlage_ablauf',
      case when v_expired then 'Abgelaufen: ' else 'Läuft bald ab: ' end || v_label || ' – ' || d.person,
      'Gültig bis ' || to_char(d.valid_until, 'DD.MM.YYYY'),
      '/mitarbeiter/' || d.user_id || '#unterlagen')
    from public.profiles p
    where p.status = 'aktiv' and p.id <> d.user_id and private.has_permission(p.id, 'employee_docs.manage');
    if v_expired then
      update public.employee_documents set expired_notified_at = now(), expiry_warned_at = coalesce(expiry_warned_at, now()) where id = d.id;
    else
      update public.employee_documents set expiry_warned_at = now() where id = d.id;
    end if;
    v_sent := v_sent + 1;
  end loop;
  return v_sent;
end;
$$;

-- Rechte
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
grant execute on all functions in schema private to authenticated, service_role;
revoke execute on all functions in schema private from public, anon;

insert into private.schema_migrations (name) values ('20261101001800_document_expiry.sql') on conflict do nothing;


-- ----- 20261101001900_monthly_report.sql -----
-- =============================================================================
-- ERLEN CRM – Monatsbericht für die Agenturleitung (PDF per E-Mail)
--   Daten und Empfänger werden nur serverseitig gelesen; der Versand erfolgt
--   einmal pro Monat über den Zeitplaner. Ein- und ausschaltbar.
-- =============================================================================

insert into public.organization_settings (key, value, description) values
  ('monthly_report', '{"enabled": true, "last_sent_month": null}', 'Monatsbericht per E-Mail an alle mit agenturweiter Berichtsansicht')
on conflict (key) do nothing;

create or replace function public.monthly_report_data(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_prev_from date := (p_from - interval '1 month')::date;
  v_prev_to date := p_from - 1;
begin
  return jsonb_build_object(
    'from', p_from, 'to', p_to, 'prev_from', v_prev_from, 'prev_to', v_prev_to,
    'totals', (
      select jsonb_build_object(
        'confirmed', coalesce(sum(r.quantity) filter (where r.status = 'bestaetigt' and r.occurred_on >= p_from), 0),
        'cancelled', coalesce(sum(r.quantity) filter (where r.status = 'storniert' and r.occurred_on >= p_from), 0),
        'pending', coalesce(sum(r.quantity) filter (where r.status = 'eingereicht' and r.occurred_on >= p_from), 0),
        'prev_confirmed', coalesce(sum(r.quantity) filter (where r.status = 'bestaetigt' and r.occurred_on < p_from), 0),
        'prev_cancelled', coalesce(sum(r.quantity) filter (where r.status = 'storniert' and r.occurred_on < p_from), 0),
        'revenue_cents', coalesce(sum(r.quantity * coalesce(private.rate_cents('agentur', r.product_id), 0)) filter (where r.status = 'bestaetigt' and r.occurred_on >= p_from), 0),
        'prev_revenue_cents', coalesce(sum(r.quantity * coalesce(private.rate_cents('agentur', r.product_id), 0)) filter (where r.status = 'bestaetigt' and r.occurred_on < p_from), 0),
        'sellers', count(distinct r.user_id) filter (where r.status = 'bestaetigt' and r.occurred_on >= p_from),
        'prev_sellers', count(distinct r.user_id) filter (where r.status = 'bestaetigt' and r.occurred_on < p_from))
      from public.performance_records r
      where r.occurred_on between v_prev_from and p_to),
    'active_employees', (select count(*) from public.profiles where status = 'aktiv'),
    'new_employees', (select count(*) from public.employee_details d join public.profiles p on p.id = d.user_id
                       where d.entry_date between p_from and p_to),
    'products', coalesce((
      select jsonb_agg(x order by x.confirmed desc, x.name) from (
        select pr.name, pr.unit_label as unit,
               coalesce(sum(r.quantity) filter (where r.status = 'bestaetigt' and r.occurred_on >= p_from), 0) as confirmed,
               coalesce(sum(r.quantity) filter (where r.status = 'storniert' and r.occurred_on >= p_from), 0) as cancelled,
               coalesce(sum(r.quantity) filter (where r.status = 'bestaetigt' and r.occurred_on < p_from), 0) as prev_confirmed
        from public.products pr
        left join public.performance_records r on r.product_id = pr.id and r.occurred_on between v_prev_from and p_to
        group by pr.id, pr.name, pr.unit_label
        having pr.is_active or coalesce(sum(r.quantity), 0) > 0) x), '[]'::jsonb),
    'teams', coalesce((
      select jsonb_agg(x order by x.confirmed desc) from (
        select coalesce(t.name, 'Ohne Team') as name,
               coalesce(sum(r.quantity) filter (where r.status = 'bestaetigt'), 0) as confirmed,
               coalesce(sum(r.quantity) filter (where r.status = 'storniert'), 0) as cancelled,
               count(distinct r.user_id) filter (where r.status = 'bestaetigt') as sellers
        from public.performance_records r
        left join public.teams t on t.id = r.team_id
        where r.occurred_on between p_from and p_to and r.status in ('bestaetigt', 'storniert')
        group by t.name) x), '[]'::jsonb),
    'top', coalesce((
      select jsonb_agg(x order by x.confirmed desc, x.name) from (
        select p.first_name || ' ' || p.last_name as name, tm.name as team, sum(r.quantity) as confirmed
        from public.performance_records r
        join public.profiles p on p.id = r.user_id
        left join public.teams tm on tm.id = private.current_team_id(p.id)
        where r.status = 'bestaetigt' and r.occurred_on between p_from and p_to
        group by p.id, p.first_name, p.last_name, tm.name
        order by sum(r.quantity) desc
        limit 10) x), '[]'::jsonb),
    'applicants', jsonb_build_object(
      'new', (select count(*) from public.applicants a where (a.created_at at time zone 'Europe/Berlin')::date between p_from and p_to),
      'bookings', (select count(*) from public.bookings b where b.status = 'gebucht' and (b.starts_at at time zone 'Europe/Berlin')::date between p_from and p_to),
      'hired', (select count(*) from public.applicants a where a.status = 'angenommen' and (a.updated_at at time zone 'Europe/Berlin')::date between p_from and p_to))
  );
end;
$$;

-- Empfänger: aktive Personen mit agenturweiter Berichtsansicht
create or replace function public.monthly_report_recipients()
returns table (email text, first_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.email, p.first_name from public.profiles p
  where p.status = 'aktiv' and private.has_permission(p.id, 'reports.read.all') and private.has_permission(p.id, 'performance.read.all')
  order by p.email;
$$;

-- Monat zum Versand beanspruchen (genau einmal, auch bei parallelen Aufrufen)
create or replace function public.monthly_report_claim(p_month text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ok boolean;
begin
  update public.organization_settings
     set value = value || jsonb_build_object('last_sent_month', p_month), updated_at = now()
   where key = 'monthly_report'
     and coalesce((value ->> 'enabled')::boolean, true)
     and (value ->> 'last_sent_month') is distinct from p_month
  returning true into v_ok;
  return coalesce(v_ok, false);
end;
$$;

create or replace function public.monthly_report_settings_save(p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_permission('settings.manage');
  update public.organization_settings
     set value = value || jsonb_build_object('enabled', coalesce(p_enabled, false)), updated_by = auth.uid(), updated_at = now()
   where key = 'monthly_report';
end;
$$;

-- Rechte
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
grant execute on all functions in schema private to authenticated, service_role;
revoke execute on all functions in schema private from public, anon;

insert into private.schema_migrations (name) values ('20261101001900_monthly_report.sql') on conflict do nothing;


-- ----- 20261102002000_avatar_by_admin.sql -----
-- =============================================================================
-- ERLEN CRM – Profilbild durch die Verwaltung setzen
--   Wer Stammdaten bearbeiten darf (employees.update) und die Person sehen darf,
--   kann ihr Profilbild hochladen, ändern oder entfernen.
-- =============================================================================

-- Darf p_viewer Dateien im Avatar-Ordner p_folder ablegen? (eigener Ordner oder Verwaltung)
create or replace function private.can_write_avatar(p_viewer uuid, p_folder text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_active_user(p_viewer) and (
    p_folder = p_viewer::text
    or (p_folder ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and private.has_permission(p_viewer, 'employees.update')
        and private.can_access_user(p_viewer, p_folder::uuid, 'employees')));
$$;

drop policy if exists storage_avatars_insert on storage.objects;
create policy storage_avatars_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and private.can_write_avatar((select auth.uid()), split_part(name, '/', 1)));

create or replace function public.admin_set_avatar(p_user uuid, p_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_permission('employees.update');
  if not private.can_access_user(auth.uid(), p_user, 'employees') then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  if p_path is not null then
    if p_path not like (p_user::text || '/%') then raise exception 'Ungültiger Dateipfad'; end if;
    if not exists (select 1 from storage.objects where bucket_id = 'avatars' and name = p_path) then
      raise exception 'Datei wurde nicht gefunden. Bitte erneut hochladen.';
    end if;
  end if;
  update public.profiles set avatar_path = p_path where id = p_user and anonymized_at is null;
  if not found then raise exception 'Benutzer nicht gefunden'; end if;
end;
$$;

-- Rechte
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
grant execute on all functions in schema private to authenticated, service_role;
revoke execute on all functions in schema private from public, anon;

insert into private.schema_migrations (name) values ('20261102002000_avatar_by_admin.sql') on conflict do nothing;


-- ----- 20261102002100_referral_career.sql -----
-- =============================================================================
-- ERLEN CRM – Empfehlungslink und Karriereleiter
--   * Jede Person bekommt einen persönlichen Empfehlungscode (Link/QR-Code).
--     Bewerbungen über diesen Link werden ihr als „geworben von“ zugeordnet.
--   * Karriereleiter: Kriterien für den nächsten Aufstieg (einstellbar), Fortschritt
--     je Person; die Verwaltung wird informiert, sobald jemand die Kriterien erfüllt.
--     Die Beförderung selbst bleibt eine bewusste Entscheidung (Rolle ändern).
-- =============================================================================

create table if not exists public.referral_codes (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  code text not null unique check (code ~ '^[a-z0-9-]{4,40}$'),
  created_at timestamptz not null default now()
);
alter table public.referral_codes enable row level security;
drop policy if exists referral_codes_select on public.referral_codes;
create policy referral_codes_select on public.referral_codes for select to authenticated
  using (user_id = (select auth.uid()) or private.has_permission((select auth.uid()), 'applicants.read'));

alter table public.applicants add column if not exists referred_by uuid references public.profiles (id) on delete set null;
create index if not exists applicants_referred_by_idx on public.applicants (referred_by);

-- Eigenen Code holen (wird beim ersten Aufruf angelegt, z. B. „leon-3f9a“)
create or replace function public.my_referral_code()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
  v_base text;
begin
  if auth.uid() is null or not private.is_active_user(auth.uid()) then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  select code into v_code from public.referral_codes where user_id = auth.uid();
  if v_code is not null then return v_code; end if;
  select left(nullif(regexp_replace(lower(translate(first_name, 'äöüßÄÖÜéèáàô', 'aousaoueeaao')), '[^a-z]', '', 'g'), ''), 20)
    into v_base from public.profiles where id = auth.uid();
  loop
    v_code := coalesce(v_base, 'erlen') || '-' || substr(md5(gen_random_uuid()::text), 1, 4);
    begin
      insert into public.referral_codes (user_id, code) values (auth.uid(), v_code);
      return v_code;
    exception when unique_violation then
      if exists (select 1 from public.referral_codes where user_id = auth.uid()) then
        return (select code from public.referral_codes where user_id = auth.uid());
      end if;
    end;
  end loop;
end;
$$;

-- Code → Person (nur Server, für Bewerbungen von der Website)
create or replace function public.referral_resolve(p_code text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select rc.user_id from public.referral_codes rc
  join public.profiles p on p.id = rc.user_id and p.status = 'aktiv'
  where rc.code = lower(trim(p_code));
$$;

-- Empfehlungs-Statistik der angemeldeten Person
create or replace function public.my_referral_stats()
returns table (applicants bigint, hired bigint, active_recruits bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select count(*) from public.applicants a where a.referred_by = auth.uid()),
    (select count(*) from public.applicants a where a.referred_by = auth.uid() and a.status = 'angenommen'),
    (select count(*) from public.employee_details d join public.profiles p on p.id = d.user_id
      where d.recruited_by = auth.uid() and p.status = 'aktiv')
  where auth.uid() is not null;
$$;

-- -----------------------------------------------------------------------------
-- Karriereleiter
-- -----------------------------------------------------------------------------
insert into public.organization_settings (key, value, description) values
  ('career', '{"enabled": false, "steps": [
     {"from": "vertriebspartner", "to": "ausbilder", "sales": 40, "recruits": 2, "months": 2},
     {"from": "ausbilder", "to": "teamleiter", "sales": 120, "recruits": 5, "months": 6},
     {"from": "teamleiter", "to": "agenturleiter", "sales": 300, "recruits": 10, "months": 12}
   ]}', 'Karriereleiter: Kriterien für den nächsten Aufstieg (Vorschlagswerte, bitte anpassen)')
on conflict (key) do nothing;

create table if not exists private.career_notified (
  user_id uuid not null references public.profiles (id) on delete cascade,
  target_role text not null,
  notified_at timestamptz not null default now(),
  primary key (user_id, target_role)
);

-- Fortschritt einer Person (selbst oder mit Sichtrecht)
create or replace function public.career_progress(p_user uuid default null)
returns table (enabled boolean, role_now text, next_role text, sales bigint, sales_target int,
               recruits bigint, recruits_target int, months int, months_target int, ready boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := coalesce(p_user, auth.uid());
  v_cfg jsonb := coalesce((select value from public.organization_settings where key = 'career'), '{}'::jsonb);
  v_role text;
  v_step jsonb;
  v_sales bigint;
  v_recruits bigint;
  v_months int;
  v_start date;
begin
  if auth.uid() is null or not (
       (v_user = auth.uid() and private.is_active_user(auth.uid()))
       or private.can_access_user(auth.uid(), v_user, 'employees')) then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  select r.key into v_role from public.profiles p join public.roles r on r.id = p.role_id where p.id = v_user;
  select s into v_step from jsonb_array_elements(coalesce(v_cfg -> 'steps', '[]'::jsonb)) s where s ->> 'from' = v_role limit 1;
  select coalesce(sum(quantity), 0) into v_sales from public.performance_records where user_id = v_user and status = 'bestaetigt';
  select count(*) into v_recruits from public.employee_details d join public.profiles p on p.id = d.user_id
    where d.recruited_by = v_user and p.status = 'aktiv';
  select coalesce(d.sales_start_date, d.entry_date, (p.created_at at time zone 'Europe/Berlin')::date) into v_start
    from public.profiles p left join public.employee_details d on d.user_id = p.id where p.id = v_user;
  v_months := greatest(0, (extract(year from age(private.today_berlin(), v_start)) * 12 + extract(month from age(private.today_berlin(), v_start)))::int);
  return query select
    coalesce((v_cfg ->> 'enabled')::boolean, false),
    v_role,
    v_step ->> 'to',
    v_sales,
    coalesce((v_step ->> 'sales')::int, 0),
    v_recruits,
    coalesce((v_step ->> 'recruits')::int, 0),
    v_months,
    coalesce((v_step ->> 'months')::int, 0),
    v_step is not null
      and v_sales >= coalesce((v_step ->> 'sales')::int, 0)
      and v_recruits >= coalesce((v_step ->> 'recruits')::int, 0)
      and v_months >= coalesce((v_step ->> 'months')::int, 0);
end;
$$;

create or replace function public.career_settings_save(p_enabled boolean, p_steps jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s jsonb;
begin
  perform private.require_permission('settings.manage');
  if jsonb_typeof(p_steps) <> 'array' or jsonb_array_length(p_steps) > 5 then raise exception 'Ungültige Stufen'; end if;
  for s in select * from jsonb_array_elements(p_steps) loop
    if not exists (select 1 from public.roles where key = s ->> 'from') or not exists (select 1 from public.roles where key = s ->> 'to') then
      raise exception 'Unbekannte Rolle';
    end if;
    if coalesce((s ->> 'sales')::int, -1) not between 0 and 100000
       or coalesce((s ->> 'recruits')::int, -1) not between 0 and 1000
       or coalesce((s ->> 'months')::int, -1) not between 0 and 240 then
      raise exception 'Ungültige Kriterien';
    end if;
  end loop;
  update public.organization_settings
     set value = jsonb_build_object('enabled', coalesce(p_enabled, false), 'steps', p_steps), updated_by = auth.uid(), updated_at = now()
   where key = 'career';
end;
$$;

-- Zeitplaner: Verwaltung informieren, wenn jemand die Kriterien erfüllt (je Person und Stufe einmal)
create or replace function public.career_watch()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cfg jsonb := coalesce((select value from public.organization_settings where key = 'career'), '{}'::jsonb);
  s jsonb;
  u record;
  v_sent int := 0;
  v_label text;
begin
  if not coalesce((v_cfg ->> 'enabled')::boolean, false) then return 0; end if;
  for s in select * from jsonb_array_elements(coalesce(v_cfg -> 'steps', '[]'::jsonb)) loop
    v_label := (select name from public.roles where key = s ->> 'to');
    for u in
      select p.id, p.first_name || ' ' || p.last_name as name
      from public.profiles p
      join public.roles r on r.id = p.role_id and r.key = s ->> 'from'
      left join public.employee_details d on d.user_id = p.id
      where p.status = 'aktiv'
        and not exists (select 1 from private.career_notified n where n.user_id = p.id and n.target_role = s ->> 'to')
        and (select coalesce(sum(quantity), 0) from public.performance_records pr where pr.user_id = p.id and pr.status = 'bestaetigt') >= (s ->> 'sales')::int
        and (select count(*) from public.employee_details d2 join public.profiles p2 on p2.id = d2.user_id
              where d2.recruited_by = p.id and p2.status = 'aktiv') >= (s ->> 'recruits')::int
        and coalesce(d.sales_start_date, d.entry_date, (p.created_at at time zone 'Europe/Berlin')::date)
              <= (private.today_berlin() - make_interval(months => (s ->> 'months')::int))::date
    loop
      insert into private.career_notified (user_id, target_role) values (u.id, s ->> 'to');
      perform private.notify(u.id, 'karriere', 'Kriterien für ' || v_label || ' erfüllt! 🚀',
        'Du hast alle Voraussetzungen für den nächsten Schritt erreicht. Die Agenturleitung meldet sich bei dir.', '/karriere');
      perform private.notify(p.id, 'karriere', u.name || ' erfüllt die Kriterien für ' || v_label,
        'Bitte prüfen und ggf. die Rolle im Mitarbeiterprofil ändern.', '/mitarbeiter/' || u.id)
      from public.profiles p
      where p.status = 'aktiv' and p.id <> u.id and private.has_permission(p.id, 'roles.assign');
      v_sent := v_sent + 1;
    end loop;
  end loop;
  return v_sent;
end;
$$;

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
grant execute on all functions in schema private to authenticated, service_role;
revoke execute on all functions in schema private from public, anon;
revoke all on private.career_notified from public, anon, authenticated;

insert into private.schema_migrations (name) values ('20261102002100_referral_career.sql') on conflict do nothing;


-- ----- 20261102002200_sales_trainer.sql -----
-- =============================================================================
-- ERLEN CRM – KI-Verkaufstrainer: Ergebnisse der Übungsgespräche
--   Gespeichert werden nur Szenario, Note und Feedback (kein Gesprächsprotokoll).
--   Sichtbar für die Person selbst und für alle, die ihren Lernfortschritt sehen dürfen.
-- =============================================================================

create table if not exists public.sales_trainings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  scenario text not null check (scenario in ('glasfaser', 'energie', 'pv')),
  difficulty text not null check (difficulty in ('leicht', 'mittel', 'schwer')),
  score int not null check (score between 0 and 100),
  outcome text not null check (outcome in ('abschluss', 'termin', 'offen', 'abgelehnt')),
  turns int not null check (turns between 1 and 100),
  feedback jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists sales_trainings_user_idx on public.sales_trainings (user_id, created_at desc);

alter table public.sales_trainings enable row level security;
drop policy if exists sales_trainings_select on public.sales_trainings;
create policy sales_trainings_select on public.sales_trainings for select to authenticated
  using (
    (user_id = (select auth.uid()) and private.is_active_user((select auth.uid())))
    or user_id in (select private.visible_user_ids((select auth.uid()), 'training.progress'))
  );

create or replace function public.sales_training_save(
  p_scenario text, p_difficulty text, p_score int, p_outcome text, p_turns int, p_feedback jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null or not private.is_active_user(auth.uid()) or not private.has_permission(auth.uid(), 'training.read') then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  if octet_length(p_feedback::text) > 20000 then raise exception 'Feedback zu groß'; end if;
  insert into public.sales_trainings (user_id, scenario, difficulty, score, outcome, turns, feedback)
  values (auth.uid(), p_scenario, p_difficulty, p_score, p_outcome, p_turns, p_feedback)
  returning id into v_id;
  return v_id;
end;
$$;

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
grant execute on all functions in schema private to authenticated, service_role;
revoke execute on all functions in schema private from public, anon;

insert into private.schema_migrations (name) values ('20261102002200_sales_trainer.sql') on conflict do nothing;


-- ----- 20261102002300_gong.sql -----
-- =============================================================================
-- ERLEN CRM – Abschluss-Gong: Sobald eine Leistung bestätigt ist, bekommt das Team
--   (oder die ganze Agentur) eine kurze Mitteilung – auch aufs Handy.
--   * Einstellbar: aus / Team / Agentur
--   * Jeder kann den Gong für sich stumm schalten
--   * Höchstens ein Gong je Verkäufer in 10 Minuten (kein Dauerklingeln)
-- =============================================================================

insert into public.organization_settings (key, value, description) values
  ('gong', '{"scope": "team"}', 'Abschluss-Gong: off | team | agentur')
on conflict (key) do nothing;

create table if not exists public.user_preferences (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  gong_muted boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.user_preferences enable row level security;
drop policy if exists user_preferences_select on public.user_preferences;
create policy user_preferences_select on public.user_preferences for select to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.gong_mute_set(p_muted boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.is_active_user(auth.uid()) then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  insert into public.user_preferences (user_id, gong_muted) values (auth.uid(), coalesce(p_muted, false))
  on conflict (user_id) do update set gong_muted = excluded.gong_muted, updated_at = now();
end;
$$;

create or replace function public.gong_settings_save(p_scope text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_permission('settings.manage');
  if p_scope not in ('off', 'team', 'agentur') then raise exception 'Ungültige Einstellung'; end if;
  update public.organization_settings set value = jsonb_build_object('scope', p_scope), updated_by = auth.uid(), updated_at = now()
   where key = 'gong';
end;
$$;

create table if not exists private.gong_last (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  rung_at timestamptz not null
);

create or replace function private.gong_on_confirm()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_scope text := coalesce((select value ->> 'scope' from public.organization_settings where key = 'gong'), 'team');
  v_name text;
  v_product text;
  v_team uuid;
begin
  if v_scope = 'off' or new.status <> 'bestaetigt' or (tg_op = 'UPDATE' and old.status = 'bestaetigt') then
    return new;
  end if;
  -- Nur aktuelle Abschlüsse (nicht nachgetragene alte Leistungen)
  if new.occurred_on < private.today_berlin() - 1 then return new; end if;
  -- Höchstens ein Gong je Verkäufer in 10 Minuten
  if exists (select 1 from private.gong_last g where g.user_id = new.user_id and g.rung_at > now() - interval '10 minutes') then
    return new;
  end if;
  insert into private.gong_last (user_id, rung_at) values (new.user_id, now())
  on conflict (user_id) do update set rung_at = excluded.rung_at;

  select p.first_name || ' ' || left(p.last_name, 1) || '.' into v_name from public.profiles p where p.id = new.user_id;
  select name into v_product from public.products where id = new.product_id;
  v_team := coalesce(new.team_id, private.current_team_id(new.user_id));

  perform private.notify(p.id, 'gong',
    '🔔 ' || v_name || ' hat abgeschlossen!',
    new.quantity || '× ' || coalesce(v_product, 'Abschluss') || ' – stark!',
    '/ziele')
  from public.profiles p
  left join public.user_preferences up on up.user_id = p.id
  where p.status = 'aktiv'
    and p.id <> new.user_id
    and not coalesce(up.gong_muted, false)
    and private.has_permission(p.id, 'rankings.read')
    and (v_scope = 'agentur'
         or (v_team is not null and (p.id in (select tm.user_id from public.team_memberships tm where tm.team_id = v_team and tm.ended_at is null))));
  return new;
end;
$$;

drop trigger if exists performance_records_gong on public.performance_records;
create trigger performance_records_gong after insert or update of status on public.performance_records
  for each row execute function private.gong_on_confirm();

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
grant execute on all functions in schema private to authenticated, service_role;
revoke execute on all functions in schema private from public, anon;
revoke all on private.gong_last from public, anon, authenticated;

insert into private.schema_migrations (name) values ('20261102002300_gong.sql') on conflict do nothing;


-- ----- 20261102002400_badges_weekly.sql -----
-- =============================================================================
-- ERLEN CRM – Abzeichen, Serien und Wochenrückblick
--   * Abzeichen werden automatisch vergeben (Zeitplaner) und bleiben gespeichert.
--   * Serie = aufeinanderfolgende Tage mit bestätigtem Abschluss (Sonntage zählen nicht mit).
--   * Wochenrückblick: freitags ab 16 Uhr eine Mitteilung mit den eigenen Zahlen.
-- =============================================================================

create table if not exists public.user_badges (
  user_id uuid not null references public.profiles (id) on delete cascade,
  badge text not null check (char_length(badge) between 2 and 60),
  earned_at timestamptz not null default now(),
  primary key (user_id, badge)
);
create index if not exists user_badges_earned_idx on public.user_badges (earned_at desc);
alter table public.user_badges enable row level security;
-- Abzeichen sind (wie Ranglisten) für alle aktiven Mitarbeitenden sichtbar
drop policy if exists user_badges_select on public.user_badges;
create policy user_badges_select on public.user_badges for select to authenticated
  using (private.is_active_user((select auth.uid())));

insert into public.organization_settings (key, value, description) values
  ('weekly_review', '{"enabled": true, "last_sent_week": null}', 'Wochenrückblick freitags für alle Mitarbeitenden')
on conflict (key) do nothing;

-- Aktuelle Serie einer Person: Tage in Folge mit bestätigtem Abschluss bis heute bzw. gestern (Sonntage übersprungen)
create or replace function private.sales_streak(p_user uuid)
returns int
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_day date := private.today_berlin();
  v_count int := 0;
begin
  -- Heute noch nichts? Dann zählt die Serie bis gestern weiter
  if not exists (select 1 from public.performance_records where user_id = p_user and status = 'bestaetigt' and occurred_on = v_day) then
    v_day := v_day - 1;
  end if;
  loop
    if extract(isodow from v_day) = 7 then
      v_day := v_day - 1;
      continue;
    end if;
    exit when not exists (select 1 from public.performance_records where user_id = p_user and status = 'bestaetigt' and occurred_on = v_day);
    v_count := v_count + 1;
    v_day := v_day - 1;
    exit when v_count >= 365;
  end loop;
  return v_count;
end;
$$;

-- Längste Serie (für Abzeichen)
create or replace function private.sales_best_streak(p_user uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  with days as (
    select distinct occurred_on d from public.performance_records
    where user_id = p_user and status = 'bestaetigt' and extract(isodow from occurred_on) <> 7
  ),
  numbered as (
    -- Sonntage überspringen: Werktagsnummer seit einem festen Datum
    select d, ((d - date '2000-01-03') - ((d - date '2000-01-03') / 7)) - row_number() over (order by d) as grp from days
  )
  select coalesce(max(c), 0)::int from (select count(*) c from numbered group by grp) x;
$$;

create or replace function public.my_streak(p_user uuid default null)
returns int
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := coalesce(p_user, auth.uid());
begin
  if auth.uid() is null or not private.is_active_user(auth.uid()) then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  return private.sales_streak(v_user);
end;
$$;

-- Abzeichen vergeben (Zeitplaner); liefert die Anzahl neuer Abzeichen
create or replace function public.badge_watch()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  u record;
  v_new int := 0;
  v_total bigint;
  v_best int;
  v_prev_month text := to_char(private.today_berlin() - interval '1 month', 'YYYY-MM');
  v_prev_from date := date_trunc('month', private.today_berlin() - interval '1 month')::date;
  v_prev_to date := (date_trunc('month', private.today_berlin()) - interval '1 day')::date;
  v_badge text;
  v_label text;
  v_candidates text[];
begin
  for u in select p.id from public.profiles p where p.status = 'aktiv' loop
    select coalesce(sum(quantity), 0) into v_total from public.performance_records where user_id = u.id and status = 'bestaetigt';
    v_best := private.sales_best_streak(u.id);
    v_candidates := array_remove(array[
      case when v_total >= 1 then 'erster_abschluss' end,
      case when v_total >= 10 then 'abschluesse_10' end,
      case when v_total >= 50 then 'abschluesse_50' end,
      case when v_total >= 100 then 'abschluesse_100' end,
      case when v_total >= 500 then 'abschluesse_500' end,
      case when v_best >= 3 then 'serie_3' end,
      case when v_best >= 5 then 'serie_5' end,
      case when v_best >= 10 then 'serie_10' end,
      case when exists (select 1 from public.employee_details d where d.recruited_by = u.id) then 'erster_werber' end,
      case when (select count(*) from public.employee_details d where d.recruited_by = u.id) >= 5 then 'werber_5' end,
      case when exists (select 1 from public.sales_trainings t where t.user_id = u.id and t.score >= 80) then 'trainer_profi' end,
      case when not exists (
             select 1 from public.products pr where pr.is_active
               and not exists (select 1 from public.performance_records r where r.user_id = u.id and r.product_id = pr.id and r.status = 'bestaetigt'))
           and exists (select 1 from public.products pr where pr.is_active) then 'allrounder' end
    ], null);
    foreach v_badge in array v_candidates loop
      insert into public.user_badges (user_id, badge) values (u.id, v_badge) on conflict do nothing;
      if found then
        v_new := v_new + 1;
        v_label := case v_badge
          when 'erster_abschluss' then 'Erster Abschluss' when 'abschluesse_10' then '10 Abschlüsse' when 'abschluesse_50' then '50 Abschlüsse'
          when 'abschluesse_100' then '100 Abschlüsse' when 'abschluesse_500' then '500 Abschlüsse'
          when 'serie_3' then '3 Tage in Folge' when 'serie_5' then '5 Tage in Folge' when 'serie_10' then '10 Tage in Folge'
          when 'erster_werber' then 'Erster geworbener Partner' when 'werber_5' then '5 geworbene Partner'
          when 'trainer_profi' then 'Trainer-Profi (80+ im KI-Training)' when 'allrounder' then 'Allrounder (jedes Produkt verkauft)'
          else v_badge end;
        perform private.notify(u.id, 'abzeichen', 'Neues Abzeichen: ' || v_label || ' 🏅', 'Schau es dir in deinem Profil an.', '/profil#abzeichen');
      end if;
    end loop;
  end loop;

  -- Monatsauszeichnungen für den Vormonat (einmalig je Monat)
  if extract(day from private.today_berlin()) <= 7 then
    for u in
      select r.user_id, sum(r.quantity) s from public.performance_records r
      join public.profiles p on p.id = r.user_id and p.status = 'aktiv'
      where r.status = 'bestaetigt' and r.occurred_on between v_prev_from and v_prev_to
      group by r.user_id
      having sum(r.quantity) = (select max(s2) from (select sum(quantity) s2 from public.performance_records
                                where status = 'bestaetigt' and occurred_on between v_prev_from and v_prev_to group by user_id) x)
    loop
      insert into public.user_badges (user_id, badge) values (u.user_id, 'monatssieger:' || v_prev_month) on conflict do nothing;
      if found then
        v_new := v_new + 1;
        perform private.notify(u.user_id, 'abzeichen', 'Monatssieger ' || to_char(v_prev_from, 'MM/YYYY') || ' 🏆', 'Du hattest die meisten bestätigten Abschlüsse – Glückwunsch!', '/profil#abzeichen');
      end if;
    end loop;
    for u in
      select d.recruited_by as user_id, count(*) c from public.employee_details d
      join public.profiles p on p.id = d.recruited_by and p.status = 'aktiv'
      where d.recruited_by is not null and d.entry_date between v_prev_from and v_prev_to
      group by d.recruited_by
      having count(*) = (select max(c2) from (select count(*) c2 from public.employee_details
                         where recruited_by is not null and entry_date between v_prev_from and v_prev_to group by recruited_by) x)
    loop
      insert into public.user_badges (user_id, badge) values (u.user_id, 'top_werber:' || v_prev_month) on conflict do nothing;
      if found then
        v_new := v_new + 1;
        perform private.notify(u.user_id, 'abzeichen', 'Top-Werber ' || to_char(v_prev_from, 'MM/YYYY') || ' 🤝', 'Du hast die meisten neuen Partner ins Team gebracht!', '/profil#abzeichen');
      end if;
    end loop;
  end if;
  return v_new;
end;
$$;

-- Wochenrückblick: freitags ab 16 Uhr einmal je Woche
create or replace function public.weekly_review_run(p_now timestamptz default null)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamp := coalesce(p_now, now()) at time zone 'Europe/Berlin';
  v_week text := to_char(v_now, 'IYYY-IW');
  v_monday date := date_trunc('week', v_now)::date;
  v_ok boolean;
  u record;
  v_this bigint;
  v_last bigint;
  v_rank bigint;
  v_streak int;
  v_badges int;
  v_body text;
  v_sent int := 0;
begin
  if extract(isodow from v_now) <> 5 or extract(hour from v_now) < 16 then return 0; end if;
  update public.organization_settings set value = value || jsonb_build_object('last_sent_week', v_week), updated_at = now()
   where key = 'weekly_review' and coalesce((value ->> 'enabled')::boolean, true)
     and (value ->> 'last_sent_week') is distinct from v_week
  returning true into v_ok;
  if not coalesce(v_ok, false) then return 0; end if;

  for u in
    select p.id, p.first_name from public.profiles p
    join public.roles r on r.id = p.role_id
    where p.status = 'aktiv' and r.key <> 'admin'
      and private.has_permission(p.id, 'performance.read.self') and private.has_permission(p.id, 'performance.create')
  loop
    select coalesce(sum(quantity) filter (where occurred_on >= v_monday), 0),
           coalesce(sum(quantity) filter (where occurred_on between v_monday - 7 and v_monday - 1), 0)
      into v_this, v_last
      from public.performance_records where user_id = u.id and status = 'bestaetigt' and occurred_on >= v_monday - 7;
    select rk into v_rank from (
      select r.user_id, rank() over (order by sum(r.quantity) desc) rk from public.performance_records r
      where r.status = 'bestaetigt' and r.occurred_on >= v_monday group by r.user_id) x where x.user_id = u.id;
    v_streak := private.sales_streak(u.id);
    select count(*) into v_badges from public.user_badges where user_id = u.id and earned_at >= v_monday;
    v_body := 'Diese Woche: ' || v_this || ' bestätigte Abschlüsse'
      || case when v_last > 0 then ' (' || case when v_this >= v_last then '+' else '' end || (v_this - v_last) || ' zur Vorwoche)' else '' end
      || case when v_rank is not null then ' · Platz ' || v_rank else '' end
      || case when v_streak >= 2 then ' · 🔥 ' || v_streak || ' Tage in Folge' else '' end
      || case when v_badges > 0 then ' · ' || v_badges || ' neue Abzeichen' else '' end
      || '. ' || case when v_this = 0 then 'Nächste Woche packst du das! 💪' when v_this >= v_last then 'Stark – weiter so! 🚀' else 'Dranbleiben – du schaffst das! 💪' end;
    perform private.notify(u.id, 'wochenrueckblick', 'Dein Wochenrückblick, ' || u.first_name, v_body, '/dashboard');
    v_sent := v_sent + 1;
  end loop;
  return v_sent;
end;
$$;

create or replace function public.weekly_review_settings_save(p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_permission('settings.manage');
  update public.organization_settings set value = value || jsonb_build_object('enabled', coalesce(p_enabled, false)), updated_by = auth.uid(), updated_at = now()
   where key = 'weekly_review';
end;
$$;

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

insert into private.schema_migrations (name) values ('20261102002400_badges_weekly.sql') on conflict do nothing;

commit;

select 'ERLEN-Datenbank erfolgreich eingerichtet' as ergebnis;
