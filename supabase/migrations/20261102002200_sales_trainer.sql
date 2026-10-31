-- =============================================================================
-- ERLEN CRM – KI-Verkaufstrainer: Ergebnisse der Übungsgespräche
--   Gespeichert werden nur Szenario, Note und Feedback (kein Gesprächsprotokoll).
--   Sichtbar für die Person selbst und für alle, die ihren Lernfortschritt sehen dürfen.
-- =============================================================================

create table if not exists public.sales_trainings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  scenario text not null check (scenario in ('glasfaser', 'energie', 'pv')),
  difficulty text not null check (difficulty in ('leicht', 'mittel', 'schwer')),
  score int not null check (score between 0 and 100),
  outcome text not null check (outcome in ('abschluss', 'termin', 'offen', 'abgelehnt')),
  turns int not null check (turns between 1 and 100),
  feedback jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists sales_trainings_user_idx on public.sales_trainings (user_id, created_at desc);

alter table public.sales_trainings enable row level security;
drop policy if exists sales_trainings_select on public.sales_trainings;
create policy sales_trainings_select on public.sales_trainings for select to authenticated
  using (
    (user_id = (select auth.uid()) and private.is_active_user((select auth.uid())))
    or user_id in (select private.visible_user_ids((select auth.uid()), 'training.progress'))
  );

create or replace function public.sales_training_save(
  p_scenario text, p_difficulty text, p_score int, p_outcome text, p_turns int, p_feedback jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null or not private.is_active_user(auth.uid()) or not private.has_permission(auth.uid(), 'training.read') then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  if octet_length(p_feedback::text) > 20000 then raise exception 'Feedback zu groß'; end if;
  insert into public.sales_trainings (user_id, scenario, difficulty, score, outcome, turns, feedback)
  values (auth.uid(), p_scenario, p_difficulty, p_score, p_outcome, p_turns, p_feedback)
  returning id into v_id;
  return v_id;
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
grant execute on all functions in schema private to authenticated, service_role;
revoke execute on all functions in schema private from public, anon;

insert into private.schema_migrations (name) values ('20261102002200_sales_trainer.sql') on conflict do nothing;
