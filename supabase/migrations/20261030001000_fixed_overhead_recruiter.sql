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
