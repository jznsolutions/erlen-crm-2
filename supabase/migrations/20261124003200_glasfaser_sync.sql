-- =============================================================================
-- ERLEN CRM – Glasfaser-Abgleich mit dem Partner-CRM (Screenshot der Auftragsliste)
--   Alle (auch Vertriebspartner) laden einen Screenshot ihrer Auftragsliste hoch.
--   Gezählt wird je Tag und Partner-Produkt; neu hinzugekommene Verträge werden
--   automatisch als bestätigte Leistung gebucht (Kennung GF:<Person>:<Datum>:<Produkt>:<Nr>).
--   Kundendaten (Adresse) werden nicht übertragen und nicht gespeichert.
--   Monatsende: Die Leitung lädt die Stornoliste hoch → passende Verträge werden
--   storniert und in der nächsten Abrechnung abgezogen.
-- =============================================================================

insert into public.organization_settings (key, value, description) values
  ('glasfaser_sync', '{"product_map": {}, "unknown": []}', 'Glasfaser-Abgleich: Partner-Produktname → Produkt/Provisionsstufe')
on conflict (key) do nothing;

-- „E.ON Highspeed 1000“ → „e-on-highspeed-1000“
create or replace function private.gf_prodkey(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select left(trim(both '-' from regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9]+', '-', 'g')), 40);
$$;

-- Partner-Produkt → Produkt (+ Provisionsstufe) im Bereich Glasfaser
create or replace function private.gf_resolve_product(p_name text, out product_id uuid, out variant_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_area uuid := (select id from public.business_areas where key = 'glasfaser');
  v_map text := (select value -> 'product_map' ->> trim(p_name) from public.organization_settings where key = 'glasfaser_sync');
  v_num text := (select max(m[1]) from regexp_matches(coalesce(p_name, ''), '(\d{2,5})', 'g') m);
  n int;
begin
  -- 1) gespeicherte Zuordnung
  if v_map is not null and v_map <> '' then
    select p.id, nullif(split_part(v_map, ':', 2), '')::uuid into product_id, variant_id
      from public.products p where p.id = split_part(v_map, ':', 1)::uuid and p.area_id = v_area and p.is_active;
    if product_id is not null then return; end if;
  end if;
  -- 2) Provisionsstufe mit derselben Zahl (z. B. „1000“)
  if v_num is not null then
    select count(*) into n from public.product_variants v join public.products p on p.id = v.product_id
     where p.area_id = v_area and p.is_active and v.is_active and v.name ~ ('(^|\D)' || v_num || '(\D|$)');
    if n = 1 then
      select p.id, v.id into product_id, variant_id from public.product_variants v join public.products p on p.id = v.product_id
       where p.area_id = v_area and p.is_active and v.is_active and v.name ~ ('(^|\D)' || v_num || '(\D|$)');
      return;
    end if;
    select count(*) into n from public.products p where p.area_id = v_area and p.is_active and p.name ~ ('(^|\D)' || v_num || '(\D|$)');
    if n = 1 then
      select p.id into product_id from public.products p where p.area_id = v_area and p.is_active and p.name ~ ('(^|\D)' || v_num || '(\D|$)');
      return;
    end if;
  end if;
  -- 3) genau ein Glasfaser-Produkt ohne Provisionsstufen
  select count(*) into n from public.products p where p.area_id = v_area and p.is_active;
  if n = 1 then
    select p.id into product_id from public.products p where p.area_id = v_area and p.is_active
       and not exists (select 1 from public.product_variants v where v.product_id = p.id and v.is_active);
  end if;
end;
$$;

