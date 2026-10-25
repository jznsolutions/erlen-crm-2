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
