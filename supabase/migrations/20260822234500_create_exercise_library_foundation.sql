create extension if not exists pg_trgm;

create table public.muscles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  muscle_group text not null,
  body_region text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint muscles_code_not_blank check (length(btrim(code)) > 0),
  constraint muscles_name_not_blank check (length(btrim(name)) > 0),
  constraint muscles_group_check check (
    muscle_group = any (array['chest', 'back', 'shoulders', 'arms', 'legs', 'core'])
  ),
  constraint muscles_region_check check (
    body_region = any (array['upper', 'lower', 'core'])
  )
);

create table public.equipment (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  category text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint equipment_code_not_blank check (length(btrim(code)) > 0),
  constraint equipment_name_not_blank check (length(btrim(name)) > 0),
  constraint equipment_category_check check (
    category = any (
      array['bodyweight', 'free_weight', 'cable', 'machine', 'support', 'station', 'accessory', 'cardio']
    )
  )
);

create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  instructions text[] not null default '{}'::text[],
  exercise_type text not null,
  movement_pattern text,
  mechanic text,
  difficulty text,
  laterality text,
  primary_tracking_metric text not null,
  load_type text not null,
  program_focuses text[] not null default '{}'::text[],
  source text not null default 'oneup_internal',
  source_exercise_id text,
  metadata jsonb not null default '{}'::jsonb,
  sort_order integer not null default 1000,
  is_active boolean not null default true,
  normalized_name text generated always as (public.normalize_food_search_text(name)) stored,
  search_document tsvector generated always as (
    setweight(to_tsvector('simple', coalesce(name, '')), 'A')
    || setweight(to_tsvector('simple', coalesce(description, '')), 'B')
  ) stored,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint exercises_slug_not_blank check (length(btrim(slug)) > 0),
  constraint exercises_name_not_blank check (length(btrim(name)) > 0),
  constraint exercises_type_check check (
    exercise_type = any (array['strength', 'cardio', 'mobility'])
  ),
  constraint exercises_movement_pattern_check check (
    movement_pattern is null
    or movement_pattern = any (
      array[
        'horizontal_push',
        'vertical_push',
        'horizontal_pull',
        'vertical_pull',
        'squat',
        'hinge',
        'lunge',
        'carry',
        'rotation',
        'anti_rotation',
        'flexion',
        'anti_extension',
        'isolation',
        'locomotion'
      ]
    )
  ),
  constraint exercises_mechanic_check check (
    mechanic is null or mechanic = any (array['compound', 'isolation', 'isometric'])
  ),
  constraint exercises_difficulty_check check (
    difficulty is null or difficulty = any (array['beginner', 'intermediate', 'advanced'])
  ),
  constraint exercises_laterality_check check (
    laterality is null or laterality = any (array['bilateral', 'unilateral', 'alternating'])
  ),
  constraint exercises_tracking_metric_check check (
    primary_tracking_metric = any (
      array['weight_reps', 'bodyweight_reps', 'reps_only', 'duration', 'distance_duration']
    )
  ),
  constraint exercises_load_type_check check (
    load_type = any (
      array['external_weight', 'bodyweight', 'bodyweight_plus_load', 'assisted', 'duration', 'distance_duration']
    )
  ),
  constraint exercises_program_focuses_check check (
    program_focuses <@ array['strength', 'hypertrophy', 'stability', 'conditioning', 'mobility']::text[]
  ),
  constraint exercises_source_check check (
    source = any (array['oneup_internal', 'authorized_external_source'])
  )
);

create table public.exercise_muscles (
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  muscle_id uuid not null references public.muscles (id) on delete restrict,
  role text not null,
  sort_order smallint not null default 1,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (exercise_id, muscle_id, role),
  constraint exercise_muscles_role_check check (role = any (array['primary', 'secondary']))
);

create table public.exercise_equipment (
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  equipment_id uuid not null references public.equipment (id) on delete restrict,
  requirement_type text not null default 'required',
  sort_order smallint not null default 1,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (exercise_id, equipment_id, requirement_type),
  constraint exercise_equipment_requirement_type_check check (
    requirement_type = any (array['required', 'optional', 'alternative'])
  )
);

create table public.exercise_aliases (
  id uuid primary key default gen_random_uuid(),
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  alias text not null,
  alias_type text,
  sort_order smallint not null default 1,
  normalized_alias text generated always as (public.normalize_food_search_text(alias)) stored,
  search_document tsvector generated always as (
    setweight(to_tsvector('simple', coalesce(alias, '')), 'A')
  ) stored,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint exercise_aliases_alias_not_blank check (length(btrim(alias)) > 0),
  constraint exercise_aliases_alias_type_check check (
    alias_type is null or alias_type = any (array['abbreviation', 'common_name', 'alternate_name'])
  )
);

comment on table public.exercises is
  'Authoritative ONE UP exercise library used by the workout UI and future workout-programming systems.';

comment on column public.exercises.primary_tracking_metric is
  'How future workout logging should normally track this exercise.';

comment on column public.exercises.load_type is
  'Whether the exercise is normally loaded by external weight, bodyweight, assistance, duration, or distance/time.';

comment on column public.exercises.instructions is
  'Ordered display steps for the exercise detail screen.';

create or replace function public.normalize_exercise_search_text(input text)
returns text
language sql
immutable
as $$
  select trim(
    regexp_replace(
      lower(regexp_replace(coalesce(input, ''), '[^[:alnum:]]+', ' ', 'g')),
      '\s+',
      ' ',
      'g'
    )
  );
$$;

drop trigger if exists set_muscles_updated_at on public.muscles;
create trigger set_muscles_updated_at
before update on public.muscles
for each row
execute function public.set_updated_at();

drop trigger if exists set_equipment_updated_at on public.equipment;
create trigger set_equipment_updated_at
before update on public.equipment
for each row
execute function public.set_updated_at();

drop trigger if exists set_exercises_updated_at on public.exercises;
create trigger set_exercises_updated_at
before update on public.exercises
for each row
execute function public.set_updated_at();

drop trigger if exists set_exercise_aliases_updated_at on public.exercise_aliases;
create trigger set_exercise_aliases_updated_at
before update on public.exercise_aliases
for each row
execute function public.set_updated_at();

create index exercises_active_sort_idx on public.exercises (is_active, sort_order, name);
create index exercises_slug_idx on public.exercises (slug);
create index exercises_normalized_name_prefix_idx on public.exercises (normalized_name text_pattern_ops) where is_active;
create index exercises_normalized_name_trgm_idx on public.exercises using gin (normalized_name gin_trgm_ops) where is_active;
create index exercises_search_document_idx on public.exercises using gin (search_document);
create index exercises_program_focuses_idx on public.exercises using gin (program_focuses);
create index exercise_muscles_muscle_idx on public.exercise_muscles (muscle_id, role, exercise_id);
create index exercise_muscles_exercise_idx on public.exercise_muscles (exercise_id, role, sort_order);
create index exercise_equipment_equipment_idx on public.exercise_equipment (equipment_id, exercise_id);
create index exercise_equipment_exercise_idx on public.exercise_equipment (exercise_id, sort_order);
create unique index exercise_aliases_unique_per_exercise_idx on public.exercise_aliases (exercise_id, normalized_alias);
create index exercise_aliases_normalized_prefix_idx on public.exercise_aliases (normalized_alias text_pattern_ops);
create index exercise_aliases_normalized_trgm_idx on public.exercise_aliases using gin (normalized_alias gin_trgm_ops);
create index exercise_aliases_search_document_idx on public.exercise_aliases using gin (search_document);

