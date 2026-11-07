-- =============================================================================
-- ERLEN CRM – Leads aus der Partner-Übersicht (Screenshot je Verkäufer)
--   Das Partner-CRM zeigt je Verkäufer nur Zähler: qualifizierte Leads je
--   Modul-Kategorie (Dachfläche), z. B. „15-39 Module 2/2“. Die Leitung lädt
--   jeden Morgen Screenshots hoch; das Portal merkt sich den letzten Stand je
--   Verkäufer und Kategorie und bucht nur die Differenz:
--     Stand 3 → 7  = 4 neue bestätigte Leads
--     Stand 7 → 6  = 1 Lead storniert
--   Jeder Lead ist ein Datensatz (Menge 1) mit der Kennung
--   L:<Mitarbeiter>:<Kategorie>:<laufende Nummer> – derselbe Screenshot zweimal
--   bucht nichts doppelt.
--   Außerdem: Vertriebspartner erfassen vorerst keine eigenen Leistungen.
-- =============================================================================

create table if not exists public.partner_lead_counts (
  user_id uuid not null references public.profiles (id) on delete cascade,
  category text not null check (char_length(category) between 1 and 40),
  qualified int not null check (qualified between 0 and 100000),
  total int check (total is null or total between 0 and 100000),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  primary key (user_id, category)
);
alter table public.partner_lead_counts enable row level security;
drop policy if exists partner_lead_counts_select on public.partner_lead_counts;
create policy partner_lead_counts_select on public.partner_lead_counts for select to authenticated
  using (private.has_permission(auth.uid(), 'performance.approve') and private.can_access_user(auth.uid(), user_id, 'performance'));

-- Zeilen: user_id, category, product_id, qualified, total (optional), start_only (nur Startwert merken)
-- Ergebnis je Zeile: neu gebuchte und stornierte Leads, ggf. Hinweis/Fehler
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
  v_pending int;
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
               'user_id', v_user, 'product_id', v_product, 'occurred_on', private.today_berlin(), 'quantity', 1,
               'ref', 'L:' || v_user || ':' || v_cat || ':' || n,
               'target', case when n <= v_new then 'bestaetigt' else 'storniert' end)), '[]'::jsonb)
        into v_rows
        from generate_series(least(v_prev, v_new) + 1, greatest(v_prev, v_new)) n;

      v_add := 0; v_cancel := 0; v_err := null; v_pending := 0;
      for r in select * from public.partner_sync_apply(v_rows) loop
        if r.action = 'angelegt' then
          v_add := v_add + 1;
          if r.message = 'eingereicht' then v_pending := v_pending + 1; end if;
        elsif r.action = 'storniert' then v_cancel := v_cancel + 1;
        elsif r.action = 'fehler' then v_err := r.message;
        end if;
      end loop;
      if v_err is not null then raise exception '%', v_err; end if;

      insert into public.partner_lead_counts (user_id, category, qualified, total, updated_at, updated_by)
      values (v_user, v_cat, v_new, v_total, now(), v_actor)
      on conflict (user_id, category) do update set qualified = excluded.qualified, total = excluded.total, updated_at = now(), updated_by = v_actor;

      idx := i; added := v_add; cancelled := v_cancel;
      message := case when v_pending > 0 then v_pending || ' zur Freigabe (eigene Leads bestätigt eine zweite Person)' end;
      return next;
    exception when others then
      idx := i; added := 0; cancelled := 0; message := sqlerrm; return next;
    end;
  end loop;
end;
$$;

-- Vertriebspartner, Ausbilder und Teamleiter erfassen vorerst keine eigenen Leistungen
-- (wieder einschaltbar unter Administration → Rollen)
delete from public.role_permissions
 where permission_key = 'performance.create'
   and role_id in (select id from public.roles where key in ('vertriebspartner', 'ausbilder', 'teamleiter'));

-- Wochenrückblick: für alle aktiven Mitarbeiter mit eigenen Leistungen (unabhängig davon, ob sie selbst erfassen dürfen)
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
      and private.has_permission(p.id, 'performance.read.self')
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

insert into private.schema_migrations (name) values ('20261108002700_partner_counts.sql') on conflict do nothing;
