create table if not exists public.user_foods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  brand_name text,
  description text,
  base_amount numeric(12,4) not null,
  base_unit text not null,
  is_active boolean not null default true,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now()),
  constraint user_foods_name_not_blank_ck
    check (char_length(trim(name)) > 0),
  constraint user_foods_brand_name_not_blank_ck
    check (brand_name is null or char_length(trim(brand_name)) > 0),
  constraint user_foods_description_not_blank_ck
    check (description is null or char_length(trim(description)) > 0),
  constraint user_foods_base_amount_positive_ck
    check (base_amount > 0),
  constraint user_foods_base_unit_supported_ck
    check (lower(trim(base_unit)) in ('g', 'ml'))
);

create table if not exists public.user_food_nutrients (
  user_food_id uuid not null references public.user_foods (id) on delete cascade,
  nutrient_id uuid not null references public.nutrients (id) on delete restrict,
  amount numeric(12,4) not null,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now()),
  primary key (user_food_id, nutrient_id),
  constraint user_food_nutrients_amount_non_negative_ck
    check (amount >= 0)
);

create table if not exists public.user_food_servings (
  id uuid primary key default gen_random_uuid(),
  user_food_id uuid not null references public.user_foods (id) on delete cascade,
  serving_name text not null,
  quantity numeric(12,4) not null,
  gram_weight numeric(12,4),
  milliliter_volume numeric(12,4),
  household_unit text,
  is_default boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now()),
  constraint user_food_servings_name_not_blank_ck
    check (char_length(trim(serving_name)) > 0),
  constraint user_food_servings_quantity_positive_ck
    check (quantity > 0),
  constraint user_food_servings_gram_weight_positive_ck
    check (gram_weight is null or gram_weight > 0),
  constraint user_food_servings_milliliter_volume_positive_ck
    check (milliliter_volume is null or milliliter_volume > 0),
  constraint user_food_servings_household_unit_not_blank_ck
    check (household_unit is null or char_length(trim(household_unit)) > 0),
  constraint user_food_servings_sort_order_non_negative_ck
    check (sort_order >= 0)
);

create unique index if not exists user_food_servings_one_default_idx
  on public.user_food_servings (user_food_id)
  where is_default;

create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  description text,
  final_weight_g numeric(12,4) not null,
  serving_count numeric(12,4),
  total_nutrients jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now()),
  constraint recipes_name_not_blank_ck
    check (char_length(trim(name)) > 0),
  constraint recipes_description_not_blank_ck
    check (description is null or char_length(trim(description)) > 0),
  constraint recipes_final_weight_positive_ck
    check (final_weight_g > 0),
  constraint recipes_serving_count_positive_ck
    check (serving_count is null or serving_count > 0),
  constraint recipes_total_nutrients_object_ck
    check (jsonb_typeof(total_nutrients) = 'object')
);

create table if not exists public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  position integer not null default 0,
  catalog_food_id uuid references public.catalog_foods (id) on delete restrict,
  user_food_id uuid references public.user_foods (id) on delete restrict,
  catalog_serving_id uuid references public.food_servings (id) on delete set null,
  user_food_serving_id uuid references public.user_food_servings (id) on delete set null,
  serving_label text not null,
  quantity numeric(12,4) not null,
  effective_grams numeric(12,4),
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now()),
  constraint recipe_ingredients_single_source_ck
    check (num_nonnulls(catalog_food_id, user_food_id) = 1),
  constraint recipe_ingredients_position_non_negative_ck
    check (position >= 0),
  constraint recipe_ingredients_serving_label_not_blank_ck
    check (char_length(trim(serving_label)) > 0),
  constraint recipe_ingredients_quantity_positive_ck
    check (quantity > 0),
  constraint recipe_ingredients_effective_grams_positive_ck
    check (effective_grams is null or effective_grams > 0)
);

create index if not exists user_foods_user_active_updated_idx
  on public.user_foods (user_id, is_active, updated_at desc);

create index if not exists user_foods_user_name_idx
  on public.user_foods (user_id, lower(name));

create index if not exists user_food_nutrients_food_idx
  on public.user_food_nutrients (user_food_id);

create index if not exists user_food_servings_food_sort_idx
  on public.user_food_servings (user_food_id, sort_order asc, created_at asc);

create index if not exists recipes_user_active_updated_idx
  on public.recipes (user_id, is_active, updated_at desc);

create index if not exists recipes_user_name_idx
  on public.recipes (user_id, lower(name));

create index if not exists recipe_ingredients_recipe_position_idx
  on public.recipe_ingredients (recipe_id, position asc, created_at asc);

alter table public.food_logs
  add column if not exists user_food_id uuid references public.user_foods (id) on delete restrict,
  add column if not exists user_food_serving_id uuid references public.user_food_servings (id) on delete set null,
  add column if not exists recipe_id uuid references public.recipes (id) on delete restrict;

alter table public.food_logs
  drop constraint if exists food_logs_single_food_reference_ck,
  drop constraint if exists food_logs_food_source_check;

alter table public.food_logs
  add constraint food_logs_single_food_reference_ck
    check (num_nonnulls(food_id, catalog_food_id, user_food_id, recipe_id) = 1),
  add constraint food_logs_food_source_check
    check (food_source = any (array['usda'::text, 'nutritionix'::text, 'saved'::text, 'recipe'::text, 'custom'::text]));

