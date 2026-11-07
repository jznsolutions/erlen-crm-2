-- =============================================================================
-- ERLEN CRM – Provisionsstufen je Produkt (z. B. PV-Lead: bis 14 / 15-39 / ab 40 Module)
--   Ein Produkt kann mehrere Varianten mit eigener Provision je Stufe
--   (Vertriebspartner, Ausbilder, Teamleiter, Agentur) haben. Leistungen bleiben
--   beim Produkt (Ranking, Ziele, Freigaben unverändert) und merken sich die
--   Variante. Provision: Satz der Variante, sonst der allgemeine Satz des Produkts.
--   Außerdem: Produkte und Varianten ohne Leistungen endgültig löschen.
-- =============================================================================

create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists product_variants_name_idx on public.product_variants (product_id, lower(name));
alter table public.product_variants enable row level security;
drop policy if exists product_variants_select on public.product_variants;
create policy product_variants_select on public.product_variants for select to authenticated using (true);

alter table public.performance_records add column if not exists variant_id uuid references public.product_variants (id) on delete restrict;
create index if not exists performance_records_variant_idx on public.performance_records (variant_id) where variant_id is not null;

create or replace function private.check_record_variant()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.variant_id is not null and not exists (select 1 from public.product_variants where id = new.variant_id and product_id = new.product_id) then
    raise exception 'Provisionsstufe passt nicht zum Produkt';
  end if;
  return new;
end;
$$;
drop trigger if exists performance_records_variant_check on public.performance_records;
create trigger performance_records_variant_check before insert or update of variant_id, product_id on public.performance_records
  for each row execute function private.check_record_variant();

-- Provisionssätze: zusätzlich je Variante (leer = gilt für das ganze Produkt)
alter table public.commission_rates add column if not exists variant_id uuid references public.product_variants (id) on delete cascade;
alter table public.commission_rates drop constraint if exists commission_rates_pkey;
alter table public.commission_rates drop constraint if exists commission_rates_unique;
alter table public.commission_rates add constraint commission_rates_unique unique nulls not distinct (level_id, product_id, variant_id);

-- Satz für das ganze Produkt (ohne Variante)
create or replace function private.rate_cents(p_level_key text, p_product uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select cr.amount_cents from public.commission_rates cr
  join public.commission_levels l on l.id = cr.level_id
  where l.key = p_level_key and cr.product_id = p_product and cr.variant_id is null;
$$;

-- Satz der Variante, sonst des Produkts
create or replace function private.rate_cents(p_level_key text, p_product uuid, p_variant uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select cr.amount_cents from public.commission_rates cr join public.commission_levels l on l.id = cr.level_id
      where p_variant is not null and l.key = p_level_key and cr.product_id = p_product and cr.variant_id = p_variant),
    private.rate_cents(p_level_key, p_product));
$$;

