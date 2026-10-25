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