create or replace function public.search_exercises(
  p_query text default null,
  p_slug text default null,
  p_exercise_id uuid default null,
  p_muscle_codes text[] default null,
  p_muscle_groups text[] default null,
  p_body_regions text[] default null,
  p_equipment_codes text[] default null,
  p_exercise_types text[] default null,
  p_difficulty_levels text[] default null,
  p_movement_patterns text[] default null,
  p_program_focuses text[] default null,
  p_limit integer default 60
)
returns table (
  id uuid,
  slug text,
  name text,
  description text,
  instructions text[],
  exercise_type text,
  movement_pattern text,
  mechanic text,
  difficulty text,
  laterality text,
  primary_tracking_metric text,
  load_type text,
  program_focuses text[],
  primary_muscles text[],
  secondary_muscles text[],
  muscle_groups text[],
  body_regions text[],
  equipment text[],
  equipment_codes text[],
  aliases text[],
  relevance_score double precision
)
language sql
stable
as $$
  with params as (
    select
      nullif(btrim(coalesce(p_query, '')), '') as raw_query,
      public.normalize_exercise_search_text(coalesce(p_query, '')) as normalized_query,
      nullif(btrim(coalesce(p_slug, '')), '') as target_slug,
      least(greatest(coalesce(p_limit, 60), 1), 100) as capped_limit,
      case
        when nullif(public.normalize_exercise_search_text(coalesce(p_query, '')), '') is null then null
        else array_to_string(
          array(
            select token || ':*'
            from unnest(regexp_split_to_array(public.normalize_exercise_search_text(coalesce(p_query, '')), '\s+')) as token
            where token <> ''
          ),
          ' & '
        )
      end as prefix_tsquery
  ),
  direct_matches as (
    select e.id, 200000::double precision as score
    from public.exercises e
    cross join params p
    where e.is_active
      and (
        (p_exercise_id is not null and e.id = p_exercise_id)
        or (p.target_slug is not null and e.slug = p.target_slug)
      )
  ),
  exact_name_matches as (
    select e.id, 140000::double precision as score
    from public.exercises e
    cross join params p
    where e.is_active
      and p.raw_query is not null
      and e.normalized_name = p.normalized_query
  ),
  exact_alias_matches as (
    select a.exercise_id as id, 138000::double precision as score
    from public.exercise_aliases a
    join public.exercises e on e.id = a.exercise_id
    cross join params p
    where e.is_active
      and p.raw_query is not null
      and a.normalized_alias = p.normalized_query
  ),
  prefix_name_matches as (
    select e.id, 120000::double precision as score
    from public.exercises e
    cross join params p
    where e.is_active
      and p.raw_query is not null
      and e.normalized_name like p.normalized_query || '%'
  ),
  prefix_alias_matches as (
    select a.exercise_id as id, 118000::double precision as score
    from public.exercise_aliases a
    join public.exercises e on e.id = a.exercise_id
    cross join params p
    where e.is_active
      and p.raw_query is not null
      and a.normalized_alias like p.normalized_query || '%'
  ),
  fts_name_matches as (
    select e.id, 100000::double precision + ts_rank(e.search_document, to_tsquery('simple', p.prefix_tsquery)) * 1000 as score
    from public.exercises e
    cross join params p
    where e.is_active
      and p.prefix_tsquery is not null
      and e.search_document @@ to_tsquery('simple', p.prefix_tsquery)
  ),
  fts_alias_matches as (
    select a.exercise_id as id, 98000::double precision + ts_rank(a.search_document, to_tsquery('simple', p.prefix_tsquery)) * 1000 as score
    from public.exercise_aliases a
    join public.exercises e on e.id = a.exercise_id
    cross join params p
    where e.is_active
      and p.prefix_tsquery is not null
      and a.search_document @@ to_tsquery('simple', p.prefix_tsquery)
  ),
  trigram_name_matches as (
    select e.id, 70000::double precision + similarity(e.normalized_name, p.normalized_query) * 1000 as score
    from public.exercises e
    cross join params p
    where e.is_active
      and coalesce(length(p.normalized_query), 0) >= 3
      and e.normalized_name % p.normalized_query
  ),
  trigram_alias_matches as (
    select a.exercise_id as id, 68000::double precision + similarity(a.normalized_alias, p.normalized_query) * 1000 as score
    from public.exercise_aliases a
    join public.exercises e on e.id = a.exercise_id
    cross join params p
    where e.is_active
      and coalesce(length(p.normalized_query), 0) >= 3
      and a.normalized_alias % p.normalized_query
  ),
  candidate_matches as (
    select * from direct_matches
    union all select * from exact_name_matches
    union all select * from exact_alias_matches
    union all select * from prefix_name_matches
    union all select * from prefix_alias_matches
    union all select * from fts_name_matches
    union all select * from fts_alias_matches
    union all select * from trigram_name_matches
    union all select * from trigram_alias_matches
  ),
  candidate_scores as (
    select id, max(score) as relevance_score
    from candidate_matches
    group by id
  ),
  filtered as (
    select e.id, coalesce(cs.relevance_score, 0::double precision) as relevance_score
    from public.exercises e
    left join candidate_scores cs on cs.id = e.id
    cross join params p
    where e.is_active
      and (p_exercise_id is null or e.id = p_exercise_id)
      and (p.target_slug is null or e.slug = p.target_slug)
      and (
        p_exercise_id is not null
        or p.target_slug is not null
        or p.raw_query is null
        or cs.id is not null
      )
      and (
        coalesce(array_length(p_muscle_codes, 1), 0) = 0
        or exists (
          select 1
          from public.exercise_muscles em
          join public.muscles m on m.id = em.muscle_id
          where em.exercise_id = e.id
            and m.code = any (p_muscle_codes)
        )
      )
      and (
        coalesce(array_length(p_muscle_groups, 1), 0) = 0
        or exists (
          select 1
          from public.exercise_muscles em
          join public.muscles m on m.id = em.muscle_id
          where em.exercise_id = e.id
            and m.muscle_group = any (p_muscle_groups)
        )
      )
      and (
        coalesce(array_length(p_body_regions, 1), 0) = 0
        or exists (
          select 1
          from public.exercise_muscles em
          join public.muscles m on m.id = em.muscle_id
          where em.exercise_id = e.id
            and m.body_region = any (p_body_regions)
        )
      )
      and (
        coalesce(array_length(p_equipment_codes, 1), 0) = 0
        or exists (
          select 1
          from public.exercise_equipment ee
          join public.equipment eq on eq.id = ee.equipment_id
          where ee.exercise_id = e.id
            and eq.code = any (p_equipment_codes)
        )
      )
      and (
        coalesce(array_length(p_exercise_types, 1), 0) = 0
        or e.exercise_type = any (p_exercise_types)
      )
      and (
        coalesce(array_length(p_difficulty_levels, 1), 0) = 0
        or e.difficulty = any (p_difficulty_levels)
      )
      and (
        coalesce(array_length(p_movement_patterns, 1), 0) = 0
        or e.movement_pattern = any (p_movement_patterns)
      )
      and (
        coalesce(array_length(p_program_focuses, 1), 0) = 0
        or e.program_focuses && p_program_focuses
      )
  )
  select
    e.id,
    e.slug,
    e.name,
    e.description,
    e.instructions,
    e.exercise_type,
    e.movement_pattern,
    e.mechanic,
    e.difficulty,
    e.laterality,
    e.primary_tracking_metric,
    e.load_type,
    e.program_focuses,
    array(
      select m.name
      from public.exercise_muscles em
      join public.muscles m on m.id = em.muscle_id
      where em.exercise_id = e.id
        and em.role = 'primary'
      order by em.sort_order, m.name
    ) as primary_muscles,
    array(
      select m.name
      from public.exercise_muscles em
      join public.muscles m on m.id = em.muscle_id
      where em.exercise_id = e.id
        and em.role = 'secondary'
      order by em.sort_order, m.name
    ) as secondary_muscles,
    array(
      select distinct m.muscle_group
      from public.exercise_muscles em
      join public.muscles m on m.id = em.muscle_id
      where em.exercise_id = e.id
      order by m.muscle_group
    ) as muscle_groups,
    array(
      select distinct m.body_region
      from public.exercise_muscles em
      join public.muscles m on m.id = em.muscle_id
      where em.exercise_id = e.id
      order by m.body_region
    ) as body_regions,
    array(
      select eq.name
      from public.exercise_equipment ee
      join public.equipment eq on eq.id = ee.equipment_id
      where ee.exercise_id = e.id
      order by ee.sort_order, eq.name
    ) as equipment,
    array(
      select eq.code
      from public.exercise_equipment ee
      join public.equipment eq on eq.id = ee.equipment_id
      where ee.exercise_id = e.id
      order by ee.sort_order, eq.code
    ) as equipment_codes,
    array(
      select a.alias
      from public.exercise_aliases a
      where a.exercise_id = e.id
      order by a.sort_order, a.alias
    ) as aliases,
    filtered.relevance_score
  from filtered
  join public.exercises e on e.id = filtered.id
  cross join params p
  order by
    case when p_exercise_id is not null or p.target_slug is not null then 0 else 1 end,
    case when p.raw_query is null then 0 else 1 end desc,
    filtered.relevance_score desc,
    e.sort_order,
    e.name
  limit (select capped_limit from params);
$$;

grant select on table public.muscles to authenticated;
grant select on table public.equipment to authenticated;
grant select on table public.exercises to authenticated;
grant select on table public.exercise_muscles to authenticated;
grant select on table public.exercise_equipment to authenticated;
grant select on table public.exercise_aliases to authenticated;

grant select, insert, update, delete on table public.muscles to service_role;
grant select, insert, update, delete on table public.equipment to service_role;
grant select, insert, update, delete on table public.exercises to service_role;
grant select, insert, update, delete on table public.exercise_muscles to service_role;
grant select, insert, update, delete on table public.exercise_equipment to service_role;
grant select, insert, update, delete on table public.exercise_aliases to service_role;

grant execute on function public.search_exercises(
  text,
  text,
  uuid,
  text[],
  text[],
  text[],
  text[],
  text[],
  text[],
  text[],
  text[],
  integer
) to authenticated;

grant execute on function public.search_exercises(
  text,
  text,
  uuid,
  text[],
  text[],
  text[],
  text[],
  text[],
  text[],
  text[],
  text[],
  integer
) to service_role;

alter table public.muscles enable row level security;
alter table public.equipment enable row level security;
alter table public.exercises enable row level security;
alter table public.exercise_muscles enable row level security;
alter table public.exercise_equipment enable row level security;
alter table public.exercise_aliases enable row level security;

create policy "Muscles are readable by authenticated users"
on public.muscles
for select
to authenticated
using (true);

create policy "Equipment is readable by authenticated users"
on public.equipment
for select
to authenticated
using (true);

create policy "Exercises are readable when active"
on public.exercises
for select
to authenticated
using (is_active);

create policy "Exercise muscles are readable for active exercises"
on public.exercise_muscles
for select
to authenticated
using (
  exists (
    select 1
    from public.exercises e
    where e.id = exercise_muscles.exercise_id
      and e.is_active
  )
);

create policy "Exercise equipment is readable for active exercises"
on public.exercise_equipment
for select
to authenticated
using (
  exists (
    select 1
    from public.exercises e
    where e.id = exercise_equipment.exercise_id
      and e.is_active
  )
);

create policy "Exercise aliases are readable for active exercises"
on public.exercise_aliases
for select
to authenticated
using (
  exists (
    select 1
    from public.exercises e
    where e.id = exercise_aliases.exercise_id
      and e.is_active
  )
);

create temporary table tmp_exercise_seed (data jsonb not null) on commit drop;

