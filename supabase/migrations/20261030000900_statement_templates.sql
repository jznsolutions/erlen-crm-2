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