create index if not exists food_logs_user_user_food_logged_at_idx
  on public.food_logs (user_id, user_food_id, logged_at desc)
  where user_food_id is not null;

create index if not exists food_logs_user_recipe_logged_at_idx
  on public.food_logs (user_id, recipe_id, logged_at desc)
  where recipe_id is not null;

create or replace function public.set_nutrition_entity_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

drop trigger if exists set_user_foods_updated_at on public.user_foods;
create trigger set_user_foods_updated_at
before update on public.user_foods
for each row
execute function public.set_nutrition_entity_updated_at();

drop trigger if exists set_user_food_nutrients_updated_at on public.user_food_nutrients;
create trigger set_user_food_nutrients_updated_at
before update on public.user_food_nutrients
for each row
execute function public.set_nutrition_entity_updated_at();

drop trigger if exists set_user_food_servings_updated_at on public.user_food_servings;
create trigger set_user_food_servings_updated_at
before update on public.user_food_servings
for each row
execute function public.set_nutrition_entity_updated_at();

drop trigger if exists set_recipes_updated_at on public.recipes;
create trigger set_recipes_updated_at
before update on public.recipes
for each row
execute function public.set_nutrition_entity_updated_at();

drop trigger if exists set_recipe_ingredients_updated_at on public.recipe_ingredients;
create trigger set_recipe_ingredients_updated_at
before update on public.recipe_ingredients
for each row
execute function public.set_nutrition_entity_updated_at();

grant select on table public.user_foods to authenticated;
grant select on table public.user_food_nutrients to authenticated;
grant select on table public.user_food_servings to authenticated;
grant select on table public.recipes to authenticated;
grant select on table public.recipe_ingredients to authenticated;

alter table public.user_foods enable row level security;
alter table public.user_food_nutrients enable row level security;
alter table public.user_food_servings enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;

drop policy if exists "Users can read their own user foods" on public.user_foods;
drop policy if exists "Users can create their own user foods" on public.user_foods;
drop policy if exists "Users can update their own user foods" on public.user_foods;
drop policy if exists "Users can delete their own user foods" on public.user_foods;

create policy "Users can read their own user foods"
on public.user_foods
for select
to authenticated
using (user_id = auth.uid());

create policy "Users can create their own user foods"
on public.user_foods
for insert
to authenticated
with check (user_id = auth.uid());

create policy "Users can update their own user foods"
on public.user_foods
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Users can delete their own user foods"
on public.user_foods
for delete
to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can read their own user food nutrients" on public.user_food_nutrients;
drop policy if exists "Users can create their own user food nutrients" on public.user_food_nutrients;
drop policy if exists "Users can update their own user food nutrients" on public.user_food_nutrients;
drop policy if exists "Users can delete their own user food nutrients" on public.user_food_nutrients;

create policy "Users can read their own user food nutrients"
on public.user_food_nutrients
for select
to authenticated
using (
  exists (
    select 1
    from public.user_foods uf
    where uf.id = user_food_nutrients.user_food_id
      and uf.user_id = auth.uid()
  )
);

create policy "Users can create their own user food nutrients"
on public.user_food_nutrients
for insert
to authenticated
with check (
  exists (
    select 1
    from public.user_foods uf
    where uf.id = user_food_nutrients.user_food_id
      and uf.user_id = auth.uid()
  )
);

create policy "Users can update their own user food nutrients"
on public.user_food_nutrients
for update
to authenticated
using (
  exists (
    select 1
    from public.user_foods uf
    where uf.id = user_food_nutrients.user_food_id
      and uf.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.user_foods uf
    where uf.id = user_food_nutrients.user_food_id
      and uf.user_id = auth.uid()
  )
);

create policy "Users can delete their own user food nutrients"
on public.user_food_nutrients
for delete
to authenticated
using (
  exists (
    select 1
    from public.user_foods uf
    where uf.id = user_food_nutrients.user_food_id
      and uf.user_id = auth.uid()
  )
);

drop policy if exists "Users can read their own user food servings" on public.user_food_servings;
drop policy if exists "Users can create their own user food servings" on public.user_food_servings;
drop policy if exists "Users can update their own user food servings" on public.user_food_servings;
drop policy if exists "Users can delete their own user food servings" on public.user_food_servings;

create policy "Users can read their own user food servings"
on public.user_food_servings
for select
to authenticated
using (
  exists (
    select 1
    from public.user_foods uf
    where uf.id = user_food_servings.user_food_id
      and uf.user_id = auth.uid()
  )
);

create policy "Users can create their own user food servings"
on public.user_food_servings
for insert
to authenticated
with check (
  exists (
    select 1
    from public.user_foods uf
    where uf.id = user_food_servings.user_food_id
      and uf.user_id = auth.uid()
  )
);

create policy "Users can update their own user food servings"
on public.user_food_servings
for update
to authenticated
using (
  exists (
    select 1
    from public.user_foods uf
    where uf.id = user_food_servings.user_food_id
      and uf.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.user_foods uf
    where uf.id = user_food_servings.user_food_id
      and uf.user_id = auth.uid()
  )
);

