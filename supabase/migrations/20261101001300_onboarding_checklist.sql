-- =============================================================================
-- ERLEN CRM – Start-Checkliste für neue Mitarbeiter
--   Profil vervollständigen, Abrechnungsdaten, Pflicht-Unterlagen, Pflichtschulungen,
--   Push-Benachrichtigungen. Welche Unterlagen Pflicht sind, legt die Verwaltung fest.
-- =============================================================================

insert into public.organization_settings (key, value, description) values
  ('onboarding', '{"required_documents": ["gewerbeanmeldung", "personalausweis"]}',
   'Start-Checkliste: Pflicht-Unterlagen neuer Mitarbeiter')
on conflict (key) do nothing;

create or replace function public.onboarding_settings_save(p_required_documents text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_permission('settings.manage');
  if exists (select 1 from unnest(coalesce(p_required_documents, '{}')) d
              where d not in ('gewerbeanmeldung', 'fuehrerschein', 'personalausweis', 'steuer', 'bankdaten', 'vertrag', 'nachweis')) then
    raise exception 'Unbekannte Unterlage';
  end if;
  update public.organization_settings
     set value = jsonb_build_object('required_documents', to_jsonb(coalesce(p_required_documents, '{}'))), updated_by = auth.uid(), updated_at = now()
   where key = 'onboarding';
end;
$$;

-- Stand der Checkliste einer Person (selbst oder mit Verwaltungsrechten)
create or replace function public.onboarding_status(p_user uuid default null)
returns table (key text, label text, done boolean, required boolean, link text, sort int)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := coalesce(p_user, auth.uid());
  v_profile public.profiles;
  v_details public.employee_details;
  v_billing public.employee_billing;
  v_docs text[] := coalesce(
    (select array_agg(x) from jsonb_array_elements_text(
       (select os.value -> 'required_documents' from public.organization_settings os where os.key = 'onboarding')) x),
    '{}');
begin
  if auth.uid() is null or not (
       (v_user = auth.uid() and private.is_active_user(auth.uid()))
       or private.has_permission(auth.uid(), 'employee_docs.manage')
       or private.has_permission(auth.uid(), 'employees.update')) then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  select * into v_profile from public.profiles where id = v_user;
  select * into v_details from public.employee_details where user_id = v_user;
  select * into v_billing from public.employee_billing where user_id = v_user;

  return query
    select 'foto', 'Profilbild hochladen', v_profile.avatar_path is not null, true, '/profil', 1
    union all
    select 'telefon', 'Telefonnummer eintragen', v_details.phone is not null, true, '/profil', 2
    union all
    select 'anschrift', 'Anschrift für Gutschriften eintragen',
           v_billing.street is not null and v_billing.postal_code is not null and v_billing.city is not null, true, '/profil#abrechnungsdaten', 3
    union all
    select 'iban', 'IBAN für Auszahlungen eintragen', v_billing.iban is not null, true, '/profil#abrechnungsdaten', 4
    union all
    select 'steuer', 'Steuernummer oder USt-IdNr. eintragen',
           v_billing.tax_number is not null or v_billing.vat_id is not null, true, '/profil#abrechnungsdaten', 5
    union all
    select 'unterlage_' || d,
           (case d when 'gewerbeanmeldung' then 'Gewerbeanmeldung' when 'fuehrerschein' then 'Führerschein'
                   when 'personalausweis' then 'Personalausweis oder Reisepass' when 'steuer' then 'Steuerunterlagen'
                   when 'bankdaten' then 'Bankdaten' when 'vertrag' then 'Unterschriebenen Vertrag' else 'Nachweis' end) || ' hochladen',
           exists (select 1 from public.employee_documents ed where ed.user_id = v_user and ed.category = d and ed.status <> 'abgelehnt'),
           true, '/unterlagen', 10 + ordinality::int
    from unnest(v_docs) with ordinality d
    union all
    select 'schulungen', 'Pflichtschulungen abschließen',
           not exists (
             select 1 from public.course_assignments ca
             where ca.user_id = v_user and ca.is_mandatory
               and exists (select 1 from public.lessons l join public.course_modules m on m.id = l.module_id
                            where m.course_id = ca.course_id and l.is_published
                              and not exists (select 1 from public.lesson_progress lp
                                               where lp.lesson_id = l.id and lp.user_id = v_user and lp.status = 'abgeschlossen'))),
           true, '/academy', 30
    union all
    select 'push', 'Benachrichtigungen aufs Handy aktivieren (empfohlen)',
           exists (select 1 from public.push_subscriptions s where s.user_id = v_user), false, '/benachrichtigungen', 40
    order by 6;
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

insert into private.schema_migrations (name) values ('20261101001300_onboarding_checklist.sql') on conflict do nothing;
