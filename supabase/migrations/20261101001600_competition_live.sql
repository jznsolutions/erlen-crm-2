-- =============================================================================
-- ERLEN CRM – Wettbewerbe live: Platzierungen merken und bei Änderungen benachrichtigen
--   * „Du wurdest überholt“ (wer einen Platz unter den ersten 3 verliert)
--   * „Du bist auf Platz 1“
--   * Nach Ende: Ergebnis an die ersten 3
--   Läuft über den Zeitplaner (alle 5 Minuten), nur serverseitig.
-- =============================================================================

alter table public.competitions add column if not exists finished_notified_at timestamptz;

create table if not exists private.competition_standings (
  competition_id uuid not null references public.competitions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  rank int not null,
  total bigint not null,
  updated_at timestamptz not null default now(),
  primary key (competition_id, user_id)
);

-- Rangliste eines Wettbewerbs (gleiche Regeln wie das Ranking: nur bestätigte Leistungen, aktive Personen)
create or replace function private.competition_ranking(p_competition uuid, p_to date)
returns table (user_id uuid, rank int, total bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with c as (select * from public.competitions where id = p_competition),
  totals as (
    select r.user_id, sum(r.quantity)::bigint as total
    from public.performance_records r, c
    where r.status = 'bestaetigt'
      and r.occurred_on between c.starts_on and least(c.ends_on, p_to)
      and (c.product_id is null or r.product_id = c.product_id)
      and (c.team_id is null or r.team_id = c.team_id)
    group by r.user_id
  )
  select t.user_id, (rank() over (order by t.total desc))::int, t.total
  from totals t
  join public.profiles p on p.id = t.user_id and p.status = 'aktiv';
$$;

-- Darf die Person Wettbewerbs-Platzierungen sehen? (Rankings an, Recht und Rolle freigegeben)
create or replace function private.may_see_competition(p_user uuid, p_team uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((private.setting('rankings') ->> 'enabled')::boolean, false)
     and private.has_permission(p_user, 'rankings.read')
     and exists (
       select 1 from public.profiles p join public.roles r on r.id = p.role_id
       where p.id = p_user
         and (private.setting('rankings') -> (case when p_team is null then 'agency_roles' else 'team_roles' end)) ? r.key);
$$;

create or replace function public.competition_watch()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.competitions;
  s record;
  v_today date := private.today_berlin();
  v_first boolean;
  v_sent int := 0;
begin
  if not coalesce((private.setting('rankings') ->> 'enabled')::boolean, false) then
    return 0;
  end if;

  -- Laufende Wettbewerbe
  for c in select * from public.competitions where is_active and v_today between starts_on and ends_on loop
    v_first := not exists (select 1 from private.competition_standings cs where cs.competition_id = c.id);
    for s in
      select n.user_id, n.rank, n.total, o.rank as old_rank
      from private.competition_ranking(c.id, v_today) n
      left join private.competition_standings o on o.competition_id = c.id and o.user_id = n.user_id
    loop
      if not v_first and private.may_see_competition(s.user_id, c.team_id) then
        if s.rank = 1 and coalesce(s.old_rank, 0) <> 1 then
          perform private.notify(s.user_id, 'wettbewerb', 'Du bist auf Platz 1! 🏆', c.title || ' – weiter so!', '/ziele');
          v_sent := v_sent + 1;
        elsif s.old_rank is not null and s.old_rank <= 3 and s.rank > s.old_rank then
          perform private.notify(s.user_id, 'wettbewerb', 'Du wurdest überholt', c.title || ': jetzt Platz ' || s.rank || ' (vorher ' || s.old_rank || ').', '/ziele');
          v_sent := v_sent + 1;
        end if;
      end if;
      insert into private.competition_standings (competition_id, user_id, rank, total, updated_at)
      values (c.id, s.user_id, s.rank, s.total, now())
      on conflict (competition_id, user_id) do update set rank = excluded.rank, total = excluded.total, updated_at = now();
    end loop;
    -- Wer aus der Wertung gefallen ist (z. B. Storno auf 0), verliert den gespeicherten Platz
    delete from private.competition_standings cs
     where cs.competition_id = c.id
       and not exists (select 1 from private.competition_ranking(c.id, v_today) n where n.user_id = cs.user_id);
  end loop;

  -- Beendete Wettbewerbe: Ergebnis an die ersten 3 (einmalig, bis 7 Tage nach Ende)
  for c in select * from public.competitions
            where is_active and ends_on < v_today and ends_on >= v_today - 7 and finished_notified_at is null loop
    for s in select * from private.competition_ranking(c.id, c.ends_on) n where n.rank <= 3 loop
      if private.may_see_competition(s.user_id, c.team_id) then
        perform private.notify(s.user_id, 'wettbewerb',
          case s.rank when 1 then 'Gewonnen! 🏆 ' else 'Platz ' || s.rank || ' 🎉 ' end || c.title,
          'Der Wettbewerb ist beendet. Du hast Platz ' || s.rank || ' mit ' || s.total || ' erreicht.', '/ziele');
        v_sent := v_sent + 1;
      end if;
    end loop;
    update public.competitions set finished_notified_at = now() where id = c.id;
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
grant execute on all functions in schema private to authenticated, service_role;
revoke execute on all functions in schema private from public, anon;
revoke all on private.competition_standings from public, anon, authenticated;

insert into private.schema_migrations (name) values ('20261101001600_competition_live.sql') on conflict do nothing;
