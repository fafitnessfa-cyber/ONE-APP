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
