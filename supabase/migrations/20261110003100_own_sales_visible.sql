-- =============================================================================
-- ERLEN CRM – Eigene Sales der Leitung überall sichtbar
--   1) Mitarbeiter-Leistung: Konten mit Rolle „Administrator“ erscheinen, sobald
--      sie im Bereich freigeschaltet sind oder Leistungen haben.
--   2) Leads aus der Partner-Übersicht (Kennung L:…), die vor dem Wegfall der
--      manuellen Freigabe als „eingereicht“ gebucht wurden, werden bestätigt –
--      genau wie es seitdem automatisch passiert.
--   3) Wer selbst Leistungen in einem Bereich hat, ist dort freigeschaltet.
-- =============================================================================

-- 1)
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
      -- reine Verwaltungskonten ohne Bereich und ohne Leistungen nicht anzeigen; wer verkauft, steht immer drin
      and (coalesce(ro.key, '') <> 'admin' or private.has_area(p.id, p_area_id) or exists (select 1 from recs x where x.user_id = p.id));
end;
$$;

-- 2) Hängende eigene Leads aus dem Screenshot-Abgleich bestätigen
do $$
declare
  r record;
begin
  for r in
    update public.performance_records
       set status = 'bestaetigt', confirmed_at = now(), confirmed_by = created_by, status_reason = null
     where external_ref like 'L:%' and status = 'eingereicht'
    returning id, created_by, user_id, occurred_on
  loop
    insert into public.performance_approvals (record_id, decision, comment, actor_id)
    values (r.id, 'bestaetigt', 'Laut Partner-CRM (Freigabe entfällt)', r.created_by);
    perform private.check_target_achievements(r.user_id, r.occurred_on);
  end loop;
end;
$$;

-- 3) Freischaltung für alle, die im Bereich bereits Leistungen haben
insert into public.user_areas (user_id, area_id)
select distinct r.user_id, pr.area_id
from public.performance_records r join public.products pr on pr.id = r.product_id
where r.status in ('eingereicht', 'bestaetigt')
on conflict do nothing;

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

insert into private.schema_migrations (name) values ('20261110003100_own_sales_visible.sql') on conflict do nothing;
