-- =============================================================================
-- ERLEN CRM – Belegnummer selbst festlegen (beim Veröffentlichen) und nachträglich ändern
-- =============================================================================

drop function if exists public.statement_publish(uuid, text, text);
create or replace function public.statement_publish(p_id uuid, p_storage_path text, p_file_name text, p_number text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.statements;
  v_year int := extract(year from (now() at time zone 'Europe/Berlin'))::int;
  v_no int;
  v_number text := upper(nullif(trim(p_number), ''));
begin
  perform private.require_permission('statements.manage');
  select * into s from public.statements where id = p_id for update;
  if s.id is null then raise exception 'Dokument nicht gefunden'; end if;
  if s.status <> 'entwurf' then raise exception 'Nur Entwürfe können veröffentlicht werden.'; end if;
  if v_number is not null then
    -- Selbst gewählte Nummer
    if v_number !~ '^[A-Z0-9][A-Z0-9/_-]{1,39}$' then
      raise exception 'Ungültige Nummer (erlaubt: Buchstaben, Ziffern, - / _; max. 40 Zeichen).';
    end if;
    if exists (select 1 from public.statements where number = v_number) then
      raise exception 'NUMMER_VERGEBEN: Die Nummer % ist bereits vergeben.', v_number;
    end if;
  else
    loop
      insert into private.statement_counters (kind, year, last_number) values (s.kind, v_year, 1)
      on conflict (kind, year) do update set last_number = private.statement_counters.last_number + 1
      returning last_number into v_no;
      v_number := private.format_statement_number(s.kind, v_year, v_no);
      exit when not exists (select 1 from public.statements where number = v_number);
    end loop;
  end if;
  update public.statements
     set number = v_number, status = 'veroeffentlicht', published_at = now(),
         storage_path = coalesce(p_storage_path, storage_path), file_name = coalesce(p_file_name, file_name)
   where id = p_id;
  perform private.notify(s.user_id, 'abrechnung_neu',
    case s.kind when 'abrechnung' then 'Neue Abrechnung verfügbar' else 'Neue Gutschrift verfügbar' end,
    s.title, '/abrechnungen');
  return v_number;
end;
$$;

-- Nummer eines veröffentlichten Belegs ändern (die App erzeugt danach das PDF neu)
create or replace function public.statement_renumber(p_id uuid, p_number text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_number text := upper(nullif(trim(p_number), ''));
begin
  perform private.require_permission('statements.manage');
  if v_number is null or v_number !~ '^[A-Z0-9][A-Z0-9/_-]{1,39}$' then
    raise exception 'Ungültige Nummer (erlaubt: Buchstaben, Ziffern, - / _; max. 40 Zeichen).';
  end if;
  if exists (select 1 from public.statements where number = v_number and id <> p_id) then
    raise exception 'NUMMER_VERGEBEN: Die Nummer % ist bereits vergeben.', v_number;
  end if;
  update public.statements set number = v_number where id = p_id and status <> 'entwurf';
  if not found then raise exception 'Nur veröffentlichte oder stornierte Belege haben eine Nummer.'; end if;
  return v_number;
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

insert into private.schema_migrations (name) values ('20261101001400_statement_manual_number.sql') on conflict do nothing;
