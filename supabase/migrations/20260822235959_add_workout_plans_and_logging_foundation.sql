create table public.workout_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  description text,
  is_active boolean not null default true,
  is_template boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint workout_plans_name_not_blank check (length(btrim(name)) > 0)
);

create table public.workout_plan_days (
  id uuid primary key default gen_random_uuid(),
  workout_plan_id uuid not null references public.workout_plans (id) on delete cascade,
  name text not null,
  day_order integer not null,
  weekday text,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint workout_plan_days_name_not_blank check (length(btrim(name)) > 0),
  constraint workout_plan_days_day_order_check check (day_order > 0),
  constraint workout_plan_days_weekday_check check (
    weekday is null
    or weekday = any (
      array[
        'monday',
        'tuesday',
        'wednesday',
        'thursday',
        'friday',
        'saturday',
        'sunday'
      ]
    )
  )
);

create table public.workout_plan_exercises (
  id uuid primary key default gen_random_uuid(),
  workout_plan_day_id uuid not null references public.workout_plan_days (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete restrict,
  position integer not null,
  target_sets integer not null default 1,
  target_reps_min integer,
  target_reps_max integer,
  target_weight_kg numeric(8, 3),
  target_duration_seconds integer,
  target_distance_meters numeric(10, 2),
  rest_seconds integer,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint workout_plan_exercises_position_check check (position > 0),
  constraint workout_plan_exercises_target_sets_check check (target_sets >= 0),
  constraint workout_plan_exercises_target_reps_min_check check (
    target_reps_min is null or target_reps_min >= 0
  ),
  constraint workout_plan_exercises_target_reps_max_check check (
    target_reps_max is null or target_reps_max >= 0
  ),
  constraint workout_plan_exercises_target_reps_order_check check (
    target_reps_min is null
    or target_reps_max is null
    or target_reps_min <= target_reps_max
  ),
  constraint workout_plan_exercises_target_weight_check check (
    target_weight_kg is null or target_weight_kg >= 0
  ),
  constraint workout_plan_exercises_target_duration_check check (
    target_duration_seconds is null or target_duration_seconds >= 0
  ),
  constraint workout_plan_exercises_target_distance_check check (
    target_distance_meters is null or target_distance_meters >= 0
  ),
  constraint workout_plan_exercises_rest_seconds_check check (
    rest_seconds is null or rest_seconds >= 0
  )
);

create table public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workout_plan_id uuid references public.workout_plans (id) on delete set null,
  workout_plan_day_id uuid references public.workout_plan_days (id) on delete set null,
  name_snapshot text not null,
  status text not null default 'in_progress',
  started_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz,
  duration_seconds integer,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint workout_sessions_name_not_blank check (length(btrim(name_snapshot)) > 0),
  constraint workout_sessions_status_check check (
    status = any (array['in_progress', 'completed', 'cancelled'])
  ),
  constraint workout_sessions_duration_seconds_check check (
    duration_seconds is null or duration_seconds >= 0
  ),
  constraint workout_sessions_completed_state_check check (
    (status = 'completed' and completed_at is not null and completed_at >= started_at)
    or (status <> 'completed' and completed_at is null)
  )
);

create table public.workout_session_exercises (
  id uuid primary key default gen_random_uuid(),
  workout_session_id uuid not null references public.workout_sessions (id) on delete cascade,
  workout_plan_exercise_id uuid references public.workout_plan_exercises (id) on delete set null,
  exercise_id uuid not null references public.exercises (id) on delete restrict,
  exercise_name_snapshot text not null,
  position integer not null,
  tracking_metric_snapshot text not null,
  load_type_snapshot text not null,
  notes text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint workout_session_exercises_name_not_blank check (
    length(btrim(exercise_name_snapshot)) > 0
  ),
  constraint workout_session_exercises_position_check check (position > 0),
  constraint workout_session_exercises_tracking_metric_check check (
    tracking_metric_snapshot = any (
      array['weight_reps', 'bodyweight_reps', 'reps_only', 'duration', 'distance_duration']
    )
  ),
  constraint workout_session_exercises_load_type_check check (
    load_type_snapshot = any (
      array[
        'external_weight',
        'bodyweight',
        'bodyweight_plus_load',
        'assisted',
        'duration',
        'distance_duration'
      ]
    )
  ),
  constraint workout_session_exercises_completed_after_started_check check (
    completed_at is null or started_at is null or completed_at >= started_at
  )
);

