-- =============================================================================
-- ERLEN CRM – Bewerber-Pipeline (Kanban): zusätzlicher Schritt „Probetag“
--   und Verschieben einer Bewerbung ohne die Notiz zu verändern.
-- =============================================================================

alter type public.applicant_status add value if not exists 'probetag' after 'gespraech';

create or replace function public.applicant_move(p_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_permission('applicants.manage');
  if p_status not in ('neu', 'kontaktiert', 'gespraech', 'probetag', 'angenommen', 'abgelehnt') then
    raise exception 'Unbekannter Status';
  end if;
  update public.applicants
     set status = p_status::public.applicant_status, handled_by = auth.uid()
   where id = p_id;
  if not found then raise exception 'Bewerbung nicht gefunden'; end if;
end;
$$;

-- Löschkonzept: alle Status inkl. Probetag
create or replace function public.purge_applicants(p_days int default 180)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  delete from public.applicants
   where updated_at < now() - make_interval(days => greatest(p_days, 30));
  get diagnostics v_count = row_count;
  return v_count;
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
grant execute on all functions in schema private to authenticated, service_role;
revoke execute on all functions in schema private from public, anon;

insert into private.schema_migrations (name) values ('20261101001700_applicant_pipeline.sql') on conflict do nothing;
