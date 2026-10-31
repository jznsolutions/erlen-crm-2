-- =============================================================================
-- ERLEN CRM – Zwei-Faktor-Anmeldung (Code aus einer Authenticator-App, TOTP)
--   * Wer einen zweiten Faktor eingerichtet hat, erhält erst nach Eingabe des Codes
--     (Sitzungsstufe „aal2“) Zugriff auf Daten – das prüft die Datenbank selbst.
--   * Die Verwaltung kann die Zwei-Faktor-Anmeldung für Rollen verpflichtend machen.
-- =============================================================================

insert into public.organization_settings (key, value, description) values
  ('security', '{"mfa_required_roles": []}', 'Sicherheit: Rollen mit verpflichtender Zwei-Faktor-Anmeldung')
on conflict (key) do nothing;

-- Ist die Zwei-Faktor-Pflicht für die angemeldete Person erfüllt?
-- Für andere Personen (z. B. Benachrichtigungen an Kollegen) und Server-Vorgänge immer erfüllt.
create or replace function private.mfa_satisfied(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user is distinct from auth.uid()
      or coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or (
        not exists (select 1 from auth.mfa_factors f where f.user_id = p_user and f.status = 'verified')
        and not exists (
          select 1
          from public.profiles p
          join public.roles r on r.id = p.role_id
          join public.organization_settings os on os.key = 'security'
          where p.id = p_user and coalesce(os.value -> 'mfa_required_roles', '[]'::jsonb) ? r.key)
      );
$$;

create or replace function private.has_permission(p_user uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_user
      and p.status = 'aktiv'
      and (
        exists (
          select 1 from public.user_permissions up
          where up.user_id = p.id and up.permission_key = p_permission and up.effect = 'grant'
        )
        or (
          exists (
            select 1 from public.role_permissions rp
            where rp.role_id = p.role_id and rp.permission_key = p_permission
          )
          and not exists (
            select 1 from public.user_permissions up
            where up.user_id = p.id and up.permission_key = p_permission and up.effect = 'deny'
          )
        )
      )
  ) and private.mfa_satisfied(p_user);
$$;

create or replace function private.is_active_user(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = p_user and status = 'aktiv')
     and private.mfa_satisfied(p_user);
$$;

-- Stand der Zwei-Faktor-Anmeldung der angemeldeten Person (für die Weiterleitung im Portal)
create or replace function public.mfa_status()
returns table (has_factor boolean, required boolean, aal text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified'),
    exists (
      select 1
      from public.profiles p
      join public.roles r on r.id = p.role_id
      join public.organization_settings os on os.key = 'security'
      where p.id = auth.uid() and p.status = 'aktiv'
        and coalesce(os.value -> 'mfa_required_roles', '[]'::jsonb) ? r.key),
    coalesce(auth.jwt() ->> 'aal', 'aal1')
  where auth.uid() is not null;
$$;

-- Zwei-Faktor-Stand mehrerer Personen (für Mitarbeiterprofile der Verwaltung)
create or replace function public.mfa_enrolled(p_users uuid[])
returns table (user_id uuid, enrolled boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (private.has_permission(auth.uid(), 'roles.assign') or private.has_permission(auth.uid(), 'settings.manage')) then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  return query
    select u, exists (select 1 from auth.mfa_factors f where f.user_id = u and f.status = 'verified')
    from unnest(p_users) u;
end;
$$;

create or replace function public.security_settings_save(p_mfa_required_roles text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_permission('settings.manage');
  if exists (select 1 from unnest(coalesce(p_mfa_required_roles, '{}')) r
              where r not in (select key from public.roles)) then
    raise exception 'Unbekannte Rolle';
  end if;
  update public.organization_settings
     set value = jsonb_build_object('mfa_required_roles', to_jsonb(coalesce(p_mfa_required_roles, '{}'))), updated_by = auth.uid(), updated_at = now()
   where key = 'security';
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
grant execute on all functions in schema private to authenticated, service_role;
revoke execute on all functions in schema private from public, anon;

insert into private.schema_migrations (name) values ('20261101001500_two_factor.sql') on conflict do nothing;
