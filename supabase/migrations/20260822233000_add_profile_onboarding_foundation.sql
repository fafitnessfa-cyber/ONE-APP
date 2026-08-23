create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  phone_number text,
  age_years smallint,
  height_cm numeric(6, 2),
  current_weight_kg numeric(7, 2),
  target_weight_kg numeric(7, 2),
  fitness_goal text,
  experience_level text,
  preferred_training_days_per_week smallint,
  preferred_training_days text[] not null default '{}'::text[],
  preferred_workout_location text,
  preferred_units text,
  onboarding_completed boolean not null default false,
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint profiles_display_name_not_blank check (
    display_name is null or length(btrim(display_name)) > 0
  ),
  constraint profiles_phone_number_not_blank check (
    phone_number is null or length(btrim(phone_number)) > 0
  ),
  constraint profiles_age_years_check check (
    age_years is null or age_years between 1 and 120
  ),
  constraint profiles_height_cm_check check (
    height_cm is null or (height_cm > 0 and height_cm <= 300)
  ),
  constraint profiles_current_weight_kg_check check (
    current_weight_kg is null or (current_weight_kg > 0 and current_weight_kg <= 1000)
  ),
  constraint profiles_target_weight_kg_check check (
    target_weight_kg is null or (target_weight_kg > 0 and target_weight_kg <= 1000)
  ),
  constraint profiles_fitness_goal_check check (
    fitness_goal is null
    or fitness_goal = any (
      array['lose_weight', 'build_muscle', 'maintain', 'improve_strength', 'improve_fitness']
    )
  ),
  constraint profiles_experience_level_check check (
    experience_level is null
    or experience_level = any (array['beginner', 'intermediate', 'advanced'])
  ),
  constraint profiles_preferred_training_days_per_week_check check (
    preferred_training_days_per_week is null
    or preferred_training_days_per_week between 0 and 7
  ),
  constraint profiles_preferred_training_days_check check (
    preferred_training_days <@ array[
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
      'sunday'
    ]::text[]
  ),
  constraint profiles_training_days_not_more_than_frequency_check check (
    preferred_training_days_per_week is null
    or cardinality(preferred_training_days) <= preferred_training_days_per_week
  ),
  constraint profiles_preferred_workout_location_check check (
    preferred_workout_location is null
    or preferred_workout_location = any (array['home', 'gym', 'both'])
  ),
  constraint profiles_preferred_units_check check (
    preferred_units is null
    or preferred_units = any (array['metric', 'imperial'])
  ),
  constraint profiles_completed_onboarding_requires_core_fields_check check (
    onboarding_completed = false
    or (
      display_name is not null
      and preferred_units is not null
      and age_years is not null
      and height_cm is not null
      and current_weight_kg is not null
      and fitness_goal is not null
      and experience_level is not null
      and preferred_training_days_per_week is not null
      and preferred_workout_location is not null
    )
  )
);

comment on table public.profiles is
  'Private per-user profile and onboarding state for ONE UP. Current weight is a convenience field, not historical progress tracking.';

comment on column public.profiles.current_weight_kg is
  'Latest known body weight stored canonically in kilograms. This is not a historical measurement log.';

comment on column public.profiles.target_weight_kg is
  'Optional target weight stored canonically in kilograms.';

comment on column public.profiles.preferred_units is
  'Preferred display system for height and weight. Canonical values remain cm/kg.';

comment on column public.profiles.onboarding_completed is
  'Authoritative server-side onboarding completion flag.';

create or replace function public.normalize_profile_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.display_name = nullif(btrim(coalesce(new.display_name, '')), '');
  new.phone_number = nullif(btrim(coalesce(new.phone_number, '')), '');

  if new.preferred_training_days is null then
    new.preferred_training_days = '{}'::text[];
  end if;

  if new.onboarding_completed then
    new.onboarding_completed_at =
      coalesce(new.onboarding_completed_at, timezone('utc', now()));
  else
    new.onboarding_completed_at = null;
  end if;

  return new;
end;
$$;

create or replace function public.handle_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists normalize_profiles_before_write on public.profiles;
create trigger normalize_profiles_before_write
before insert or update on public.profiles
for each row
execute function public.normalize_profile_before_write();

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

drop trigger if exists on_auth_user_created_create_profile on auth.users;
create trigger on_auth_user_created_create_profile
after insert on auth.users
for each row
execute function public.handle_auth_user_profile();

insert into public.profiles (id)
select u.id
from auth.users u
where not exists (
  select 1
  from public.profiles p
  where p.id = u.id
);

grant select, insert, update on table public.profiles to authenticated;

alter table public.profiles enable row level security;

create policy "Users can read their own profile"
on public.profiles
for select
to authenticated
using (id = auth.uid());

create policy "Users can create their own profile"
on public.profiles
for insert
to authenticated
with check (id = auth.uid());

create policy "Users can update their own profile"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());
