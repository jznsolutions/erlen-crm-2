-- =============================================================================
-- ERLEN CRM – Abzeichen, Serien und Wochenrückblick
--   * Abzeichen werden automatisch vergeben (Zeitplaner) und bleiben gespeichert.
--   * Serie = aufeinanderfolgende Tage mit bestätigtem Abschluss (Sonntage zählen nicht mit).
--   * Wochenrückblick: freitags ab 16 Uhr eine Mitteilung mit den eigenen Zahlen.
-- =============================================================================

create table if not exists public.user_badges (
  user_id uuid not null references public.profiles (id) on delete cascade,
  badge text not null check (char_length(badge) between 2 and 60),
  earned_at timestamptz not null default now(),
  primary key (user_id, badge)
);
create index if not exists user_badges_earned_idx on public.user_badges (earned_at desc);
alter table public.user_badges enable row level security;
-- Abzeichen sind (wie Ranglisten) für alle aktiven Mitarbeitenden sichtbar
drop policy if exists user_badges_select on public.user_badges;
create policy user_badges_select on public.user_badges for select to authenticated
  using (private.is_active_user((select auth.uid())));

insert into public.organization_settings (key, value, description) values
  ('weekly_review', '{"enabled": true, "last_sent_week": null}', 'Wochenrückblick freitags für alle Mitarbeitenden')
on conflict (key) do nothing;

-- Aktuelle Serie einer Person: Tage in Folge mit bestätigtem Abschluss bis heute bzw. gestern (Sonntage übersprungen)
create or replace function private.sales_streak(p_user uuid)
returns int
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_day date := private.today_berlin();
  v_count int := 0;
begin
  -- Heute noch nichts? Dann zählt die Serie bis gestern weiter
  if not exists (select 1 from public.performance_records where user_id = p_user and status = 'bestaetigt' and occurred_on = v_day) then
    v_day := v_day - 1;
  end if;
  loop
    if extract(isodow from v_day) = 7 then
      v_day := v_day - 1;
      continue;
    end if;
    exit when not exists (select 1 from public.performance_records where user_id = p_user and status = 'bestaetigt' and occurred_on = v_day);
    v_count := v_count + 1;
    v_day := v_day - 1;
    exit when v_count >= 365;
  end loop;
  return v_count;
end;
$$;