-- Bisherige Einzelsatz-Funktion: nur Satz ohne Variante
create or replace function public.commission_rate_set(p_product uuid, p_level_key text, p_amount_cents int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.commission_rates_row_save(p_product, null, jsonb_build_object(p_level_key, p_amount_cents));
end;
$$;

-- Eine Zeile der Provisionstabelle speichern: Produkt (+ Variante) × alle Stufen
-- p_rates: {"vertriebspartner": 3000, "ausbilder": null, ...} – null/fehlend = kein Satz
create or replace function public.commission_rates_row_save(p_product uuid, p_variant uuid, p_rates jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l record;
  v_amount int;
begin
  perform private.require_permission('commissions.manage');
  if not exists (select 1 from public.products where id = p_product) then raise exception 'Produkt nicht gefunden'; end if;
  if p_variant is not null and not exists (select 1 from public.product_variants where id = p_variant and product_id = p_product) then
    raise exception 'Provisionsstufe nicht gefunden';
  end if;
  if jsonb_typeof(p_rates) <> 'object' then raise exception 'Ungültige Beträge'; end if;
  for l in select id, key from public.commission_levels where key is not null loop
    if not (p_rates ? l.key) then continue; end if;
    v_amount := (p_rates ->> l.key)::int;
    if v_amount is null then
      delete from public.commission_rates where level_id = l.id and product_id = p_product and variant_id is not distinct from p_variant;
    else
      if v_amount < 0 or v_amount > 10000000 then raise exception 'Ungültiger Betrag'; end if;
      insert into public.commission_rates (level_id, product_id, variant_id, amount_cents, updated_by, updated_at)
      values (l.id, p_product, p_variant, v_amount, auth.uid(), now())
      on conflict on constraint commission_rates_unique do update
        set amount_cents = excluded.amount_cents, updated_by = excluded.updated_by, updated_at = now();
    end if;
  end loop;
end;
$$;

-- Variante anlegen/ändern
create or replace function public.product_variant_upsert(p_id uuid, p_product uuid, p_name text, p_sort_order int default 0, p_is_active boolean default true)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform private.require_permission('products.manage');
  if nullif(trim(p_name), '') is null then raise exception 'Bitte einen Namen eingeben'; end if;
  if p_id is null then
    if not exists (select 1 from public.products where id = p_product) then raise exception 'Produkt nicht gefunden'; end if;
    insert into public.product_variants (product_id, name, sort_order, is_active)
    values (p_product, trim(p_name), coalesce(p_sort_order, 0), coalesce(p_is_active, true)) returning id into v_id;
  else
    update public.product_variants set name = trim(p_name), sort_order = coalesce(p_sort_order, 0), is_active = coalesce(p_is_active, true)
     where id = p_id returning id into v_id;
    if v_id is null then raise exception 'Provisionsstufe nicht gefunden'; end if;
  end if;
  return v_id;
exception when unique_violation then
  raise exception 'Eine Provisionsstufe mit diesem Namen gibt es bei diesem Produkt schon.';
end;
$$;

create or replace function public.product_variant_delete(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  n int;
begin
  perform private.require_permission('products.manage');
  select count(*) into n from public.performance_records where variant_id = p_id;
  if n > 0 then
    raise exception 'Zu dieser Provisionsstufe gibt es bereits % Leistungen. Bitte stattdessen inaktiv schalten, damit Abrechnungen stimmen.', n;
  end if;
  delete from public.product_variants where id = p_id;
end;
$$;

-- Produkt endgültig löschen (nur ohne Leistungen, Ziele und Wettbewerbe)
create or replace function public.product_delete(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  n int;
begin
  perform private.require_permission('products.manage');
  select count(*) into n from public.performance_records where product_id = p_id;
  if n > 0 then
    raise exception 'Zu diesem Produkt gibt es bereits % Leistungen. Löschen würde Abrechnungen verfälschen – bitte stattdessen inaktiv schalten.', n;
  end if;
  if exists (select 1 from public.targets where product_id = p_id) then
    raise exception 'Das Produkt wird in einem Ziel verwendet. Bitte zuerst das Ziel löschen oder ändern.';
  end if;
  if exists (select 1 from public.competitions where product_id = p_id) then
    raise exception 'Das Produkt wird in einem Wettbewerb verwendet. Bitte zuerst den Wettbewerb löschen oder ändern.';
  end if;
  delete from public.products where id = p_id;
  if not found then raise exception 'Produkt nicht gefunden'; end if;
end;
$$;

-- Abrechnungsvorschau: je Produkt und Provisionsstufe eine Zeile
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
      select l.kind, pr.id as product_id, pr.name || coalesce(' – ' || v.name, '') as product_name, pr.unit_label, sum(l.quantity)::bigint as quantity, l.unit_cents,
             (sum(l.quantity) * l.unit_cents)::bigint as total_cents, true as has_rate, pr.sort_order, coalesce(v.sort_order, 0) as vsort
      from private.commission_lines(p_from, p_to) l
      join public.products pr on pr.id = l.product_id
      left join public.product_variants v on v.id = l.variant_id
      where l.beneficiary = p_user
      group by l.kind, pr.id, pr.name, v.name, v.sort_order, pr.unit_label, l.unit_cents, pr.sort_order
      union all
      -- Stornos: früher bestätigte (und damit abgerechnete) Leistungen, die im Zeitraum storniert wurden
      select 'storno', pr.id, pr.name || coalesce(' – ' || v.name, ''), pr.unit_label, -sum(r.quantity)::bigint,
             coalesce(private.rate_cents(private.level_key_of(p_user), pr.id, r.variant_id), 0),
             (-sum(r.quantity) * coalesce(private.rate_cents(private.level_key_of(p_user), pr.id, r.variant_id), 0))::bigint, true, pr.sort_order, coalesce(v.sort_order, 0)
      from public.performance_records r join public.products pr on pr.id = r.product_id
      left join public.product_variants v on v.id = r.variant_id
      where r.user_id = p_user and r.status = 'storniert' and r.confirmed_at is not null
        and (r.cancelled_at at time zone 'Europe/Berlin')::date between p_from and p_to and r.occurred_on < p_from
      group by pr.id, pr.name, r.variant_id, v.name, v.sort_order, pr.unit_label, pr.sort_order
      union all
      select 'vermittlung', pr.id, pr.name || coalesce(' – ' || v.name, ''), pr.unit_label, sum(r.quantity)::bigint, 0, 0::bigint, false, pr.sort_order, coalesce(v.sort_order, 0)
      from public.performance_records r join public.products pr on pr.id = r.product_id
      left join public.product_variants v on v.id = r.variant_id
      where r.user_id = p_user and r.status = 'bestaetigt' and r.occurred_on between p_from and p_to
        and private.rate_cents(private.level_key_of(p_user), r.product_id, r.variant_id) is null
      group by pr.id, pr.name, v.name, v.sort_order, pr.unit_label, pr.sort_order
    ) x
    order by case x.kind when 'vermittlung' then 1 when 'storno' then 2 when 'overhead_ausbilder' then 3 else 4 end, x.sort_order, x.product_name, x.vsort;
end;
$$;

-- Provisionszeilen je Leistung, jetzt mit Variante (Satz der Variante, sonst des Produkts)
drop function if exists private.commission_lines(date, date);
create or replace function private.commission_lines(p_from date, p_to date)
returns table (beneficiary uuid, kind text, product_id uuid, seller_id uuid, quantity bigint, unit_cents int, variant_id uuid)
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
    select r.user_id as seller, r.product_id as product, r.variant_id as variant, r.quantity::bigint as qty, r.occurred_on, r.team_id
    from public.performance_records r
    where r.status = 'bestaetigt' and r.occurred_on between p_from and p_to
  ),
  chain as (
    select rc.*,
      private.rate_cents(private.level_key_of(rc.seller), rc.product, rc.variant) as seller_rate,
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
           then private.rate_cents(private.level_key_of(c.trainer), c.product, c.variant) end as trainer_rate,
      case when c.leader is not null then private.rate_cents(private.level_key_of(c.leader), c.product, c.variant) end as leader_rate
    from chain c
  )
  select x.beneficiary, x.kind, x.product, x.seller, x.qty, x.unit, x.variant
  from (
    -- eigene Leistung
    select seller as beneficiary, 'vermittlung'::text as kind, product, seller, qty, seller_rate as unit, variant from rates where seller_rate is not null
    union all
    -- Vermittlungsprovision für den Werber
    select recruiter, 'werbung', product, seller, qty, v_werbung, variant
    from rates where recruiter is not null and recruiter <> seller and v_werbung > 0
    union all
    -- Overhead Ausbilder (ist der Ausbilder zugleich Teamleiter, erhält er nur den Teamleiter-Overhead)
    select trainer, 'overhead_ausbilder', product, seller, qty,
      case when v_mode = 'fest' then v_ausbilder else greatest(trainer_rate - coalesce(seller_rate, 0), 0) end, variant
    from rates
    where trainer is not null and trainer <> seller
      and (v_mode <> 'fest' or trainer is distinct from leader)
      and (v_mode = 'fest' or trainer_rate is not null)
    union all
    -- Overhead Teamleiter
    select leader, 'overhead_teamleiter', product, seller, qty,
      case when v_mode = 'fest' then v_teamleiter
           else greatest(leader_rate - greatest(coalesce(seller_rate, 0),
                         case when trainer is not null and trainer <> leader then coalesce(trainer_rate, 0) else 0 end), 0) end, variant
    from rates
    where leader is not null
      and (v_mode = 'fest' or (leader_rate is not null and leader <> coalesce(trainer, '00000000-0000-0000-0000-000000000000'::uuid)))
  ) x
  where x.unit > 0;
end;
$$;

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
      (select coalesce(sum(r.quantity * coalesce(private.rate_cents('agentur', r.product_id, r.variant_id), 0)), 0)::bigint
         from public.performance_records r where r.status = 'bestaetigt' and r.occurred_on between p_from and p_to)
    end,
    (select coalesce(sum(l.quantity * l.unit_cents), 0)::bigint from private.commission_lines(p_from, p_to) l where l.beneficiary = v_uid);
end;
$$;

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
        'revenue_cents', coalesce(sum(r.quantity * coalesce(private.rate_cents('agentur', r.product_id, r.variant_id), 0)) filter (where r.status = 'bestaetigt' and r.occurred_on >= p_from), 0),
        'prev_revenue_cents', coalesce(sum(r.quantity * coalesce(private.rate_cents('agentur', r.product_id, r.variant_id), 0)) filter (where r.status = 'bestaetigt' and r.occurred_on < p_from), 0),
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

-- Leistung erfassen: optional mit Provisionsstufe (Variante)
drop function if exists public.performance_create(uuid, uuid, date, int, text, text, boolean, boolean);
create or replace function public.performance_create(
  p_user uuid,
  p_product uuid,
  p_occurred_on date,
  p_quantity int,
  p_external_ref text default null,
  p_note text default null,
  p_submit boolean default true,
  p_confirm_duplicate boolean default false,
  p_variant uuid default null)
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
  if p_variant is not null and not exists (select 1 from public.product_variants where id = p_variant and product_id = p_product and is_active) then
    raise exception 'Provisionsstufe passt nicht zum Produkt';
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
    user_id, team_id, product_id, variant_id, occurred_on, quantity, external_ref, note, status,
    created_by, submitted_at, confirmed_at, confirmed_by)
  values (
    p_user, private.current_team_id(p_user), p_product, p_variant, p_occurred_on, p_quantity, v_ref,
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

-- Partner-Abgleich: Zeilen können eine Provisionsstufe (variant_id) mitbringen; das Produkt wird für die Person
-- automatisch freigeschaltet (das Partner-CRM belegt, dass sie es verkauft)
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
        -- Laut Partner-CRM verkauft die Person das Produkt → automatisch freischalten
        insert into public.user_products (user_id, product_id, granted_by) values (v_user, v_product, v_actor) on conflict do nothing;
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

create or replace function public.partner_counts_apply(p_rows jsonb)
returns table (idx int, added int, cancelled int, message text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  row_ jsonb;
  i int := 0;
  v_user uuid;
  v_cat text;
  v_product uuid;
  v_new int;
  v_total int;
  v_prev int;
  v_rows jsonb;
  r record;
  v_add int;
  v_cancel int;
  v_err text;
begin
  perform private.require_permission('performance.approve');
  perform private.require_permission('performance.update');
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500 then raise exception 'Höchstens 500 Zeilen pro Abgleich.'; end if;

  for row_ in select * from jsonb_array_elements(p_rows) loop
    i := i + 1;
    begin
      v_user := (row_ ->> 'user_id')::uuid;
      v_cat := nullif(trim(row_ ->> 'category'), '');
      v_product := (row_ ->> 'product_id')::uuid;
      v_new := (row_ ->> 'qualified')::int;
      v_total := (row_ ->> 'total')::int;
      if v_cat is null or char_length(v_cat) > 40 then raise exception 'Kategorie fehlt'; end if;
      if v_new is null or v_new < 0 or v_new > 100000 then raise exception 'Ungültige Anzahl'; end if;
      if not private.is_active_user(v_user) or not private.can_access_user(v_actor, v_user, 'performance') then
        raise exception 'Mitarbeiter nicht gefunden oder nicht in deinem Bereich';
      end if;

      select qualified into v_prev from public.partner_lead_counts where user_id = v_user and category = v_cat for update;
      if v_prev is null and coalesce((row_ ->> 'start_only')::boolean, false) then
        insert into public.partner_lead_counts (user_id, category, qualified, total, updated_by) values (v_user, v_cat, v_new, v_total, v_actor);
        idx := i; added := 0; cancelled := 0; message := 'Startwert gespeichert'; return next; continue;
      end if;
      v_prev := coalesce(v_prev, 0);
      if v_new - v_prev > 1000 then raise exception 'Mehr als 1000 neue Leads auf einmal – bitte Zahl prüfen'; end if;

      -- neue Leads (laufende Nummern prev+1 … new) bzw. Stornos (new+1 … prev)
      select coalesce(jsonb_agg(jsonb_build_object(
               'user_id', v_user, 'product_id', v_product, 'variant_id', row_ ->> 'variant_id', 'occurred_on', private.today_berlin(), 'quantity', 1,
               'ref', 'L:' || v_user || ':' || v_cat || ':' || n,
               'target', case when n <= v_new then 'bestaetigt' else 'storniert' end)), '[]'::jsonb)
        into v_rows
        from generate_series(least(v_prev, v_new) + 1, greatest(v_prev, v_new)) n;

      v_add := 0; v_cancel := 0; v_err := null;
      for r in select * from public.partner_sync_apply(v_rows) loop
        if r.action = 'angelegt' then
          v_add := v_add + 1;
        elsif r.action = 'storniert' then v_cancel := v_cancel + 1;
        elsif r.action = 'fehler' then v_err := r.message;
        end if;
      end loop;
      if v_err is not null then raise exception '%', v_err; end if;

      insert into public.partner_lead_counts (user_id, category, qualified, total, updated_at, updated_by)
      values (v_user, v_cat, v_new, v_total, now(), v_actor)
      on conflict (user_id, category) do update set qualified = excluded.qualified, total = excluded.total, updated_at = now(), updated_by = v_actor;

      idx := i; added := v_add; cancelled := v_cancel;
      message := null;
      return next;
    exception when others then
      idx := i; added := 0; cancelled := 0; message := sqlerrm; return next;
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
revoke execute on function public.monthly_report_data(date, date) from authenticated;
revoke execute on function public.monthly_report_recipients() from authenticated;
revoke execute on function public.monthly_report_claim(text) from authenticated;
revoke execute on function public.referral_resolve(text) from authenticated;
revoke execute on function public.career_watch() from authenticated;
revoke execute on function public.badge_watch() from authenticated;
revoke execute on function public.weekly_review_run(timestamptz) from authenticated;
grant execute on all functions in schema private to authenticated, service_role;
revoke execute on all functions in schema private from public, anon;

insert into private.schema_migrations (name) values ('20261109002900_product_variants.sql') on conflict do nothing;
