-- =============================================================================
-- ERLEN CRM – Erinnerung an ablaufende Unterlagen (Feld „gültig bis“)
--   30 Tage vorher und nach Ablauf (Tag nach „gültig bis“): Benachrichtigung an die Person und an die
--   Verwaltung (employee_docs.manage). Jede Erinnerung nur einmal. Nur serverseitig.
-- =============================================================================

alter table public.employee_documents
  add column if not exists expiry_warned_at timestamptz,
  add column if not exists expired_notified_at timestamptz;

create or replace function public.document_expiry_watch()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  d record;
  v_today date := private.today_berlin();
  v_sent int := 0;
  v_label text;
  v_expired boolean;
begin
  for d in
    select ed.*, p.first_name || ' ' || p.last_name as person
    from public.employee_documents ed
    join public.profiles p on p.id = ed.user_id and p.status = 'aktiv'
    where ed.valid_until is not null
      and ed.status <> 'abgelehnt'
      and ((ed.valid_until < v_today and ed.expired_notified_at is null)
           or (ed.valid_until >= v_today and ed.valid_until <= v_today + 30 and ed.expiry_warned_at is null))
      -- Nur die neueste Unterlage je Art: wer schon eine neuere hochgeladen hat, wird nicht erinnert
      and not exists (
        select 1 from public.employee_documents n
        where n.user_id = ed.user_id and n.category = ed.category and n.status <> 'abgelehnt'
          and n.id <> ed.id and coalesce(n.valid_until, 'infinity'::date) > ed.valid_until)
  loop
    v_expired := d.valid_until < v_today;
    v_label := case d.category when 'gewerbeanmeldung' then 'Gewerbeanmeldung' when 'fuehrerschein' then 'Führerschein'
                 when 'personalausweis' then 'Personalausweis' when 'steuer' then 'Steuerunterlagen' when 'bankdaten' then 'Bankdaten'
                 when 'vertrag' then 'Vertrag' when 'nachweis' then 'Nachweis' else 'Unterlage' end
               || coalesce(' (' || d.title || ')', '');
    perform private.notify(d.user_id, 'unterlage_ablauf',
      case when v_expired then v_label || ' ist abgelaufen' else v_label || ' läuft bald ab' end,
      case when v_expired then 'Gültig bis ' || to_char(d.valid_until, 'DD.MM.YYYY') || '. Bitte lade eine aktuelle Version hoch.'
           else 'Gültig bis ' || to_char(d.valid_until, 'DD.MM.YYYY') || '. Bitte rechtzeitig eine neue Version hochladen.' end,
      '/unterlagen');
    perform private.notify(p.id, 'unterlage_ablauf',
      case when v_expired then 'Abgelaufen: ' else 'Läuft bald ab: ' end || v_label || ' – ' || d.person,
      'Gültig bis ' || to_char(d.valid_until, 'DD.MM.YYYY'),
      '/mitarbeiter/' || d.user_id || '#unterlagen')
    from public.profiles p
    where p.status = 'aktiv' and p.id <> d.user_id and private.has_permission(p.id, 'employee_docs.manage');
    if v_expired then
      update public.employee_documents set expired_notified_at = now(), expiry_warned_at = coalesce(expiry_warned_at, now()) where id = d.id;
    else
      update public.employee_documents set expiry_warned_at = now() where id = d.id;
    end if;
    v_sent := v_sent + 1;
  end loop;
  return v_sent;
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
grant execute on all functions in schema private to authenticated, service_role;
revoke execute on all functions in schema private from public, anon;

insert into private.schema_migrations (name) values ('20261101001800_document_expiry.sql') on conflict do nothing;
