create table public.body_weight_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  weight_kg numeric(7, 2) not null,
  measured_at timestamptz not null default timezone('utc', now()),
  source text not null default 'manual',
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint body_weight_entries_weight_kg_check check (
    weight_kg > 0 and weight_kg <= 1000
  ),
  constraint body_weight_entries_source_check check (
    source = any (array['manual', 'profile_sync', 'backfill'])
  )
);

create table public.body_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  measurement_type text not null,
  value numeric(7, 2) not null,
  unit text not null,
  measured_at timestamptz not null default timezone('utc', now()),
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint body_measurements_type_check check (
    measurement_type = any (
      array[
        'waist',
        'chest',
        'hips',
        'left_arm',
        'right_arm',
        'left_thigh',
        'right_thigh',
        'neck',
        'body_fat_percentage'
      ]
    )
  ),
  constraint body_measurements_unit_check check (
    unit = any (array['cm', 'percent'])
  ),
  constraint body_measurements_value_check check (
    (
      measurement_type = 'body_fat_percentage'
      and unit = 'percent'
      and value > 0
      and value <= 100
    )
    or (
      measurement_type <> 'body_fat_percentage'
      and unit = 'cm'
      and value > 0
      and value <= 400
    )
  )
);

comment on table public.body_weight_entries is
  'Private per-user body weight history stored canonically in kilograms. This is the authoritative historical source for Progress.';

comment on table public.body_measurements is
  'Private per-user body measurement history stored canonically in centimeters and body-fat percentage values.';

comment on column public.body_weight_entries.source is
  'How this historical weight row was created. manual = Progress UI, profile_sync = profile edits/onboarding, backfill = migration bootstrap.';

comment on column public.body_measurements.unit is
  'Canonical storage only. Circumference values use cm and body-fat entries use percent.';

create or replace function public.normalize_body_weight_entry_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.notes = nullif(btrim(coalesce(new.notes, '')), '');
  new.source = coalesce(nullif(btrim(coalesce(new.source, '')), ''), 'manual');
  new.measured_at = coalesce(new.measured_at, timezone('utc', now()));
  return new;
end;
$$;

create or replace function public.normalize_body_measurement_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.notes = nullif(btrim(coalesce(new.notes, '')), '');
  new.measurement_type = lower(btrim(new.measurement_type));
  new.unit = lower(btrim(new.unit));
  new.measured_at = coalesce(new.measured_at, timezone('utc', now()));
  return new;
end;
$$;

create or replace function public.get_latest_body_weight_kg(p_user_id uuid)
returns numeric
language sql
stable
set search_path = public
as $$
  select bwe.weight_kg
  from public.body_weight_entries bwe
  where bwe.user_id = p_user_id
  order by bwe.measured_at desc, bwe.created_at desc, bwe.id desc
  limit 1
$$;

create or replace function public.sync_profile_current_weight_from_history(
  p_user_id uuid
)
returns void
language plpgsql
set search_path = public
as $$
declare
  next_weight numeric(7, 2);
begin
  select public.get_latest_body_weight_kg(p_user_id)
  into next_weight;

  perform set_config('oneup.progress_weight_sync_source', 'history', true);

  update public.profiles p
  set current_weight_kg = next_weight
  where p.id = p_user_id
    and p.current_weight_kg is distinct from next_weight;
end;
$$;

create or replace function public.handle_body_weight_entry_after_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform public.sync_profile_current_weight_from_history(
    coalesce(new.user_id, old.user_id)
  );
  return null;
end;
$$;

create or replace function public.handle_profile_current_weight_history_sync()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  sync_source text := current_setting('oneup.progress_weight_sync_source', true);
begin
  if sync_source = 'history' then
    return null;
  end if;

  if new.current_weight_kg is null then
    if exists (
      select 1
      from public.body_weight_entries bwe
      where bwe.user_id = new.id
    ) then
      perform public.sync_profile_current_weight_from_history(new.id);
    end if;
    return null;
  end if;

  if tg_op = 'INSERT' or new.current_weight_kg is distinct from old.current_weight_kg then
    perform set_config('oneup.progress_weight_sync_source', 'profile', true);

    insert into public.body_weight_entries (
      user_id,
      weight_kg,
      measured_at,
      source
    )
    values (
      new.id,
      new.current_weight_kg,
      coalesce(new.updated_at, new.created_at, timezone('utc', now())),
      'profile_sync'
    );
  end if;

  return null;