insert into tmp_exercise_seed (data)
values ($exercise_seed${
  "muscles": [
    {
      "id": "590ae736-05ea-50be-968c-270af647b955",
      "code": "pectorals",
      "name": "Pectorals",
      "muscleGroup": "chest",
      "bodyRegion": "upper"
    },
    {
      "id": "e8e7900a-64b0-5b4b-94c6-c2dfdebd3df6",
      "code": "upper_chest",
      "name": "Upper Chest",
      "muscleGroup": "chest",
      "bodyRegion": "upper"
    },
    {
      "id": "3e1d95a5-5e16-5d75-a4e1-5d98ea961ad4",
      "code": "lats",
      "name": "Lats",
      "muscleGroup": "back",
      "bodyRegion": "upper"
    },
    {
      "id": "6e0a749d-7da3-548c-b787-7e1b705c3985",
      "code": "rhomboids",
      "name": "Rhomboids",
      "muscleGroup": "back",
      "bodyRegion": "upper"
    },
    {
      "id": "4cf95239-bf56-5ad1-aef9-052c291316e1",
      "code": "upper_back",
      "name": "Upper Back",
      "muscleGroup": "back",
      "bodyRegion": "upper"
    },
    {
      "id": "3b09799a-822f-55a5-8def-810d29770c05",
      "code": "deltoids",
      "name": "Deltoids",
      "muscleGroup": "shoulders",
      "bodyRegion": "upper"
    },
    {
      "id": "b1e8347a-9364-5020-8fe7-2d7c8ec439d4",
      "code": "side_delts",
      "name": "Side Delts",
      "muscleGroup": "shoulders",
      "bodyRegion": "upper"
    },
    {
      "id": "224359fd-2193-5ec2-8d13-dafc67c2e683",
      "code": "rear_delts",
      "name": "Rear Delts",
      "muscleGroup": "shoulders",
      "bodyRegion": "upper"
    },
    {
      "id": "99e31cac-5cd2-5c3d-91d4-99a1c1015a46",
      "code": "biceps",
      "name": "Biceps",
      "muscleGroup": "arms",
      "bodyRegion": "upper"
    },
    {
      "id": "0f5e4d91-0a3a-52f8-bdb9-dad255d6f48d",
      "code": "triceps",
      "name": "Triceps",
      "muscleGroup": "arms",
      "bodyRegion": "upper"
    },
    {
      "id": "43c85ad4-0572-556a-b496-e2b84c27d000",
      "code": "forearms",
      "name": "Forearms",
      "muscleGroup": "arms",
      "bodyRegion": "upper"
    },
    {
      "id": "eca2057f-3610-5cc1-af8a-89e551ec8680",
      "code": "quads",
      "name": "Quads",
      "muscleGroup": "legs",
      "bodyRegion": "lower"
    },
    {
      "id": "359690ac-82f0-5c66-ba1d-9ba808aaf877",
      "code": "hamstrings",
      "name": "Hamstrings",
      "muscleGroup": "legs",
      "bodyRegion": "lower"
    },
    {
      "id": "33790ca6-78cc-50d6-855b-b273123e400c",
      "code": "glutes",
      "name": "Glutes",
      "muscleGroup": "legs",
      "bodyRegion": "lower"
    },
    {
      "id": "0f00431b-7a83-538f-a0b4-1c116b5b28ad",
      "code": "calves",
      "name": "Calves",
      "muscleGroup": "legs",
      "bodyRegion": "lower"
    },
    {
      "id": "6f465ac2-35d4-542f-8f5e-968534a078e9",
      "code": "abs",
      "name": "Abs",
      "muscleGroup": "core",
      "bodyRegion": "core"
    },
    {
      "id": "2be12c0a-c399-573c-b9ff-c6b257a05a80",
      "code": "obliques",
      "name": "Obliques",
      "muscleGroup": "core",
      "bodyRegion": "core"
    },
    {
      "id": "0e1512a9-669a-54b7-b5f4-1d40502b8250",
      "code": "core",
      "name": "Core",
      "muscleGroup": "core",
      "bodyRegion": "core"
    },
    {
      "id": "048b3314-aa40-5975-9dec-650f5e3eaff4",
      "code": "hip_flexors",
      "name": "Hip Flexors",
      "muscleGroup": "core",
      "bodyRegion": "core"
    },
    {
      "id": "347c02f9-ec1f-5c93-989a-18bd64d7e9cf",
      "code": "lower_back",
      "name": "Lower Back",
      "muscleGroup": "back",
      "bodyRegion": "core"
    },
    {
      "id": "bedf1cd4-fdfb-5a2b-ac68-2fd83e9e00c7",
      "code": "rotator_cuff",
      "name": "Rotator Cuff",
      "muscleGroup": "shoulders",
      "bodyRegion": "upper"
    }
  ],
  "equipment": [
    {
      "id": "389df9dc-b0c7-5487-999e-ede487887fcf",
      "code": "bodyweight",
      "name": "Bodyweight",
      "category": "bodyweight"
    },
    {
      "id": "58d75549-ef67-5624-b53a-ea179c777440",
      "code": "barbell",
      "name": "Barbell",
      "category": "free_weight"
    },
    {
      "id": "d468a44d-4f43-5186-9cf9-adb88f7af5ec",
      "code": "dumbbell",
      "name": "Dumbbell",
      "category": "free_weight"
    },
    {
      "id": "35c30ff8-7364-5dca-8d74-07e9189c385e",
      "code": "cable",
      "name": "Cable",
      "category": "cable"
    },
    {
      "id": "bdebe20d-4e00-5ecc-81dc-7a69fbe4f40a",
      "code": "machine",
      "name": "Machine",
      "category": "machine"
    },
    {
      "id": "320ef07a-8900-56b3-897a-79e0f16bdfb3",
      "code": "bench",
      "name": "Bench",
      "category": "support"
    },
    {
      "id": "793bdfb0-7f2f-5984-921d-a702bfca327f",
      "code": "pullup_bar",
      "name": "Pull-Up Bar",
      "category": "station"
    },
    {
      "id": "985a1584-8c40-5b6c-95f8-e96b55ee0ba5",
      "code": "dip_station",
      "name": "Dip Station",
      "category": "station"
    },
    {
      "id": "296cd4e2-ff73-506f-be6b-3c404863ed49",
      "code": "ez_bar",
      "name": "EZ Bar",
      "category": "free_weight"
    },
    {
      "id": "3edf5f12-bbf8-55ee-9537-8edf7715c5f9",
      "code": "ab_wheel",
      "name": "Ab Wheel",
      "category": "accessory"
    },
    {
      "id": "0dded36f-1508-5357-b80e-936efb5e2491",
      "code": "treadmill",
      "name": "Treadmill",
      "category": "cardio"
    },
    {
      "id": "a14e496b-ea43-5b86-88f3-4e10e21ab200",
      "code": "stationary_bike",
      "name": "Stationary Bike",
      "category": "cardio"
    }
  ],
  "exercises": [
    {
      "id": "4bcd6394-106d-531b-bd20-707153a8f6f6",
      "sortOrder": 10,
      "source": "oneup_internal",
      "slug": "barbell-bench-press",
      "name": "Barbell Bench Press",
      "description": "Classic horizontal press for building chest strength with heavy bilateral loading.",
      "instructions": [
        "Set your eyes under the bar and plant your feet before lifting the bar out of the rack.",
        "Lower the bar to the mid chest with your shoulder blades pinned back and elbows stacked under the bar.",
        "Press the bar back up in a slight arc until your elbows lock out over the shoulders."
      ],
      "exerciseType": "strength",
      "movementPattern": "horizontal_push",
      "mechanic": "compound",
      "difficulty": "intermediate",
      "laterality": "bilateral",
      "tracking": "weight_reps",
      "loadType": "external_weight",
      "focuses": [
        "strength",
        "hypertrophy"
      ],
      "primary": [
        "pectorals"
      ],
      "secondary": [
        "triceps",
        "deltoids"
      ],
      "equipment": [
        {
          "code": "barbell",
          "requirement": "required"
        },
        {
          "code": "bench",
          "requirement": "required"
        }
      ],
      "aliases": [
        {
          "alias": "Bench Press",
          "type": "common_name"
        }
      ]
    },
    {
      "id": "49c29933-8acf-5daf-8e09-45d39ca1405c",
      "sortOrder": 20,
      "source": "oneup_internal",
      "slug": "incline-barbell-bench-press",
      "name": "Incline Barbell Bench Press",
      "description": "Incline press variation that shifts more work toward the upper chest and front delts.",
      "instructions": [
        "Set the bench to a low incline and grip the bar slightly wider than shoulder width.",
        "Lower the bar toward the upper chest while keeping the ribcage stacked and shoulders packed down.",
        "Drive the bar up over the shoulders without letting your elbows flare too early."
      ],
      "exerciseType": "strength",
      "movementPattern": "horizontal_push",
      "mechanic": "compound",
      "difficulty": "intermediate",
      "laterality": "bilateral",
      "tracking": "weight_reps",
      "loadType": "external_weight",
      "focuses": [
        "strength",
        "hypertrophy"
      ],
      "primary": [
        "upper_chest"
      ],
      "secondary": [
        "pectorals",
        "deltoids",
        "triceps"
      ],
      "equipment": [
        {
          "code": "barbell",
          "requirement": "required"
        },
        {
          "code": "bench",
          "requirement": "required"
        }
      ],
      "aliases": [
        {
          "alias": "Incline Bench Press",
          "type": "common_name"
        }
      ]
    },
    {
      "id": "8074f3ac-1ac6-5279-bc01-1132e577ded6",
      "sortOrder": 30,
      "source": "oneup_internal",
      "slug": "dumbbell-bench-press",
      "name": "Dumbbell Bench Press",
      "description": "Chest press variation that adds more range of motion and each-arm control.",
      "instructions": [
        "Kick the dumbbells into position with your feet and settle your shoulders into the bench.",
        "Lower both bells to the sides of the chest while keeping your wrists stacked over the elbows.",
        "Press the dumbbells back up together until they finish over the shoulders."
      ],
      "exerciseType": "strength",
      "movementPattern": "horizontal_push",
      "mechanic": "compound",
      "difficulty": "beginner",
      "laterality": "bilateral",
      "tracking": "weight_reps",
      "loadType": "external_weight",
      "focuses": [
        "strength",
        "hypertrophy"
      ],
      "primary": [
        "pectorals"
      ],
      "secondary": [
        "triceps",
        "deltoids"
      ],
      "equipment": [
        {
          "code": "dumbbell",
          "requirement": "required"
        },
        {
          "code": "bench",
          "requirement": "required"
        }
      ],
      "aliases": []
    },
    {
      "id": "d6f274c8-dba2-5056-bf05-af42fa41df50",
      "sortOrder": 40,
      "source": "oneup_internal",
      "slug": "incline-dumbbell-press",
      "name": "Incline Dumbbell Press",
      "description": "Upper-chest pressing pattern with dumbbells and a shoulder-friendly path.",
      "instructions": [
        "Set the bench to a low incline and bring the dumbbells to shoulder level before you recline.",
        "Lower the dumbbells with control until your elbows are just below the bench line.",
        "Press back up and slightly inward without letting the dumbbells drift behind the shoulders."
      ],
      "exerciseType": "strength",
      "movementPattern": "horizontal_push",
      "mechanic": "compound",
      "difficulty": "beginner",
      "laterality": "bilateral",
      "tracking": "weight_reps",
      "loadType": "external_weight",
      "focuses": [
        "strength",
        "hypertrophy"
      ],
      "primary": [
        "upper_chest"
      ],
      "secondary": [
        "deltoids",
        "triceps"
      ],
      "equipment": [
        {
          "code": "dumbbell",
          "requirement": "required"
        },
        {
          "code": "bench",
          "requirement": "required"
        }
      ],
      "aliases": []
    },
    {
      "id": "73ed61e2-62d2-573d-8ac0-54fa878ee216",
      "sortOrder": 50,
      "source": "oneup_internal",
      "slug": "cable-fly",
      "name": "Cable Fly",
      "description": "Isolation fly variation that keeps chest tension through the full arc.",
      "instructions": [
        "Set the handles just below shoulder height and take a split stance with a soft bend in the elbows.",
        "Bring the handles together in front of the chest without shrugging your shoulders forward.",
        "Return slowly until you feel a chest stretch while keeping your torso steady."
      ],
      "exerciseType": "strength",
      "movementPattern": "isolation",
      "mechanic": "isolation",
      "difficulty": "beginner",
      "laterality": "bilateral",
      "tracking": "weight_reps",
      "loadType": "external_weight",
      "focuses": [
        "hypertrophy"
      ],
      "primary": [
        "pectorals"
      ],
      "secondary": [
        "deltoids"
      ],
      "equipment": [
        {
          "code": "cable",
          "requirement": "required"
        }
      ],
      "aliases": [
        {
          "alias": "Cable Chest Fly",
          "type": "alternate_name"
        }
      ]
    },
    {
      "id": "646dd676-03a4-50ec-a7d3-395e50e99111",
      "sortOrder": 60,
      "source": "oneup_internal",
      "slug": "pec-deck-fly",
      "name": "Pec Deck Fly",
      "description": "Machine chest fly that makes it easy to train the chest close to failure with control.",
      "instructions": [
        "Adjust the seat so the handles line up with the middle of your chest.",
        "Bring the handles together in a smooth hugging arc while keeping the ribs down.",
        "Pause briefly in front, then return until your chest stretches without losing posture."
      ],
      "exerciseType": "strength",
      "movementPattern": "isolation",
      "mechanic": "isolation",
      "difficulty": "beginner",
      "laterality": "bilateral",
      "tracking": "weight_reps",
      "loadType": "external_weight",
      "focuses": [
        "hypertrophy"
      ],
      "primary": [
        "pectorals"
      ],
      "secondary": [],
      "equipment": [
        {
          "code": "machine",
          "requirement": "required"
        }
      ],
      "aliases": [
        {
          "alias": "Machine Fly",
          "type": "common_name"
        }
      ]
    },
    {
      "id": "3d089bc4-c2a1-548c-b709-9466f56b958b",
      "sortOrder": 70,
      "source": "oneup_internal",
      "slug": "push-up",
      "name": "Push-Up",
      "description": "Bodyweight pressing pattern that trains the chest, triceps, and core together.",
      "instructions": [
        "Set your hands just outside shoulder width and make a straight line from shoulders to heels.",
        "Lower the chest toward the floor while keeping the ribs tucked and elbows at a natural angle.",
        "Press the floor away until your arms are straight and your trunk stays rigid."
      ],
      "exerciseType": "strength",
      "movementPattern": "horizontal_push",
      "mechanic": "compound",
      "difficulty": "beginner",
      "laterality": "bilateral",
      "tracking": "bodyweight_reps",
      "loadType": "bodyweight",
      "focuses": [
        "strength",
        "stability"
      ],
      "primary": [
        "pectorals"
      ],
      "secondary": [
        "triceps",
        "core"
      ],
      "equipment": [
        {
          "code": "bodyweight",
          "requirement": "required"
        }
      ],
      "aliases": []
    },
    {
      "id": "99ba2eb6-bbdb-5fe9-857b-1b3f10cc1a08",
      "sortOrder": 80,
      "source": "oneup_internal",
      "slug": "chest-dip",
      "name": "Chest Dip",
      "description": "Dip variation with a forward torso lean to bias the chest and triceps.",
      "instructions": [
        "Support yourself on the bars with the shoulders packed down and the legs tucked behind you.",
        "Lean slightly forward as you lower until the upper arms are about parallel to the floor.",
        "Drive back up by pressing through the bars while maintaining the forward lean."
      ],
      "exerciseType": "strength",
      "movementPattern": "vertical_push",
      "mechanic": "compound",
      "difficulty": "advanced",
      "laterality": "bilateral",
      "tracking": "bodyweight_reps",
      "loadType": "bodyweight_plus_load",
      "focuses": [
        "strength",
        "hypertrophy"
      ],
      "primary": [
        "pectorals"
      ],
      "secondary": [
        "triceps",
        "deltoids"
      ],
      "equipment": [
        {
          "code": "bodyweight",
          "requirement": "required"
        },
        {
          "code": "dip_station",
          "requirement": "required"
        }
      ],
      "aliases": [
        {
          "alias": "Dip",
          "type": "common_name"
        }
      ]
    },
    {
      "id": "8e32e4a9-4891-5722-9fdb-58ce986f28e4",
      "sortOrder": 90,
      "source": "oneup_internal",
      "slug": "deadlift",
      "name": "Deadlift",
      "description": "Heavy hinge pattern that trains the posterior chain and total-body bracing.",
      "instructions": [
        "Set the bar over the middle of the foot and pull your chest tall before breaking it from the floor.",
        "Push the floor away while keeping the bar close to your legs and your trunk stiff.",
        "Stand tall at lockout, then return the bar by hinging back first before bending the knees."
      ],
      "exerciseType": "strength",
      "movementPattern": "hinge",
      "mechanic": "compound",
      "difficulty": "advanced",
      "laterality": "bilateral",
      "tracking": "weight_reps",
      "loadType": "external_weight",
      "focuses": [
        "strength"
      ],
      "primary": [
        "hamstrings",
        "glutes",
        "lower_back"
      ],
      "secondary": [
        "quads",
        "core"
      ],
      "equipment": [
        {
          "code": "barbell",
          "requirement": "required"
        }
      ],
      "aliases": []
    },
    {
      "id": "5dc58c23-6be2-576d-8134-e4ccd57145b7",
      "sortOrder": 100,
      "source": "oneup_internal",
      "slug": "romanian-deadlift",
      "name": "Romanian Deadlift",
      "description": "Hip hinge variation that emphasizes hamstrings and glutes through a long eccentric.",
      "instructions": [
        "Start from the top with the bar close to the thighs and a soft bend in the knees.",
        "Push the hips back as the bar travels down the legs until you feel the hamstrings fully loaded.",
        "Drive the hips forward to stand tall without letting the bar drift away from your body."
      ],
      "exerciseType": "strength",
      "movementPattern": "hinge",
      "mechanic": "compound",
      "difficulty": "intermediate",
      "laterality": "bilateral",
      "tracking": "weight_reps",
      "loadType": "external_weight",
      "focuses": [
        "strength",
        "hypertrophy"
      ],
      "primary": [
        "hamstrings",
        "glutes"
      ],
      "secondary": [
        "lower_back"
      ],
      "equipment": [
        {
          "code": "barbell",
          "requirement": "required"
        }
      ],
      "aliases": [
        {
          "alias": "RDL",
          "type": "abbreviation"
        }
      ]
    },
    {
      "id": "1a73106f-2def-535d-99b0-932b5cd9b078",
      "sortOrder": 110,
      "source": "oneup_internal",
      "slug": "bent-over-row",
      "name": "Bent Over Row",
      "description": "Free-weight rowing pattern that builds the lats and upper back with a strong hinge position.",
      "instructions": [
        "Hinge until your torso is just above parallel and let the bar hang under the shoulders.",
        "Row the bar toward the lower ribs while keeping the elbows tight and the trunk still.",
        "Lower the bar back under control without losing your back position."
      ],
      "exerciseType": "strength",
      "movementPattern": "horizontal_pull",
      "mechanic": "compound",
      "difficulty": "intermediate",
      "laterality": "bilateral",
      "tracking": "weight_reps",
      "loadType": "external_weight",
      "focuses": [
        "strength",
        "hypertrophy"
      ],
      "primary": [
        "lats",
        "upper_back"
      ],
      "secondary": [
        "rhomboids",
        "biceps",
        "lower_back"
      ],
      "equipment": [
        {
          "code": "barbell",
          "requirement": "required"
        }
      ],
      "aliases": [
        {
          "alias": "Barbell Row",
          "type": "common_name"
        }
      ]
    },
    {
      "id": "99e3940a-372a-517b-9ceb-27af22fd651f",
      "sortOrder": 120,
      "source": "oneup_internal",
      "slug": "chest-supported-dumbbell-row",
      "name": "Chest-Supported Dumbbell Row",
      "description": "Supported row that keeps tension on the back while reducing lower-back fatigue.",
      "instructions": [
        "Lie face down on an incline bench with a dumbbell in each hand and the chest glued to the pad.",
        "Pull the elbows up and back until the dumbbells reach the side of the bench.",
        "Lower slowly until the arms are straight without lifting your chest from the pad."
      ],
      "exerciseType": "strength",
      "movementPattern": "horizontal_pull",
      "mechanic": "compound",
      "difficulty": "beginner",
      "laterality": "bilateral",
      "tracking": "weight_reps",
      "loadType": "external_weight",
      "focuses": [
        "strength",
        "hypertrophy"
      ],
      "primary": [
        "upper_back",
        "rhomboids"
      ],
      "secondary": [
        "lats",
        "biceps"
      ],
      "equipment": [
        {
          "code": "dumbbell",
          "requirement": "required"
        },
        {
          "code": "bench",
          "requirement": "required"
        }
      ],
      "aliases": [
        {
          "alias": "Chest Supported Row",
          "type": "common_name"
        }
      ]
    },
    {
      "id": "20f2210e-4923-54f7-8678-2fecaa6cc845",
      "sortOrder": 130,
      "source": "oneup_internal",
      "slug": "seated-cable-row",
      "name": "Seated Cable Row",
      "description": "Cable row variation with constant tension through the mid back and lats.",
      "instructions": [
        "Sit tall with the feet braced and the handle held at full arm extension.",
        "Drive the elbows back while keeping the ribs stacked and the shoulders away from the ears.",
        "Extend the arms again under control until you feel the lats stretch forward."
      ],
      "exerciseType": "strength",
      "movementPattern": "horizontal_pull",
      "mechanic": "compound",
      "difficulty": "beginner",
      "laterality": "bilateral",
      "tracking": "weight_reps",
      "loadType": "external_weight",
      "focuses": [
        "strength",
        "hypertrophy"
      ],
      "primary": [
        "lats",
        "rhomboids"
      ],
      "secondary": [
        "upper_back",
        "biceps"
      ],
      "equipment": [
        {
          "code": "cable",
          "requirement": "required"
        }
      ],
      "aliases": []
    },
    {
      "id": "fbc8b57e-6b99-593d-ab14-ed43245dd796",
      "sortOrder": 140,
      "source": "oneup_internal",
      "slug": "lat-pulldown",
      "name": "Lat Pulldown",
      "description": "Vertical pulling pattern that trains the lats through a controlled overhead path.",
      "instructions": [
        "Secure your legs under the pad and take a grip that lets the elbows travel down and in.",
        "Pull the bar toward the top of the chest without leaning too far backward.",
        "Return the bar overhead under control while keeping tension through the lats."
      ],
      "exerciseType": "strength",
      "movementPattern": "vertical_pull",
      "mechanic": "compound",
      "difficulty": "beginner",
      "laterality": "bilateral",
      "tracking": "weight_reps",
      "loadType": "external_weight",
      "focuses": [
        "strength",
        "hypertrophy"
      ],
      "primary": [
        "lats"
      ],
      "secondary": [
        "biceps",
        "upper_back"
      ],
      "equipment": [
        {
          "code": "cable",
          "requirement": "required"
        }
      ],
      "aliases": [
        {
          "alias": "Lat Pull-down",
          "type": "alternate_name"
        }
      ]
    },
    {
      "id": "9c86edad-e4bc-55aa-9346-288840f4dfdb",
      "sortOrder": 150,
      "source": "oneup_internal",
      "slug": "pull-up",
      "name": "Pull-Up",
      "description": "Bodyweight vertical pull that builds back strength and relative upper-body control.",
      "instructions": [
        "Hang from the bar with your ribs down and shoulders slightly active before the first rep.",
        "Pull your elbows toward your sides until the chin clears the bar.",
        "Lower with control to a full hang before starting the next rep."
      ],
      "exerciseType": "strength",
      "movementPattern": "vertical_pull",
      "mechanic": "compound",
      "difficulty": "advanced",
      "laterality": "bilateral",
      "tracking": "bodyweight_reps",
      "loadType": "bodyweight_plus_load",
      "focuses": [
        "strength"
      ],
      "primary": [
        "lats"
      ],
      "secondary": [
        "biceps",
        "core"
      ],
      "equipment": [
        {
          "code": "bodyweight",
          "requirement": "required"
        },
        {
          "code": "pullup_bar",
          "requirement": "required"
        }
      ],
      "aliases": [
        {
          "alias": "Pull Up",
          "type": "alternate_name"
        }
      ]
    },
    {
      "id": "282df7f6-0a6f-52dd-af8b-81bdf40e3ea8",
      "sortOrder": 160,
      "source": "oneup_internal",
      "slug": "single-arm-dumbbell-row",
      "name": "Single-Arm Dumbbell Row",
      "description": "Unilateral row that trains the lats while letting each side work through its own path.",
      "instructions": [
        "Brace one hand on a bench or rack and let the working arm hang straight toward the floor.",
        "Row the dumbbell toward the hip while keeping the chest square and the neck long.",
        "Lower under control until the shoulder reaches forward into a full stretch."
      ],
      "exerciseType": "strength",
      "movementPattern": "horizontal_pull",
      "mechanic": "compound",
      "difficulty": "beginner",
      "laterality": "unilateral",
      "tracking": "weight_reps",
      "loadType": "external_weight",
      "focuses": [
        "strength",
        "hypertrophy"
      ],
      "primary": [
        "lats"
      ],
      "secondary": [
        "rhomboids",
        "biceps"
      ],
      "equipment": [
        {
          "code": "dumbbell",
          "requirement": "required"
        },
        {
          "code": "bench",
          "requirement": "optional"
        }
      ],
      "aliases": [
        {
          "alias": "One-Arm Dumbbell Row",
          "type": "alternate_name"
        }
      ]
    },
    {
      "id": "f709fdbe-bb25-5351-bf68-7fb8fc007131",
      "sortOrder": 170,
      "source": "oneup_internal",
      "slug": "face-pull",
      "name": "Face Pull",
      "description": "Cable rear-delt and upper-back exercise that also reinforces shoulder positioning.",
      "instructions": [
        "Set the rope around face height and step back until the arms are straight.",
        "Pull the rope toward the bridge of the nose while spreading the ends apart.",
        "Return slowly without letting the shoulders shrug forward."
      ],
      "exerciseType": "strength",
      "movementPattern": "horizontal_pull",
      "mechanic": "isolation",
      "difficulty": "beginner",
      "laterality": "bilateral",
      "tracking": "weight_reps",
      "loadType": "external_weight",
      "focuses": [
        "stability",
        "hypertrophy"
      ],
      "primary": [
        "rear_delts",
        "upper_back"
      ],
      "secondary": [
        "rotator_cuff"
      ],
      "equipment": [
        {
          "code": "cable",
          "requirement": "required"
        }
      ],
      "aliases": []
    },
    {
      "id": "050b6586-1490-5b68-b066-7d92952c414c",
      "sortOrder": 180,
      "source": "oneup_internal",
      "slug": "assisted-pull-up-machine",
      "name": "Assisted Pull-Up Machine",
      "description": "Machine-assisted vertical pull that builds toward full bodyweight pull-ups.",
      "instructions": [
        "Set the assistance level, place your knees or feet on the support, and take your grip.",
        "Pull your chest up toward the handles while keeping the body stacked under the line of pull.",
        "Lower until the elbows are straight again without bouncing on the support."
      ],
      "exerciseType": "strength",
      "movementPattern": "vertical_pull",
      "mechanic": "compound",
      "difficulty": "beginner",
      "laterality": "bilateral",
      "tracking": "reps_only",
      "loadType": "assisted",
      "focuses": [
        "strength"
      ],
      "primary": [
        "lats"
      ],
      "secondary": [
        "biceps",
        "upper_back"
      ],
      "equipment": [
        {
          "code": "machine",
          "requirement": "required"
        }
      ],
      "aliases": [
        {
          "alias": "Assisted Pull-Up",
          "type": "common_name"
        }
      ]
    },
    {
      "id": "b04e6860-8fa9-598e-a945-477212eee562",
      "sortOrder": 190,
      "source": "oneup_internal",
      "slug": "overhead-press",
      "name": "Overhead Press",
      "description": "Vertical barbell press that challenges the shoulders, triceps, and full-body bracing.",
      "instructions": [
        "Start with the bar at shoulder height and squeeze your glutes before the press begins.",
        "Press the bar overhead in a straight line while moving your head slightly out of the way.",
        "Lock out over the mid foot, then lower back to the shoulders under control."
      ],
      "exerciseType": "strength",
      "movementPattern": "vertical_push",
      "mechanic": "compound",
      "difficulty": "intermediate",
      "laterality": "bilateral",
      "tracking": "weight_reps",
      "loadType": "external_weight",
      "focuses": [
        "strength",
        "hypertrophy"
      ],
      "primary": [
        "deltoids"
      ],
      "secondary": [
        "triceps",
        "upper_chest",
        "core"
      ],
      "equipment": [
        {
          "code": "barbell",
          "requirement": "required"
        }
      ],
      "aliases": [
        {
          "alias": "Barbell Overhead Press",
          "type": "common_name"
        }
      ]
    },
    {
      "id": "9e9656d7-fa56-508a-b0ae-8813907be180",
      "sortOrder": 200,
      "source": "oneup_internal",
      "slug": "seated-dumbbell-shoulder-press",
      "name": "Seated Dumbbell Shoulder Press",
      "description": "Shoulder press variation that adds single-arm control while the bench supports the torso.",
      "instructions": [
        "Sit tall on the bench with the dumbbells at shoulder height and palms facing forward.",
        "Press the dumbbells overhead until the elbows are straight above the shoulders.",
        "Lower back to the starting position without losing ribcage control."
      ],
      "exerciseType": "strength",
      "movementPattern": "vertical_push",
      "mechanic": "compound",
      "difficulty": "beginner",
      "laterality": "bilateral",
      "tracking": "weight_reps",
      "loadType": "external_weight",
      "focuses": [
        "strength",
        "hypertrophy"
      ],
      "primary": [
        "deltoids"
      ],
      "secondary": [
        "triceps",
        "upper_chest"
      ],
      "equipment": [
        {
          "code": "dumbbell",
          "requirement": "required"
        },
        {
          "code": "bench",
          "requirement": "required"
        }
      ],
      "aliases": [
        {
          "alias": "Dumbbell Shoulder Press",
          "type": "common_name"
        }
      ]
    },
    {
      "id": "7e28ec2b-f422-597c-9a10-7b11f710e9b3",
      "sortOrder": 210,
      "source": "oneup_internal",
      "slug": "dumbbell-lateral-raise",
      "name": "Dumbbell Lateral Raise",
      "description": "Isolation raise that targets the side delts through a clean outward arc.",
      "instructions": [
        "Stand tall with the dumbbells at your sides and a small bend in the elbows.",
        "Raise the arms out until the hands reach shoulder height without swinging the torso.",
        "Lower with control and keep tension on the delts between reps."
      ],
      "exerciseType": "strength",
      "movementPattern": "isolation",
      "mechanic": "isolation",
      "difficulty": "beginner",
      "laterality": "bilateral",
      "tracking": "weight_reps",
      "loadType": "external_weight",
      "focuses": [
        "hypertrophy"
      ],
      "primary": [
        "side_delts"
      ],
      "secondary": [
        "deltoids"
      ],
      "equipment": [
        {
          "code": "dumbbell",
          "requirement": "required"
        }
      ],
      "aliases": [
        {
          "alias": "Lateral Raise",
          "type": "common_name"
        }
      ]
    },
    {
      "id": "dde58121-4014-5b42-bad5-11d1f50c762e",
      "sortOrder": 220,
      "source": "oneup_internal",
      "slug": "cable-lateral-raise",
      "name": "Cable Lateral Raise",
      "description": "Cable side-delt raise that keeps tension on the shoulder through the full range.",
      "instructions": [
        "Stand side-on to the cable stack and hold the handle with the working hand across the body.",
        "Lift the arm out to shoulder height while keeping the torso quiet and the wrist neutral.",
        "Return slowly until the cable crosses back in front of the thigh."
      ],
      "exerciseType": "strength",
      "movementPattern": "isolation",
      "mechanic": "isolation",
      "difficulty": "intermediate",
      "laterality": "unilateral",
      "tracking": "weight_reps",
      "loadType": "external_weight",
      "focuses": [
        "hypertrophy"
      ],
      "primary": [
        "side_delts"
      ],
      "secondary": [
        "deltoids"
      ],
      "equipment": [
        {
          "code": "cable",
          "requirement": "required"
        }
      ],
      "aliases": []
    },
    {
      "id": "e29e5a6c-f59f-5ce2-b22e-9bed855024ef",
      "sortOrder": 230,
      "source": "oneup_internal",
      "slug": "rear-delt-fly",
      "name": "Rear Delt Fly",
      "description": "Rear-shoulder fly for building the back side of the shoulders and upper back control.",
      "instructions": [
        "Hinge forward or brace the chest against a pad so the arms can hang below the shoulders.",
        "Sweep the arms out wide until the upper arms line up with the torso.",
        "Lower under control without turning the rep into a row."
      ],
      "exerciseType": "strength",
      "movementPattern": "isolation",
      "mechanic": "isolation",
      "difficulty": "beginner",
      "laterality": "bilateral",
      "tracking": "weight_reps",
      "loadType": "external_weight",
      "focuses": [
        "hypertrophy"
      ],
      "primary": [
        "rear_delts"
      ],
      "secondary": [
        "upper_back"
      ],
      "equipment": [
        {
          "code": "dumbbell",
          "requirement": "required"
        }
      ],
      "aliases": [
        {
          "alias": "Reverse Fly",
          "type": "alternate_name"
        }
      ]
    },
    {
      "id": "bb24de21-87b9-5ece-9992-0bfb31704439",
      "sortOrder": 240,
      "source": "oneup_internal",
      "slug": "front-raise",
      "name": "Front Raise",
      "description": "Shoulder isolation movement that trains the front delts through controlled flexion.",
      "instructions": [
        "Stand tall with the weight in front of the thighs and the ribs stacked over the hips.",
        "Raise the arm or arms forward to shoulder height without leaning backward.",
        "Lower slowly until the weight returns to the start with tension still on the shoulders."
      ],
      "exerciseType": "strength",
      "movementPattern": "isolation",
      "mechanic": "isolation",
      "difficulty": "beginner",
      "laterality": "bilateral",
      "tracking": "weight_reps",
      "loadType": "external_weight",
      "focuses": [
        "hypertrophy"
      ],
      "primary": [
        "deltoids"
      ],
      "secondary": [
        "upper_chest"
      ],
      "equipment": [
        {
          "code": "dumbbell",
          "requirement": "required"
        }
      ],
      "aliases": []
    },
    {
      "id": "0e84207d-b05e-5c96-bec7-37ad9a7545fe",
      "sortOrder": 250,
      "source": "oneup_internal",
      "slug": "barbell-curl",
      "name": "Barbell Curl",
      "description": "Classic bilateral curl for building elbow flexor strength and arm size.",
      "instructions": [
        "Stand with the bar resting against the thighs and keep the elbows pinned near the ribs.",
        "Curl the bar upward without letting the shoulders roll forward or the torso swing.",
        "Lower slowly until the elbows are straight again."
      ],
      "exerciseType": "strength",
      "movementPattern": "isolation",
      "mechanic": "isolation",
      "difficulty": "beginner",
      "laterality": "bilateral",
      "tracking": "weight_reps",
      "loadType": "external_weight",
      "focuses": [
        "hypertrophy"
      ],
      "primary": [
        "biceps"
      ],
      "secondary": [
        "forearms"
      ],
      "equipment": [
        {
          "code": "barbell",
          "requirement": "required"
        }
      ],
      "aliases": []
    },
    {
      "id": "ddeb89a1-af02-5c51-80cf-f82a813ce8cc",
      "sortOrder": 260,
      "source": "oneup_internal",
      "slug": "hammer-curl",
      "name": "Hammer Curl",
      "description": "Neutral-grip curl that loads the biceps and forearms together.",
      "instructions": [
        "Hold the dumbbells at your sides with the palms facing each other and the elbows tucked.",
        "Curl upward while keeping the neutral grip and avoiding torso swing.",
        "Lower under control until the arms are straight again."
      ],
      "exerciseType": "strength",
      "movementPattern": "isolation",
      "mechanic": "isolation",
      "difficulty": "beginner",
      "laterality": "bilateral",
      "tracking": "weight_reps",
      "loadType": "external_weight",
      "focuses": [
        "hypertrophy"
      ],
      "primary": [
        "biceps"
      ],
      "secondary": [
        "forearms"
      ],
      "equipment": [
        {
          "code": "dumbbell",
          "requirement": "required"
        }
      ],
      "aliases": []
    },
    {
      "id": "2e841f94-bce2-59b9-8800-b276c2c12b62",
      "sortOrder": 270,
      "source": "oneup_internal",
      "slug": "incline-dumbbell-curl",
      "name": "Incline Dumbbell Curl",
      "description": "Long-range curl performed on an incline bench to challenge the biceps from a stretched position.",
      "instructions": [
        "Sit back on a low incline bench with the arms hanging fully behind the torso.",
        "Curl the dumbbells up without letting the shoulders roll forward off the pad.",
        "Lower until the elbows are straight and the biceps stretch again."
      ],
      "exerciseType": "strength",
      "movementPattern": "isolation",
      "mechanic": "isolation",
      "difficulty": "intermediate",
      "laterality": "bilateral",
      "tracking": "weight_reps",
      "loadType": "external_weight",
      "focuses": [
        "hypertrophy"
      ],
      "primary": [
        "biceps"
      ],
      "secondary": [],
      "equipment": [
        {
          "code": "dumbbell",
          "requirement": "required"
        },
        {
          "code": "bench",
          "requirement": "required"
        }
      ],
      "aliases": []
    },
    {
      "id": "0e943c9c-2e97-5bbf-9296-bd5c3eb4b825",
      "sortOrder": 280,
      "source": "oneup_internal",
      "slug": "preacher-curl",
      "name": "Preacher Curl",
      "description": "Supported curl variation that reduces body English and keeps constant elbow-flexor tension.",
      "instructions": [
        "Set your upper arms on the pad so the armpits stay glued down throughout the set.",
        "Curl the handle or bar until the forearms approach vertical without lifting the elbows.",
        "Lower slowly until the elbows are nearly straight."
      ],
      "exerciseType": "strength",
      "movementPattern": "isolation",
      "mechanic": "isolation",
      "difficulty": "beginner",
      "laterality": "bilateral",
      "tracking": "weight_reps",
      "loadType": "external_weight",
      "focuses": [
        "hypertrophy"
      ],
      "primary": [
        "biceps"
      ],
      "secondary": [],
      "equipment": [
        {
          "code": "ez_bar",
          "requirement": "optional"
        },
        {
          "code": "machine",
          "requirement": "optional"
        },
        {
          "code": "bench",
          "requirement": "required"
        }
      ],
      "aliases": []
    },
    {
      "id": "e4f2d2ab-0bd8-5099-a6ec-c6f03cf36e47",
      "sortOrder": 290,
      "source": "oneup_internal",
      "slug": "triceps-pushdown",
      "name": "Triceps Pushdown",
      "description": "Cable extension that isolates the triceps with a stable setup and repeatable line of pull.",
      "instructions": [
        "Stand tall at the cable with the elbows pinned close to the sides.",
        "Press the handle down until the elbows are fully straight without the shoulders drifting forward.",
        "Return only until the forearms are about parallel to the floor before repeating."
      ],
      "exerciseType": "strength",
      "movementPattern": "isolation",
      "mechanic": "isolation",
      "difficulty": "beginner",
      "laterality": "bilateral",
      "tracking": "weight_reps",
      "loadType": "external_weight",
      "focuses": [
        "hypertrophy"
      ],
      "primary": [
        "triceps"
      ],
      "secondary": [],
      "equipment": [
        {
          "code": "cable",
          "requirement": "required"
        }
      ],
      "aliases": []
    },
    {
      "id": "c1ac7389-1e94-5294-acfd-3ff08b546bb3",
      "sortOrder": 300,
      "source": "oneup_internal",
      "slug": "overhead-triceps-extension",
      "name": "Overhead Triceps Extension",
      "description": "Overhead extension that trains the triceps in a lengthened shoulder-flexed position.",
      "instructions": [
        "Hold the weight overhead with the elbows pointing forward and the ribs pulled down.",
        "Bend at the elbows to lower the weight behind the head without flaring the arms wide.",
        "Extend the elbows to return the weight overhead while keeping the upper arms mostly still."
      ],
      "exerciseType": "strength",
      "movementPattern": "isolation",
      "mechanic": "isolation",
      "difficulty": "intermediate",
      "laterality": "bilateral",
      "tracking": "weight_reps",
      "loadType": "external_weight",
      "focuses": [
        "hypertrophy"
      ],
      "primary": [
        "triceps"
      ],
      "secondary": [],
      "equipment": [
        {
          "code": "dumbbell",
          "requirement": "optional"
        },
        {
          "code": "cable",
          "requirement": "optional"
        },
        {
          "code": "ez_bar",
          "requirement": "optional"
        }
      ],
      "aliases": []
    },
    {
      "id": "380ee949-2b94-53e6-b231-c72091d5095e",
      "sortOrder": 310,
      "source": "oneup_internal",
      "slug": "lying-triceps-extension",
      "name": "Lying Triceps Extension",
      "description": "Skull crusher variation for direct triceps loading on a bench.",
      "instructions": [
        "Lie on the bench with the weight above the shoulders and the elbows pointing up.",
        "Lower the weight toward the forehead or just behind the head by bending only at the elbows.",
        "Extend the elbows to return to the start without letting the shoulders roll forward."
      ],
      "exerciseType": "strength",
      "movementPattern": "isolation",
      "mechanic": "isolation",
      "difficulty": "intermediate",
      "laterality": "bilateral",
      "tracking": "weight_reps",
      "loadType": "external_weight",
      "focuses": [
        "hypertrophy"
      ],
      "primary": [
        "triceps"
      ],
      "secondary": [],
      "equipment": [
        {
          "code": "ez_bar",
          "requirement": "optional"
        },
        {
          "code": "dumbbell",
          "requirement": "optional"
        },
        {
          "code": "bench",
          "requirement": "required"
        }
      ],
      "aliases": [
        {
          "alias": "Skull Crusher",
          "type": "common_name"
        }
      ]
    },
    {
      "id": "dc6eb91c-5547-56a3-bd47-cd473220d924",
      "sortOrder": 320,
      "source": "oneup_internal",
      "slug": "close-grip-bench-press",
      "name": "Close-Grip Bench Press",
      "description": "Bench press variation that keeps a narrower hand position to emphasize the triceps.",
      "instructions": [
        "Set up as you would for a bench press, but take a grip just inside shoulder width.",
        "Lower the bar to the lower chest with the elbows tucked closer to the torso.",
        "Press back to lockout while keeping the wrists stacked over the forearms."
      ],
      "exerciseType": "strength",
      "movementPattern": "horizontal_push",
      "mechanic": "compound",
      "difficulty": "intermediate",
      "laterality": "bilateral",
      "tracking": "weight_reps",
      "loadType": "external_weight",
      "focuses": [
        "strength",
        "hypertrophy"
      ],
      "primary": [
        "triceps"
      ],
      "secondary": [
        "pectorals",
        "deltoids"
      ],
      "equipment": [
        {
          "code": "barbell",
          "requirement": "required"
        },
        {
          "code": "bench",
          "requirement": "required"
        }
      ],
      "aliases": []
    },
    {
      "id": "3c5cb130-180a-5052-a820-f694cf9b1382",
      "sortOrder": 330,
      "source": "oneup_internal",
      "slug": "high-bar-squat",
      "name": "High Bar Squat",
      "description": "Upright barbell squat that strongly trains the quads while still loading the hips.",
      "instructions": [
        "Rest the bar high on the traps, brace hard, and set your feet in your squat stance.",
        "Sit down between the heels while keeping the chest tall and the knees tracking over the toes.",
        "Drive up through the whole foot until you stand fully tall again."
      ],
      "exerciseType": "strength",
      "movementPattern": "squat",
      "mechanic": "compound",
      "difficulty": "intermediate",
      "laterality": "bilateral",
      "tracking": "weight_reps",
      "loadType": "external_weight",
      "focuses": [
        "strength",
        "hypertrophy"
      ],
      "primary": [
        "quads"
      ],
      "secondary": [
        "glutes",
        "core"
      ],
      "equipment": [
        {
          "code": "barbell",
          "requirement": "required"
        }
      ],
      "aliases": [
        {
          "alias": "Back Squat",
          "type": "common_name"
        }
      ]
    },
    {
      "id": "fe171464-4eb1-59d5-bb1a-011352041f84",
      "sortOrder": 340,
      "source": "oneup_internal",
      "slug": "front-squat",
      "name": "Front Squat",
      "description": "Front-loaded squat variation that challenges the quads, trunk, and upper-back posture.",
      "instructions": [
        "Rack the bar across the front delts with the elbows high before stepping into your stance.",
        "Descend straight down while keeping the torso tall and the elbows lifted.",
        "Stand up by driving the floor away and maintaining the front-rack position."
      ],
      "exerciseType": "strength",
      "movementPattern": "squat",
      "mechanic": "compound",
      "difficulty": "advanced",
      "laterality": "bilateral",
      "tracking": "weight_reps",
      "loadType": "external_weight",
      "focuses": [
        "strength"
      ],
      "primary": [
        "quads"
      ],
      "secondary": [
        "glutes",
        "core",
        "upper_back"
      ],
      "equipment": [
        {
          "code": "barbell",
          "requirement": "required"
        }
      ],
      "aliases": []
    },
    {
      "id": "bf033534-ed45-5da6-9f14-3da66451213c",
      "sortOrder": 350,
      "source": "oneup_internal",
      "slug": "goblet-squat",
      "name": "Goblet Squat",
      "description": "Accessible squat variation that teaches bracing and depth with a front-held weight.",
      "instructions": [
        "Hold one dumbbell or kettlebell at chest height and set your feet into a stable squat stance.",
        "Descend while keeping the chest tall and the elbows inside the knees.",
        "Stand by pushing through the floor and keeping the weight close to the chest."
      ],
      "exerciseType": "strength",
      "movementPattern": "squat",
      "mechanic": "compound",
      "difficulty": "beginner",
      "laterality": "bilateral",
      "tracking": "weight_reps",
      "loadType": "external_weight",
      "focuses": [
        "strength",
        "hypertrophy"
      ],
      "primary": [
        "quads"
      ],
      "secondary": [
        "glutes",
        "core"
      ],
      "equipment": [
        {
          "code": "dumbbell",
          "requirement": "required"
        }
      ],
      "aliases": []
    },
    {
      "id": "3d9781a8-e597-513d-81ef-64e6987e3399",
      "sortOrder": 360,
      "source": "oneup_internal",
      "slug": "leg-press",
      "name": "Leg Press",
      "description": "Machine squat pattern that lets you load the legs hard with more external support.",
      "instructions": [
        "Set your feet on the platform in a stance that lets the knees track comfortably.",
        "Lower the sled until your thighs approach the chest without the hips rounding off the pad.",
        "Press the sled away through the whole foot until the knees are nearly straight."
      ],
      "exerciseType": "strength",
      "movementPattern": "squat",
      "mechanic": "compound",
      "difficulty": "beginner",
      "laterality": "bilateral",
      "tracking": "weight_reps",
      "loadType": "external_weight",
      "focuses": [
        "strength",
        "hypertrophy"
      ],
      "primary": [
        "quads"
      ],
      "secondary": [
        "glutes",
        "hamstrings"
      ],
      "equipment": [
        {
          "code": "machine",
          "requirement": "required"
        }
      ],
      "aliases": []
    },
    {
      "id": "9d65f3a8-a1e3-59c6-801a-fead3dfbcac1",
      "sortOrder": 370,
      "source": "oneup_internal",
      "slug": "walking-lunge",
      "name": "Walking Lunge",
      "description": "Traveling unilateral leg pattern that trains quads, glutes, and balance together.",
      "instructions": [
        "Step forward into a long stance and lower until both knees are bent with the torso tall.",
        "Push through the front foot to rise and bring the back leg through into the next step.",
        "Continue alternating sides while keeping the knees tracking cleanly over the toes."
      ],
      "exerciseType": "strength",
      "movementPattern": "lunge",
      "mechanic": "compound",
      "difficulty": "beginner",
      "laterality": "alternating",
      "tracking": "reps_only",
      "loadType": "bodyweight",
      "focuses": [
        "hypertrophy",
        "stability"
      ],
      "primary": [
        "quads",
        "glutes"
      ],
      "secondary": [
        "hamstrings",
        "core"
      ],
      "equipment": [
        {
          "code": "bodyweight",
          "requirement": "required"
        },
        {
          "code": "dumbbell",
          "requirement": "optional"
        }
      ],
      "aliases": []
    },
    {
      "id": "6c1378b3-9f07-5bc5-9b61-6b2522e651bc",
      "sortOrder": 380,
      "source": "oneup_internal",
      "slug": "bulgarian-split-squat",
      "name": "Bulgarian Split Squat",
      "description": "Rear-foot-elevated split squat for unilateral leg strength and deep quad loading.",
      "instructions": [
        "Set the back foot on a bench behind you and find a stance where the front foot stays flat.",
        "Lower straight down until the front thigh approaches parallel while the torso stays tall.",
        "Drive through the front foot to return to the top before repeating on the other side."
      ],
      "exerciseType": "strength",
      "movementPattern": "lunge",
      "mechanic": "compound",
      "difficulty": "intermediate",
      "laterality": "unilateral",
      "tracking": "weight_reps",
      "loadType": "external_weight",
      "focuses": [
        "strength",
        "hypertrophy"
      ],
      "primary": [
        "quads",
        "glutes"
      ],
      "secondary": [
        "hamstrings",
        "core"
      ],
      "equipment": [
        {
          "code": "bench",
          "requirement": "required"
        },
        {
          "code": "bodyweight",
          "requirement": "required"
        },
        {
          "code": "dumbbell",
          "requirement": "optional"
        }
      ],
      "aliases": [
        {
          "alias": "Rear-Foot Elevated Split Squat",
          "type": "alternate_name"
        }
      ]
    },
    {
      "id": "29328955-af4e-5153-8258-9fbcc5950a3a",
      "sortOrder": 390,
      "source": "oneup_internal",
      "slug": "leg-extension",
      "name": "Leg Extension",
      "description": "Machine isolation exercise for the quads with a simple resistance path.",
      "instructions": [
        "Set the machine so the knee joint lines up with the pivot point and the pad sits over the lower shin.",
        "Extend the knees until the legs are straight without kicking or bouncing the pad upward.",
        "Lower under control until the knees bend back to the start."
      ],
      "exerciseType": "strength",
      "movementPattern": "isolation",
      "mechanic": "isolation",
      "difficulty": "beginner",
      "laterality": "bilateral",
      "tracking": "weight_reps",
      "loadType": "external_weight",
      "focuses": [
        "hypertrophy"
      ],
      "primary": [
        "quads"
      ],
      "secondary": [],
      "equipment": [
        {
          "code": "machine",
          "requirement": "required"
        }
      ],
      "aliases": []
    },
    {
      "id": "41855e0f-09dc-5599-bfa4-2e63c3a9187a",
      "sortOrder": 400,
      "source": "oneup_internal",
      "slug": "seated-leg-curl",
      "name": "Seated Leg Curl",
      "description": "Hamstring isolation exercise that trains knee flexion with a stable seated setup.",
      "instructions": [
        "Adjust the machine so the knees line up with the pivot and the pad sits just above the heels.",
        "Curl the pad down by pulling the heels back under the seat.",
        "Return slowly until the knees are straight again without losing contact with the pad."
      ],
      "exerciseType": "strength",
      "movementPattern": "isolation",
      "mechanic": "isolation",
      "difficulty": "beginner",
      "laterality": "bilateral",
      "tracking": "weight_reps",
      "loadType": "external_weight",
      "focuses": [
        "hypertrophy"
      ],
      "primary": [
        "hamstrings"
      ],
      "secondary": [],
      "equipment": [
        {
          "code": "machine",
          "requirement": "required"
        }
      ],
      "aliases": [
        {
          "alias": "Leg Curl",
          "type": "common_name"
        }
      ]
    },
    {
      "id": "2d65535e-5203-561d-96ef-bb9058b5596d",
      "sortOrder": 410,
      "source": "oneup_internal",
      "slug": "hip-thrust",
      "name": "Hip Thrust",
      "description": "Glute-focused bridge pattern that lets you load hip extension heavily.",
      "instructions": [
        "Rest the upper back on a bench with the bar or pad across the hips and the feet flat on the floor.",
        "Drive through the heels to lift the hips until the torso and thighs form a straight line.",
        "Lower with control until the hips drop just below the bench edge before repeating."
      ],
      "exerciseType": "strength",
      "movementPattern": "hinge",
      "mechanic": "compound",
      "difficulty": "intermediate",
      "laterality": "bilateral",
      "tracking": "weight_reps",
      "loadType": "external_weight",
      "focuses": [
        "hypertrophy",
        "strength"
      ],
      "primary": [
        "glutes"
      ],
      "secondary": [
        "hamstrings",
        "core"
      ],
      "equipment": [
        {
          "code": "barbell",
          "requirement": "optional"
        },
        {
          "code": "bench",
          "requirement": "required"
        },
        {
          "code": "bodyweight",
          "requirement": "required"
        }
      ],
      "aliases": []
    },
    {
      "id": "8db80cd2-456f-5557-914b-ef11b03bbcb0",
      "sortOrder": 420,
      "source": "oneup_internal",
      "slug": "glute-bridge",
      "name": "Glute Bridge",
      "description": "Bridge variation for glute training with a shorter range and easy home setup.",
      "instructions": [
        "Lie on your back with the feet flat and the knees bent comfortably.",
        "Drive through the heels to lift the hips until the ribs stay down and the glutes fully squeeze.",
        "Lower slowly until the hips hover just above the floor."
      ],
      "exerciseType": "strength",
      "movementPattern": "hinge",
      "mechanic": "compound",
      "difficulty": "beginner",
      "laterality": "bilateral",
      "tracking": "reps_only",
      "loadType": "bodyweight",
      "focuses": [
        "stability",
        "hypertrophy"
      ],
      "primary": [
        "glutes"
      ],
      "secondary": [
        "hamstrings",
        "core"
      ],
      "equipment": [
        {
          "code": "bodyweight",
          "requirement": "required"
        }
      ],
      "aliases": []
    },
    {
      "id": "51ce4477-fb9e-5523-b671-13dbea21682f",
      "sortOrder": 430,
      "source": "oneup_internal",
      "slug": "standing-calf-raise",
      "name": "Standing Calf Raise",
      "description": "Straight-leg calf movement that trains the calves through ankle plantar flexion.",
      "instructions": [
        "Stand tall with the balls of the feet on a stable edge or platform if available.",
        "Rise as high as possible through the ankles without bending the knees.",
        "Lower until the calves stretch before the next rep."
      ],
      "exerciseType": "strength",
      "movementPattern": "isolation",
      "mechanic": "isolation",
      "difficulty": "beginner",
      "laterality": "bilateral",
      "tracking": "reps_only",
      "loadType": "bodyweight_plus_load",
      "focuses": [
        "hypertrophy"
      ],
      "primary": [
        "calves"
      ],
      "secondary": [],
      "equipment": [
        {
          "code": "bodyweight",
          "requirement": "required"
        },
        {
          "code": "dumbbell",
          "requirement": "optional"
        },
        {
          "code": "machine",
          "requirement": "optional"
        }
      ],
      "aliases": []
    },
    {
      "id": "b8e753f0-2e18-5d61-b888-af19047c7e56",
      "sortOrder": 440,
      "source": "oneup_internal",
      "slug": "seated-calf-raise",
      "name": "Seated Calf Raise",
      "description": "Bent-knee calf raise variation that makes it easy to isolate the calves under load.",
      "instructions": [
        "Sit into the machine or setup with the knees bent and the pad resting across the thighs.",
        "Press through the balls of the feet to raise the heels as high as possible.",
        "Lower slowly into a full stretch before starting the next rep."
      ],
      "exerciseType": "strength",
      "movementPattern": "isolation",
      "mechanic": "isolation",
      "difficulty": "beginner",
      "laterality": "bilateral",
      "tracking": "weight_reps",
      "loadType": "external_weight",
      "focuses": [
        "hypertrophy"
      ],
      "primary": [
        "calves"
      ],
      "secondary": [],
      "equipment": [
        {
          "code": "machine",
          "requirement": "required"
        }
      ],
      "aliases": []
    },
    {
      "id": "9aac0583-ab67-5ffc-b3a1-ae7db7bdd6de",
      "sortOrder": 450,
      "source": "oneup_internal",
      "slug": "bodyweight-squat",
      "name": "Bodyweight Squat",
      "description": "Simple squat pattern for home training, warm-ups, and technique practice.",
      "instructions": [
        "Set your feet into a comfortable squat stance with the ribs stacked over the hips.",
        "Sit down between the heels while keeping the chest tall and the knees tracking over the toes.",
        "Stand back up by driving evenly through both feet."
      ],
      "exerciseType": "strength",
      "movementPattern": "squat",
      "mechanic": "compound",
      "difficulty": "beginner",
      "laterality": "bilateral",
      "tracking": "reps_only",
      "loadType": "bodyweight",
      "focuses": [
        "conditioning",
        "stability"
      ],
      "primary": [
        "quads"
      ],
      "secondary": [
        "glutes",
        "core"
      ],
      "equipment": [
        {
          "code": "bodyweight",
          "requirement": "required"
        }
      ],
      "aliases": [
        {
          "alias": "Air Squat",
          "type": "alternate_name"
        }
      ]
    },
    {
      "id": "b7788caf-78de-5cd4-b632-048c5bd5edc1",
      "sortOrder": 460,
      "source": "oneup_internal",
      "slug": "plank",
      "name": "Plank",
      "description": "Anti-extension core hold that teaches full-body bracing under tension.",
      "instructions": [
        "Set your elbows under the shoulders and make a straight line from head to heels.",
        "Brace the abs and glutes so the hips do not sag or pike upward.",
        "Breathe through the brace and hold the position for the target time."
      ],
      "exerciseType": "strength",
      "movementPattern": "anti_extension",
      "mechanic": "isometric",
      "difficulty": "beginner",
      "laterality": "bilateral",
      "tracking": "duration",
      "loadType": "duration",
      "focuses": [
        "stability"
      ],
      "primary": [
        "core"
      ],
      "secondary": [
        "deltoids"
      ],
      "equipment": [
        {
          "code": "bodyweight",
          "requirement": "required"
        }
      ],
      "aliases": []
    },
    {
      "id": "9b6072ec-2c5f-5c8e-a2b2-b089b84dca31",
      "sortOrder": 470,
      "source": "oneup_internal",
      "slug": "side-plank",
      "name": "Side Plank",
      "description": "Lateral core hold that trains the obliques and shoulder stability.",
      "instructions": [
        "Stack the elbow under the shoulder and line the feet up so the body forms a straight side profile.",
        "Lift the hips high and keep the top shoulder stacked over the bottom shoulder.",
        "Hold the position while breathing steadily and resisting rotation."
      ],
      "exerciseType": "strength",
      "movementPattern": "anti_rotation",
      "mechanic": "isometric",
      "difficulty": "beginner",
      "laterality": "unilateral",
      "tracking": "duration",
      "loadType": "duration",
      "focuses": [
        "stability"
      ],
      "primary": [
        "obliques"
      ],
      "secondary": [
        "core",
        "deltoids"
      ],
      "equipment": [
        {
          "code": "bodyweight",
          "requirement": "required"
        }
      ],
      "aliases": []
    },
    {
      "id": "f415d9db-5158-5122-9b8d-a1eac3cfa259",
      "sortOrder": 480,
      "source": "oneup_internal",
      "slug": "hanging-leg-raise",
      "name": "Hanging Leg Raise",
      "description": "Advanced hanging core exercise that trains the abs through strong hip flexion control.",
      "instructions": [
        "Hang from the bar with the ribs down and the shoulders active before the first rep.",
        "Raise the legs by curling the pelvis under instead of simply swinging the feet upward.",
        "Lower the legs with control until the body is still again."
      ],
      "exerciseType": "strength",
      "movementPattern": "flexion",
      "mechanic": "compound",
      "difficulty": "advanced",
      "laterality": "bilateral",
      "tracking": "bodyweight_reps",
      "loadType": "bodyweight",
      "focuses": [
        "strength",
        "stability"
      ],
      "primary": [
        "abs"
      ],
      "secondary": [
        "hip_flexors",
        "core"
      ],
      "equipment": [
        {
          "code": "bodyweight",
          "requirement": "required"
        },
        {
          "code": "pullup_bar",
          "requirement": "required"
        }
      ],
      "aliases": []
    },
    {
      "id": "a4f0876d-9495-55c1-bc34-5acb5454d4b9",
      "sortOrder": 490,
      "source": "oneup_internal",
      "slug": "hanging-knee-raise",
      "name": "Hanging Knee Raise",
      "description": "More accessible hanging core variation that builds toward the full leg raise.",
      "instructions": [
        "Hang from the bar with your shoulders active and the legs together.",
        "Lift the knees toward the chest by curling the pelvis under instead of swinging.",
        "Lower until the body settles back into a dead hang before the next rep."
      ],
      "exerciseType": "strength",
      "movementPattern": "flexion",
      "mechanic": "compound",
      "difficulty": "intermediate",
      "laterality": "bilateral",
      "tracking": "bodyweight_reps",
      "loadType": "bodyweight",
      "focuses": [
        "strength",
        "stability"
      ],
      "primary": [
        "abs"
      ],
      "secondary": [
        "hip_flexors",
        "core"
      ],
      "equipment": [
        {
          "code": "bodyweight",
          "requirement": "required"
        },
        {
          "code": "pullup_bar",
          "requirement": "required"
        }
      ],
      "aliases": []
    },
    {
      "id": "ad7001bf-5235-5ffd-a1e9-d0cee304c4ea",
      "sortOrder": 500,
      "source": "oneup_internal",
      "slug": "cable-crunch",
      "name": "Cable Crunch",
      "description": "Loaded spinal-flexion exercise for direct abdominal hypertrophy work.",
      "instructions": [
        "Kneel facing the cable and lock the rope by the sides of your head.",
        "Curl the ribs toward the pelvis while keeping the hips mostly fixed in place.",
        "Extend back up under control until the abs lengthen without losing tension."
      ],
      "exerciseType": "strength",
      "movementPattern": "flexion",
      "mechanic": "isolation",
      "difficulty": "beginner",
      "laterality": "bilateral",
      "tracking": "weight_reps",
      "loadType": "external_weight",
      "focuses": [
        "hypertrophy"
      ],
      "primary": [
        "abs"
      ],
      "secondary": [],
      "equipment": [
        {
          "code": "cable",
          "requirement": "required"
        }
      ],
      "aliases": []
    },
    {
      "id": "10e0d4c3-b3c4-5ac9-8671-428508ea750a",
      "sortOrder": 510,
      "source": "oneup_internal",
      "slug": "pallof-press",
      "name": "Pallof Press",
      "description": "Anti-rotation cable press that trains the core to resist twisting.",
      "instructions": [
        "Stand side-on to the cable with the handle held at chest level and the feet planted evenly.",
        "Press the handle straight out while keeping the torso square and the hips still.",
        "Bring the handle back in slowly without letting the cable rotate you toward the stack."
      ],
      "exerciseType": "strength",
      "movementPattern": "anti_rotation",
      "mechanic": "isolation",
      "difficulty": "beginner",
      "laterality": "bilateral",
      "tracking": "reps_only",
      "loadType": "external_weight",
      "focuses": [
        "stability"
      ],
      "primary": [
        "obliques"
      ],
      "secondary": [
        "core"
      ],
      "equipment": [
        {
          "code": "cable",
          "requirement": "required"
        }
      ],
      "aliases": []
    },
    {
      "id": "3cff9daf-d9e4-5a48-b9f3-79f5b7c8b8e7",
      "sortOrder": 520,
      "source": "oneup_internal",
      "slug": "dead-bug",
      "name": "Dead Bug",
      "description": "Core control drill that trains anti-extension while the limbs move independently.",
      "instructions": [
        "Lie on your back with the hips and knees bent to ninety degrees and the arms straight up.",
        "Brace the core and slowly reach one leg and the opposite arm away without arching the lower back.",
        "Return to the start and repeat on the other side with the trunk still flat to the floor."
      ],
      "exerciseType": "strength",
      "movementPattern": "anti_extension",
      "mechanic": "isolation",
      "difficulty": "beginner",
      "laterality": "alternating",
      "tracking": "reps_only",
      "loadType": "bodyweight",
      "focuses": [
        "stability"
      ],
      "primary": [
        "core"
      ],
      "secondary": [
        "abs"
      ],
      "equipment": [
        {
          "code": "bodyweight",
          "requirement": "required"
        }
      ],
      "aliases": []
    },
    {
      "id": "3e91921d-2558-51e2-a126-270caa56caa3",
      "sortOrder": 530,
      "source": "oneup_internal",
      "slug": "ab-wheel-rollout",
      "name": "Ab Wheel Rollout",
      "description": "Anti-extension core exercise that challenges trunk stiffness over a long lever.",
      "instructions": [
        "Start on the knees with the wheel under the shoulders and the glutes lightly squeezed.",
        "Roll forward only as far as you can keep the ribs down and the lower back from arching.",
        "Pull the wheel back underneath you by bracing the core and driving the hips forward."
      ],
      "exerciseType": "strength",
      "movementPattern": "anti_extension",
      "mechanic": "compound",
      "difficulty": "advanced",
      "laterality": "bilateral",
      "tracking": "reps_only",
      "loadType": "bodyweight",
      "focuses": [
        "stability"
      ],
      "primary": [
        "core"
      ],
      "secondary": [
        "abs",
        "deltoids"
      ],
      "equipment": [
        {
          "code": "bodyweight",
          "requirement": "required"
        },
        {
          "code": "ab_wheel",
          "requirement": "required"
        }
      ],
      "aliases": [
        {
          "alias": "Ab Rollout",
          "type": "common_name"
        }
      ]
    },
    {
      "id": "739bb116-f5b3-5131-b6de-8882e3f212aa",
      "sortOrder": 540,
      "source": "oneup_internal",
      "slug": "bicycle-crunch",
      "name": "Bicycle Crunch",
      "description": "Bodyweight trunk-flexion drill that combines abdominal work with rotational control.",
      "instructions": [
        "Lie on your back with the hands lightly supporting the head and the knees bent up.",
        "Curl one shoulder toward the opposite knee while the other leg extends away.",
        "Alternate sides smoothly without pulling on the neck or swinging the legs."
      ],
      "exerciseType": "strength",
      "movementPattern": "flexion",
      "mechanic": "isolation",
      "difficulty": "beginner",
      "laterality": "alternating",
      "tracking": "reps_only",
      "loadType": "bodyweight",
      "focuses": [
        "conditioning",
        "stability"
      ],
      "primary": [
        "abs"
      ],
      "secondary": [
        "obliques",
        "hip_flexors"
      ],
      "equipment": [
        {
          "code": "bodyweight",
          "requirement": "required"
        }
      ],
      "aliases": []
    },
    {
      "id": "4f4cf162-691f-51a9-9365-ba505b223243",
      "sortOrder": 550,
      "source": "oneup_internal",
      "slug": "treadmill-run",
      "name": "Treadmill Run",
      "description": "Cardio running option tracked primarily by time and distance instead of reps.",
      "instructions": [
        "Set a pace you can control with a tall posture and relaxed shoulders.",
        "Land under your center of mass while matching your breathing to the pace.",
        "Use the cool-down to gradually bring the speed back to a walk before stepping off."
      ],
      "exerciseType": "cardio",
      "movementPattern": null,
      "mechanic": null,
      "difficulty": "beginner",
      "laterality": "bilateral",
      "tracking": "distance_duration",
      "loadType": "distance_duration",
      "focuses": [
        "conditioning"
      ],
      "primary": [
        "quads",
        "calves"
      ],
      "secondary": [
        "glutes",
        "core"
      ],
      "equipment": [
        {
          "code": "treadmill",
          "requirement": "required"
        }
      ],
      "aliases": [
        {
          "alias": "Run",
          "type": "common_name"
        }
      ]
    },
    {
      "id": "315e2c6c-a930-53b4-8e09-db974105441a",
      "sortOrder": 560,
      "source": "oneup_internal",
      "slug": "stationary-bike",
      "name": "Stationary Bike",
      "description": "Cardio cycling option that fits gym sessions and lower-impact conditioning work.",
      "instructions": [
        "Adjust the seat so the knee stays softly bent at the bottom of each pedal stroke.",
        "Pedal smoothly while keeping a steady torso and even pressure through both legs.",
        "Change resistance or pace only after you have settled into a controlled rhythm."
      ],
      "exerciseType": "cardio",
      "movementPattern": null,
      "mechanic": null,
      "difficulty": "beginner",
      "laterality": "bilateral",
      "tracking": "distance_duration",
      "loadType": "distance_duration",
      "focuses": [
        "conditioning"
      ],
      "primary": [
        "quads"
      ],
      "secondary": [
        "glutes",
        "calves"
      ],
      "equipment": [
        {
          "code": "stationary_bike",
          "requirement": "required"
        }
      ],
      "aliases": [
        {
          "alias": "Bike",
          "type": "common_name"
        }
      ]
    }
  ]
}$exercise_seed$::jsonb);