create policy "Users can delete their own user food servings"
on public.user_food_servings
for delete
to authenticated
using (
  exists (
    select 1
    from public.user_foods uf
    where uf.id = user_food_servings.user_food_id
      and uf.user_id = auth.uid()
  )
);

drop policy if exists "Users can read their own recipes" on public.recipes;
drop policy if exists "Users can create their own recipes" on public.recipes;
drop policy if exists "Users can update their own recipes" on public.recipes;
drop policy if exists "Users can delete their own recipes" on public.recipes;

create policy "Users can read their own recipes"
on public.recipes
for select
to authenticated
using (user_id = auth.uid());

create policy "Users can create their own recipes"
on public.recipes
for insert
to authenticated
with check (user_id = auth.uid());

create policy "Users can update their own recipes"
on public.recipes
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Users can delete their own recipes"
on public.recipes
for delete
to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can read their own recipe ingredients" on public.recipe_ingredients;
drop policy if exists "Users can create their own recipe ingredients" on public.recipe_ingredients;
drop policy if exists "Users can update their own recipe ingredients" on public.recipe_ingredients;
drop policy if exists "Users can delete their own recipe ingredients" on public.recipe_ingredients;

create policy "Users can read their own recipe ingredients"
on public.recipe_ingredients
for select
to authenticated
using (
  exists (
    select 1
    from public.recipes r
    where r.id = recipe_ingredients.recipe_id
      and r.user_id = auth.uid()
  )
);

create policy "Users can create their own recipe ingredients"
on public.recipe_ingredients
for insert
to authenticated
with check (
  exists (
    select 1
    from public.recipes r
    where r.id = recipe_ingredients.recipe_id
      and r.user_id = auth.uid()
  )
);

create policy "Users can update their own recipe ingredients"
on public.recipe_ingredients
for update
to authenticated
using (
  exists (
    select 1
    from public.recipes r
    where r.id = recipe_ingredients.recipe_id
      and r.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.recipes r
    where r.id = recipe_ingredients.recipe_id
      and r.user_id = auth.uid()
  )
);

create policy "Users can delete their own recipe ingredients"
on public.recipe_ingredients
for delete
to authenticated
using (
  exists (
    select 1
    from public.recipes r
    where r.id = recipe_ingredients.recipe_id
      and r.user_id = auth.uid()
  )
);

create or replace function public.food_log_reference_key(
  legacy_food_id uuid,
  master_catalog_food_id uuid,
  personal_food_id uuid,
  recipe_reference_id uuid
)
returns text
language sql
immutable
as $$
  select case
    when recipe_reference_id is not null then 'recipe:' || recipe_reference_id::text
    when personal_food_id is not null then 'user_food:' || personal_food_id::text
    when master_catalog_food_id is not null then 'catalog:' || master_catalog_food_id::text
    when legacy_food_id is not null then 'legacy:' || legacy_food_id::text
    else null
  end;
$$;

create or replace function public.food_log_entry_type(
  legacy_food_id uuid,
  master_catalog_food_id uuid,
  personal_food_id uuid,
  recipe_reference_id uuid
)
returns text
language sql
immutable
as $$
  select case
    when recipe_reference_id is not null then 'recipe'
    when personal_food_id is not null then 'user_food'
    when master_catalog_food_id is not null then 'catalog'
    when legacy_food_id is not null then 'legacy'
    else null
  end;
$$;

