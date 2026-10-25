-- =============================================================================
-- ERLEN CRM – ERLEN Academy (Kurse, Module, Lektionen, Quizze, Lernfortschritt)
-- =============================================================================
-- Fortschrittsregeln:
--  * Das Öffnen einer Lektion setzt nur "in_bearbeitung".
--  * Text-/Dokumentlektionen: Abschluss nur durch ausdrückliche Bestätigung,
--    frühestens nach der Mindestlesezeit (min_seconds) seit dem Start.
--  * Videolektionen: Abschluss, wenn mindestens 90 % der Videolänge als
--    angesehen gemeldet wurden.
--  * Quizlektionen: Abschluss ausschließlich durch ein bestandenes Quiz
--    (Auswertung serverseitig; richtige Antworten werden nie an Lernende gesendet).
--  * Ausbilder/Teamleiter können Fortschritt dokumentieren (Quelle "ausbilder").
-- =============================================================================

create type public.course_status as enum ('entwurf', 'veroeffentlicht', 'archiviert');
create type public.lesson_type as enum ('text', 'video', 'dokument', 'quiz');
create type public.progress_status as enum ('nicht_begonnen', 'in_bearbeitung', 'abgeschlossen');
create type public.completion_source as enum ('selbst', 'video', 'quiz', 'ausbilder');

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 2 and 160),
  description text,
  cover_path text,
  status public.course_status not null default 'entwurf',
  sort_order int not null default 0,
  created_by uuid references public.profiles (id),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.course_modules (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  title text not null check (char_length(title) between 2 and 160),
  description text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index course_modules_course_idx on public.course_modules (course_id, sort_order);

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.course_modules (id) on delete cascade,
  title text not null check (char_length(title) between 2 and 160),
  lesson_type public.lesson_type not null,
  content text,                       -- Markdown-Text
  video_path text,                    -- Pfad im privaten Bucket "academy"
  video_url text check (video_url is null or video_url ~ '^https://'),  -- optional: externer Player (z. B. Vimeo privat)
  document_path text,                 -- Pfad im privaten Bucket "academy"
  duration_minutes int check (duration_minutes is null or duration_minutes between 0 and 600),
  min_seconds int not null default 30 check (min_seconds between 0 and 3600),
  sort_order int not null default 0,
  is_published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index lessons_module_idx on public.lessons (module_id, sort_order);

-- Freigabe eines Kurses für Rolle, Team oder einzelne Person (genau eines davon)
create table public.course_access (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  role_id uuid references public.roles (id) on delete cascade,
  team_id uuid references public.teams (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete cascade,
  is_mandatory boolean not null default false,  -- Pflichtschulung für diese Zielgruppe
  created_at timestamptz not null default now(),
  check (num_nonnulls(role_id, team_id, user_id) = 1)
);
create unique index course_access_unique_idx
  on public.course_access (course_id, coalesce(role_id, team_id, user_id));

-- Persönliche Zuweisungen (Pflichtschulungen mit optionaler Frist)
create table public.course_assignments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  assigned_by uuid references public.profiles (id),
  due_on date,
  is_mandatory boolean not null default true,
  assigned_at timestamptz not null default now(),
  unique (course_id, user_id)
);
create index course_assignments_user_idx on public.course_assignments (user_id);

create table public.lesson_progress (
  user_id uuid not null references public.profiles (id) on delete cascade,
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  status public.progress_status not null default 'in_bearbeitung',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  completion_source public.completion_source,
  video_position_seconds int not null default 0,
  video_duration_seconds int,
  confirmed_by uuid references public.profiles (id),
  note text,
  updated_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);
create index lesson_progress_lesson_idx on public.lesson_progress (lesson_id);

create table public.quizzes (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null unique references public.lessons (id) on delete cascade,
  pass_percent int not null default 80 check (pass_percent between 1 and 100),
  max_attempts int check (max_attempts is null or max_attempts between 1 and 50),
  created_at timestamptz not null default now()
);

create table public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes (id) on delete cascade,
  question text not null check (char_length(question) between 3 and 1000),
  allows_multiple boolean not null default false,
  sort_order int not null default 0
);
create index quiz_questions_quiz_idx on public.quiz_questions (quiz_id, sort_order);

