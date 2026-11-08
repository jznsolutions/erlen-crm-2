-- =============================================================================
-- ERLEN CRM – Bereiche (Glasfaser, Leads) strikt getrennt
--   Jedes Produkt gehört zu genau einem Bereich. Kennzahlen, Diagramme,
--   Ranglisten, Ziele, Wettbewerbe und Umsatz werden nur innerhalb eines
--   Bereichs gerechnet. Mitarbeiter werden je Bereich freigeschaltet.
--   Neu: Auswertung je Mitarbeiter (aktive Tage, Sales, Umsatz).
-- =============================================================================

create table if not exists public.business_areas (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z0-9_-]{2,40}$'),
  name text not null check (char_length(trim(name)) between 2 and 60),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists business_areas_name_idx on public.business_areas (lower(name));
alter table public.business_areas enable row level security;
drop policy if exists business_areas_select on public.business_areas;
create policy business_areas_select on public.business_areas for select to authenticated using (true);
insert into public.business_areas (key, name, sort_order) values ('glasfaser', 'Glasfaser', 1), ('leads', 'Leads', 2)
on conflict (key) do nothing;

-- Produkte: Bereich (Glasfaser/DSL/Internet → Glasfaser, alles andere → Leads; im Produkt änderbar)
alter table public.products add column if not exists area_id uuid references public.business_areas (id) on delete restrict;
update public.products p set area_id = (select a.id from public.business_areas a where a.key =
  case when p.name ~* '(glasfaser|faser|dsl|internet|ftth|tng|telekom)' then 'glasfaser' else 'leads' end)
 where p.area_id is null;
alter table public.products alter column area_id set not null;
create index if not exists products_area_idx on public.products (area_id);

