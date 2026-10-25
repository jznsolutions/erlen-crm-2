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
