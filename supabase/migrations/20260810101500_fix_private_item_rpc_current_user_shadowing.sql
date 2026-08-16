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
