-- =============================================================================
-- ERLEN CRM – Push-Benachrichtigungen aufs Handy (Web Push)
--   Jede neue Benachrichtigung im Portal wird zusätzlich an die Geräte des
--   Mitarbeiters geschickt, auf denen er Push-Benachrichtigungen aktiviert hat.
-- =============================================================================

-- Geräte (Browser) eines Mitarbeiters
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  user_agent text check (user_agent is null or char_length(user_agent) <= 300),
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
create policy push_subscriptions_select on public.push_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.push_subscribe(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.is_active_user(auth.uid()) then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent;
end;
$$;

create or replace function public.push_unsubscribe(p_endpoint text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
end;
$$;

-- Schlüsselpaar (VAPID) für den Versand – wird beim ersten Gebrauch erzeugt und nur serverseitig gelesen
create table private.app_secrets (
  key text primary key,
  value text not null,
  created_at timestamptz not null default now()
);

create or replace function public.push_vapid_keys(p_public text default null, p_private text default null)
returns table (public_key text, private_key text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_public is not null and p_private is not null then
    insert into private.app_secrets (key, value) values ('vapid_public', p_public), ('vapid_private', p_private)
    on conflict (key) do nothing;
  end if;
  return query
    select (select value from private.app_secrets where key = 'vapid_public'),
           (select value from private.app_secrets where key = 'vapid_private');
end;
$$;

-- Versandstatus je Benachrichtigung; bestehende gelten als bereits zugestellt
alter table public.notifications add column pushed_at timestamptz;
update public.notifications set pushed_at = now() where pushed_at is null;

-- Offene Benachrichtigungen für den Versand „beanspruchen“ (nur Server)
create or replace function public.push_claim_pending()
returns table (notification_id uuid, user_id uuid, title text, body text, link text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
    update public.notifications n set pushed_at = now()
     where n.pushed_at is null and n.created_at > now() - interval '1 day'
    returning n.id, n.user_id, n.title, n.body, n.link;
end;
$$;

create or replace function public.push_subscriptions_for(p_users uuid[])
returns table (id uuid, user_id uuid, endpoint text, p256dh text, auth text)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.user_id, s.endpoint, s.p256dh, s.auth
  from public.push_subscriptions s join public.profiles p on p.id = s.user_id
  where s.user_id = any (p_users) and p.status = 'aktiv';
$$;

create or replace function public.push_subscription_remove(p_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_subscriptions where id = p_id;
$$;

-- Sofortzustellung: Bei neuer Benachrichtigung ruft die Datenbank (pg_net) den Versand-Endpunkt auf.
-- Adresse und Schlüssel werden über „Automatische Erinnerungen & Push aktivieren“ hinterlegt.
create or replace function private.push_hook()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text := (select value from private.app_secrets where key = 'push_hook_url');
  v_secret text := (select value from private.app_secrets where key = 'push_hook_secret');
begin
  if v_url is null or v_secret is null or to_regproc('net.http_post') is null then
    return null;
  end if;
  begin
    execute 'select net.http_post(url := $1, headers := jsonb_build_object(''Authorization'', $2, ''Content-Type'', ''application/json''), body := ''{}''::jsonb, timeout_milliseconds := 20000)'
      using v_url, 'Bearer ' || v_secret;
  exception when others then
    -- Versand darf das Anlegen der Benachrichtigung nie verhindern (Zeitplaner stellt nach)
    null;
  end;
  return null;
end;
$$;
create trigger notifications_push_hook after insert on public.notifications
  for each statement execute function private.push_hook();

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
grant execute on all functions in schema private to authenticated, service_role;
revoke execute on all functions in schema private from public, anon;

insert into private.schema_migrations (name) values ('20261031001100_push_notifications.sql') on conflict do nothing;
