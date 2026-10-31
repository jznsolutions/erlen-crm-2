-- =============================================================================
-- ERLEN CRM – Abschluss-Gong: Sobald eine Leistung bestätigt ist, bekommt das Team
--   (oder die ganze Agentur) eine kurze Mitteilung – auch aufs Handy.
--   * Einstellbar: aus / Team / Agentur
--   * Jeder kann den Gong für sich stumm schalten
--   * Höchstens ein Gong je Verkäufer in 10 Minuten (kein Dauerklingeln)
-- =============================================================================

insert into public.organization_settings (key, value, description) values
  ('gong', '{"scope": "team"}', 'Abschluss-Gong: off | team | agentur')
on conflict (key) do nothing;

create table if not exists public.user_preferences (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  gong_muted boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.user_preferences enable row level security;
drop policy if exists user_preferences_select on public.user_preferences;
create policy user_preferences_select on public.user_preferences for select to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.gong_mute_set(p_muted boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.is_active_user(auth.uid()) then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  insert into public.user_preferences (user_id, gong_muted) values (auth.uid(), coalesce(p_muted, false))
  on conflict (user_id) do update set gong_muted = excluded.gong_muted, updated_at = now();
end;
$$;

create or replace function public.gong_settings_save(p_scope text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_permission('settings.manage');
  if p_scope not in ('off', 'team', 'agentur') then raise exception 'Ungültige Einstellung'; end if;
  update public.organization_settings set value = jsonb_build_object('scope', p_scope), updated_by = auth.uid(), updated_at = now()
   where key = 'gong';
end;
$$;

create table if not exists private.gong_last (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  rung_at timestamptz not null
);

create or replace function private.gong_on_confirm()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_scope text := coalesce((select value ->> 'scope' from public.organization_settings where key = 'gong'), 'team');
  v_name text;
  v_product text;
  v_team uuid;
begin
  if v_scope = 'off' or new.status <> 'bestaetigt' or (tg_op = 'UPDATE' and old.status = 'bestaetigt') then
    return new;
  end if;
  -- Nur aktuelle Abschlüsse (nicht nachgetragene alte Leistungen)
  if new.occurred_on < private.today_berlin() - 1 then return new; end if;
  -- Höchstens ein Gong je Verkäufer in 10 Minuten
  if exists (select 1 from private.gong_last g where g.user_id = new.user_id and g.rung_at > now() - interval '10 minutes') then
    return new;
  end if;
  insert into private.gong_last (user_id, rung_at) values (new.user_id, now())
  on conflict (user_id) do update set rung_at = excluded.rung_at;

  select p.first_name || ' ' || left(p.last_name, 1) || '.' into v_name from public.profiles p where p.id = new.user_id;
  select name into v_product from public.products where id = new.product_id;
  v_team := coalesce(new.team_id, private.current_team_id(new.user_id));

  perform private.notify(p.id, 'gong',
    '🔔 ' || v_name || ' hat abgeschlossen!',
    new.quantity || '× ' || coalesce(v_product, 'Abschluss') || ' – stark!',
    '/ziele')
  from public.profiles p
  left join public.user_preferences up on up.user_id = p.id
  where p.status = 'aktiv'
    and p.id <> new.user_id
    and not coalesce(up.gong_muted, false)
    and private.has_permission(p.id, 'rankings.read')
    and (v_scope = 'agentur'
         or (v_team is not null and (p.id in (select tm.user_id from public.team_memberships tm where tm.team_id = v_team and tm.ended_at is null))));
  return new;
end;
$$;

drop trigger if exists performance_records_gong on public.performance_records;
create trigger performance_records_gong after insert or update of status on public.performance_records
  for each row execute function private.gong_on_confirm();

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
revoke all on private.gong_last from public, anon, authenticated;

insert into private.schema_migrations (name) values ('20261102002300_gong.sql') on conflict do nothing;