end;
$$;

drop trigger if exists normalize_body_weight_entries_before_write on public.body_weight_entries;
create trigger normalize_body_weight_entries_before_write
before insert or update on public.body_weight_entries
for each row
execute function public.normalize_body_weight_entry_before_write();

drop trigger if exists set_body_weight_entries_updated_at on public.body_weight_entries;
create trigger set_body_weight_entries_updated_at
before update on public.body_weight_entries
for each row
execute function public.set_updated_at();

drop trigger if exists sync_profile_current_weight_after_body_weight_write on public.body_weight_entries;
create trigger sync_profile_current_weight_after_body_weight_write
after insert or update or delete on public.body_weight_entries
for each row
execute function public.handle_body_weight_entry_after_write();

drop trigger if exists normalize_body_measurements_before_write on public.body_measurements;
create trigger normalize_body_measurements_before_write
before insert or update on public.body_measurements
for each row
execute function public.normalize_body_measurement_before_write();

drop trigger if exists set_body_measurements_updated_at on public.body_measurements;
create trigger set_body_measurements_updated_at
before update on public.body_measurements
for each row
execute function public.set_updated_at();

drop trigger if exists sync_body_weight_history_after_profile_weight_write on public.profiles;
create trigger sync_body_weight_history_after_profile_weight_write
after insert or update of current_weight_kg on public.profiles
for each row
execute function public.handle_profile_current_weight_history_sync();

create index body_weight_entries_user_measured_idx
  on public.body_weight_entries (user_id, measured_at desc, created_at desc, id desc);
create index body_measurements_user_type_measured_idx
  on public.body_measurements (user_id, measurement_type, measured_at desc, created_at desc, id desc);
create index body_measurements_user_measured_idx
  on public.body_measurements (user_id, measured_at desc, created_at desc, id desc);
create index workout_sets_user_exercise_completed_idx
  on public.workout_sets (user_id, exercise_id, completed_at desc)
  where is_completed;

alter table public.profiles
drop constraint if exists profiles_completed_onboarding_requires_core_fields_check;

alter table public.profiles
add constraint profiles_completed_onboarding_requires_core_fields_check check (
  onboarding_completed = false
  or (
    display_name is not null
    and preferred_units is not null
    and age_years is not null
    and height_cm is not null
    and fitness_goal is not null
    and experience_level is not null
    and preferred_training_days_per_week is not null
    and preferred_workout_location is not null
  )
);

insert into public.body_weight_entries (
  user_id,
  weight_kg,
  measured_at,
  source
)
select
  p.id,
  p.current_weight_kg,
  coalesce(p.updated_at, p.created_at, timezone('utc', now())),
  'backfill'
from public.profiles p
where p.current_weight_kg is not null;

grant select, insert, update, delete on table public.body_weight_entries to authenticated;
grant select, insert, update, delete on table public.body_measurements to authenticated;

alter table public.body_weight_entries enable row level security;
alter table public.body_measurements enable row level security;

create policy "Users can read their own body weight entries"
on public.body_weight_entries
for select
to authenticated
using (user_id = auth.uid());

create policy "Users can create their own body weight entries"
on public.body_weight_entries
for insert
to authenticated
with check (user_id = auth.uid());

create policy "Users can update their own body weight entries"
on public.body_weight_entries
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Users can delete their own body weight entries"
on public.body_weight_entries
for delete
to authenticated
using (user_id = auth.uid());

create policy "Users can read their own body measurements"
on public.body_measurements
for select
to authenticated
using (user_id = auth.uid());

create policy "Users can create their own body measurements"
on public.body_measurements
for insert
to authenticated
with check (user_id = auth.uid());