create table public.workout_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workout_session_id uuid not null references public.workout_sessions (id) on delete cascade,
  workout_session_exercise_id uuid not null references public.workout_session_exercises (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete restrict,
  set_number integer not null,
  set_type text not null default 'working',
  weight_kg numeric(8, 3),
  reps integer,
  duration_seconds integer,
  distance_meters numeric(10, 2),
  assistance_weight_kg numeric(8, 3),
  bodyweight_kg_snapshot numeric(7, 2),
  rpe numeric(3, 1),
  rir integer,
  is_completed boolean not null default false,
  completed_at timestamptz,
  planned_reps_min integer,
  planned_reps_max integer,
  planned_weight_kg numeric(8, 3),
  planned_duration_seconds integer,
  planned_distance_meters numeric(10, 2),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint workout_sets_set_number_check check (set_number > 0),
  constraint workout_sets_set_type_check check (
    set_type = any (array['warmup', 'working', 'drop', 'failure'])
  ),
  constraint workout_sets_weight_check check (weight_kg is null or weight_kg >= 0),
  constraint workout_sets_reps_check check (reps is null or reps >= 0),
  constraint workout_sets_duration_check check (
    duration_seconds is null or duration_seconds >= 0
  ),
  constraint workout_sets_distance_check check (
    distance_meters is null or distance_meters >= 0
  ),
  constraint workout_sets_assistance_weight_check check (
    assistance_weight_kg is null or assistance_weight_kg >= 0
  ),
  constraint workout_sets_bodyweight_snapshot_check check (
    bodyweight_kg_snapshot is null or bodyweight_kg_snapshot >= 0
  ),
  constraint workout_sets_rpe_check check (rpe is null or (rpe >= 1 and rpe <= 10)),
  constraint workout_sets_rir_check check (rir is null or (rir >= 0 and rir <= 10)),
  constraint workout_sets_completion_state_check check (
    (is_completed = true and completed_at is not null)
    or (is_completed = false and completed_at is null)
  ),
  constraint workout_sets_planned_reps_min_check check (
    planned_reps_min is null or planned_reps_min >= 0
  ),
  constraint workout_sets_planned_reps_max_check check (
    planned_reps_max is null or planned_reps_max >= 0
  ),
  constraint workout_sets_planned_reps_order_check check (
    planned_reps_min is null
    or planned_reps_max is null
    or planned_reps_min <= planned_reps_max
  ),
  constraint workout_sets_planned_weight_check check (
    planned_weight_kg is null or planned_weight_kg >= 0
  ),
  constraint workout_sets_planned_duration_check check (
    planned_duration_seconds is null or planned_duration_seconds >= 0
  ),
  constraint workout_sets_planned_distance_check check (
    planned_distance_meters is null or planned_distance_meters >= 0
  )
);

comment on table public.workout_plans is
  'Private user-owned workout plans and templates. Plans may be edited or archived without mutating historical sessions.';

comment on table public.workout_sessions is
  'Actual workout sessions performed by the user. Completed rows remain immutable historical snapshots even if the original plan changes later.';

comment on table public.workout_sets is
  'Authoritative set-level workout performance data stored canonically in kilograms, meters, and seconds.';

comment on column public.workout_sets.bodyweight_kg_snapshot is
  'The user bodyweight captured at logging time when the exercise meaning depends on bodyweight.';

comment on column public.workout_sets.planned_weight_kg is
  'Snapshot of the planned target load for this set. Actual performed load lives in weight_kg.';

create or replace function public.normalize_workout_plan_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.name = btrim(new.name);
  new.description = nullif(btrim(coalesce(new.description, '')), '');
  return new;
end;
$$;

create or replace function public.normalize_workout_plan_day_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.name = btrim(new.name);
  new.notes = nullif(btrim(coalesce(new.notes, '')), '');
  return new;
end;
$$;

create or replace function public.normalize_workout_plan_exercise_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.notes = nullif(btrim(coalesce(new.notes, '')), '');
  return new;
end;
$$;

create or replace function public.normalize_workout_session_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.name_snapshot = btrim(new.name_snapshot);
  new.notes = nullif(btrim(coalesce(new.notes, '')), '');
  return new;
end;
$$;

create or replace function public.normalize_workout_session_exercise_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.exercise_name_snapshot = btrim(new.exercise_name_snapshot);
  new.notes = nullif(btrim(coalesce(new.notes, '')), '');
  return new;
end;
$$;

create or replace function public.normalize_workout_set_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  session_owner_id uuid;
  session_exercise_session_id uuid;
  session_exercise_exercise_id uuid;