create table public.quiz_answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.quiz_questions (id) on delete cascade,
  answer text not null check (char_length(answer) between 1 and 500),
  is_correct boolean not null default false,
  sort_order int not null default 0
);
create index quiz_answers_question_idx on public.quiz_answers (question_id, sort_order);

create table public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  score_percent int not null,
  passed boolean not null,
  answers jsonb not null,
  created_at timestamptz not null default now()
);
create index quiz_attempts_user_idx on public.quiz_attempts (user_id, quiz_id);

-- Feedback und Ausbildungsnotizen
create table public.training_notes (
  id uuid primary key default gen_random_uuid(),
  trainee_id uuid not null references public.profiles (id) on delete cascade,
  author_id uuid not null references public.profiles (id),
  body text not null check (char_length(body) between 1 and 5000),
  shared_with_trainee boolean not null default false,
  created_at timestamptz not null default now()
);
create index training_notes_trainee_idx on public.training_notes (trainee_id, created_at desc);

create trigger courses_touch before update on public.courses
  for each row execute function private.touch_updated_at();
create trigger lessons_touch before update on public.lessons
  for each row execute function private.touch_updated_at();
create trigger lesson_progress_touch before update on public.lesson_progress
  for each row execute function private.touch_updated_at();

create trigger courses_audit after insert or update or delete on public.courses
  for each row execute function private.audit_trigger();
create trigger course_access_audit after insert or update or delete on public.course_access
  for each row execute function private.audit_trigger('user_id');
create trigger course_assignments_audit after insert or update or delete on public.course_assignments
  for each row execute function private.audit_trigger('user_id');
create trigger lesson_progress_audit after insert or update or delete on public.lesson_progress
  for each row execute function private.audit_trigger('user_id');

-- =============================================================================
-- Sichtbarkeit
-- =============================================================================

-- Darf p_user den Kurs nutzen? (unabhängig davon, wer fragt)
create or replace function private.course_available_to(p_user uuid, p_course uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.courses c
    where c.id = p_course
      and c.status = 'veroeffentlicht'
      and private.has_permission(p_user, 'training.read')
      and (
        exists (select 1 from public.course_assignments ca where ca.course_id = c.id and ca.user_id = p_user)
        or exists (
          select 1 from public.course_access a
          where a.course_id = c.id
            and (a.user_id = p_user
                 or a.role_id = (select role_id from public.profiles where id = p_user)
                 or a.team_id = private.current_team_id(p_user)))
      )
  );
$$;

