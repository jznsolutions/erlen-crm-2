-- =============================================================================
-- ERLEN CRM – Monatsbericht für die Agenturleitung (PDF per E-Mail)
--   Daten und Empfänger werden nur serverseitig gelesen; der Versand erfolgt
--   einmal pro Monat über den Zeitplaner. Ein- und ausschaltbar.
-- =============================================================================

insert into public.organization_settings (key, value, description) values
  ('monthly_report', '{"enabled": true, "last_sent_month": null}', 'Monatsbericht per E-Mail an alle mit agenturweiter Berichtsansicht')
on conflict (key) do nothing;

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
        'revenue_cents', coalesce(sum(r.quantity * coalesce(private.rate_cents('agentur', r.product_id), 0)) filter (where r.status = 'bestaetigt' and r.occurred_on >= p_from), 0),
        'prev_revenue_cents', coalesce(sum(r.quantity * coalesce(private.rate_cents('agentur', r.product_id), 0)) filter (where r.status = 'bestaetigt' and r.occurred_on < p_from), 0),
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

-- Empfänger: aktive Personen mit agenturweiter Berichtsansicht
create or replace function public.monthly_report_recipients()
returns table (email text, first_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.email, p.first_name from public.profiles p
  where p.status = 'aktiv' and private.has_permission(p.id, 'reports.read.all') and private.has_permission(p.id, 'performance.read.all')
  order by p.email;
$$;

-- Monat zum Versand beanspruchen (genau einmal, auch bei parallelen Aufrufen)
create or replace function public.monthly_report_claim(p_month text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ok boolean;
begin
  update public.organization_settings
     set value = value || jsonb_build_object('last_sent_month', p_month), updated_at = now()
   where key = 'monthly_report'
     and coalesce((value ->> 'enabled')::boolean, true)
     and (value ->> 'last_sent_month') is distinct from p_month
  returning true into v_ok;
  return coalesce(v_ok, false);
end;
$$;

create or replace function public.monthly_report_settings_save(p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_permission('settings.manage');
  update public.organization_settings
     set value = value || jsonb_build_object('enabled', coalesce(p_enabled, false)), updated_by = auth.uid(), updated_at = now()
   where key = 'monthly_report';
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
revoke execute on function public.push_vapid_keys(text, text) from authenticated;
revoke execute on function public.push_claim_pending() from authenticated;
revoke execute on function public.push_subscriptions_for(uuid[]) from authenticated;
revoke execute on function public.push_subscription_remove(uuid) from authenticated;
revoke execute on function public.competition_watch() from authenticated;
revoke execute on function public.document_expiry_watch() from authenticated;
revoke execute on function public.monthly_report_data(date, date) from authenticated;
revoke execute on function public.monthly_report_recipients() from authenticated;
revoke execute on function public.monthly_report_claim(text) from authenticated;
grant execute on all functions in schema private to authenticated, service_role;
revoke execute on all functions in schema private from public, anon;

insert into private.schema_migrations (name) values ('20261101001900_monthly_report.sql') on conflict do nothing;