with muscle_seed as (
  select *
  from jsonb_to_recordset((select data->'muscles' from tmp_exercise_seed)) as seed(
    id uuid,
    code text,
    name text,
    "muscleGroup" text,
    "bodyRegion" text
  )
)
insert into public.muscles (
  id,
  code,
  name,
  muscle_group,
  body_region
)
select
  id,
  code,
  name,
  "muscleGroup",
  "bodyRegion"
from muscle_seed
on conflict (code) do update
set
  name = excluded.name,
  muscle_group = excluded.muscle_group,
  body_region = excluded.body_region,
  updated_at = timezone('utc', now());

with equipment_seed as (
  select *
  from jsonb_to_recordset((select data->'equipment' from tmp_exercise_seed)) as seed(
    id uuid,
    code text,
    name text,
    category text
  )
)
insert into public.equipment (
  id,
  code,
  name,
  category
)
select id, code, name, category
from equipment_seed
on conflict (code) do update
set
  name = excluded.name,
  category = excluded.category,
  updated_at = timezone('utc', now());

with exercise_seed as (
  select *
  from jsonb_to_recordset((select data->'exercises' from tmp_exercise_seed)) as seed(
    id uuid,
    "sortOrder" integer,
    source text,
    slug text,
    name text,
    description text,
    instructions jsonb,
    "exerciseType" text,
    "movementPattern" text,
    mechanic text,
    difficulty text,
    laterality text,
    tracking text,
    "loadType" text,
    focuses jsonb,
    "primary" jsonb,
    "secondary" jsonb,
    equipment jsonb,
    aliases jsonb
  )
)
insert into public.exercises (
  id,
  slug,
  name,
  description,
  instructions,
  exercise_type,
  movement_pattern,
  mechanic,
  difficulty,
  laterality,
  primary_tracking_metric,
  load_type,
  program_focuses,
  source,
  sort_order,
  is_active
)
select
  id,
  slug,
  name,
  description,
  array(select jsonb_array_elements_text(coalesce(instructions, '[]'::jsonb))),
  "exerciseType",
  "movementPattern",
  mechanic,
  difficulty,
  laterality,
  tracking,
  "loadType",
  array(select jsonb_array_elements_text(coalesce(focuses, '[]'::jsonb))),
  coalesce(source, 'oneup_internal'),
  "sortOrder",
  true