begin
  select ws.user_id
  into session_owner_id
  from public.workout_sessions ws
  where ws.id = new.workout_session_id;

  if session_owner_id is null then
    raise exception 'Workout session % does not exist.', new.workout_session_id;
  end if;

  select wse.workout_session_id, wse.exercise_id
  into session_exercise_session_id, session_exercise_exercise_id
  from public.workout_session_exercises wse
  where wse.id = new.workout_session_exercise_id;

  if session_exercise_session_id is null then
    raise exception 'Workout session exercise % does not exist.', new.workout_session_exercise_id;
  end if;

  if session_exercise_session_id <> new.workout_session_id then
    raise exception 'Workout set session mismatch.';
  end if;

  if session_exercise_exercise_id <> new.exercise_id then
    raise exception 'Workout set exercise mismatch.';
  end if;

  new.user_id = session_owner_id;

  if new.is_completed and new.completed_at is null then
    new.completed_at = timezone('utc', now());
  elsif not new.is_completed then
    new.completed_at = null;
  end if;

  return new;
end;
$$;

drop trigger if exists normalize_workout_plans_before_write on public.workout_plans;
create trigger normalize_workout_plans_before_write
before insert or update on public.workout_plans
for each row
execute function public.normalize_workout_plan_before_write();

drop trigger if exists set_workout_plans_updated_at on public.workout_plans;
create trigger set_workout_plans_updated_at
before update on public.workout_plans
for each row
execute function public.set_updated_at();

drop trigger if exists normalize_workout_plan_days_before_write on public.workout_plan_days;
create trigger normalize_workout_plan_days_before_write
before insert or update on public.workout_plan_days
for each row
execute function public.normalize_workout_plan_day_before_write();

drop trigger if exists set_workout_plan_days_updated_at on public.workout_plan_days;
create trigger set_workout_plan_days_updated_at
before update on public.workout_plan_days
for each row
execute function public.set_updated_at();

drop trigger if exists normalize_workout_plan_exercises_before_write on public.workout_plan_exercises;
create trigger normalize_workout_plan_exercises_before_write
before insert or update on public.workout_plan_exercises
for each row
execute function public.normalize_workout_plan_exercise_before_write();

drop trigger if exists set_workout_plan_exercises_updated_at on public.workout_plan_exercises;
create trigger set_workout_plan_exercises_updated_at
before update on public.workout_plan_exercises
for each row
execute function public.set_updated_at();

drop trigger if exists normalize_workout_sessions_before_write on public.workout_sessions;
create trigger normalize_workout_sessions_before_write
before insert or update on public.workout_sessions
for each row
execute function public.normalize_workout_session_before_write();

drop trigger if exists set_workout_sessions_updated_at on public.workout_sessions;
create trigger set_workout_sessions_updated_at
before update on public.workout_sessions
for each row
execute function public.set_updated_at();

drop trigger if exists normalize_workout_session_exercises_before_write on public.workout_session_exercises;
create trigger normalize_workout_session_exercises_before_write
before insert or update on public.workout_session_exercises
for each row
execute function public.normalize_workout_session_exercise_before_write();

drop trigger if exists set_workout_session_exercises_updated_at on public.workout_session_exercises;
create trigger set_workout_session_exercises_updated_at
before update on public.workout_session_exercises
for each row
execute function public.set_updated_at();

drop trigger if exists normalize_workout_sets_before_write on public.workout_sets;
create trigger normalize_workout_sets_before_write
before insert or update on public.workout_sets
for each row
execute function public.normalize_workout_set_before_write();

drop trigger if exists set_workout_sets_updated_at on public.workout_sets;
create trigger set_workout_sets_updated_at
before update on public.workout_sets
for each row
execute function public.set_updated_at();

create index workout_plans_user_active_idx
  on public.workout_plans (user_id, is_active, updated_at desc);
create unique index workout_plan_days_plan_day_order_idx
  on public.workout_plan_days (workout_plan_id, day_order);
create index workout_plan_days_plan_weekday_idx
  on public.workout_plan_days (workout_plan_id, weekday, day_order);
create unique index workout_plan_exercises_day_position_idx
  on public.workout_plan_exercises (workout_plan_day_id, position);
create index workout_plan_exercises_day_exercise_idx
  on public.workout_plan_exercises (workout_plan_day_id, exercise_id);
create index workout_sessions_user_status_started_idx
  on public.workout_sessions (user_id, status, started_at desc);
create unique index workout_sessions_one_active_per_user_idx
  on public.workout_sessions (user_id)
  where status = 'in_progress';