create or replace function private.can_view_course(p_viewer uuid, p_course uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_permission(p_viewer, 'training.manage')
      or private.course_available_to(p_viewer, p_course);
$$;

create or replace function private.can_view_lesson(p_viewer uuid, p_lesson uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.lessons l
    join public.course_modules m on m.id = l.module_id
    where l.id = p_lesson
      and (private.has_permission(p_viewer, 'training.manage')
           or (l.is_published and private.course_available_to(p_viewer, m.course_id)))
  );
$$;

-- Mandatory-Kurse für einen Benutzer automatisch zuweisen (Rolle/Team)
create or replace function private.assign_mandatory_courses(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record;
begin
  for c in
    select distinct a.course_id, co.title
    from public.course_access a
    join public.courses co on co.id = a.course_id and co.status = 'veroeffentlicht'
    where a.is_mandatory
      and (a.user_id = p_user
           or a.role_id = (select role_id from public.profiles where id = p_user)
           or a.team_id = private.current_team_id(p_user))
      and not exists (select 1 from public.course_assignments x where x.course_id = a.course_id and x.user_id = p_user)
  loop
    insert into public.course_assignments (course_id, user_id, assigned_by, is_mandatory)
    values (c.course_id, p_user, auth.uid(), true);
    perform private.notify(p_user, 'schulung_zugewiesen', 'Neue Pflichtschulung: ' || c.title, null,
      '/academy/kurs/' || c.course_id::text);
  end loop;
end;
$$;

alter table public.courses enable row level security;
alter table public.course_modules enable row level security;
alter table public.lessons enable row level security;
alter table public.course_access enable row level security;
alter table public.course_assignments enable row level security;
alter table public.lesson_progress enable row level security;
alter table public.quizzes enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.quiz_answers enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.training_notes enable row level security;

create policy courses_select on public.courses for select to authenticated
  using (private.can_view_course((select auth.uid()), id));
create policy course_modules_select on public.course_modules for select to authenticated
  using (private.can_view_course((select auth.uid()), course_id));
create policy lessons_select on public.lessons for select to authenticated
  using (private.can_view_lesson((select auth.uid()), id));
create policy course_access_select on public.course_access for select to authenticated
  using (private.has_permission((select auth.uid()), 'training.manage'));
create policy course_assignments_select on public.course_assignments for select to authenticated
  using (user_id in (select private.visible_user_ids((select auth.uid()), 'training.progress')));
create policy lesson_progress_select on public.lesson_progress for select to authenticated
  using (user_id in (select private.visible_user_ids((select auth.uid()), 'training.progress')));
create policy quizzes_select on public.quizzes for select to authenticated
  using (private.can_view_lesson((select auth.uid()), lesson_id));
-- Fragen/Antworten (inkl. Lösung) nur für Kursverwaltung; Lernende nutzen get_quiz()
create policy quiz_questions_select on public.quiz_questions for select to authenticated
  using (private.has_permission((select auth.uid()), 'training.manage'));
create policy quiz_answers_select on public.quiz_answers for select to authenticated
  using (private.has_permission((select auth.uid()), 'training.manage'));
create policy quiz_attempts_select on public.quiz_attempts for select to authenticated
  using (user_id in (select private.visible_user_ids((select auth.uid()), 'training.progress')));
create policy training_notes_select on public.training_notes for select to authenticated
  using (
    author_id = (select auth.uid())
    or (trainee_id = (select auth.uid()) and shared_with_trainee)
    or (trainee_id <> (select auth.uid())
        and private.has_permission((select auth.uid()), 'training.notes.write')
        and trainee_id in (select private.visible_user_ids((select auth.uid()), 'training.progress')))
  );

-- =============================================================================
-- RPCs: Lernende
-- =============================================================================

create or replace function public.lesson_start(p_lesson uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.can_view_lesson(auth.uid(), p_lesson)
     or not private.has_permission(auth.uid(), 'training.read') then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  insert into public.lesson_progress (user_id, lesson_id, status)
  values (auth.uid(), p_lesson, 'in_bearbeitung')
  on conflict (user_id, lesson_id) do nothing;
end;
$$;

-- Text- und Dokumentlektionen ausdrücklich abschließen
create or replace function public.lesson_complete(p_lesson uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.lessons;
  p public.lesson_progress;
begin
  if not private.can_view_lesson(auth.uid(), p_lesson)
     or not private.has_permission(auth.uid(), 'training.read') then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  select * into l from public.lessons where id = p_lesson;
  -- Externe Videos (ohne eigene Datei) können nicht gemessen werden -> ausdrückliche Bestätigung
  if l.lesson_type not in ('text', 'dokument') and not (l.lesson_type = 'video' and l.video_path is null) then
    raise exception 'Diese Lektion wird über Video bzw. Quiz abgeschlossen.';
  end if;
  select * into p from public.lesson_progress where user_id = auth.uid() and lesson_id = p_lesson;
  if p.user_id is null then
    raise exception 'Bitte öffne die Lektion zuerst.';
  end if;
  if p.status = 'abgeschlossen' then return; end if;
  if now() < p.started_at + make_interval(secs => l.min_seconds) then
    raise exception 'MINDESTZEIT: Bitte nimm dir etwas mehr Zeit für diese Lektion.';
  end if;
  update public.lesson_progress
     set status = 'abgeschlossen', completed_at = now(), completion_source = 'selbst'
   where user_id = auth.uid() and lesson_id = p_lesson;
end;
$$;

-- Videofortschritt melden. Abschluss ab 90 % der Videolänge.
create or replace function public.lesson_video_progress(p_lesson uuid, p_position int, p_duration int)
returns public.progress_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.lessons;
  v_status public.progress_status;
begin
  if not private.can_view_lesson(auth.uid(), p_lesson)
     or not private.has_permission(auth.uid(), 'training.read') then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  select * into l from public.lessons where id = p_lesson;
  if l.lesson_type <> 'video' then raise exception 'Keine Videolektion'; end if;
  if p_duration is null or p_duration <= 0 or p_position < 0 or p_position > p_duration + 5 then
    raise exception 'Ungültige Videodaten';
  end if;
  insert into public.lesson_progress (user_id, lesson_id, status, video_position_seconds, video_duration_seconds)
  values (auth.uid(), p_lesson, 'in_bearbeitung', p_position, p_duration)
  on conflict (user_id, lesson_id) do update
    set video_position_seconds = greatest(public.lesson_progress.video_position_seconds, excluded.video_position_seconds),
        video_duration_seconds = excluded.video_duration_seconds;

  update public.lesson_progress
     set status = 'abgeschlossen', completed_at = now(), completion_source = 'video'
   where user_id = auth.uid() and lesson_id = p_lesson
     and status <> 'abgeschlossen'
     and video_position_seconds >= 0.9 * video_duration_seconds
     -- Plausibilität: Abschluss frühestens nach 50 % der Videolänge in Echtzeit
     and now() >= started_at + make_interval(secs => (0.5 * video_duration_seconds)::int);

  select status into v_status from public.lesson_progress where user_id = auth.uid() and lesson_id = p_lesson;
  return v_status;
end;
$$;

-- Quiz ohne Lösungen abrufen
create or replace function public.get_quiz(p_lesson uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_quiz public.quizzes;
  v_attempts int;
begin
  if not private.can_view_lesson(auth.uid(), p_lesson) then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  select * into v_quiz from public.quizzes where lesson_id = p_lesson;
  if v_quiz.id is null then return null; end if;
  select count(*) into v_attempts from public.quiz_attempts where quiz_id = v_quiz.id and user_id = auth.uid();
  return jsonb_build_object(
    'quiz_id', v_quiz.id,
    'pass_percent', v_quiz.pass_percent,
    'max_attempts', v_quiz.max_attempts,
    'attempts_used', v_attempts,
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', q.id, 'question', q.question, 'allows_multiple', q.allows_multiple,
        'answers', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'answer', a.answer) order by a.sort_order), '[]')
                    from public.quiz_answers a where a.question_id = q.id)
      ) order by q.sort_order)
      from public.quiz_questions q where q.quiz_id = v_quiz.id), '[]'));
