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