from exercise_seed
on conflict (slug) do update
set
  name = excluded.name,
  description = excluded.description,
  instructions = excluded.instructions,
  exercise_type = excluded.exercise_type,
  movement_pattern = excluded.movement_pattern,
  mechanic = excluded.mechanic,
  difficulty = excluded.difficulty,
  laterality = excluded.laterality,
  primary_tracking_metric = excluded.primary_tracking_metric,
  load_type = excluded.load_type,
  program_focuses = excluded.program_focuses,
  source = excluded.source,
  sort_order = excluded.sort_order,
  is_active = true,
  updated_at = timezone('utc', now());

with seeded_exercise_ids as (
  select id
  from jsonb_to_recordset((select data->'exercises' from tmp_exercise_seed)) as seed(id uuid)
)
delete from public.exercise_muscles
where exercise_id in (select id from seeded_exercise_ids);

with seeded_exercise_ids as (
  select id
  from jsonb_to_recordset((select data->'exercises' from tmp_exercise_seed)) as seed(id uuid)
)
delete from public.exercise_equipment
where exercise_id in (select id from seeded_exercise_ids);

with seeded_exercise_ids as (
  select id
  from jsonb_to_recordset((select data->'exercises' from tmp_exercise_seed)) as seed(id uuid)
)
delete from public.exercise_aliases
where exercise_id in (select id from seeded_exercise_ids);