-- Längste Serie (für Abzeichen)
create or replace function private.sales_best_streak(p_user uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  with days as (
    select distinct occurred_on d from public.performance_records
    where user_id = p_user and status = 'bestaetigt' and extract(isodow from occurred_on) <> 7
  ),
  numbered as (
    -- Sonntage überspringen: Werktagsnummer seit einem festen Datum
    select d, ((d - date '2000-01-03') - ((d - date '2000-01-03') / 7)) - row_number() over (order by d) as grp from days
  )
  select coalesce(max(c), 0)::int from (select count(*) c from numbered group by grp) x;
$$;

create or replace function public.my_streak(p_user uuid default null)
returns int
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := coalesce(p_user, auth.uid());
begin
  if auth.uid() is null or not private.is_active_user(auth.uid()) then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  return private.sales_streak(v_user);
end;
$$;

-- Abzeichen vergeben (Zeitplaner); liefert die Anzahl neuer Abzeichen
create or replace function public.badge_watch()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  u record;
  v_new int := 0;
  v_total bigint;
  v_best int;
  v_prev_month text := to_char(private.today_berlin() - interval '1 month', 'YYYY-MM');
  v_prev_from date := date_trunc('month', private.today_berlin() - interval '1 month')::date;
  v_prev_to date := (date_trunc('month', private.today_berlin()) - interval '1 day')::date;
  v_badge text;
  v_label text;
  v_candidates text[];
begin
  for u in select p.id from public.profiles p where p.status = 'aktiv' loop
    select coalesce(sum(quantity), 0) into v_total from public.performance_records where user_id = u.id and status = 'bestaetigt';
    v_best := private.sales_best_streak(u.id);
    v_candidates := array_remove(array[
      case when v_total >= 1 then 'erster_abschluss' end,
      case when v_total >= 10 then 'abschluesse_10' end,
      case when v_total >= 50 then 'abschluesse_50' end,
      case when v_total >= 100 then 'abschluesse_100' end,
      case when v_total >= 500 then 'abschluesse_500' end,
      case when v_best >= 3 then 'serie_3' end,
      case when v_best >= 5 then 'serie_5' end,
      case when v_best >= 10 then 'serie_10' end,
      case when exists (select 1 from public.employee_details d where d.recruited_by = u.id) then 'erster_werber' end,
      case when (select count(*) from public.employee_details d where d.recruited_by = u.id) >= 5 then 'werber_5' end,
      case when exists (select 1 from public.sales_trainings t where t.user_id = u.id and t.score >= 80) then 'trainer_profi' end,
      case when not exists (
             select 1 from public.products pr where pr.is_active
               and not exists (select 1 from public.performance_records r where r.user_id = u.id and r.product_id = pr.id and r.status = 'bestaetigt'))
           and exists (select 1 from public.products pr where pr.is_active) then 'allrounder' end
    ], null);
    foreach v_badge in array v_candidates loop
      insert into public.user_badges (user_id, badge) values (u.id, v_badge) on conflict do nothing;
      if found then
        v_new := v_new + 1;
        v_label := case v_badge
          when 'erster_abschluss' then 'Erster Abschluss' when 'abschluesse_10' then '10 Abschlüsse' when 'abschluesse_50' then '50 Abschlüsse'
          when 'abschluesse_100' then '100 Abschlüsse' when 'abschluesse_500' then '500 Abschlüsse'
          when 'serie_3' then '3 Tage in Folge' when 'serie_5' then '5 Tage in Folge' when 'serie_10' then '10 Tage in Folge'
          when 'erster_werber' then 'Erster geworbener Partner' when 'werber_5' then '5 geworbene Partner'
          when 'trainer_profi' then 'Trainer-Profi (80+ im KI-Training)' when 'allrounder' then 'Allrounder (jedes Produkt verkauft)'
          else v_badge end;
        perform private.notify(u.id, 'abzeichen', 'Neues Abzeichen: ' || v_label || ' 🏅', 'Schau es dir in deinem Profil an.', '/profil#abzeichen');
      end if;
    end loop;
  end loop;

  -- Monatsauszeichnungen für den Vormonat (einmalig je Monat)
  if extract(day from private.today_berlin()) <= 7 then
    for u in
      select r.user_id, sum(r.quantity) s from public.performance_records r
      join public.profiles p on p.id = r.user_id and p.status = 'aktiv'
      where r.status = 'bestaetigt' and r.occurred_on between v_prev_from and v_prev_to
      group by r.user_id
      having sum(r.quantity) = (select max(s2) from (select sum(quantity) s2 from public.performance_records
                                where status = 'bestaetigt' and occurred_on between v_prev_from and v_prev_to group by user_id) x)
    loop
      insert into public.user_badges (user_id, badge) values (u.user_id, 'monatssieger:' || v_prev_month) on conflict do nothing;
      if found then
        v_new := v_new + 1;
        perform private.notify(u.user_id, 'abzeichen', 'Monatssieger ' || to_char(v_prev_from, 'MM/YYYY') || ' 🏆', 'Du hattest die meisten bestätigten Abschlüsse – Glückwunsch!', '/profil#abzeichen');
      end if;
    end loop;
    for u in
      select d.recruited_by as user_id, count(*) c from public.employee_details d
      join public.profiles p on p.id = d.recruited_by and p.status = 'aktiv'
      where d.recruited_by is not null and d.entry_date between v_prev_from and v_prev_to
      group by d.recruited_by
      having count(*) = (select max(c2) from (select count(*) c2 from public.employee_details
                         where recruited_by is not null and entry_date between v_prev_from and v_prev_to group by recruited_by) x)
    loop
      insert into public.user_badges (user_id, badge) values (u.user_id, 'top_werber:' || v_prev_month) on conflict do nothing;
      if found then
        v_new := v_new + 1;
        perform private.notify(u.user_id, 'abzeichen', 'Top-Werber ' || to_char(v_prev_from, 'MM/YYYY') || ' 🤝', 'Du hast die meisten neuen Partner ins Team gebracht!', '/profil#abzeichen');
      end if;
    end loop;
  end if;
  return v_new;
end;
$$;

-- Wochenrückblick: freitags ab 16 Uhr einmal je Woche
create or replace function public.weekly_review_run(p_now timestamptz default null)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamp := coalesce(p_now, now()) at time zone 'Europe/Berlin';
  v_week text := to_char(v_now, 'IYYY-IW');
  v_monday date := date_trunc('week', v_now)::date;
  v_ok boolean;
  u record;
  v_this bigint;
  v_last bigint;
  v_rank bigint;
  v_streak int;
  v_badges int;
  v_body text;
  v_sent int := 0;
begin
  if extract(isodow from v_now) <> 5 or extract(hour from v_now) < 16 then return 0; end if;
  update public.organization_settings set value = value || jsonb_build_object('last_sent_week', v_week), updated_at = now()
   where key = 'weekly_review' and coalesce((value ->> 'enabled')::boolean, true)
     and (value ->> 'last_sent_week') is distinct from v_week
  returning true into v_ok;
  if not coalesce(v_ok, false) then return 0; end if;

  for u in
    select p.id, p.first_name from public.profiles p
    join public.roles r on r.id = p.role_id
    where p.status = 'aktiv' and r.key <> 'admin'
      and private.has_permission(p.id, 'performance.read.self') and private.has_permission(p.id, 'performance.create')
  loop
    select coalesce(sum(quantity) filter (where occurred_on >= v_monday), 0),
           coalesce(sum(quantity) filter (where occurred_on between v_monday - 7 and v_monday - 1), 0)
      into v_this, v_last
      from public.performance_records where user_id = u.id and status = 'bestaetigt' and occurred_on >= v_monday - 7;
    select rk into v_rank from (
      select r.user_id, rank() over (order by sum(r.quantity) desc) rk from public.performance_records r
      where r.status = 'bestaetigt' and r.occurred_on >= v_monday group by r.user_id) x where x.user_id = u.id;
    v_streak := private.sales_streak(u.id);
    select count(*) into v_badges from public.user_badges where user_id = u.id and earned_at >= v_monday;
    v_body := 'Diese Woche: ' || v_this || ' bestätigte Abschlüsse'
      || case when v_last > 0 then ' (' || case when v_this >= v_last then '+' else '' end || (v_this - v_last) || ' zur Vorwoche)' else '' end
      || case when v_rank is not null then ' · Platz ' || v_rank else '' end
      || case when v_streak >= 2 then ' · 🔥 ' || v_streak || ' Tage in Folge' else '' end
      || case when v_badges > 0 then ' · ' || v_badges || ' neue Abzeichen' else '' end
      || '. ' || case when v_this = 0 then 'Nächste Woche packst du das! 💪' when v_this >= v_last then 'Stark – weiter so! 🚀' else 'Dranbleiben – du schaffst das! 💪' end;
    perform private.notify(u.id, 'wochenrueckblick', 'Dein Wochenrückblick, ' || u.first_name, v_body, '/dashboard');
    v_sent := v_sent + 1;
  end loop;
  return v_sent;
end;
$$;

create or replace function public.weekly_review_settings_save(p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_permission('settings.manage');
  update public.organization_settings set value = value || jsonb_build_object('enabled', coalesce(p_enabled, false)), updated_by = auth.uid(), updated_at = now()
   where key = 'weekly_review';
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

insert into private.schema_migrations (name) values ('20261102002400_badges_weekly.sql') on conflict do nothing;
