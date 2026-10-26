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