create index workout_sessions_user_completed_idx
  on public.workout_sessions (user_id, completed_at desc)
  where status = 'completed';
create unique index workout_session_exercises_session_position_idx
  on public.workout_session_exercises (workout_session_id, position);
create index workout_session_exercises_exercise_idx
  on public.workout_session_exercises (exercise_id, created_at desc);
create unique index workout_sets_session_exercise_set_number_idx
  on public.workout_sets (workout_session_exercise_id, set_number);
create index workout_sets_session_idx
  on public.workout_sets (workout_session_id, workout_session_exercise_id, set_number);
create index workout_sets_user_completed_idx
  on public.workout_sets (user_id, completed_at desc)
  where is_completed;
create index workout_sets_exercise_completed_idx
  on public.workout_sets (exercise_id, completed_at desc)
  where is_completed;

create or replace function public.save_workout_plan(
  p_plan_id uuid default null,
  p_name text default null,
  p_description text default null,
  p_is_active boolean default true,
  p_is_template boolean default false,
  p_days jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  auth_user_id uuid;
  next_plan_id uuid;
  next_day_id uuid;
  day_payload record;
  exercise_payload record;
begin
  auth_user_id := auth.uid();

  if auth_user_id is null then
    raise exception 'Authentication required.';
  end if;

  if p_name is null or length(btrim(p_name)) = 0 then
    raise exception 'Workout plan name is required.';
  end if;

  if p_plan_id is null then
    insert into public.workout_plans (
      user_id,
      name,
      description,
      is_active,
      is_template
    )
    values (
      auth_user_id,
      p_name,
      p_description,
      coalesce(p_is_active, true),
      coalesce(p_is_template, false)
    )
    returning id into next_plan_id;
  else
    update public.workout_plans
    set
      name = p_name,
      description = p_description,
      is_active = coalesce(p_is_active, true),
      is_template = coalesce(p_is_template, false)
    where id = p_plan_id
      and user_id = auth_user_id
    returning id into next_plan_id;

    if next_plan_id is null then
      raise exception 'Workout plan not found.';
    end if;

    delete from public.workout_plan_days
    where workout_plan_id = next_plan_id;
  end if;

  for day_payload in
    select payload.item, payload.ordinality::integer as ordinality
    from jsonb_array_elements(coalesce(p_days, '[]'::jsonb)) with ordinality as payload(item, ordinality)
  loop
    insert into public.workout_plan_days (
      workout_plan_id,
      name,
      day_order,
      weekday,
      notes
    )
    values (
      next_plan_id,
      coalesce(day_payload.item ->> 'name', format('Day %s', day_payload.ordinality)),
      coalesce((day_payload.item ->> 'day_order')::integer, day_payload.ordinality),
      nullif(day_payload.item ->> 'weekday', ''),
      day_payload.item ->> 'notes'
    )
    returning id into next_day_id;

    for exercise_payload in
      select
        payload.item,
        payload.ordinality::integer as ordinality
      from jsonb_array_elements(coalesce(day_payload.item -> 'exercises', '[]'::jsonb))
      with ordinality as payload(item, ordinality)
    loop
      insert into public.workout_plan_exercises (
        workout_plan_day_id,
        exercise_id,
        position,
        target_sets,
        target_reps_min,
        target_reps_max,
        target_weight_kg,
        target_duration_seconds,
        target_distance_meters,
        rest_seconds,
        notes
      )
      select
        next_day_id,
        e.id,
        coalesce((exercise_payload.item ->> 'position')::integer, exercise_payload.ordinality),
        coalesce((exercise_payload.item ->> 'target_sets')::integer, 1),
        (exercise_payload.item ->> 'target_reps_min')::integer,
        (exercise_payload.item ->> 'target_reps_max')::integer,
        (exercise_payload.item ->> 'target_weight_kg')::numeric,
        (exercise_payload.item ->> 'target_duration_seconds')::integer,
        (exercise_payload.item ->> 'target_distance_meters')::numeric,
        (exercise_payload.item ->> 'rest_seconds')::integer,
        exercise_payload.item ->> 'notes'
      from public.exercises e
      where e.id = (exercise_payload.item ->> 'exercise_id')::uuid
        and e.is_active;

      if not found then
        raise exception 'Workout plan exercise is invalid or inactive.';
      end if;
    end loop;
  end loop;

  return next_plan_id;
end;
$$;

create or replace function public.start_workout_session(
  p_workout_plan_day_id uuid default null,
  p_session_name text default null,
  p_exercises jsonb default '[]'::jsonb
)
returns table (
  session_id uuid,
  was_resumed boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  auth_user_id uuid;
  active_session_id uuid;
  next_session_id uuid;
  next_session_started_at timestamptz := timezone('utc', now());
  next_plan_id uuid;
  next_day_name text;
  bodyweight_snapshot numeric(7, 2);
  source_exercise record;
  next_session_exercise_id uuid;
  custom_exercise_count integer := 0;
begin
  auth_user_id := auth.uid();

  if auth_user_id is null then
    raise exception 'Authentication required.';
  end if;

  select ws.id
  into active_session_id
  from public.workout_sessions ws
  where ws.user_id = auth_user_id
    and ws.status = 'in_progress'
  order by ws.started_at desc
  limit 1;

  if active_session_id is not null then
    session_id := active_session_id;
    was_resumed := true;
    return next;
    return;
  end if;

  select p.current_weight_kg
  into bodyweight_snapshot
  from public.profiles p
  where p.id = auth_user_id;

  if p_workout_plan_day_id is not null then
    select d.workout_plan_id, d.name
    into next_plan_id, next_day_name
    from public.workout_plan_days d
    join public.workout_plans p
      on p.id = d.workout_plan_id
    where d.id = p_workout_plan_day_id
      and p.user_id = auth_user_id
      and p.is_active;

    if next_plan_id is null then
      raise exception 'Workout plan day not found.';
    end if;

    insert into public.workout_sessions (
      user_id,
      workout_plan_id,
      workout_plan_day_id,
      name_snapshot,
      status,
      started_at
    )
    values (
      auth_user_id,
      next_plan_id,
      p_workout_plan_day_id,
      coalesce(nullif(btrim(coalesce(p_session_name, '')), ''), next_day_name),
      'in_progress',
      next_session_started_at
    )
    returning id into next_session_id;

    for source_exercise in
      select
        pe.id as workout_plan_exercise_id,
        pe.exercise_id,
        pe.position,
        pe.target_sets,
        pe.target_reps_min,
        pe.target_reps_max,
        pe.target_weight_kg,
        pe.target_duration_seconds,
        pe.target_distance_meters,
        pe.notes,
        e.name,
        e.primary_tracking_metric,
        e.load_type
      from public.workout_plan_exercises pe
      join public.exercises e
        on e.id = pe.exercise_id
      where pe.workout_plan_day_id = p_workout_plan_day_id
      order by pe.position
    loop
      insert into public.workout_session_exercises (
        workout_session_id,
        workout_plan_exercise_id,
        exercise_id,
        exercise_name_snapshot,
        position,
        tracking_metric_snapshot,
        load_type_snapshot,
        notes,
        started_at
      )
      values (
        next_session_id,
        source_exercise.workout_plan_exercise_id,
        source_exercise.exercise_id,
        source_exercise.name,
        source_exercise.position,
        source_exercise.primary_tracking_metric,
        source_exercise.load_type,
        source_exercise.notes,
        next_session_started_at
      )
      returning id into next_session_exercise_id;

      for custom_exercise_count in 1..source_exercise.target_sets loop
        insert into public.workout_sets (
          workout_session_id,
          workout_session_exercise_id,
          exercise_id,
          set_number,
          set_type,
          weight_kg,
          reps,
          duration_seconds,
          distance_meters,
          bodyweight_kg_snapshot,
          planned_reps_min,
          planned_reps_max,
          planned_weight_kg,
          planned_duration_seconds,
          planned_distance_meters
        )
        values (
          next_session_id,
          next_session_exercise_id,
          source_exercise.exercise_id,
          custom_exercise_count,
          'working',
          case
            when source_exercise.load_type in ('external_weight', 'bodyweight_plus_load')
              then source_exercise.target_weight_kg
            else null
          end,
          case
            when source_exercise.primary_tracking_metric in ('weight_reps', 'bodyweight_reps', 'reps_only')
              then coalesce(source_exercise.target_reps_min, source_exercise.target_reps_max)
            else null
          end,
          case
            when source_exercise.primary_tracking_metric in ('duration', 'distance_duration')
              then source_exercise.target_duration_seconds
            else null
          end,
          case
            when source_exercise.primary_tracking_metric = 'distance_duration'
              then source_exercise.target_distance_meters
            else null
          end,
          case
            when source_exercise.load_type in ('bodyweight', 'bodyweight_plus_load', 'assisted')
              then bodyweight_snapshot
            else null
          end,
          source_exercise.target_reps_min,
          source_exercise.target_reps_max,
          source_exercise.target_weight_kg,
          source_exercise.target_duration_seconds,
          source_exercise.target_distance_meters
        );
      end loop;
    end loop;

    if not exists (
      select 1
      from public.workout_session_exercises wse
      where wse.workout_session_id = next_session_id
    ) then
      raise exception 'Workout plan day has no exercises.';
    end if;
  else
    if jsonb_typeof(coalesce(p_exercises, '[]'::jsonb)) <> 'array'
      or jsonb_array_length(coalesce(p_exercises, '[]'::jsonb)) = 0 then
      raise exception 'At least one exercise is required to start a workout.';
    end if;

    insert into public.workout_sessions (
      user_id,
      name_snapshot,
      status,
      started_at
    )
    values (
      auth_user_id,
      coalesce(nullif(btrim(coalesce(p_session_name, '')), ''), 'Custom Workout'),
      'in_progress',
      next_session_started_at
    )
    returning id into next_session_id;

    custom_exercise_count := 0;

    for source_exercise in
      select
        e.id as exercise_id,
        e.name,
        e.primary_tracking_metric,
        e.load_type,
        coalesce((payload.item ->> 'position')::integer, payload.ordinality::integer) as position,
        coalesce((payload.item ->> 'target_sets')::integer, 1) as target_sets,
        (payload.item ->> 'target_reps_min')::integer as target_reps_min,
        (payload.item ->> 'target_reps_max')::integer as target_reps_max,
        (payload.item ->> 'target_weight_kg')::numeric as target_weight_kg,
        (payload.item ->> 'target_duration_seconds')::integer as target_duration_seconds,
        (payload.item ->> 'target_distance_meters')::numeric as target_distance_meters,
        payload.item ->> 'notes' as notes
      from jsonb_array_elements(p_exercises) with ordinality as payload(item, ordinality)
      join public.exercises e
        on e.id = (payload.item ->> 'exercise_id')::uuid
       and e.is_active
      order by coalesce((payload.item ->> 'position')::integer, payload.ordinality::integer)
    loop
      custom_exercise_count := custom_exercise_count + 1;

      insert into public.workout_session_exercises (
        workout_session_id,
        exercise_id,
        exercise_name_snapshot,
        position,
        tracking_metric_snapshot,
        load_type_snapshot,
        notes,
        started_at
      )
      values (
        next_session_id,
        source_exercise.exercise_id,
        source_exercise.name,
        source_exercise.position,
        source_exercise.primary_tracking_metric,
        source_exercise.load_type,
        source_exercise.notes,
        next_session_started_at
      )
      returning id into next_session_exercise_id;

      for active_session_id in 1..source_exercise.target_sets loop
        insert into public.workout_sets (
          workout_session_id,
          workout_session_exercise_id,
          exercise_id,
          set_number,
          set_type,
          weight_kg,
          reps,
          duration_seconds,
          distance_meters,
          bodyweight_kg_snapshot,
          planned_reps_min,
          planned_reps_max,
          planned_weight_kg,
          planned_duration_seconds,
          planned_distance_meters
        )
        values (
          next_session_id,
          next_session_exercise_id,
          source_exercise.exercise_id,
          active_session_id,
          'working',
          case
            when source_exercise.load_type in ('external_weight', 'bodyweight_plus_load')
              then source_exercise.target_weight_kg
            else null
          end,
          case
            when source_exercise.primary_tracking_metric in ('weight_reps', 'bodyweight_reps', 'reps_only')
              then coalesce(source_exercise.target_reps_min, source_exercise.target_reps_max)
            else null
          end,
          case
            when source_exercise.primary_tracking_metric in ('duration', 'distance_duration')
              then source_exercise.target_duration_seconds
            else null
          end,
          case
            when source_exercise.primary_tracking_metric = 'distance_duration'
              then source_exercise.target_distance_meters
            else null
          end,
          case
            when source_exercise.load_type in ('bodyweight', 'bodyweight_plus_load', 'assisted')
              then bodyweight_snapshot
            else null
          end,
          source_exercise.target_reps_min,
          source_exercise.target_reps_max,
          source_exercise.target_weight_kg,
          source_exercise.target_duration_seconds,
          source_exercise.target_distance_meters
        );
      end loop;
    end loop;

    if custom_exercise_count <> jsonb_array_length(p_exercises) then
      raise exception 'One or more workout exercises are invalid or inactive.';
    end if;
  end if;

  session_id := next_session_id;
  was_resumed := false;
  return next;
  return;
exception
  when unique_violation then
    select ws.id
    into active_session_id
    from public.workout_sessions ws
    where ws.user_id = auth_user_id
      and ws.status = 'in_progress'
    order by ws.started_at desc
    limit 1;

    if active_session_id is null then
      raise;
    end if;

    session_id := active_session_id;
    was_resumed := true;
    return next;
    return;
end;
$$;

create or replace function public.complete_workout_session(
  p_workout_session_id uuid
)
returns table (
  session_id uuid,
  status text,
  completed_at timestamptz,
  duration_seconds integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  auth_user_id uuid;
  completion_time timestamptz := timezone('utc', now());
begin
  auth_user_id := auth.uid();

  if auth_user_id is null then
    raise exception 'Authentication required.';
  end if;

  update public.workout_session_exercises wse
  set
    started_at = coalesce(wse.started_at, completion_time),
    completed_at = coalesce(wse.completed_at, completion_time)
  where wse.workout_session_id = p_workout_session_id;

  update public.workout_sessions ws
  set
    status = 'completed',
    completed_at = completion_time,
    duration_seconds = greatest(
      floor(extract(epoch from (completion_time - ws.started_at)))::integer,
      0
    )
  where ws.id = p_workout_session_id
    and ws.user_id = auth_user_id
    and ws.status = 'in_progress'
  returning
    ws.id,
    ws.status,
    ws.completed_at,
    ws.duration_seconds
  into session_id, status, completed_at, duration_seconds;

  if session_id is null then
    raise exception 'Active workout session not found.';
  end if;

  return next;
end;
$$;

create or replace function public.cancel_workout_session(
  p_workout_session_id uuid
)
returns table (
  session_id uuid,
  status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  auth_user_id uuid;
begin
  auth_user_id := auth.uid();

  if auth_user_id is null then
    raise exception 'Authentication required.';
  end if;

  update public.workout_session_exercises wse
  set completed_at = null
  where wse.workout_session_id = p_workout_session_id;

  update public.workout_sessions ws
  set
    status = 'cancelled',
    completed_at = null,
    duration_seconds = null
  where ws.id = p_workout_session_id
    and ws.user_id = auth_user_id
    and ws.status = 'in_progress'
  returning ws.id, ws.status
  into session_id, status;

  if session_id is null then
    raise exception 'Active workout session not found.';
  end if;

  return next;
end;
$$;

grant select, insert, update, delete on table public.workout_plans to authenticated;
grant select, insert, update, delete on table public.workout_plan_days to authenticated;
grant select, insert, update, delete on table public.workout_plan_exercises to authenticated;
grant select, insert, update, delete on table public.workout_sessions to authenticated;
grant select, insert, update, delete on table public.workout_session_exercises to authenticated;
grant select, insert, update, delete on table public.workout_sets to authenticated;

grant execute on function public.save_workout_plan(uuid, text, text, boolean, boolean, jsonb) to authenticated;
grant execute on function public.start_workout_session(uuid, text, jsonb) to authenticated;
grant execute on function public.complete_workout_session(uuid) to authenticated;
grant execute on function public.cancel_workout_session(uuid) to authenticated;

alter table public.workout_plans enable row level security;
alter table public.workout_plan_days enable row level security;
alter table public.workout_plan_exercises enable row level security;
alter table public.workout_sessions enable row level security;
alter table public.workout_session_exercises enable row level security;
alter table public.workout_sets enable row level security;

create policy "Users can read their own workout plans"
on public.workout_plans
for select
to authenticated
using (user_id = auth.uid());

create policy "Users can create their own workout plans"
on public.workout_plans
for insert
to authenticated
with check (user_id = auth.uid());

create policy "Users can update their own workout plans"
on public.workout_plans
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Users can delete their own workout plans"
on public.workout_plans
for delete
to authenticated
using (user_id = auth.uid());

create policy "Users can read their own workout plan days"
on public.workout_plan_days
for select
to authenticated
using (
  exists (
    select 1
    from public.workout_plans wp
    where wp.id = workout_plan_days.workout_plan_id
      and wp.user_id = auth.uid()
  )
);

create policy "Users can create their own workout plan days"
on public.workout_plan_days
for insert
to authenticated
with check (
  exists (
    select 1
    from public.workout_plans wp
    where wp.id = workout_plan_days.workout_plan_id
      and wp.user_id = auth.uid()
  )
);

create policy "Users can update their own workout plan days"
on public.workout_plan_days
for update
to authenticated
using (
  exists (
    select 1
    from public.workout_plans wp
    where wp.id = workout_plan_days.workout_plan_id
      and wp.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.workout_plans wp
    where wp.id = workout_plan_days.workout_plan_id
      and wp.user_id = auth.uid()
  )
);

create policy "Users can delete their own workout plan days"
on public.workout_plan_days
for delete
to authenticated
using (
  exists (
    select 1
    from public.workout_plans wp
    where wp.id = workout_plan_days.workout_plan_id
      and wp.user_id = auth.uid()
  )
);

create policy "Users can read their own workout plan exercises"
on public.workout_plan_exercises
for select
to authenticated
using (
  exists (
    select 1
    from public.workout_plan_days wpd
    join public.workout_plans wp
      on wp.id = wpd.workout_plan_id
    where wpd.id = workout_plan_exercises.workout_plan_day_id
      and wp.user_id = auth.uid()
  )
);

create policy "Users can create their own workout plan exercises"
on public.workout_plan_exercises
for insert
to authenticated
with check (
  exists (
    select 1
    from public.workout_plan_days wpd
    join public.workout_plans wp
      on wp.id = wpd.workout_plan_id
    where wpd.id = workout_plan_exercises.workout_plan_day_id
      and wp.user_id = auth.uid()
  )
);

create policy "Users can update their own workout plan exercises"
on public.workout_plan_exercises
for update
to authenticated
using (
  exists (
    select 1
    from public.workout_plan_days wpd
    join public.workout_plans wp
      on wp.id = wpd.workout_plan_id
    where wpd.id = workout_plan_exercises.workout_plan_day_id
      and wp.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.workout_plan_days wpd
    join public.workout_plans wp
      on wp.id = wpd.workout_plan_id
    where wpd.id = workout_plan_exercises.workout_plan_day_id
      and wp.user_id = auth.uid()
  )
);

create policy "Users can delete their own workout plan exercises"
on public.workout_plan_exercises
for delete
to authenticated
using (
  exists (
    select 1
    from public.workout_plan_days wpd
    join public.workout_plans wp
      on wp.id = wpd.workout_plan_id
    where wpd.id = workout_plan_exercises.workout_plan_day_id
      and wp.user_id = auth.uid()
  )
);

create policy "Users can read their own workout sessions"
on public.workout_sessions
for select
to authenticated
using (user_id = auth.uid());

create policy "Users can create their own workout sessions"
on public.workout_sessions
for insert
to authenticated
with check (user_id = auth.uid());

create policy "Users can update their own workout sessions"
on public.workout_sessions
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Users can delete their own workout sessions"
on public.workout_sessions
for delete
to authenticated
using (user_id = auth.uid());

create policy "Users can read their own workout session exercises"
on public.workout_session_exercises
for select
to authenticated
using (
  exists (
    select 1
    from public.workout_sessions ws
    where ws.id = workout_session_exercises.workout_session_id
      and ws.user_id = auth.uid()
  )
);

create policy "Users can create their own workout session exercises"
on public.workout_session_exercises
for insert
to authenticated
with check (
  exists (
    select 1
    from public.workout_sessions ws
    where ws.id = workout_session_exercises.workout_session_id
      and ws.user_id = auth.uid()
  )
);

create policy "Users can update their own workout session exercises"
on public.workout_session_exercises
for update
to authenticated
using (
  exists (
    select 1
    from public.workout_sessions ws
    where ws.id = workout_session_exercises.workout_session_id
      and ws.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.workout_sessions ws
    where ws.id = workout_session_exercises.workout_session_id
      and ws.user_id = auth.uid()
  )
);

create policy "Users can delete their own workout session exercises"
on public.workout_session_exercises
for delete
to authenticated
using (
  exists (
    select 1
    from public.workout_sessions ws
    where ws.id = workout_session_exercises.workout_session_id
      and ws.user_id = auth.uid()
  )
);

create policy "Users can read their own workout sets"
on public.workout_sets
for select
to authenticated
using (user_id = auth.uid());

create policy "Users can create their own workout sets"
on public.workout_sets
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.workout_sessions ws
    where ws.id = workout_sets.workout_session_id
      and ws.user_id = auth.uid()
  )
  and exists (
    select 1
    from public.workout_session_exercises wse
    where wse.id = workout_sets.workout_session_exercise_id
      and wse.workout_session_id = workout_sets.workout_session_id
      and wse.exercise_id = workout_sets.exercise_id
  )
);

create policy "Users can update their own workout sets"
on public.workout_sets
for update
to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.workout_sessions ws
    where ws.id = workout_sets.workout_session_id
      and ws.user_id = auth.uid()
  )
);

create policy "Users can delete their own workout sets"
on public.workout_sets
for delete
to authenticated
using (user_id = auth.uid());