create policy "Users can update their own body measurements"
on public.body_measurements
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Users can delete their own body measurements"
on public.body_measurements
for delete
to authenticated
using (user_id = auth.uid());

create or replace function public.progress_completed_set_facts(
  p_exercise_id uuid default null
)
returns table (
  workout_set_id uuid,
  workout_session_id uuid,
  workout_session_exercise_id uuid,
  exercise_id uuid,
  session_name text,
  exercise_name text,
  achieved_at timestamptz,
  session_completed_at timestamptz,
  set_number integer,
  set_type text,
  tracking_metric text,
  load_type text,
  weight_kg numeric,
  reps integer,
  duration_seconds integer,
  distance_meters numeric,
  assistance_weight_kg numeric,
  bodyweight_kg_snapshot numeric,
  counts_as_working_set boolean,
  external_volume_kg numeric,
  effective_load_kg numeric,
  estimated_one_rep_max_kg numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    ws.id as workout_set_id,
    wss.id as workout_session_id,
    wse.id as workout_session_exercise_id,
    ws.exercise_id,
    wss.name_snapshot as session_name,
    wse.exercise_name_snapshot as exercise_name,
    coalesce(ws.completed_at, wss.completed_at) as achieved_at,
    wss.completed_at as session_completed_at,
    ws.set_number,
    ws.set_type,
    wse.tracking_metric_snapshot as tracking_metric,
    wse.load_type_snapshot as load_type,
    ws.weight_kg,
    ws.reps,
    ws.duration_seconds,
    ws.distance_meters,
    ws.assistance_weight_kg,
    ws.bodyweight_kg_snapshot,
    (ws.set_type <> 'warmup') as counts_as_working_set,
    case
      when wse.load_type_snapshot in ('external_weight', 'bodyweight_plus_load')
        and ws.weight_kg is not null
        and ws.reps is not null
      then round((ws.weight_kg * ws.reps)::numeric, 2)
      else null
    end as external_volume_kg,
    case
      when wse.load_type_snapshot = 'external_weight'
        and ws.weight_kg is not null
      then ws.weight_kg
      when wse.load_type_snapshot = 'bodyweight_plus_load'
        and ws.bodyweight_kg_snapshot is not null
      then round((ws.bodyweight_kg_snapshot + coalesce(ws.weight_kg, 0))::numeric, 2)
      else null
    end as effective_load_kg,
    case
      when wse.load_type_snapshot in ('external_weight', 'bodyweight_plus_load')
        and ws.reps between 1 and 12
        and (
          (wse.load_type_snapshot = 'external_weight' and ws.weight_kg is not null)
          or (wse.load_type_snapshot = 'bodyweight_plus_load' and ws.bodyweight_kg_snapshot is not null)
        )
      then round(
        (
          case
            when wse.load_type_snapshot = 'external_weight'
              then ws.weight_kg
            else ws.bodyweight_kg_snapshot + coalesce(ws.weight_kg, 0)
          end
        ) * (1 + (ws.reps::numeric / 30)),
        2
      )
      else null
    end as estimated_one_rep_max_kg
  from public.workout_sets ws
  join public.workout_sessions wss
    on wss.id = ws.workout_session_id
  join public.workout_session_exercises wse
    on wse.id = ws.workout_session_exercise_id
  where auth.uid() is not null
    and ws.user_id = auth.uid()
    and wss.user_id = auth.uid()
    and wss.status = 'completed'
    and ws.is_completed = true
    and (p_exercise_id is null or ws.exercise_id = p_exercise_id)
$$;

revoke all on function public.progress_completed_set_facts(uuid) from public;

create or replace function public.get_exercise_progress(
  p_exercise_id uuid,
  p_limit integer default 60
)
returns table (
  workout_set_id uuid,
  workout_session_id uuid,
  workout_session_exercise_id uuid,
  exercise_id uuid,
  session_name text,
  exercise_name text,
  achieved_at timestamptz,
  set_number integer,
  set_type text,
  tracking_metric text,
  load_type text,
  weight_kg numeric,
  reps integer,
  duration_seconds integer,
  distance_meters numeric,
  assistance_weight_kg numeric,
  bodyweight_kg_snapshot numeric,
  counts_as_working_set boolean,
  external_volume_kg numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    facts.workout_set_id,
    facts.workout_session_id,
    facts.workout_session_exercise_id,
    facts.exercise_id,
    facts.session_name,
    facts.exercise_name,
    facts.achieved_at,
    facts.set_number,
    facts.set_type,
    facts.tracking_metric,
    facts.load_type,
    facts.weight_kg,
    facts.reps,
    facts.duration_seconds,
    facts.distance_meters,
    facts.assistance_weight_kg,
    facts.bodyweight_kg_snapshot,
    facts.counts_as_working_set,
    facts.external_volume_kg
  from public.progress_completed_set_facts(p_exercise_id) facts
  order by facts.achieved_at desc, facts.set_number desc, facts.workout_set_id desc
  limit greatest(coalesce(p_limit, 60), 1)
$$;

create or replace function public.get_personal_records(
  p_exercise_id uuid default null,
  p_limit integer default 100
)
returns table (
  exercise_id uuid,
  exercise_name text,
  record_type text,
  value numeric,
  unit text,
  weight_kg numeric,
  reps integer,
  duration_seconds integer,
  distance_meters numeric,
  assistance_weight_kg numeric,
  bodyweight_kg_snapshot numeric,
  workout_session_id uuid,
  workout_set_id uuid,
  achieved_at timestamptz,
  tracking_metric text,
  load_type text,
  previous_value numeric,
  previous_achieved_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with set_facts as (
    select *
    from public.progress_completed_set_facts(p_exercise_id)
    where counts_as_working_set
  ),
  record_candidates as (
    select
      sf.exercise_id,
      sf.exercise_name,
      'heaviest_load'::text as record_type,
      sf.effective_load_kg as value,
      'kg'::text as unit,
      sf.weight_kg,
      sf.reps,
      sf.duration_seconds,
      sf.distance_meters,
      sf.assistance_weight_kg,
      sf.bodyweight_kg_snapshot,
      sf.workout_session_id,
      sf.workout_set_id,
      sf.achieved_at,
      sf.tracking_metric,
      sf.load_type,
      coalesce(sf.reps, 0)::numeric as secondary_metric
    from set_facts sf
    where sf.load_type in ('external_weight', 'bodyweight_plus_load')
      and sf.effective_load_kg is not null

    union all

    select
      sf.exercise_id,
      sf.exercise_name,
      'estimated_one_rep_max'::text as record_type,
      sf.estimated_one_rep_max_kg as value,
      'kg'::text as unit,
      sf.weight_kg,
      sf.reps,
      sf.duration_seconds,
      sf.distance_meters,
      sf.assistance_weight_kg,
      sf.bodyweight_kg_snapshot,
      sf.workout_session_id,
      sf.workout_set_id,
      sf.achieved_at,
      sf.tracking_metric,
      sf.load_type,
      coalesce(sf.effective_load_kg, 0) as secondary_metric
    from set_facts sf
    where sf.load_type in ('external_weight', 'bodyweight_plus_load')
      and sf.estimated_one_rep_max_kg is not null

    union all

    select
      sf.exercise_id,
      sf.exercise_name,
      'max_reps'::text as record_type,
      sf.reps::numeric as value,
      'reps'::text as unit,
      sf.weight_kg,
      sf.reps,
      sf.duration_seconds,
      sf.distance_meters,
      sf.assistance_weight_kg,
      sf.bodyweight_kg_snapshot,
      sf.workout_session_id,
      sf.workout_set_id,
      sf.achieved_at,
      sf.tracking_metric,
      sf.load_type,
      case
        when sf.load_type = 'assisted'
          then coalesce(-sf.assistance_weight_kg, 0)
        when sf.load_type = 'bodyweight'
          then coalesce(sf.bodyweight_kg_snapshot, 0)
        else coalesce(sf.effective_load_kg, coalesce(sf.weight_kg, 0))
      end as secondary_metric
    from set_facts sf
    where sf.reps is not null
      and sf.reps > 0
      and sf.load_type in (
        'external_weight',
        'bodyweight',
        'bodyweight_plus_load',
        'assisted'
      )

    union all

    select
      sf.exercise_id,
      sf.exercise_name,
      'least_assistance'::text as record_type,
      sf.assistance_weight_kg as value,
      'kg'::text as unit,
      sf.weight_kg,
      sf.reps,
      sf.duration_seconds,
      sf.distance_meters,
      sf.assistance_weight_kg,
      sf.bodyweight_kg_snapshot,
      sf.workout_session_id,
      sf.workout_set_id,
      sf.achieved_at,
      sf.tracking_metric,
      sf.load_type,
      coalesce(sf.reps, 0)::numeric as secondary_metric
    from set_facts sf
    where sf.load_type = 'assisted'
      and sf.assistance_weight_kg is not null

    union all

    select
      sf.exercise_id,
      sf.exercise_name,
      'longest_duration'::text as record_type,
      sf.duration_seconds::numeric as value,
      'seconds'::text as unit,
      sf.weight_kg,
      sf.reps,
      sf.duration_seconds,
      sf.distance_meters,
      sf.assistance_weight_kg,
      sf.bodyweight_kg_snapshot,
      sf.workout_session_id,
      sf.workout_set_id,
      sf.achieved_at,
      sf.tracking_metric,
      sf.load_type,
      coalesce(sf.distance_meters, 0) as secondary_metric
    from set_facts sf
    where sf.duration_seconds is not null
      and sf.duration_seconds > 0
      and sf.load_type in ('duration', 'distance_duration')

    union all

    select
      sf.exercise_id,
      sf.exercise_name,
      'longest_distance'::text as record_type,
      sf.distance_meters as value,
      'meters'::text as unit,
      sf.weight_kg,
      sf.reps,
      sf.duration_seconds,
      sf.distance_meters,
      sf.assistance_weight_kg,
      sf.bodyweight_kg_snapshot,
      sf.workout_session_id,
      sf.workout_set_id,
      sf.achieved_at,
      sf.tracking_metric,
      sf.load_type,
      coalesce(sf.duration_seconds, 0)::numeric as secondary_metric
    from set_facts sf
    where sf.load_type = 'distance_duration'
      and sf.distance_meters is not null
      and sf.distance_meters > 0
  ),
  ranked_candidates as (
    select
      rc.*,
      row_number() over (
        partition by rc.exercise_id, rc.record_type
        order by
          case
            when rc.record_type = 'least_assistance'
              then rc.value
          end asc nulls last,
          case
            when rc.record_type <> 'least_assistance'
              then rc.value
          end desc nulls last,
          rc.secondary_metric desc nulls last,
          rc.achieved_at desc,
          rc.workout_set_id desc
      ) as record_rank
    from record_candidates rc
    where rc.value is not null
  )
  select
    current_record.exercise_id,
    current_record.exercise_name,
    current_record.record_type,
    current_record.value,
    current_record.unit,
    current_record.weight_kg,
    current_record.reps,
    current_record.duration_seconds,
    current_record.distance_meters,
    current_record.assistance_weight_kg,
    current_record.bodyweight_kg_snapshot,
    current_record.workout_session_id,
    current_record.workout_set_id,
    current_record.achieved_at,
    current_record.tracking_metric,
    current_record.load_type,
    previous_record.value as previous_value,
    previous_record.achieved_at as previous_achieved_at
  from ranked_candidates current_record
  left join ranked_candidates previous_record
    on previous_record.exercise_id = current_record.exercise_id
   and previous_record.record_type = current_record.record_type
   and previous_record.record_rank = 2
  where current_record.record_rank = 1
  order by current_record.achieved_at desc, current_record.exercise_name asc
  limit greatest(coalesce(p_limit, 100), 1)
$$;

create or replace function public.get_activity_buckets(
  p_range text default 'week',
  p_timezone text default 'UTC',
  p_reference_at timestamptz default timezone('utc', now())
)
returns table (
  label text,
  bucket_start date,
  bucket_end date,
  total_minutes integer,
  workout_count integer,
  completed_working_sets integer,
  external_volume_kg numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  normalized_range text := lower(coalesce(nullif(btrim(p_range), ''), 'week'));
  normalized_timezone text := coalesce(nullif(btrim(p_timezone), ''), 'UTC');
  reference_at timestamptz := coalesce(p_reference_at, timezone('utc', now()));
  local_week_start date := date_trunc('week', reference_at at time zone normalized_timezone)::date;
begin
  if normalized_range not in ('week', 'month') then
    raise exception 'Unsupported activity range: %', normalized_range;
  end if;

  if normalized_range = 'week' then
    return query
    with day_buckets as (
      select
        day::date as bucket_start,
        day::date as bucket_end,
        to_char(day::date, 'Dy') as label
      from generate_series(
        local_week_start::timestamp,
        (local_week_start + 6)::timestamp,
        interval '1 day'
      ) as day
    ),
    completed_sessions as (
      select
        ws.id,
        (ws.completed_at at time zone normalized_timezone)::date as local_completed_date,
        coalesce(
          ws.duration_seconds,
          greatest(
            floor(extract(epoch from (ws.completed_at - ws.started_at)))::integer,
            0
          ),
          0
        ) as duration_seconds
      from public.workout_sessions ws
      where auth.uid() is not null
        and ws.user_id = auth.uid()
        and ws.status = 'completed'
        and ws.completed_at is not null
    ),
    session_set_rollups as (
      select
        facts.workout_session_id,
        coalesce(count(*) filter (where facts.counts_as_working_set), 0)::integer as completed_working_sets,
        coalesce(sum(
          case
            when facts.counts_as_working_set
              then facts.external_volume_kg
            else null
          end
        ), 0)::numeric as external_volume_kg
      from public.progress_completed_set_facts(null) facts
      group by facts.workout_session_id
    ),
    bucket_rollups as (
      select
        buckets.label,
        buckets.bucket_start,
        buckets.bucket_end,
        coalesce(round(sum(sessions.duration_seconds) / 60.0), 0)::integer as total_minutes,
        count(sessions.id)::integer as workout_count,
        coalesce(sum(sets.completed_working_sets), 0)::integer as completed_working_sets,
        coalesce(round(sum(sets.external_volume_kg), 2), 0)::numeric as external_volume_kg
      from day_buckets buckets
      left join completed_sessions sessions
        on sessions.local_completed_date = buckets.bucket_start
      left join session_set_rollups sets
        on sets.workout_session_id = sessions.id
      group by buckets.label, buckets.bucket_start, buckets.bucket_end
    )
    select
      bucket_rollups.label,
      bucket_rollups.bucket_start,
      bucket_rollups.bucket_end,
      bucket_rollups.total_minutes,
      bucket_rollups.workout_count,
      bucket_rollups.completed_working_sets,
      bucket_rollups.external_volume_kg
    from bucket_rollups
    order by bucket_rollups.bucket_start;
  else
    return query
    with week_buckets as (
      select
        week_start::date as bucket_start,
        (week_start::date + 6) as bucket_end,
        format('W%s', row_number() over (order by week_start)) as label
      from generate_series(
        (local_week_start - 21)::timestamp,
        local_week_start::timestamp,
        interval '7 day'
      ) as week_start
    ),
    completed_sessions as (
      select
        ws.id,
        (ws.completed_at at time zone normalized_timezone)::date as local_completed_date,
        coalesce(
          ws.duration_seconds,
          greatest(
            floor(extract(epoch from (ws.completed_at - ws.started_at)))::integer,
            0
          ),
          0
        ) as duration_seconds
      from public.workout_sessions ws
      where auth.uid() is not null
        and ws.user_id = auth.uid()
        and ws.status = 'completed'
        and ws.completed_at is not null
    ),
    session_set_rollups as (
      select
        facts.workout_session_id,
        coalesce(count(*) filter (where facts.counts_as_working_set), 0)::integer as completed_working_sets,
        coalesce(sum(
          case
            when facts.counts_as_working_set
              then facts.external_volume_kg
            else null
          end
        ), 0)::numeric as external_volume_kg
      from public.progress_completed_set_facts(null) facts
      group by facts.workout_session_id
    ),
    bucket_rollups as (
      select
        buckets.label,
        buckets.bucket_start,
        buckets.bucket_end,
        coalesce(round(sum(sessions.duration_seconds) / 60.0), 0)::integer as total_minutes,
        count(sessions.id)::integer as workout_count,
        coalesce(sum(sets.completed_working_sets), 0)::integer as completed_working_sets,
        coalesce(round(sum(sets.external_volume_kg), 2), 0)::numeric as external_volume_kg
      from week_buckets buckets
      left join completed_sessions sessions
        on sessions.local_completed_date between buckets.bucket_start and buckets.bucket_end
      left join session_set_rollups sets
        on sets.workout_session_id = sessions.id
      group by buckets.label, buckets.bucket_start, buckets.bucket_end
    )
    select
      bucket_rollups.label,
      bucket_rollups.bucket_start,
      bucket_rollups.bucket_end,
      bucket_rollups.total_minutes,
      bucket_rollups.workout_count,
      bucket_rollups.completed_working_sets,
      bucket_rollups.external_volume_kg
    from bucket_rollups
    order by bucket_rollups.bucket_start;
  end if;
end;
$$;

create or replace function public.get_training_summary(
  p_timezone text default 'UTC',
  p_reference_at timestamptz default timezone('utc', now())
)
returns table (
  completed_workouts_this_week integer,
  completed_workouts_last_7_days integer,
  completed_workouts_last_30_days integer,
  completed_working_sets_this_week integer,
  total_duration_seconds_this_week integer,
  external_volume_kg_this_week numeric,
  workout_goal_per_week integer,
  weekly_goal_completion_percent numeric,
  primary_muscle_sets jsonb,
  secondary_muscle_sets jsonb,
  top_exercises jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with context as (
    select
      coalesce(nullif(btrim(p_timezone), ''), 'UTC') as timezone_name,
      coalesce(p_reference_at, timezone('utc', now())) as reference_at
  ),
  local_window as (
    select
      date_trunc('week', context.reference_at at time zone context.timezone_name)::date as week_start,
      (context.reference_at at time zone context.timezone_name)::date as today_local
    from context
  ),
  completed_sessions as (
    select
      ws.id,
      (ws.completed_at at time zone context.timezone_name)::date as local_completed_date,
      coalesce(
        ws.duration_seconds,
        greatest(
          floor(extract(epoch from (ws.completed_at - ws.started_at)))::integer,
          0
        ),
        0
      ) as duration_seconds
    from public.workout_sessions ws
    cross join context
    where auth.uid() is not null
      and ws.user_id = auth.uid()
      and ws.status = 'completed'
      and ws.completed_at is not null
  ),
  working_set_facts as (
    select
      facts.*,
      (facts.achieved_at at time zone context.timezone_name)::date as local_achieved_date
    from public.progress_completed_set_facts(null) facts
    cross join context
    where facts.counts_as_working_set
  ),
  current_week_sessions as (
    select sessions.*
    from completed_sessions sessions
    cross join local_window
    where sessions.local_completed_date between local_window.week_start and (local_window.week_start + 6)
  ),
  current_week_sets as (
    select facts.*
    from working_set_facts facts
    cross join local_window
    where facts.local_achieved_date between local_window.week_start and (local_window.week_start + 6)
  ),
  weekly_primary_muscles as (
    select
      m.id,
      m.code,
      m.name,
      m.muscle_group,
      count(*)::integer as set_count
    from current_week_sets facts
    join public.exercise_muscles em
      on em.exercise_id = facts.exercise_id
     and em.role = 'primary'
    join public.muscles m
      on m.id = em.muscle_id
    group by m.id, m.code, m.name, m.muscle_group
    order by set_count desc, m.name asc
  ),
  weekly_secondary_muscles as (
    select
      m.id,
      m.code,
      m.name,
      m.muscle_group,
      round((count(*)::numeric * 0.5), 2) as set_score
    from current_week_sets facts
    join public.exercise_muscles em
      on em.exercise_id = facts.exercise_id
     and em.role = 'secondary'
    join public.muscles m
      on m.id = em.muscle_id
    group by m.id, m.code, m.name, m.muscle_group
    order by set_score desc, m.name asc
  ),
  weekly_top_exercises as (
    select
      facts.exercise_id,
      facts.exercise_name,
      count(*)::integer as completed_working_sets,
      coalesce(round(sum(facts.external_volume_kg), 2), 0)::numeric as external_volume_kg
    from current_week_sets facts
    group by facts.exercise_id, facts.exercise_name
    order by external_volume_kg desc, completed_working_sets desc, facts.exercise_name asc
  ),
  user_goal as (
    select p.preferred_training_days_per_week
    from public.profiles p
    where p.id = auth.uid()
  )
  select
    (select count(*)::integer from current_week_sessions) as completed_workouts_this_week,
    (
      select count(*)::integer
      from completed_sessions sessions
      cross join local_window
      where sessions.local_completed_date between (local_window.today_local - 6) and local_window.today_local
    ) as completed_workouts_last_7_days,
    (
      select count(*)::integer
      from completed_sessions sessions
      cross join local_window
      where sessions.local_completed_date between (local_window.today_local - 29) and local_window.today_local
    ) as completed_workouts_last_30_days,
    (select coalesce(count(*), 0)::integer from current_week_sets) as completed_working_sets_this_week,
    (select coalesce(sum(duration_seconds), 0)::integer from current_week_sessions) as total_duration_seconds_this_week,
    (select coalesce(round(sum(external_volume_kg), 2), 0)::numeric from current_week_sets) as external_volume_kg_this_week,
    (select preferred_training_days_per_week from user_goal) as workout_goal_per_week,
    (
      select
        case
          when preferred_training_days_per_week is null or preferred_training_days_per_week = 0
            then null
          else round(
            (
              (select count(*)::numeric from current_week_sessions)
              / preferred_training_days_per_week::numeric
            ) * 100,
            2
          )
        end
      from user_goal
    ) as weekly_goal_completion_percent,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'muscleId', weekly_primary_muscles.id,
            'code', weekly_primary_muscles.code,
            'name', weekly_primary_muscles.name,
            'muscleGroup', weekly_primary_muscles.muscle_group,
            'setCount', weekly_primary_muscles.set_count
          )
          order by weekly_primary_muscles.set_count desc, weekly_primary_muscles.name asc
        )
        from (
          select *
          from weekly_primary_muscles
          limit 6
        ) weekly_primary_muscles
      ),
      '[]'::jsonb
    ) as primary_muscle_sets,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'muscleId', weekly_secondary_muscles.id,
            'code', weekly_secondary_muscles.code,
            'name', weekly_secondary_muscles.name,
            'muscleGroup', weekly_secondary_muscles.muscle_group,
            'setScore', weekly_secondary_muscles.set_score
          )
          order by weekly_secondary_muscles.set_score desc, weekly_secondary_muscles.name asc
        )
        from (
          select *
          from weekly_secondary_muscles
          limit 6
        ) weekly_secondary_muscles
      ),
      '[]'::jsonb
    ) as secondary_muscle_sets,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'exerciseId', weekly_top_exercises.exercise_id,
            'exerciseName', weekly_top_exercises.exercise_name,
            'completedWorkingSets', weekly_top_exercises.completed_working_sets,
            'externalVolumeKg', weekly_top_exercises.external_volume_kg
          )
          order by weekly_top_exercises.external_volume_kg desc, weekly_top_exercises.completed_working_sets desc, weekly_top_exercises.exercise_name asc
        )
        from (
          select *
          from weekly_top_exercises
          limit 5
        ) weekly_top_exercises
      ),
      '[]'::jsonb
    ) as top_exercises
$$;

grant execute on function public.get_exercise_progress(uuid, integer) to authenticated;
grant execute on function public.get_personal_records(uuid, integer) to authenticated;
grant execute on function public.get_activity_buckets(text, text, timestamptz) to authenticated;
grant execute on function public.get_training_summary(text, timestamptz) to authenticated;