create or replace function public.save_user_food(
  food_id uuid default null,
  food_name text default null,
  brand_name text default null,
  description text default null,
  base_amount numeric default null,
  base_unit text default null,
  nutrient_values jsonb default null,
  servings jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_name text := trim(coalesce(food_name, ''));
  normalized_brand_name text := nullif(trim(coalesce(brand_name, '')), '');
  normalized_description text := nullif(trim(coalesce(description, '')), '');
  normalized_base_unit text := lower(trim(coalesce(base_unit, '')));
  validated_base_amount numeric(12,4) := base_amount::numeric(12,4);
  resolved_food_id uuid;
  default_serving_count integer;
  inserted_nutrient_count integer;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if normalized_name = '' then
    raise exception 'Custom food name is required';
  end if;

  if validated_base_amount is null or validated_base_amount <= 0 then
    raise exception 'Custom food base amount must be positive';
  end if;

  if normalized_base_unit not in ('g', 'ml') then
    raise exception 'Custom food base unit must be g or ml';
  end if;

  if nutrient_values is null or jsonb_typeof(nutrient_values) <> 'object' then
    raise exception 'Custom food nutrient values must be a JSON object';
  end if;

  if servings is null or jsonb_typeof(servings) <> 'array' then
    raise exception 'Custom food servings must be a JSON array';
  end if;

  if jsonb_object_length(nutrient_values) = 0 then
    raise exception 'Custom food nutrient values are required';
  end if;

  if jsonb_array_length(servings) = 0 then
    raise exception 'At least one custom food serving is required';
  end if;

  if exists (
    select 1
    from jsonb_each(nutrient_values) as entry(code, value_json)
    where jsonb_typeof(value_json) <> 'number'
  ) then
    raise exception 'Custom food nutrient values must all be numeric';
  end if;

  if exists (
    select 1
    from jsonb_each_text(nutrient_values) as entry(code, value_text)
    where value_text::numeric < 0
  ) then
    raise exception 'Custom food nutrient values cannot be negative';
  end if;

  if exists (
    select 1
    from (values ('energy_kcal'), ('protein'), ('carbohydrate'), ('fat')) as required(code)
    where not nutrient_values ? required.code
  ) then
    raise exception 'Calories, protein, carbohydrate, and fat are required for custom foods';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(servings) as serving(row_json)
    where jsonb_typeof(row_json) <> 'object'
  ) then
    raise exception 'Each custom food serving must be an object';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(servings) as serving(row_json)
    where trim(coalesce(row_json ->> 'serving_name', '')) = ''
  ) then
    raise exception 'Custom food servings must include a name';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(servings) as serving(row_json)
    where coalesce(nullif(row_json ->> 'quantity', '')::numeric, 0) <= 0
  ) then
    raise exception 'Custom food serving quantities must be positive';
  end if;

  if normalized_base_unit = 'g' and exists (
    select 1
    from jsonb_array_elements(servings) as serving(row_json)
    where coalesce(nullif(row_json ->> 'gram_weight', '')::numeric, 0) <= 0
  ) then
    raise exception 'Gram-based custom foods require positive gram weights for every serving';
  end if;

  if normalized_base_unit = 'ml' and exists (
    select 1
    from jsonb_array_elements(servings) as serving(row_json)
    where coalesce(nullif(row_json ->> 'milliliter_volume', '')::numeric, 0) <= 0
  ) then
    raise exception 'Milliliter-based custom foods require positive milliliter volumes for every serving';
  end if;

  select count(*)
  into default_serving_count
  from jsonb_array_elements(servings) as serving(row_json)
  where coalesce((row_json ->> 'is_default')::boolean, false);

  if default_serving_count > 1 then
    raise exception 'Only one custom food serving can be the default';
  end if;

  if food_id is null then
    insert into public.user_foods (
      user_id,
      name,
      brand_name,
      description,
      base_amount,
      base_unit,
      is_active
    )
    values (
      current_user_id,
      normalized_name,
      normalized_brand_name,
      normalized_description,
      validated_base_amount,
      normalized_base_unit,
      true
    )
    returning id into resolved_food_id;
  else
    update public.user_foods
    set
      name = normalized_name,
      brand_name = normalized_brand_name,
      description = normalized_description,
      base_amount = validated_base_amount,
      base_unit = normalized_base_unit,
      is_active = true
    where id = food_id
      and user_id = current_user_id
    returning id into resolved_food_id;

    if resolved_food_id is null then
      raise exception 'Custom food not found or not owned by the current user';
    end if;
  end if;

  delete from public.user_food_nutrients
  where user_food_id = resolved_food_id;

  insert into public.user_food_nutrients (
    user_food_id,
    nutrient_id,
    amount
  )
  select
    resolved_food_id,
    n.id,
    entry.value_text::numeric(12,4)
  from jsonb_each_text(nutrient_values) as entry(code, value_text)
  join public.nutrients n
    on n.code = entry.code;

  get diagnostics inserted_nutrient_count = row_count;

  if inserted_nutrient_count <> jsonb_object_length(nutrient_values) then
    raise exception 'One or more custom food nutrient codes are invalid';
  end if;

  delete from public.user_food_servings
  where user_food_id = resolved_food_id;

  insert into public.user_food_servings (
    id,
    user_food_id,
    serving_name,
    quantity,
    gram_weight,
    milliliter_volume,
    household_unit,
    is_default,
    sort_order
  )
  with raw_servings as (
    select
      serving.row_json,
      serving.ordinality - 1 as sort_order
    from jsonb_array_elements(servings) with ordinality as serving(row_json, ordinality)
  )
  select
    coalesce(nullif(raw_servings.row_json ->> 'id', '')::uuid, gen_random_uuid()),
    resolved_food_id,
    trim(raw_servings.row_json ->> 'serving_name'),
    (raw_servings.row_json ->> 'quantity')::numeric(12,4),
    nullif(raw_servings.row_json ->> 'gram_weight', '')::numeric(12,4),
    nullif(raw_servings.row_json ->> 'milliliter_volume', '')::numeric(12,4),
    nullif(trim(coalesce(raw_servings.row_json ->> 'household_unit', '')), ''),
    case
      when default_serving_count = 0 then raw_servings.sort_order = 0
      else coalesce((raw_servings.row_json ->> 'is_default')::boolean, false)
    end,
    raw_servings.sort_order
  from raw_servings
  order by raw_servings.sort_order asc;

  return resolved_food_id;
end;
$$;