-- Zuordnungen speichern (Leitung)
create or replace function public.glasfaser_settings_save(p_product_map jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v jsonb := (select value from public.organization_settings where key = 'glasfaser_sync');
  v_map jsonb;
begin
  perform private.require_permission('performance.approve');
  if jsonb_typeof(p_product_map) <> 'object' or octet_length(p_product_map::text) > 20000 then raise exception 'Ungültige Zuordnung'; end if;
  v_map := coalesce(v -> 'product_map', '{}'::jsonb) || p_product_map;
  v_map := (select coalesce(jsonb_object_agg(k, val), '{}'::jsonb) from jsonb_each(v_map) e(k, val) where val is not null and val <> '""'::jsonb);
  update public.organization_settings
     set value = jsonb_build_object(
           'product_map', v_map,
           'unknown', coalesce((select jsonb_agg(u) from jsonb_array_elements_text(coalesce(v -> 'unknown', '[]'::jsonb)) u where not v_map ? u), '[]'::jsonb)),
         updated_by = auth.uid(), updated_at = now()
   where key = 'glasfaser_sync';
end;
$$;

-- Screenshot-Abgleich: Zeilen {partner, product_name, date, count, user_id?}
-- Vertriebspartner buchen nur für sich; die Leitung kann eine Person je Partner-Kennung wählen.
create or replace function public.glasfaser_upload_apply(p_rows jsonb)
returns table (idx int, added int, message text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_area uuid := (select id from public.business_areas where key = 'glasfaser');
  v_approver boolean := private.has_permission(auth.uid(), 'performance.approve');
  row_ jsonb;
  i int := 0;
  v_user uuid;
  v_partner text;
  v_own text;
  v_name text;
  v_date date;
  v_count int;
  v_product uuid;
  v_variant uuid;
  v_prefix text;
  v_existing int;
  v_id uuid;
  v_added int;
begin
  if v_actor is null or not private.is_active_user(v_actor) then raise exception 'Keine Berechtigung' using errcode = '42501'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 300 then raise exception 'Höchstens 300 Zeilen pro Abgleich.'; end if;
  for row_ in select * from jsonb_array_elements(p_rows) loop
    i := i + 1;
    begin
      v_partner := nullif(trim(row_ ->> 'partner'), '');
      v_name := nullif(trim(row_ ->> 'product_name'), '');
      v_date := (row_ ->> 'date')::date;
      v_count := (row_ ->> 'count')::int;
      v_user := v_actor;
      if v_approver and nullif(row_ ->> 'user_id', '') is not null then
        v_user := (row_ ->> 'user_id')::uuid;
        if v_user <> v_actor and not private.can_access_user(v_actor, v_user, 'performance') then raise exception 'Mitarbeiter nicht in deinem Bereich'; end if;
      end if;
      if v_name is null or char_length(v_name) > 120 then raise exception 'Produkt fehlt'; end if;
      if v_count is null or v_count < 1 or v_count > 50 then raise exception 'Ungültige Anzahl'; end if;
      if v_date is null or v_date > private.today_berlin() or v_date < private.today_berlin() - 400 then raise exception 'Ungültiges Datum'; end if;
      if not private.is_active_user(v_user) then raise exception 'Mitarbeiter nicht aktiv'; end if;
      if not private.has_area(v_user, v_area) then raise exception 'Für den Bereich Glasfaser nicht freigeschaltet – bitte die Leitung fragen.'; end if;

      -- Partner-Kennung (z. B. PP-ES-LJanzen): beim ersten Mal merken, danach fremde Listen erkennen
      if v_partner is not null then
        select partner_seller_id into v_own from public.employee_details where user_id = v_user;
        if v_own is null then
          if not exists (select 1 from public.employee_details where lower(partner_seller_id) = lower(v_partner) and user_id <> v_user) then
            insert into public.employee_details (user_id, partner_seller_id) values (v_user, v_partner)
            on conflict (user_id) do update set partner_seller_id = excluded.partner_seller_id;
          elsif not v_approver then
            raise exception 'Die Partner-Kennung % gehört zu einer anderen Person.', v_partner;
          end if;
        elsif lower(v_own) <> lower(v_partner) and not v_approver then
          idx := i; added := 0; message := 'Fremde Partner-Kennung ' || v_partner || ' – übersprungen'; return next; continue;
        end if;
      end if;

      select r.product_id, r.variant_id into v_product, v_variant from private.gf_resolve_product(v_name) r;
      if v_product is null then
        update public.organization_settings
           set value = jsonb_set(value, '{unknown}', (select coalesce(jsonb_agg(distinct u), '[]'::jsonb)
                       from (select jsonb_array_elements_text(coalesce(value -> 'unknown', '[]'::jsonb)) u union select v_name) x))
         where key = 'glasfaser_sync';
        idx := i; added := 0; message := 'Produkt „' || v_name || '“ ist noch keinem Glasfaser-Produkt zugeordnet – die Leitung ordnet es einmalig zu.';
        return next; continue;
      end if;

      v_prefix := 'GF:' || v_user || ':' || to_char(v_date, 'YYYYMMDD') || ':' || private.gf_prodkey(v_name) || ':';
      select count(*) into v_existing from public.performance_records where user_id = v_user and external_ref like v_prefix || '%';
      v_added := 0;
      for n in v_existing + 1 .. v_count loop
        insert into public.performance_records (user_id, team_id, product_id, variant_id, occurred_on, quantity, external_ref, note, status,
                                                created_by, submitted_at, confirmed_at, confirmed_by)
        values (v_user, private.current_team_id(v_user), v_product, v_variant, v_date, 1, v_prefix || n, 'Glasfaser-Abgleich (Partner-CRM)', 'bestaetigt',
                v_actor, now(), now(), v_actor)
        returning id into v_id;
        insert into public.performance_approvals (record_id, decision, comment, actor_id) values (v_id, 'bestaetigt', 'Laut Partner-CRM', v_actor);
        v_added := v_added + 1;
      end loop;
      if v_added > 0 then perform private.check_target_achievements(v_user, v_date); end if;
      idx := i; added := v_added; message := null; return next;
    exception when others then
      idx := i; added := 0; message := sqlerrm; return next;
    end;
  end loop;
end;
$$;

-- Stornoliste (Monatsende, Leitung): Zeilen {user_id, product_name, date?, reason?}
-- Je Zeile wird ein passender aktiver Vertrag storniert (gleiche Person, gleicher Tag, gleiches Produkt).
create or replace function public.glasfaser_storno_apply(p_rows jsonb)
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
  v_date date;
  v_key text;
  v_reason text;
  rec public.performance_records;
begin
  perform private.require_permission('performance.approve');
  perform private.require_permission('performance.update');
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 1000 then raise exception 'Höchstens 1000 Zeilen.'; end if;
  for row_ in select * from jsonb_array_elements(p_rows) loop
    i := i + 1;
    begin
      v_user := (row_ ->> 'user_id')::uuid;
      v_date := nullif(row_ ->> 'date', '')::date;
      v_key := private.gf_prodkey(row_ ->> 'product_name');
      v_reason := coalesce(nullif(trim(row_ ->> 'reason'), ''), 'Storno laut Partner-Liste');
      if not private.can_access_user(v_actor, v_user, 'performance') then raise exception 'Mitarbeiter nicht in deinem Bereich'; end if;
      rec := null;
      -- gleicher Tag und gleiches Produkt, sonst gleicher Tag, sonst gleiches Produkt (neuester zuerst)
      select * into rec from public.performance_records r
       where r.user_id = v_user and r.external_ref like 'GF:%' and r.status in ('eingereicht', 'bestaetigt')
         and (v_date is null or r.occurred_on = v_date)
       order by (split_part(r.external_ref, ':', 4) = v_key) desc, r.occurred_on desc, r.created_at desc
       limit 1;
      if rec.id is null and v_date is not null then
        idx := i; action := 'nicht_gefunden'; message := 'Kein offener Vertrag an diesem Tag gefunden'; return next; continue;
      end if;
      if rec.id is null then
        idx := i; action := 'nicht_gefunden'; message := 'Kein offener Vertrag gefunden'; return next; continue;
      end if;
      update public.performance_records set status = 'storniert', cancelled_at = now(), cancelled_by = v_actor, status_reason = v_reason where id = rec.id;
      insert into public.performance_adjustments (record_id, action, from_status, to_status, reason, actor_id)
      values (rec.id, 'storniert', rec.status, 'storniert', v_reason, v_actor);
      perform private.notify(rec.user_id, 'leistung_storniert', 'Glasfaser-Vertrag storniert',
                             v_reason || ' (Auftrag vom ' || to_char(rec.occurred_on, 'DD.MM.YYYY') || ')', '/leistungen');
      idx := i; action := 'storniert'; message := to_char(rec.occurred_on, 'DD.MM.YYYY'); return next;
    exception when others then
      idx := i; action := 'fehler'; message := sqlerrm; return next;
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
revoke execute on function public.monthly_report_data(date, date, uuid) from authenticated;
revoke execute on function public.monthly_report_recipients() from authenticated;
revoke execute on function public.monthly_report_claim(text) from authenticated;
revoke execute on function public.referral_resolve(text) from authenticated;
revoke execute on function public.career_watch() from authenticated;
revoke execute on function public.badge_watch() from authenticated;
revoke execute on function public.weekly_review_run(timestamptz) from authenticated;
grant execute on all functions in schema private to authenticated, service_role;
revoke execute on all functions in schema private from public, anon;

insert into private.schema_migrations (name) values ('20261124003200_glasfaser_sync.sql') on conflict do nothing;