end;
$$;

-- Quiz einreichen und serverseitig auswerten.
-- p_answers: {"<question_id>": ["<answer_id>", ...], ...}
create or replace function public.submit_quiz(p_lesson uuid, p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quiz public.quizzes;
  v_total int;
  v_correct int := 0;
  v_score int;
  v_passed boolean;
  v_attempts int;
  q record;
  v_given uuid[];
  v_expected uuid[];
begin
  if not private.can_view_lesson(auth.uid(), p_lesson)
     or not private.has_permission(auth.uid(), 'training.read') then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  select * into v_quiz from public.quizzes where lesson_id = p_lesson;
  if v_quiz.id is null then raise exception 'Kein Quiz vorhanden'; end if;
  select count(*) into v_attempts from public.quiz_attempts where quiz_id = v_quiz.id and user_id = auth.uid();
  if v_quiz.max_attempts is not null and v_attempts >= v_quiz.max_attempts then
    raise exception 'Maximale Anzahl an Versuchen erreicht.';
  end if;
  select count(*) into v_total from public.quiz_questions where quiz_id = v_quiz.id;
  if v_total = 0 then raise exception 'Das Quiz enthält keine Fragen.'; end if;

  for q in select id from public.quiz_questions where quiz_id = v_quiz.id loop
    select coalesce(array_agg(x::uuid order by x), '{}') into v_given
      from jsonb_array_elements_text(coalesce(p_answers -> q.id::text, '[]'::jsonb)) x;
    select coalesce(array_agg(a.id order by a.id), '{}') into v_expected
      from public.quiz_answers a where a.question_id = q.id and a.is_correct;
    if v_given = v_expected then v_correct := v_correct + 1; end if;
  end loop;

  v_score := round(100.0 * v_correct / v_total);
  v_passed := v_score >= v_quiz.pass_percent;
  insert into public.quiz_attempts (quiz_id, user_id, score_percent, passed, answers)
  values (v_quiz.id, auth.uid(), v_score, v_passed, coalesce(p_answers, '{}'));

  insert into public.lesson_progress (user_id, lesson_id, status)
  values (auth.uid(), p_lesson, 'in_bearbeitung')
  on conflict (user_id, lesson_id) do nothing;
  if v_passed then
    update public.lesson_progress
       set status = 'abgeschlossen', completed_at = coalesce(completed_at, now()), completion_source = 'quiz'
     where user_id = auth.uid() and lesson_id = p_lesson and status <> 'abgeschlossen';
  end if;
  return jsonb_build_object('score_percent', v_score, 'passed', v_passed,
                            'correct', v_correct, 'total', v_total, 'pass_percent', v_quiz.pass_percent);
end;
$$;

-- Kursfortschritt eines Mitarbeiters (für ihn selbst oder berechtigte Führungskräfte)
create or replace function public.get_training_overview(p_user uuid default null)
returns table (
  course_id uuid, title text, is_mandatory boolean, due_on date,
  total_lessons bigint, completed_lessons bigint, last_activity timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := coalesce(p_user, auth.uid());
begin
  if not private.can_access_user(auth.uid(), v_user, 'training.progress') then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  return query
    select c.id, c.title,
           coalesce(ca.is_mandatory, false),
           ca.due_on,
           (select count(*) from public.lessons l join public.course_modules m on m.id = l.module_id
             where m.course_id = c.id and l.is_published),
           (select count(*) from public.lesson_progress lp
              join public.lessons l on l.id = lp.lesson_id
              join public.course_modules m on m.id = l.module_id
             where m.course_id = c.id and l.is_published and lp.user_id = v_user and lp.status = 'abgeschlossen'),
           (select max(lp.updated_at) from public.lesson_progress lp
              join public.lessons l on l.id = lp.lesson_id
              join public.course_modules m on m.id = l.module_id
             where m.course_id = c.id and lp.user_id = v_user)
    from public.courses c
    left join public.course_assignments ca on ca.course_id = c.id and ca.user_id = v_user
    where private.course_available_to(v_user, c.id)
    order by coalesce(ca.is_mandatory, false) desc, c.sort_order, c.title;
end;
$$;

-- =============================================================================
-- RPCs: Ausbilder / Führungskräfte
-- =============================================================================

create or replace function public.trainer_set_lesson_progress(
  p_user uuid, p_lesson uuid, p_status public.progress_status, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_permission('training.progress.manage');
  if p_user = auth.uid() or not private.can_access_user(auth.uid(), p_user, 'training.progress') then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.lessons l join public.course_modules m on m.id = l.module_id
    where l.id = p_lesson and private.course_available_to(p_user, m.course_id)) then
    raise exception 'Die Lektion ist für diesen Mitarbeiter nicht freigegeben.';
  end if;
  if p_status = 'nicht_begonnen' then
    delete from public.lesson_progress where user_id = p_user and lesson_id = p_lesson;
    return;
  end if;
  insert into public.lesson_progress (user_id, lesson_id, status, completed_at, completion_source, confirmed_by, note)
  values (p_user, p_lesson, p_status,
          case when p_status = 'abgeschlossen' then now() end,
          case when p_status = 'abgeschlossen' then 'ausbilder'::public.completion_source end,
          auth.uid(), nullif(trim(p_note), ''))
  on conflict (user_id, lesson_id) do update
    set status = excluded.status, completed_at = excluded.completed_at,
        completion_source = excluded.completion_source, confirmed_by = excluded.confirmed_by,
        note = excluded.note;
end;
$$;

create or replace function public.training_note_add(p_trainee uuid, p_body text, p_shared boolean default false)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform private.require_permission('training.notes.write');
  if p_trainee = auth.uid() or not private.can_access_user(auth.uid(), p_trainee, 'training.progress') then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  insert into public.training_notes (trainee_id, author_id, body, shared_with_trainee)
  values (p_trainee, auth.uid(), trim(p_body), coalesce(p_shared, false))
  returning id into v_id;
  if coalesce(p_shared, false) then
    perform private.notify(p_trainee, 'feedback', 'Neues Feedback von deinem Ausbilder', null, '/academy');
  end if;
  return v_id;
end;
$$;

-- Kurs persönlich zuweisen (Pflichtschulung)
create or replace function public.course_assign(p_course uuid, p_user uuid, p_due_on date default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
begin
  if not (private.has_permission(auth.uid(), 'training.manage')
          or (private.has_permission(auth.uid(), 'training.progress.manage')
              and p_user <> auth.uid()
              and private.can_access_user(auth.uid(), p_user, 'training.progress'))) then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  select title into v_title from public.courses where id = p_course and status = 'veroeffentlicht';
  if v_title is null then raise exception 'Kurs nicht gefunden oder nicht veröffentlicht'; end if;
  insert into public.course_assignments (course_id, user_id, assigned_by, due_on, is_mandatory)
  values (p_course, p_user, auth.uid(), p_due_on, true)
  on conflict (course_id, user_id) do update set due_on = excluded.due_on, is_mandatory = true;
  perform private.notify(p_user, 'schulung_zugewiesen', 'Neue Schulung zugewiesen: ' || v_title,
    case when p_due_on is not null then 'Fällig bis ' || to_char(p_due_on, 'DD.MM.YYYY') end,
    '/academy/kurs/' || p_course::text);
end;
$$;

create or replace function public.course_unassign(p_course uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (private.has_permission(auth.uid(), 'training.manage')
          or (private.has_permission(auth.uid(), 'training.progress.manage')
              and private.can_access_user(auth.uid(), p_user, 'training.progress'))) then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  delete from public.course_assignments where course_id = p_course and user_id = p_user;
end;
$$;

-- =============================================================================
-- RPCs: Kursverwaltung (training.manage)
-- =============================================================================

create or replace function public.course_upsert(
  p_id uuid, p_title text, p_description text, p_status public.course_status, p_sort_order int default 0)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform private.require_permission('training.manage');
  if p_id is null then
    insert into public.courses (title, description, status, sort_order, created_by, published_at)
    values (trim(p_title), nullif(trim(p_description), ''), p_status, coalesce(p_sort_order, 0), auth.uid(),
            case when p_status = 'veroeffentlicht' then now() end)
    returning id into v_id;
  else
    update public.courses
       set title = trim(p_title), description = nullif(trim(p_description), ''), status = p_status,
           sort_order = coalesce(p_sort_order, 0),
           published_at = case when p_status = 'veroeffentlicht' then coalesce(published_at, now()) else published_at end
     where id = p_id
    returning id into v_id;
    if v_id is null then raise exception 'Kurs nicht gefunden'; end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.course_set_cover(p_course uuid, p_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_permission('training.manage');
  update public.courses set cover_path = p_path where id = p_course;
end;
$$;

create or replace function public.course_delete(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_permission('training.manage');
  if exists (select 1 from public.lesson_progress lp join public.lessons l on l.id = lp.lesson_id
             join public.course_modules m on m.id = l.module_id where m.course_id = p_id) then
    raise exception 'Kurs hat bereits Lernfortschritte. Bitte archivieren statt löschen.';
  end if;
  delete from public.courses where id = p_id;
end;
$$;

-- Freigaben eines Kurses vollständig setzen.
-- p_entries: [{"role_id":..}|{"team_id":..}|{"user_id":..}, "is_mandatory": bool]
create or replace function public.course_set_access(p_course uuid, p_entries jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e jsonb;
  u record;
begin
  perform private.require_permission('training.manage');
  delete from public.course_access where course_id = p_course;
  for e in select * from jsonb_array_elements(coalesce(p_entries, '[]')) loop
    insert into public.course_access (course_id, role_id, team_id, user_id, is_mandatory)
    values (p_course, (e ->> 'role_id')::uuid, (e ->> 'team_id')::uuid, (e ->> 'user_id')::uuid,
            coalesce((e ->> 'is_mandatory')::boolean, false));
  end loop;
  -- Pflichtschulungen sofort für betroffene aktive Benutzer zuweisen
  for u in select id from public.profiles where status = 'aktiv' loop
    perform private.assign_mandatory_courses(u.id);
  end loop;
end;
$$;

create or replace function public.module_upsert(
  p_id uuid, p_course uuid, p_title text, p_description text, p_sort_order int)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform private.require_permission('training.manage');
  if p_id is null then
    insert into public.course_modules (course_id, title, description, sort_order)
    values (p_course, trim(p_title), nullif(trim(p_description), ''), coalesce(p_sort_order, 0))
    returning id into v_id;
  else
    update public.course_modules
       set title = trim(p_title), description = nullif(trim(p_description), ''), sort_order = coalesce(p_sort_order, 0)
     where id = p_id
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.module_delete(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_permission('training.manage');
  if exists (select 1 from public.lesson_progress lp join public.lessons l on l.id = lp.lesson_id where l.module_id = p_id) then
    raise exception 'Modul hat bereits Lernfortschritte und kann nicht gelöscht werden.';
  end if;
  delete from public.course_modules where id = p_id;
end;
$$;

create or replace function public.lesson_upsert(
  p_id uuid, p_module uuid, p_title text, p_type public.lesson_type, p_content text,
  p_video_url text, p_duration_minutes int, p_min_seconds int, p_sort_order int, p_is_published boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_was_published boolean := false;
  v_course uuid;
  v_course_title text;
  u record;
begin
  perform private.require_permission('training.manage');
  if p_id is null then
    insert into public.lessons (module_id, title, lesson_type, content, video_url, duration_minutes,
                                min_seconds, sort_order, is_published, published_at)
    values (p_module, trim(p_title), p_type, p_content, nullif(trim(p_video_url), ''), p_duration_minutes,
            coalesce(p_min_seconds, 30), coalesce(p_sort_order, 0), coalesce(p_is_published, false),
            case when coalesce(p_is_published, false) then now() end)
    returning id into v_id;
  else
    select is_published into v_was_published from public.lessons where id = p_id;
    update public.lessons
       set title = trim(p_title), lesson_type = p_type, content = p_content,
           video_url = nullif(trim(p_video_url), ''), duration_minutes = p_duration_minutes,
           min_seconds = coalesce(p_min_seconds, 30), sort_order = coalesce(p_sort_order, 0),
           is_published = coalesce(p_is_published, false),
           published_at = case when coalesce(p_is_published, false) then coalesce(published_at, now()) end
     where id = p_id
    returning id into v_id;
    if v_id is null then raise exception 'Lektion nicht gefunden'; end if;
  end if;

  if p_type = 'quiz' then
    insert into public.quizzes (lesson_id) values (v_id) on conflict (lesson_id) do nothing;
  end if;

  -- Benachrichtigung bei Neuveröffentlichung
  if coalesce(p_is_published, false) and not coalesce(v_was_published, false) then
    select c.id, c.title into v_course, v_course_title
      from public.course_modules m join public.courses c on c.id = m.course_id
     where m.id = (select module_id from public.lessons where id = v_id);
    for u in select id from public.profiles where status = 'aktiv' loop
      if private.course_available_to(u.id, v_course) then
        perform private.notify(u.id, 'lektion_neu', 'Neue Lektion in „' || v_course_title || '“',
          trim(p_title), '/academy/lektion/' || v_id::text);
      end if;
    end loop;
  end if;
  return v_id;
end;
$$;

create or replace function public.lesson_set_media(p_lesson uuid, p_kind text, p_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_permission('training.manage');
  if p_kind = 'video' then
    update public.lessons set video_path = p_path where id = p_lesson;
  elsif p_kind = 'dokument' then
    update public.lessons set document_path = p_path where id = p_lesson;
  else
    raise exception 'Ungültiger Medientyp';
  end if;
end;
$$;

create or replace function public.lesson_delete(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_permission('training.manage');
  if exists (select 1 from public.lesson_progress where lesson_id = p_id and status = 'abgeschlossen') then
    raise exception 'Lektion wurde bereits abgeschlossen. Bitte stattdessen die Veröffentlichung aufheben.';
  end if;
  delete from public.lessons where id = p_id;
end;
$$;

-- Quiz vollständig speichern.
-- p_questions: [{"question": "...", "allows_multiple": bool, "answers": [{"answer": "...", "is_correct": bool}]}]
create or replace function public.quiz_save(p_lesson uuid, p_pass_percent int, p_max_attempts int, p_questions jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quiz uuid;
  q jsonb;
  a jsonb;
  v_q uuid;
  i int := 0;
  j int;
begin
  perform private.require_permission('training.manage');
  if not exists (select 1 from public.lessons where id = p_lesson and lesson_type = 'quiz') then
    raise exception 'Keine Quizlektion';
  end if;
  insert into public.quizzes (lesson_id, pass_percent, max_attempts)
  values (p_lesson, coalesce(p_pass_percent, 80), p_max_attempts)
  on conflict (lesson_id) do update set pass_percent = excluded.pass_percent, max_attempts = excluded.max_attempts
  returning id into v_quiz;
  delete from public.quiz_questions where quiz_id = v_quiz;
  for q in select * from jsonb_array_elements(coalesce(p_questions, '[]')) loop
    i := i + 1;
    if not exists (select 1 from jsonb_array_elements(q -> 'answers') x where (x ->> 'is_correct')::boolean) then
      raise exception 'Jede Frage benötigt mindestens eine richtige Antwort (Frage %).', i;
    end if;
    insert into public.quiz_questions (quiz_id, question, allows_multiple, sort_order)
    values (v_quiz, trim(q ->> 'question'), coalesce((q ->> 'allows_multiple')::boolean, false), i)
    returning id into v_q;
    j := 0;
    for a in select * from jsonb_array_elements(q -> 'answers') loop
      j := j + 1;
      insert into public.quiz_answers (question_id, answer, is_correct, sort_order)
      values (v_q, trim(a ->> 'answer'), coalesce((a ->> 'is_correct')::boolean, false), j);
    end loop;
  end loop;
end;
$$;