create or replace function public.archive_user_food(target_food_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  update public.user_foods
  set is_active = false
  where id = target_food_id
    and user_id = auth.uid();

  if not found then
    raise exception 'Custom food not found or not owned by the current user';
  end if;
end;
$$;

create or replace function public.save_recipe(
  recipe_id uuid default null,
  recipe_name text default null,
  description text default null,
  final_weight_g numeric default null,
  serving_count numeric default null,
  total_nutrients jsonb default null,
  ingredients jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_name text := trim(coalesce(recipe_name, ''));
  normalized_description text := nullif(trim(coalesce(description, '')), '');
  validated_final_weight_g numeric(12,4) := final_weight_g::numeric(12,4);
  validated_serving_count numeric(12,4) := case
    when serving_count is null then null
    else serving_count::numeric(12,4)
  end;
  resolved_recipe_id uuid;
  inserted_ingredient_count integer;
  inserted_nutrient_count integer;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if normalized_name = '' then
    raise exception 'Recipe name is required';
  end if;

  if validated_final_weight_g is null or validated_final_weight_g <= 0 then
    raise exception 'Recipe final cooked weight must be positive';
  end if;

  if validated_serving_count is not null and validated_serving_count <= 0 then
    raise exception 'Recipe serving count must be positive when provided';
  end if;

  if total_nutrients is null or jsonb_typeof(total_nutrients) <> 'object' then
    raise exception 'Recipe nutrient totals must be a JSON object';
  end if;

  if ingredients is null or jsonb_typeof(ingredients) <> 'array' then
    raise exception 'Recipe ingredients must be a JSON array';
  end if;

  if jsonb_object_length(total_nutrients) = 0 then
    raise exception 'Recipe nutrient totals are required';
  end if;

  if jsonb_array_length(ingredients) = 0 then
    raise exception 'Recipes must include at least one ingredient';
  end if;

  if exists (
    select 1
    from jsonb_each(total_nutrients) as entry(code, value_json)
    where jsonb_typeof(value_json) <> 'number'
  ) then
    raise exception 'Recipe nutrient totals must all be numeric';
  end if;

  if exists (
    select 1
    from jsonb_each_text(total_nutrients) as entry(code, value_text)
    where value_text::numeric < 0
  ) then
    raise exception 'Recipe nutrient totals cannot be negative';
  end if;

  if exists (
    select 1
    from (values ('energy_kcal'), ('protein'), ('carbohydrate'), ('fat')) as required(code)
    where not total_nutrients ? required.code
  ) then
    raise exception 'Recipe calories, protein, carbohydrate, and fat totals are required';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(ingredients) as ingredient(row_json)
    where jsonb_typeof(row_json) <> 'object'
  ) then
    raise exception 'Each recipe ingredient must be an object';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(ingredients) as ingredient(row_json)
    where num_nonnulls(
      nullif(ingredient.row_json ->> 'catalog_food_id', ''),
      nullif(ingredient.row_json ->> 'user_food_id', '')
    ) <> 1
  ) then
    raise exception 'Each recipe ingredient must reference exactly one food source';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(ingredients) as ingredient(row_json)
    where trim(coalesce(ingredient.row_json ->> 'serving_label', '')) = ''
  ) then
    raise exception 'Each recipe ingredient must include a serving label';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(ingredients) as ingredient(row_json)
    where coalesce(nullif(ingredient.row_json ->> 'quantity', '')::numeric, 0) <= 0
  ) then
    raise exception 'Recipe ingredient quantities must be positive';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(ingredients) as ingredient(row_json)
    where ingredient.row_json ? 'effective_grams'
      and ingredient.row_json ->> 'effective_grams' <> ''
      and (ingredient.row_json ->> 'effective_grams')::numeric <= 0
  ) then
    raise exception 'Recipe ingredient gram weights must be positive when provided';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(ingredients) as ingredient(row_json)
    where ingredient.row_json ? 'user_food_id'
      and ingredient.row_json ->> 'user_food_id' <> ''
      and not exists (
        select 1
        from public.user_foods uf
        where uf.id = (ingredient.row_json ->> 'user_food_id')::uuid
          and uf.user_id = current_user_id
      )
  ) then
    raise exception 'Recipe ingredients can only use your own custom foods';
  end if;

  if recipe_id is null then
    insert into public.recipes (
      user_id,
      name,
      description,
      final_weight_g,
      serving_count,
      save_recipe.total_nutrients,
      is_active
    )
    values (
      current_user_id,
      normalized_name,
      normalized_description,
      validated_final_weight_g,
      validated_serving_count,
      total_nutrients,
      true
    )
    returning id into resolved_recipe_id;
  else
    update public.recipes
    set
      name = normalized_name,
      description = normalized_description,
      final_weight_g = validated_final_weight_g,
      serving_count = validated_serving_count,
      total_nutrients = save_recipe.total_nutrients,
      is_active = true
    where id = recipe_id
      and user_id = current_user_id
    returning id into resolved_recipe_id;

    if resolved_recipe_id is null then
      raise exception 'Recipe not found or not owned by the current user';
    end if;
  end if;

  select count(*)
  into inserted_nutrient_count
  from jsonb_each_text(total_nutrients) as entry(code, value_text)
  join public.nutrients n
    on n.code = entry.code;

  if inserted_nutrient_count <> jsonb_object_length(total_nutrients) then
    raise exception 'One or more recipe nutrient codes are invalid';
  end if;

  delete from public.recipe_ingredients as ingredients_to_replace
  where ingredients_to_replace.recipe_id = resolved_recipe_id;

  insert into public.recipe_ingredients (
    id,
    recipe_id,
    position,
    catalog_food_id,
    user_food_id,
    catalog_serving_id,
    user_food_serving_id,
    serving_label,
    quantity,
    effective_grams
  )
  with raw_ingredients as (
    select
      ingredient.row_json,
      ingredient.ordinality - 1 as position
    from jsonb_array_elements(ingredients) with ordinality as ingredient(row_json, ordinality)
  )
  select
    coalesce(nullif(raw_ingredients.row_json ->> 'id', '')::uuid, gen_random_uuid()),
    resolved_recipe_id,
    coalesce(nullif(raw_ingredients.row_json ->> 'position', '')::integer, raw_ingredients.position),
    nullif(raw_ingredients.row_json ->> 'catalog_food_id', '')::uuid,
    nullif(raw_ingredients.row_json ->> 'user_food_id', '')::uuid,
    nullif(raw_ingredients.row_json ->> 'catalog_serving_id', '')::uuid,
    nullif(raw_ingredients.row_json ->> 'user_food_serving_id', '')::uuid,
    trim(raw_ingredients.row_json ->> 'serving_label'),
    (raw_ingredients.row_json ->> 'quantity')::numeric(12,4),
    nullif(raw_ingredients.row_json ->> 'effective_grams', '')::numeric(12,4)
  from raw_ingredients
  order by coalesce(nullif(raw_ingredients.row_json ->> 'position', '')::integer, raw_ingredients.position);

  get diagnostics inserted_ingredient_count = row_count;

  if inserted_ingredient_count <> jsonb_array_length(ingredients) then
    raise exception 'Unable to save every recipe ingredient';
  end if;

  return resolved_recipe_id;
