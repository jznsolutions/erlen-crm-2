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
