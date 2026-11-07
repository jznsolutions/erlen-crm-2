-- =============================================================================
-- ERLEN CRM – Partner-Abgleich ohne manuelle Freigabe
--   Die Zahlen kommen aus dem Partner-CRM und werden von der Leitung eingespielt.
--   Deshalb gelten sie auch für eigene Leads sofort (bestätigt bzw. storniert) –
--   keine zweite Person muss mehr freigeben. Für sonstige, von Hand erfasste
--   Leistungen bleibt das Vier-Augen-Prinzip unverändert.
-- =============================================================================

create or replace function public.partner_sync_apply(p_rows jsonb)
returns table (idx int, action text, message text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  row_ jsonb;
  i int := 0;
  v_user uuid;
  v_product uuid;
  v_date date;
  v_qty int;
  v_ref text;
  v_target text;
  rec public.performance_records;
  v_id uuid;
  v_reason text := 'Laut Partner-CRM';
begin
  perform private.require_permission('performance.approve');
  perform private.require_permission('performance.update');
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 2000 then raise exception 'Höchstens 2000 Zeilen pro Abgleich.'; end if;

  for row_ in select * from jsonb_array_elements(p_rows) loop
    i := i + 1;
    begin
      v_user := (row_ ->> 'user_id')::uuid;
      v_product := (row_ ->> 'product_id')::uuid;
      v_date := (row_ ->> 'occurred_on')::date;
      v_qty := coalesce((row_ ->> 'quantity')::int, 1);
      v_ref := nullif(trim(row_ ->> 'ref'), '');
      v_target := row_ ->> 'target';
      if v_target not in ('eingereicht', 'bestaetigt', 'storniert') then raise exception 'Unbekannter Status'; end if;
      if v_ref is null or char_length(v_ref) > 120 then raise exception 'Auftragsnummer fehlt'; end if;
      if not private.is_active_user(v_user) or not private.can_access_user(v_actor, v_user, 'performance') then
        raise exception 'Mitarbeiter nicht gefunden oder nicht in deinem Bereich';
      end if;
      if not exists (select 1 from public.products where id = v_product and is_active) then raise exception 'Produkt nicht gefunden'; end if;
      if v_qty < 1 or v_qty > 1000 then raise exception 'Ungültige Menge'; end if;
      if v_date is null or v_date > private.today_berlin() or v_date < private.today_berlin() - 400 then raise exception 'Ungültiges Datum'; end if;

      select * into rec from public.performance_records
       where product_id = v_product and lower(external_ref) = lower(v_ref) and status in ('entwurf', 'eingereicht', 'bestaetigt')
       order by created_at desc limit 1;

      if rec.id is null then
        if v_target = 'storniert' then
          -- Storno eines bei uns schon stornierten oder nie erfassten Auftrags
          if exists (select 1 from public.performance_records where product_id = v_product and lower(external_ref) = lower(v_ref) and status = 'storniert') then
            idx := i; action := 'unveraendert'; message := 'bereits storniert'; return next; continue;
          end if;
          idx := i; action := 'uebersprungen'; message := 'Storno ohne erfassten Auftrag'; return next; continue;
        end if;
        insert into public.performance_records (user_id, team_id, product_id, occurred_on, quantity, external_ref, note, status,
                                                created_by, submitted_at, confirmed_at, confirmed_by)
        values (v_user, private.current_team_id(v_user), v_product, v_date, v_qty, v_ref, 'Aus Partner-CRM übernommen', v_target::public.performance_status,
                v_actor, now(), case when v_target = 'bestaetigt' then now() end, case when v_target = 'bestaetigt' then v_actor end)
        returning id into v_id;
        if v_target = 'bestaetigt' then
          insert into public.performance_approvals (record_id, decision, comment, actor_id) values (v_id, 'bestaetigt', v_reason, v_actor);
          perform private.check_target_achievements(v_user, v_date);
        end if;
        idx := i; action := 'angelegt'; message := v_target; return next; continue;
      end if;

      if rec.user_id <> v_user then
        raise exception 'Auftragsnummer ist bei uns einer anderen Person zugeordnet';
      end if;
      if v_target = 'storniert' and rec.status in ('eingereicht', 'bestaetigt') then
        update public.performance_records set status = 'storniert', cancelled_at = now(), cancelled_by = v_actor, status_reason = v_reason where id = rec.id;
        insert into public.performance_adjustments (record_id, action, from_status, to_status, reason, actor_id)
        values (rec.id, 'storniert', rec.status, 'storniert', v_reason, v_actor);
        perform private.notify(rec.user_id, 'leistung_storniert', 'Leistung storniert', v_reason || ' (Auftrag ' || v_ref || ')', '/leistungen');
        idx := i; action := 'storniert'; message := null; return next; continue;
      end if;
      if v_target = 'bestaetigt' and rec.status in ('entwurf', 'eingereicht') then
        update public.performance_records
           set status = 'bestaetigt', submitted_at = coalesce(submitted_at, now()), confirmed_at = now(), confirmed_by = v_actor, status_reason = null
         where id = rec.id;
        insert into public.performance_approvals (record_id, decision, comment, actor_id) values (rec.id, 'bestaetigt', v_reason, v_actor);
        perform private.check_target_achievements(rec.user_id, rec.occurred_on);
        idx := i; action := 'bestaetigt'; message := null; return next; continue;
      end if;
      idx := i; action := 'unveraendert'; message := null; return next;
    exception when others then
      idx := i; action := 'fehler'; message := sqlerrm; return next;
    end;
  end loop;
end;
$$;

create or replace function public.partner_counts_apply(p_rows jsonb)
returns table (idx int, added int, cancelled int, message text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  row_ jsonb;
  i int := 0;
  v_user uuid;
  v_cat text;
  v_product uuid;
  v_new int;
  v_total int;
  v_prev int;
  v_rows jsonb;
  r record;
  v_add int;
  v_cancel int;
  v_err text;
begin
  perform private.require_permission('performance.approve');
  perform private.require_permission('performance.update');
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500 then raise exception 'Höchstens 500 Zeilen pro Abgleich.'; end if;

  for row_ in select * from jsonb_array_elements(p_rows) loop
    i := i + 1;
    begin
      v_user := (row_ ->> 'user_id')::uuid;
      v_cat := nullif(trim(row_ ->> 'category'), '');
      v_product := (row_ ->> 'product_id')::uuid;
      v_new := (row_ ->> 'qualified')::int;
      v_total := (row_ ->> 'total')::int;
      if v_cat is null or char_length(v_cat) > 40 then raise exception 'Kategorie fehlt'; end if;
      if v_new is null or v_new < 0 or v_new > 100000 then raise exception 'Ungültige Anzahl'; end if;
      if not private.is_active_user(v_user) or not private.can_access_user(v_actor, v_user, 'performance') then
        raise exception 'Mitarbeiter nicht gefunden oder nicht in deinem Bereich';
      end if;

      select qualified into v_prev from public.partner_lead_counts where user_id = v_user and category = v_cat for update;
      if v_prev is null and coalesce((row_ ->> 'start_only')::boolean, false) then
        insert into public.partner_lead_counts (user_id, category, qualified, total, updated_by) values (v_user, v_cat, v_new, v_total, v_actor);
        idx := i; added := 0; cancelled := 0; message := 'Startwert gespeichert'; return next; continue;
      end if;
      v_prev := coalesce(v_prev, 0);
      if v_new - v_prev > 1000 then raise exception 'Mehr als 1000 neue Leads auf einmal – bitte Zahl prüfen'; end if;

      -- neue Leads (laufende Nummern prev+1 … new) bzw. Stornos (new+1 … prev)
      select coalesce(jsonb_agg(jsonb_build_object(
               'user_id', v_user, 'product_id', v_product, 'occurred_on', private.today_berlin(), 'quantity', 1,
               'ref', 'L:' || v_user || ':' || v_cat || ':' || n,
               'target', case when n <= v_new then 'bestaetigt' else 'storniert' end)), '[]'::jsonb)
        into v_rows
        from generate_series(least(v_prev, v_new) + 1, greatest(v_prev, v_new)) n;

      v_add := 0; v_cancel := 0; v_err := null;
      for r in select * from public.partner_sync_apply(v_rows) loop
        if r.action = 'angelegt' then
          v_add := v_add + 1;
        elsif r.action = 'storniert' then v_cancel := v_cancel + 1;
        elsif r.action = 'fehler' then v_err := r.message;
        end if;
      end loop;
      if v_err is not null then raise exception '%', v_err; end if;

      insert into public.partner_lead_counts (user_id, category, qualified, total, updated_at, updated_by)
      values (v_user, v_cat, v_new, v_total, now(), v_actor)
      on conflict (user_id, category) do update set qualified = excluded.qualified, total = excluded.total, updated_at = now(), updated_by = v_actor;

      idx := i; added := v_add; cancelled := v_cancel;
      message := null;
      return next;
    exception when others then
      idx := i; added := 0; cancelled := 0; message := sqlerrm; return next;
    end;
  end loop;
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
revoke execute on function public.badge_watch() from authenticated;
revoke execute on function public.weekly_review_run(timestamptz) from authenticated;
grant execute on all functions in schema private to authenticated, service_role;
revoke execute on all functions in schema private from public, anon;

insert into private.schema_migrations (name) values ('20261108002800_partner_sync_self.sql') on conflict do nothing;