end;
$$;

create or replace function public.archive_recipe(target_recipe_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  update public.recipes
  set is_active = false
  where id = target_recipe_id
    and user_id = auth.uid();

  if not found then
    raise exception 'Recipe not found or not owned by the current user';
  end if;
end;
$$;

revoke all on function public.save_user_food(uuid, text, text, text, numeric, text, jsonb, jsonb) from public;
revoke all on function public.archive_user_food(uuid) from public;
revoke all on function public.save_recipe(uuid, text, text, numeric, numeric, jsonb, jsonb) from public;
revoke all on function public.archive_recipe(uuid) from public;

grant execute on function public.save_user_food(uuid, text, text, text, numeric, text, jsonb, jsonb) to authenticated;
grant execute on function public.archive_user_food(uuid) to authenticated;
grant execute on function public.save_recipe(uuid, text, text, numeric, numeric, jsonb, jsonb) to authenticated;
grant execute on function public.archive_recipe(uuid) to authenticated;

drop function if exists public.get_recent_foods(integer);
drop function if exists public.search_food_history(text, integer);
drop function if exists public.get_food_go_tos(meal_type, integer);

create or replace function public.get_recent_foods(
  result_limit integer default 20
)
returns table (
  reference_key text,
  entry_type text,
  catalog_food_id uuid,
  food_id uuid,
  user_food_id uuid,
  recipe_id uuid,
  catalog_serving_id uuid,
  user_food_serving_id uuid,
  food_name text,
  food_brand text,
  food_source text,
  serving_label text,
  serving_quantity numeric,
  effective_grams numeric,
  calories_per_serving numeric,
  protein_per_serving_g numeric,
  carbs_per_serving_g numeric,
  fat_per_serving_g numeric,
  fiber_per_serving_g numeric,
  sodium_mg_per_serving numeric,
  last_logged_at timestamp with time zone,
  log_count bigint
)
language sql
stable
set search_path = public, extensions
as $$
  with input as (
    select greatest(1, least(coalesce(result_limit, 20), 30)) as capped_limit
  ),
  scoped_logs as (
    select
      public.food_log_reference_key(fl.food_id, fl.catalog_food_id, fl.user_food_id, fl.recipe_id) as reference_key,
      public.food_log_entry_type(fl.food_id, fl.catalog_food_id, fl.user_food_id, fl.recipe_id) as entry_type,
      fl.*,
      row_number() over (
        partition by public.food_log_reference_key(fl.food_id, fl.catalog_food_id, fl.user_food_id, fl.recipe_id)
        order by fl.logged_at desc, fl.id desc
      ) as recent_rank,
      count(*) over (
        partition by public.food_log_reference_key(fl.food_id, fl.catalog_food_id, fl.user_food_id, fl.recipe_id)
      ) as log_count
    from public.food_logs fl
    where fl.user_id = auth.uid()
  )
  select
    sl.reference_key,
    sl.entry_type,
    sl.catalog_food_id,
    sl.food_id,
    sl.user_food_id,
    sl.recipe_id,
    sl.catalog_serving_id,
    sl.user_food_serving_id,
    sl.food_name,
    sl.food_brand,
    sl.food_source,
    sl.serving_label,
    sl.serving_quantity,
    sl.effective_grams,
    sl.calories_per_serving,
    sl.protein_per_serving_g,
    sl.carbs_per_serving_g,
    sl.fat_per_serving_g,
    sl.fiber_per_serving_g,
    sl.sodium_mg_per_serving,
    sl.logged_at as last_logged_at,
    sl.log_count
  from scoped_logs sl
  cross join input i
  where sl.recent_rank = 1
  order by sl.logged_at desc, sl.reference_key
  limit (select capped_limit from input);
$$;

create or replace function public.search_food_history(
  search_query text,
  result_limit integer default 8
)
returns table (
  reference_key text,
  entry_type text,
  catalog_food_id uuid,
  food_id uuid,
  user_food_id uuid,
  recipe_id uuid,
  catalog_serving_id uuid,
  user_food_serving_id uuid,
  food_name text,
  food_brand text,
  food_source text,
  serving_label text,
  serving_quantity numeric,
  effective_grams numeric,
  calories_per_serving numeric,
  protein_per_serving_g numeric,
  carbs_per_serving_g numeric,
  fat_per_serving_g numeric,
  fiber_per_serving_g numeric,
  sodium_mg_per_serving numeric,
  last_logged_at timestamp with time zone,
  log_count bigint,
  history_score double precision
)
language sql
stable
set search_path = public, extensions
as $$
  with input as (
    select
      public.normalize_food_search_text(search_query) as normalized_query,
      trim(regexp_replace(lower(coalesce(search_query, '')), '\s+', ' ', 'g')) as raw_query_for_trgm,
      greatest(1, least(coalesce(result_limit, 8), 20)) as capped_limit
  ),
  query_state as (
    select
      normalized_query,
      raw_query_for_trgm,
      capped_limit,
      char_length(normalized_query) as query_length
    from input
  ),
  history_window as (
    select
      public.food_log_reference_key(fl.food_id, fl.catalog_food_id, fl.user_food_id, fl.recipe_id) as reference_key,
      public.food_log_entry_type(fl.food_id, fl.catalog_food_id, fl.user_food_id, fl.recipe_id) as entry_type,
      fl.*,
      public.normalize_food_search_text(coalesce(fl.food_name, '')) as normalized_name,
      lower(coalesce(fl.food_name, '')) as lower_name,
      lower(coalesce(fl.food_brand, '')) as lower_brand
    from public.food_logs fl
    cross join query_state qs
    where fl.user_id = auth.uid()
      and qs.query_length >= 2
      and fl.logged_at >= timezone('utc'::text, now()) - interval '180 days'
  ),
  matched_logs as (
    select
      hw.*,
      (
        case
          when hw.normalized_name = qs.normalized_query then 120
          when hw.normalized_name like qs.normalized_query || '%' then 92
          when hw.normalized_name like '% ' || qs.normalized_query || '%' then 78
          when hw.normalized_name like '%' || qs.normalized_query || '%' then 64
          else 0
        end
        + case
            when qs.query_length >= 3 then greatest(similarity(hw.lower_name, qs.raw_query_for_trgm), 0) * 28
            else 0
          end
        + case
            when qs.query_length >= 3
              and hw.lower_brand <> ''
              and hw.lower_brand % qs.raw_query_for_trgm
              then greatest(similarity(hw.lower_brand, qs.raw_query_for_trgm), 0) * 10
            else 0
          end
      )::double precision as text_relevance
    from history_window hw
    cross join query_state qs
    where
      hw.normalized_name = qs.normalized_query
      or hw.normalized_name like qs.normalized_query || '%'
      or hw.normalized_name like '% ' || qs.normalized_query || '%'
      or hw.normalized_name like '%' || qs.normalized_query || '%'
      or (
        qs.query_length >= 3
        and (
          hw.lower_name % qs.raw_query_for_trgm
          or (hw.lower_brand <> '' and hw.lower_brand % qs.raw_query_for_trgm)
        )
      )
  ),
  aggregated as (
    select
      ml.reference_key,
      ml.entry_type,
      max(ml.logged_at) as last_logged_at,
      count(*) as log_count,
      max(ml.text_relevance) as text_relevance
    from matched_logs ml
    group by ml.reference_key, ml.entry_type
  ),
  latest_rows as (
    select distinct on (ml.reference_key)
      ml.reference_key,
      ml.catalog_food_id,
      ml.food_id,
      ml.user_food_id,
      ml.recipe_id,
      ml.catalog_serving_id,
      ml.user_food_serving_id,
      ml.food_name,
      ml.food_brand,
      ml.food_source,
      ml.serving_label,
      ml.serving_quantity,
      ml.effective_grams,
      ml.calories_per_serving,
      ml.protein_per_serving_g,
      ml.carbs_per_serving_g,
      ml.fat_per_serving_g,
      ml.fiber_per_serving_g,
      ml.sodium_mg_per_serving
    from matched_logs ml
    order by ml.reference_key, ml.logged_at desc, ml.id desc
  )
  select
    lr.reference_key,
    a.entry_type,
    lr.catalog_food_id,
    lr.food_id,
    lr.user_food_id,
    lr.recipe_id,
    lr.catalog_serving_id,
    lr.user_food_serving_id,
    lr.food_name,
    lr.food_brand,
    lr.food_source,
    lr.serving_label,
    lr.serving_quantity,
    lr.effective_grams,
    lr.calories_per_serving,
    lr.protein_per_serving_g,
    lr.carbs_per_serving_g,
    lr.fat_per_serving_g,
    lr.fiber_per_serving_g,
    lr.sodium_mg_per_serving,
    a.last_logged_at,
    a.log_count,
    (
      a.text_relevance
      + least(a.log_count, 25) * 1.4
      + greatest(
          0,
          14 - extract(epoch from timezone('utc'::text, now()) - a.last_logged_at) / 86400.0
        ) * 1.2
    )::double precision as history_score
  from aggregated a
  join latest_rows lr
    on lr.reference_key = a.reference_key
  order by history_score desc, a.last_logged_at desc, lr.reference_key
  limit (select capped_limit from query_state limit 1);
$$;

create or replace function public.get_food_go_tos(
  meal_context meal_type,
  result_limit integer default 12
)
returns table (
  reference_key text,
  entry_type text,
  catalog_food_id uuid,
  food_id uuid,
  user_food_id uuid,
  recipe_id uuid,
  catalog_serving_id uuid,
  user_food_serving_id uuid,
  food_name text,
  food_brand text,
  food_source text,
  serving_label text,
  serving_quantity numeric,
  effective_grams numeric,
  calories_per_serving numeric,
  protein_per_serving_g numeric,
  carbs_per_serving_g numeric,
  fat_per_serving_g numeric,
  fiber_per_serving_g numeric,
  sodium_mg_per_serving numeric,
  last_logged_at timestamp with time zone,
  log_count bigint,
  meal_match_count bigint,
  go_to_score double precision
)
language sql
stable
set search_path = public, extensions
as $$
  with input as (
    select greatest(1, least(coalesce(result_limit, 12), 24)) as capped_limit
  ),
  scoped_logs as (
    select
      public.food_log_reference_key(fl.food_id, fl.catalog_food_id, fl.user_food_id, fl.recipe_id) as reference_key,
      public.food_log_entry_type(fl.food_id, fl.catalog_food_id, fl.user_food_id, fl.recipe_id) as entry_type,
      fl.*
    from public.food_logs fl
    where fl.user_id = auth.uid()
      and fl.logged_at >= timezone('utc'::text, now()) - interval '90 days'
  ),
  aggregated as (
    select
      sl.reference_key,
      sl.entry_type,
      max(sl.logged_at) as last_logged_at,
      count(*) as log_count,
      count(*) filter (where sl.meal = meal_context) as meal_match_count
    from scoped_logs sl
    group by sl.reference_key, sl.entry_type
    having count(*) filter (where sl.meal = meal_context) > 0
  ),
  latest_rows as (
    select distinct on (sl.reference_key)
      sl.reference_key,
      sl.catalog_food_id,
      sl.food_id,
      sl.user_food_id,
      sl.recipe_id,
      sl.catalog_serving_id,
      sl.user_food_serving_id,
      sl.food_name,
      sl.food_brand,
      sl.food_source,
      sl.serving_label,
      sl.serving_quantity,
      sl.effective_grams,
      sl.calories_per_serving,
      sl.protein_per_serving_g,
      sl.carbs_per_serving_g,
      sl.fat_per_serving_g,
      sl.fiber_per_serving_g,
      sl.sodium_mg_per_serving
    from scoped_logs sl
    where sl.meal = meal_context
    order by sl.reference_key, sl.logged_at desc, sl.id desc
  )
  select
    lr.reference_key,
    a.entry_type,
    lr.catalog_food_id,
    lr.food_id,
    lr.user_food_id,
    lr.recipe_id,
    lr.catalog_serving_id,
    lr.user_food_serving_id,
    lr.food_name,
    lr.food_brand,
    lr.food_source,
    lr.serving_label,
    lr.serving_quantity,
    lr.effective_grams,
    lr.calories_per_serving,
    lr.protein_per_serving_g,
    lr.carbs_per_serving_g,
    lr.fat_per_serving_g,
    lr.fiber_per_serving_g,
    lr.sodium_mg_per_serving,
    a.last_logged_at,
    a.log_count,
    a.meal_match_count,
    (
      a.meal_match_count * 12
      + least(a.log_count, 20) * 1.1
      + greatest(
          0,
          10 - extract(epoch from timezone('utc'::text, now()) - a.last_logged_at) / 86400.0
        )
    )::double precision as go_to_score
  from aggregated a
  join latest_rows lr
    on lr.reference_key = a.reference_key
  order by go_to_score desc, a.last_logged_at desc, lr.reference_key
  limit (select capped_limit from input);
$$;

comment on table public.user_foods is
  'Private user-owned custom foods that sit alongside the global USDA/master catalog.';

comment on table public.user_food_nutrients is
  'Normalized nutrient amounts for custom foods using the shared nutrients table.';

comment on table public.user_food_servings is
  'Selectable serving definitions for private custom foods.';

comment on table public.recipes is
  'Private user-owned recipes with cooked final weight and current total nutrient snapshots.';

comment on table public.recipe_ingredients is
  'Recipe ingredient rows that reference either a master-catalog food or a private custom food.';

comment on column public.food_logs.user_food_id is
  'References the private user_foods definition used for this log when the source is a custom food. Historical rendering must still rely on the saved snapshot fields.';

comment on column public.food_logs.user_food_serving_id is
  'References the selected private user_food_servings row when available. Historical rendering must still rely on the saved snapshot fields.';

comment on column public.food_logs.recipe_id is
  'References the private recipes definition used for this log when the source is a recipe. Historical rendering must still rely on the saved snapshot fields.';
