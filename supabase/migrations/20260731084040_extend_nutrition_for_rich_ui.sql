alter table public.foods
  add column if not exists slug text,
  add column if not exists source text default 'usda',
  add column if not exists default_servings numeric(8, 2) not null default 1,
  add column if not exists sodium_mg numeric(8, 2) not null default 0,
  add column if not exists keywords text[] not null default '{}',
  add column if not exists suggested_meal_ids text[] not null default '{}',
  add column if not exists featured_in_barcode_preview boolean not null default false;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'foods_slug_key'
  ) then
    alter table public.foods
      add constraint foods_slug_key unique (slug);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'foods_source_check'
  ) then
    alter table public.foods
      add constraint foods_source_check
      check (source in ('usda', 'nutritionix', 'saved', 'recipe'));
  end if;
end
$$;

alter table public.foods
  alter column source set not null;

alter table public.nutrition_goals
  add column if not exists exercise_calories integer not null default 0,
  add column if not exists hydration_consumed_liters numeric(6, 2) not null default 0;

alter table public.food_logs
  add column if not exists logged_from text default 'search',
  add column if not exists food_name text,
  add column if not exists food_brand text,
  add column if not exists serving_label text,
  add column if not exists food_source text default 'usda',
  add column if not exists calories_per_serving integer not null default 0,
  add column if not exists protein_per_serving_g numeric(8, 2) not null default 0,
  add column if not exists carbs_per_serving_g numeric(8, 2) not null default 0,
  add column if not exists fat_per_serving_g numeric(8, 2) not null default 0,
  add column if not exists fiber_per_serving_g numeric(8, 2) not null default 0,
  add column if not exists sodium_mg_per_serving numeric(8, 2) not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'food_logs_logged_from_check'
  ) then
    alter table public.food_logs
      add constraint food_logs_logged_from_check
      check (logged_from in ('search', 'barcode', 'saved', 'recipe', 'suggested'));
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'food_logs_food_source_check'
  ) then
    alter table public.food_logs
      add constraint food_logs_food_source_check
      check (food_source in ('usda', 'nutritionix', 'saved', 'recipe'));
  end if;
end
$$;

update public.food_logs as logs
set
  food_name = coalesce(logs.food_name, foods.name, 'Unknown Food'),
  food_brand = coalesce(logs.food_brand, foods.brand),
  serving_label = coalesce(logs.serving_label, foods.serving_label, '1 serving'),
  food_source = coalesce(logs.food_source, foods.source, 'usda'),
  calories_per_serving = case
    when logs.calories_per_serving > 0 then logs.calories_per_serving
    when logs.servings > 0 then round(logs.calories / logs.servings)::integer
    else logs.calories
  end,
  protein_per_serving_g = case
    when logs.protein_per_serving_g > 0 then logs.protein_per_serving_g
    when logs.servings > 0 then logs.protein_g / logs.servings
    else logs.protein_g
  end,
  carbs_per_serving_g = case
    when logs.carbs_per_serving_g > 0 then logs.carbs_per_serving_g
    when logs.servings > 0 then logs.carbs_g / logs.servings
    else logs.carbs_g
  end,
  fat_per_serving_g = case
    when logs.fat_per_serving_g > 0 then logs.fat_per_serving_g
    when logs.servings > 0 then logs.fat_g / logs.servings
    else logs.fat_g
  end,
  fiber_per_serving_g = case
    when logs.fiber_per_serving_g > 0 then logs.fiber_per_serving_g
    when logs.servings > 0 then logs.fiber_g / logs.servings
    else logs.fiber_g
  end,
  sodium_mg_per_serving = coalesce(nullif(logs.sodium_mg_per_serving, 0), foods.sodium_mg, 0)
from public.foods
where logs.food_id = foods.id;

update public.food_logs
set
  logged_from = coalesce(logged_from, 'search'),
  food_name = coalesce(food_name, 'Unknown Food'),
  serving_label = coalesce(serving_label, '1 serving'),
  food_source = coalesce(food_source, 'usda')
where
  logged_from is null
  or food_name is null
  or serving_label is null
  or food_source is null;

alter table public.food_logs
  alter column logged_from set not null,
  alter column food_source set not null;
