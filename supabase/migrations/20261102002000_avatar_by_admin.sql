-- =============================================================================
-- ERLEN CRM – Profilbild durch die Verwaltung setzen
--   Wer Stammdaten bearbeiten darf (employees.update) und die Person sehen darf,
--   kann ihr Profilbild hochladen, ändern oder entfernen.
-- =============================================================================

-- Darf p_viewer Dateien im Avatar-Ordner p_folder ablegen? (eigener Ordner oder Verwaltung)
create or replace function private.can_write_avatar(p_viewer uuid, p_folder text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_active_user(p_viewer) and (
    p_folder = p_viewer::text
    or (p_folder ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and private.has_permission(p_viewer, 'employees.update')
        and private.can_access_user(p_viewer, p_folder::uuid, 'employees')));
$$;

drop policy if exists storage_avatars_insert on storage.objects;
create policy storage_avatars_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and private.can_write_avatar((select auth.uid()), split_part(name, '/', 1)));

create or replace function public.admin_set_avatar(p_user uuid, p_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_permission('employees.update');
  if not private.can_access_user(auth.uid(), p_user, 'employees') then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  if p_path is not null then
    if p_path not like (p_user::text || '/%') then raise exception 'Ungültiger Dateipfad'; end if;
    if not exists (select 1 from storage.objects where bucket_id = 'avatars' and name = p_path) then
      raise exception 'Datei wurde nicht gefunden. Bitte erneut hochladen.';
    end if;
  end if;
  update public.profiles set avatar_path = p_path where id = p_user and anonymized_at is null;
  if not found then raise exception 'Benutzer nicht gefunden'; end if;
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

insert into private.schema_migrations (name) values ('20261102002000_avatar_by_admin.sql') on conflict do nothing;