create or replace function private.product_area(p_product uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select area_id from public.products where id = p_product;
$$;

drop function if exists public.product_upsert(uuid, text, text, text, boolean, boolean, int);
create or replace function public.product_upsert(
  p_id uuid, p_name text, p_description text, p_unit_label text,
  p_requires_external_ref boolean, p_is_active boolean, p_sort_order int default 0, p_area uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform private.require_permission('products.manage');
  if p_area is not null and not exists (select 1 from public.business_areas where id = p_area) then raise exception 'Bereich nicht gefunden'; end if;
  if p_id is null then
    if p_area is null then raise exception 'Bitte einen Bereich wählen'; end if;
    insert into public.products (name, description, unit_label, requires_external_ref, is_active, sort_order, area_id)
    values (trim(p_name), nullif(trim(p_description), ''), coalesce(nullif(trim(p_unit_label), ''), 'Verträge'),
            coalesce(p_requires_external_ref, false), coalesce(p_is_active, true), coalesce(p_sort_order, 0), p_area)
    returning id into v_id;
  else
    update public.products
       set name = trim(p_name), description = nullif(trim(p_description), ''),
           unit_label = coalesce(nullif(trim(p_unit_label), ''), 'Verträge'),
           requires_external_ref = coalesce(p_requires_external_ref, false),
           is_active = coalesce(p_is_active, true), sort_order = coalesce(p_sort_order, 0),
           area_id = coalesce(p_area, area_id)
     where id = p_id
    returning id into v_id;
    if v_id is null then raise exception 'Produkt nicht gefunden'; end if;
  end if;
  return v_id;
exception when unique_violation then
  raise exception 'Ein Produkt mit diesem Namen gibt es schon.';
end;
$$;

-- -----------------------------------------------------------------------------
-- Freischaltung je Bereich (ersetzt die Freischaltung je Produkt)
-- -----------------------------------------------------------------------------
create table if not exists public.user_areas (
  user_id uuid not null references public.profiles (id) on delete cascade,
  area_id uuid not null references public.business_areas (id) on delete cascade,
  granted_by uuid references public.profiles (id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, area_id)
);
alter table public.user_areas enable row level security;
drop policy if exists user_areas_select on public.user_areas;
create policy user_areas_select on public.user_areas for select to authenticated
  using (user_id = auth.uid() or private.can_access_user(auth.uid(), user_id, 'employees'));
-- bisherige Produktfreigaben übernehmen
insert into public.user_areas (user_id, area_id, granted_by)
select distinct up.user_id, pr.area_id, up.granted_by from public.user_products up join public.products pr on pr.id = up.product_id
on conflict do nothing;

create or replace function private.has_area(p_user uuid, p_area uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.user_areas where user_id = p_user and area_id = p_area);
$$;

-- Leistungen nur in freigeschalteten Bereichen
create or replace function private.has_product(p_user uuid, p_product uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_area(p_user, private.product_area(p_product));
$$;

create or replace function public.user_areas_set(p_user uuid, p_areas uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_added text;
begin
  perform private.require_permission('products.assign');
  if not exists (select 1 from public.profiles where id = p_user) then raise exception 'Benutzer nicht gefunden'; end if;
  delete from public.user_areas where user_id = p_user and not (area_id = any (coalesce(p_areas, '{}')));
  select string_agg(a.name, ', ' order by a.sort_order) into v_added
  from public.business_areas a
  where a.id = any (coalesce(p_areas, '{}'))
    and not exists (select 1 from public.user_areas ua where ua.user_id = p_user and ua.area_id = a.id);
  insert into public.user_areas (user_id, area_id, granted_by)
  select p_user, a.id, auth.uid() from public.business_areas a where a.id = any (coalesce(p_areas, '{}'))
  on conflict do nothing;
  if v_added is not null then
    perform private.notify(p_user, 'bereich_freigeschaltet', 'Neuer Bereich freigeschaltet', 'Freigeschaltet: ' || v_added, '/dashboard');
  end if;
end;
$$;

-- Einladungen: Bereiche werden beim Annehmen freigeschaltet
alter table public.invitations add column if not exists area_ids uuid[] not null default '{}';
create or replace function public.invitation_set_areas(p_id uuid, p_areas uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_permission('products.assign');
  update public.invitations set area_ids = coalesce(p_areas, '{}') where id = p_id and accepted_user_id is null;
  if not found then raise exception 'Einladung nicht gefunden oder bereits angenommen'; end if;
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
    insert into public.user_areas (user_id, area_id, granted_by)
    select distinct new.accepted_user_id, a.id, new.invited_by from public.business_areas a
    where a.id = any (new.area_ids) or a.id in (select pr.area_id from public.products pr where pr.id = any (new.product_ids))
    on conflict do nothing;
    if new.recruited_by is not null and new.recruited_by <> new.accepted_user_id then
      insert into public.employee_details (user_id, recruited_by) values (new.accepted_user_id, new.recruited_by)
      on conflict (user_id) do update set recruited_by = excluded.recruited_by;
    end if;
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Ziele und Wettbewerbe gehören zu einem Bereich
-- -----------------------------------------------------------------------------
alter table public.targets add column if not exists area_id uuid references public.business_areas (id) on delete restrict;
alter table public.competitions add column if not exists area_id uuid references public.business_areas (id) on delete restrict;
update public.targets t set area_id = coalesce(private.product_area(t.product_id), (select id from public.business_areas where key = 'glasfaser')) where area_id is null;
update public.competitions c set area_id = coalesce(private.product_area(c.product_id), (select id from public.business_areas where key = 'glasfaser')) where area_id is null;

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
   and (t.area_id is null or r.product_id in (select pr.id from public.products pr where pr.area_id = t.area_id))
  where t.id = p_target
    and case t.scope
          when 'mitarbeiter' then r.user_id = t.user_id
          when 'team' then r.team_id = t.team_id
          else true end;
$$;
drop function if exists public.target_upsert(uuid, text, public.target_scope, uuid, uuid, uuid, public.target_period, date, date, int);
create or replace function public.target_upsert(
  p_id uuid, p_title text, p_scope public.target_scope, p_user uuid, p_team uuid,
  p_product uuid, p_period public.target_period, p_starts_on date, p_ends_on date, p_target_value int, p_area uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_existing public.targets;
  v_area uuid;
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

  v_area := coalesce(private.product_area(p_product), p_area);
  if v_area is null then raise exception 'Bitte einen Bereich wählen'; end if;
  if p_id is null then
    insert into public.targets (title, scope, user_id, team_id, product_id, period,
                                starts_on, ends_on, target_value, created_by, area_id)
    values (trim(p_title), p_scope,
            case when p_scope = 'mitarbeiter' then p_user end,
            case when p_scope = 'team' then p_team end,
            p_product, p_period, p_starts_on, p_ends_on, p_target_value, auth.uid(), v_area)
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
           ends_on = p_ends_on, target_value = p_target_value, area_id = v_area
     where id = p_id
    returning id into v_id;
  end if;
  return v_id;
end;
$$;
drop function if exists public.competition_upsert(uuid, text, text, uuid, uuid, date, date, boolean);
create or replace function public.competition_upsert(
  p_id uuid, p_title text, p_description text, p_product uuid, p_team uuid,
  p_starts_on date, p_ends_on date, p_is_active boolean, p_area uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_area uuid := coalesce(private.product_area(p_product), p_area);
begin
  perform private.require_permission('competitions.manage');
  if v_area is null then raise exception 'Bitte einen Bereich wählen'; end if;
  if p_ends_on - p_starts_on > 400 then
    raise exception 'Ein Wettbewerb darf höchstens 400 Tage dauern.';
  end if;
  if p_id is null then
    insert into public.competitions (title, description, product_id, team_id, starts_on, ends_on, is_active, created_by, area_id)
    values (trim(p_title), nullif(trim(p_description), ''), p_product, p_team, p_starts_on, p_ends_on,
            coalesce(p_is_active, true), auth.uid(), v_area)
    returning id into v_id;
  else
    update public.competitions
       set title = trim(p_title), description = nullif(trim(p_description), ''), product_id = p_product,
           team_id = p_team, starts_on = p_starts_on, ends_on = p_ends_on, is_active = coalesce(p_is_active, true), area_id = v_area
     where id = p_id
    returning id into v_id;
    if v_id is null then raise exception 'Wettbewerb nicht gefunden'; end if;
  end if;
  return v_id;
end;
$$;
drop function if exists public.get_target_progress(date);
create or replace function public.get_target_progress(p_day date default null)
returns table (
  target_id uuid, title text, scope public.target_scope, user_id uuid, team_id uuid,
  product_id uuid, period public.target_period, target_value int,
  window_start date, window_end date, actual bigint, area_id uuid)
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
           private.target_actual(t.id, w.window_start, w.window_end), t.area_id
    from public.targets t
    cross join lateral private.target_window(t.period, t.starts_on, t.ends_on, v_day) w
    where v_day between t.starts_on and t.ends_on
      and private.can_view_target(auth.uid(), t.id)
    order by t.scope, t.title;
end;
$$;

-- -----------------------------------------------------------------------------
-- Auswertungen mit Bereichsfilter
-- -----------------------------------------------------------------------------
drop function if exists public.performance_daily(date, date, uuid[], uuid, uuid);
create or replace function public.performance_daily(
  p_from date, p_to date,
  p_user_ids uuid[] default null,
  p_team_id uuid default null,
  p_product_id uuid default null,
  p_area_id uuid default null)
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
    and (p_area_id is null or r.product_id in (select pr.id from public.products pr where pr.area_id = p_area_id))
  group by 1, 2, 3, 4, 5;
$$;
drop function if exists public.get_leaderboard(date, date, uuid, uuid);
create or replace function public.get_leaderboard(
  p_from date, p_to date, p_product_id uuid default null, p_team_id uuid default null, p_area_id uuid default null)
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
        and (p_area_id is null or r.product_id in (select pr.id from public.products pr where pr.area_id = p_area_id))
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
drop function if exists public.get_money_kpis(date, date);
create or replace function public.get_money_kpis(p_from date, p_to date, p_area_id uuid default null)
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
      (select coalesce(sum(r.quantity * coalesce(private.rate_cents('agentur', r.product_id, r.variant_id), 0)), 0)::bigint
         from public.performance_records r where r.status = 'bestaetigt' and r.occurred_on between p_from and p_to
           and (p_area_id is null or private.product_area(r.product_id) = p_area_id))
    end,
    (select coalesce(sum(l.quantity * l.unit_cents), 0)::bigint from private.commission_lines(p_from, p_to) l where l.beneficiary = v_uid
       and (p_area_id is null or private.product_area(l.product_id) = p_area_id));
end;
$$;
drop function if exists public.monthly_report_data(date, date);
create or replace function public.monthly_report_data(p_from date, p_to date, p_area_id uuid default null)
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
    'area', (select name from public.business_areas where id = p_area_id),
    'from', p_from, 'to', p_to, 'prev_from', v_prev_from, 'prev_to', v_prev_to,
    'totals', (
      select jsonb_build_object(
        'confirmed', coalesce(sum(r.quantity) filter (where r.status = 'bestaetigt' and r.occurred_on >= p_from), 0),
        'cancelled', coalesce(sum(r.quantity) filter (where r.status = 'storniert' and r.occurred_on >= p_from), 0),
        'pending', coalesce(sum(r.quantity) filter (where r.status = 'eingereicht' and r.occurred_on >= p_from), 0),
        'prev_confirmed', coalesce(sum(r.quantity) filter (where r.status = 'bestaetigt' and r.occurred_on < p_from), 0),
        'prev_cancelled', coalesce(sum(r.quantity) filter (where r.status = 'storniert' and r.occurred_on < p_from), 0),
        'revenue_cents', coalesce(sum(r.quantity * coalesce(private.rate_cents('agentur', r.product_id, r.variant_id), 0)) filter (where r.status = 'bestaetigt' and r.occurred_on >= p_from), 0),
        'prev_revenue_cents', coalesce(sum(r.quantity * coalesce(private.rate_cents('agentur', r.product_id, r.variant_id), 0)) filter (where r.status = 'bestaetigt' and r.occurred_on < p_from), 0),
        'sellers', count(distinct r.user_id) filter (where r.status = 'bestaetigt' and r.occurred_on >= p_from),
        'prev_sellers', count(distinct r.user_id) filter (where r.status = 'bestaetigt' and r.occurred_on < p_from))
      from public.performance_records r
      where r.occurred_on between v_prev_from and p_to and (p_area_id is null or private.product_area(r.product_id) = p_area_id)),
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
        where (p_area_id is null or pr.area_id = p_area_id)
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
        where r.occurred_on between p_from and p_to and r.status in ('bestaetigt', 'storniert') and (p_area_id is null or private.product_area(r.product_id) = p_area_id)
        group by t.name) x), '[]'::jsonb),
    'top', coalesce((
      select jsonb_agg(x order by x.confirmed desc, x.name) from (
        select p.first_name || ' ' || p.last_name as name, tm.name as team, sum(r.quantity) as confirmed
        from public.performance_records r
        join public.profiles p on p.id = r.user_id
        left join public.teams tm on tm.id = private.current_team_id(p.id)
        where r.status = 'bestaetigt' and r.occurred_on between p_from and p_to and (p_area_id is null or private.product_area(r.product_id) = p_area_id)
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

-- Auswertung je Mitarbeiter: aktive Tage, Sales, offene/stornierte, Umsatz (nur Gesamtsicht)
create or replace function public.employee_performance(p_from date, p_to date, p_area_id uuid)
returns table (user_id uuid, first_name text, last_name text, team_name text, role_name text,
               active_days int, sales bigint, pending bigint, cancelled bigint, revenue_cents bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer uuid := auth.uid();
  v_money boolean := private.has_permission(auth.uid(), 'performance.read.all');
begin
  if v_viewer is null or not private.is_active_user(v_viewer) then raise exception 'Keine Berechtigung' using errcode = '42501'; end if;
  if p_to < p_from or (p_to - p_from) > 400 then raise exception 'Ungültiger Zeitraum'; end if;
  return query
    with recs as (
      select r.user_id, r.occurred_on, r.status, r.quantity, r.product_id, r.variant_id
      from public.performance_records r
      join public.products pr on pr.id = r.product_id and pr.area_id = p_area_id
      where r.occurred_on between p_from and p_to
    ),
    people as (
      select p.id from public.profiles p
      where p.status = 'aktiv' and (private.has_area(p.id, p_area_id) or exists (select 1 from recs x where x.user_id = p.id))
      union
      select distinct x.user_id from recs x
    )
    select p.id, p.first_name, p.last_name, tm.name, ro.name,
           (select count(distinct x.occurred_on)::int from recs x where x.user_id = p.id and x.status = 'bestaetigt'),
           coalesce((select sum(x.quantity) from recs x where x.user_id = p.id and x.status = 'bestaetigt'), 0)::bigint,
           coalesce((select sum(x.quantity) from recs x where x.user_id = p.id and x.status = 'eingereicht'), 0)::bigint,
           coalesce((select sum(x.quantity) from recs x where x.user_id = p.id and x.status = 'storniert'), 0)::bigint,
           case when v_money then coalesce((select sum(x.quantity * coalesce(private.rate_cents('agentur', x.product_id, x.variant_id), 0))
                                            from recs x where x.user_id = p.id and x.status = 'bestaetigt'), 0)::bigint end
    from people pe
    join public.profiles p on p.id = pe.id
    left join public.roles ro on ro.id = p.role_id
    left join public.teams tm on tm.id = private.current_team_id(p.id)
    where (p.id = v_viewer or private.can_access_user(v_viewer, p.id, 'performance'))
      and coalesce(ro.key, '') <> 'admin';
end;
$$;

-- Partner-Abgleich schaltet den Bereich frei (statt einzelner Produkte)
create or replace function public.partner_sync_apply(p_rows jsonb)
returns table (idx int, action text, message text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  row_ jsonb;
  i int := 0;
  v_user uuid;
  v_product uuid;
  v_variant uuid;
  v_date date;
  v_qty int;
  v_ref text;
  v_target text;
  rec public.performance_records;
  v_id uuid;
  v_reason text := 'Laut Partner-CRM';
begin
  perform private.require_permission('performance.approve');
  perform private.require_permission('performance.update');
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 2000 then raise exception 'Höchstens 2000 Zeilen pro Abgleich.'; end if;

  for row_ in select * from jsonb_array_elements(p_rows) loop
    i := i + 1;
    begin
      v_user := (row_ ->> 'user_id')::uuid;
      v_product := (row_ ->> 'product_id')::uuid;
      v_variant := nullif(row_ ->> 'variant_id', '')::uuid;
      v_date := (row_ ->> 'occurred_on')::date;
      v_qty := coalesce((row_ ->> 'quantity')::int, 1);
      v_ref := nullif(trim(row_ ->> 'ref'), '');
      v_target := row_ ->> 'target';
      if v_target not in ('eingereicht', 'bestaetigt', 'storniert') then raise exception 'Unbekannter Status'; end if;
      if v_ref is null or char_length(v_ref) > 120 then raise exception 'Auftragsnummer fehlt'; end if;
      if not private.is_active_user(v_user) or not private.can_access_user(v_actor, v_user, 'performance') then
        raise exception 'Mitarbeiter nicht gefunden oder nicht in deinem Bereich';
      end if;
      if not exists (select 1 from public.products where id = v_product and is_active) then raise exception 'Produkt nicht gefunden'; end if;
      if v_variant is not null and not exists (select 1 from public.product_variants where id = v_variant and product_id = v_product) then raise exception 'Provisionsstufe passt nicht zum Produkt'; end if;
      if v_qty < 1 or v_qty > 1000 then raise exception 'Ungültige Menge'; end if;
      if v_date is null or v_date > private.today_berlin() or v_date < private.today_berlin() - 400 then raise exception 'Ungültiges Datum'; end if;

      select * into rec from public.performance_records
       where product_id = v_product and lower(external_ref) = lower(v_ref) and status in ('entwurf', 'eingereicht', 'bestaetigt')
       order by created_at desc limit 1;

      if rec.id is null then
        if v_target = 'storniert' then
          -- Storno eines bei uns schon stornierten oder nie erfassten Auftrags
          if exists (select 1 from public.performance_records where product_id = v_product and lower(external_ref) = lower(v_ref) and status = 'storniert') then
            idx := i; action := 'unveraendert'; message := 'bereits storniert'; return next; continue;
          end if;
          idx := i; action := 'uebersprungen'; message := 'Storno ohne erfassten Auftrag'; return next; continue;
        end if;
        -- Laut Partner-CRM verkauft die Person im Bereich → Bereich automatisch freischalten
        insert into public.user_areas (user_id, area_id, granted_by) values (v_user, private.product_area(v_product), v_actor) on conflict do nothing;
        insert into public.performance_records (user_id, team_id, product_id, variant_id, occurred_on, quantity, external_ref, note, status,
                                                created_by, submitted_at, confirmed_at, confirmed_by)
        values (v_user, private.current_team_id(v_user), v_product, v_variant, v_date, v_qty, v_ref, 'Aus Partner-CRM übernommen', v_target::public.performance_status,
                v_actor, now(), case when v_target = 'bestaetigt' then now() end, case when v_target = 'bestaetigt' then v_actor end)
        returning id into v_id;
        if v_target = 'bestaetigt' then
          insert into public.performance_approvals (record_id, decision, comment, actor_id) values (v_id, 'bestaetigt', v_reason, v_actor);
          perform private.check_target_achievements(v_user, v_date);
        end if;
        idx := i; action := 'angelegt'; message := v_target; return next; continue;
      end if;

      if rec.user_id <> v_user then
        raise exception 'Auftragsnummer ist bei uns einer anderen Person zugeordnet';
      end if;
      if v_target = 'storniert' and rec.status in ('eingereicht', 'bestaetigt') then
        update public.performance_records set status = 'storniert', cancelled_at = now(), cancelled_by = v_actor, status_reason = v_reason where id = rec.id;
        insert into public.performance_adjustments (record_id, action, from_status, to_status, reason, actor_id)
        values (rec.id, 'storniert', rec.status, 'storniert', v_reason, v_actor);
        perform private.notify(rec.user_id, 'leistung_storniert', 'Leistung storniert', v_reason || ' (Auftrag ' || v_ref || ')', '/leistungen');
        idx := i; action := 'storniert'; message := null; return next; continue;
      end if;
      if v_target = 'bestaetigt' and rec.status in ('entwurf', 'eingereicht') then
        update public.performance_records
           set status = 'bestaetigt', submitted_at = coalesce(submitted_at, now()), confirmed_at = now(), confirmed_by = v_actor, status_reason = null
         where id = rec.id;
        insert into public.performance_approvals (record_id, decision, comment, actor_id) values (rec.id, 'bestaetigt', v_reason, v_actor);
        perform private.check_target_achievements(rec.user_id, rec.occurred_on);
        idx := i; action := 'bestaetigt'; message := null; return next; continue;
      end if;
      idx := i; action := 'unveraendert'; message := null; return next;
    exception when others then
      idx := i; action := 'fehler'; message := sqlerrm; return next;
    end;
  end loop;
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
revoke execute on function public.monthly_report_data(date, date, uuid) from authenticated;
revoke execute on function public.monthly_report_recipients() from authenticated;
revoke execute on function public.monthly_report_claim(text) from authenticated;
revoke execute on function public.referral_resolve(text) from authenticated;
revoke execute on function public.career_watch() from authenticated;
revoke execute on function public.badge_watch() from authenticated;
revoke execute on function public.weekly_review_run(timestamptz) from authenticated;
grant execute on all functions in schema private to authenticated, service_role;
revoke execute on all functions in schema private from public, anon;

insert into private.schema_migrations (name) values ('20261110003000_business_areas.sql') on conflict do nothing;