with exercise_seed as (
  select *
  from jsonb_to_recordset((select data->'exercises' from tmp_exercise_seed)) as seed(
    id uuid,
    "primary" jsonb,
    "secondary" jsonb
  )
),
primary_rows as (
  select
    exercise_seed.id as exercise_id,
    codes.code,
    codes.ordinality::smallint as sort_order,
    'primary'::text as role
  from exercise_seed
  cross join lateral jsonb_array_elements_text(coalesce(exercise_seed."primary", '[]'::jsonb)) with ordinality as codes(code, ordinality)
),
secondary_rows as (
  select
    exercise_seed.id as exercise_id,
    codes.code,
    codes.ordinality::smallint as sort_order,
    'secondary'::text as role
  from exercise_seed
  cross join lateral jsonb_array_elements_text(coalesce(exercise_seed."secondary", '[]'::jsonb)) with ordinality as codes(code, ordinality)
),
all_rows as (
  select * from primary_rows
  union all
  select * from secondary_rows
)
insert into public.exercise_muscles (
  exercise_id,
  muscle_id,
  role,
  sort_order
)
select
  rows.exercise_id,
  m.id,
  rows.role,
  rows.sort_order
from all_rows rows
join public.muscles m on m.code = rows.code;

with exercise_seed as (
  select *
  from jsonb_to_recordset((select data->'exercises' from tmp_exercise_seed)) as seed(
    id uuid,
    equipment jsonb
  )
),
all_rows as (
  select
    exercise_seed.id as exercise_id,
    item.value->>'code' as code,
    coalesce(item.value->>'requirement', 'required') as requirement_type,
    item.ordinality::smallint as sort_order
  from exercise_seed
  cross join lateral jsonb_array_elements(exercise_seed.equipment) with ordinality as item(value, ordinality)
)
insert into public.exercise_equipment (
  exercise_id,
  equipment_id,
  requirement_type,
  sort_order
)
select
  rows.exercise_id,
  e.id,
  rows.requirement_type,
  rows.sort_order
from all_rows rows
join public.equipment e on e.code = rows.code;

with exercise_seed as (
  select *
  from jsonb_to_recordset((select data->'exercises' from tmp_exercise_seed)) as seed(
    id uuid,
    aliases jsonb
  )
),
all_rows as (
  select
    exercise_seed.id as exercise_id,
    item.value->>'alias' as alias,
    item.value->>'type' as alias_type,
    item.ordinality::smallint as sort_order
  from exercise_seed
  cross join lateral jsonb_array_elements(exercise_seed.aliases) with ordinality as item(value, ordinality)
)
insert into public.exercise_aliases (
  id,
  exercise_id,
  alias,
  alias_type,
  sort_order
)
select
  gen_random_uuid(),
  rows.exercise_id,
  rows.alias,
  rows.alias_type,
  rows.sort_order
from all_rows rows;
