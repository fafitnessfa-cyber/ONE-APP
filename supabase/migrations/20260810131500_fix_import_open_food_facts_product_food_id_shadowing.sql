create or replace function public.import_open_food_facts_product(
  product jsonb,
  normalized_barcode text,
  original_barcode text default null,
  requested_country_code text default null
)
returns table(
  status text,
  food_id uuid,
  product_name text,
  brand_name text,
  message text
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  open_food_facts_source_id uuid;
  open_food_facts_id text;
  normalized_country_code text := public.normalize_country_code(requested_country_code);
  resolved_product_name text;
  resolved_brand_name text;
  resolved_description text;
  nutriments jsonb := coalesce(product -> 'nutriments', '{}'::jsonb);
  misc_tags jsonb := coalesce(product -> 'misc_tags', '[]'::jsonb);
  countries_tags jsonb := coalesce(product -> 'countries_tags', '[]'::jsonb);
  nutrition_data_per text := lower(trim(coalesce(product ->> 'nutrition_data_per', '')));
  base_suffix text := '_100g';
  base_unit text := 'g';
  base_values jsonb;
  required_missing text[] := array[]::text[];
  energy_kcal_value numeric;
  protein_value numeric;
  carbohydrate_value numeric;
  fat_value numeric;
  fiber_value numeric;
  sugars_value numeric;
  sodium_value numeric;
  potassium_value numeric;
  calcium_value numeric;
  iron_value numeric;
  vitamin_c_value numeric;
  vitamin_d_value numeric;
  saturated_fat_value numeric;
  cholesterol_value numeric;
  salt_fallback_value numeric;
  serving_energy_value numeric;
  serving_protein_value numeric;
  serving_carbohydrate_value numeric;
  serving_fat_value numeric;
  serving_fiber_value numeric;
  serving_sugars_value numeric;
  serving_sodium_value numeric;
  serving_potassium_value numeric;
  serving_calcium_value numeric;
  serving_iron_value numeric;
  serving_vitamin_c_value numeric;
  serving_vitamin_d_value numeric;
  serving_saturated_fat_value numeric;
  serving_cholesterol_value numeric;
  base_serving_default boolean := true;
  serving_text text := nullif(trim(product ->> 'serving_size'), '');
  serving_measurement record;
  serving_values jsonb := null;
  should_insert_serving boolean := false;
  resolved_food_id uuid;
  completeness_value numeric;
  metadata_value jsonb;
begin
  if not public.is_valid_gtin(normalized_barcode) then
    return query
    select
      'invalid_barcode'::text,
      null::uuid,
      null::text,
      null::text,
      'That barcode format is not supported.'::text;
    return;
  end if;

  if product is null or jsonb_typeof(product) <> 'object' then
    return query
    select
      'external_error'::text,
      null::uuid,
      null::text,
      null::text,
      'The packaged-food provider returned an invalid response.'::text;
    return;
  end if;

  open_food_facts_id := nullif(trim(product ->> 'code'), '');
  resolved_product_name := nullif(trim(product ->> 'product_name'), '');
  resolved_brand_name := nullif(trim(product ->> 'brands'), '');
  resolved_description := nullif(trim(product ->> 'quantity'), '');

  if open_food_facts_id is null then
    open_food_facts_id := normalized_barcode;
  end if;

  if resolved_product_name is null
    or coalesce(product ->> 'nutrition_data', '') <> 'on'
    or jsonb_typeof(nutriments) <> 'object'
  then
    return query
    select
      'incomplete'::text,
      null::uuid,
      resolved_product_name,
      resolved_brand_name,
      'Product found, but nutrition information is incomplete.'::text;
    return;
  end if;

  if nutrition_data_per = '100ml'
    or exists (
      select 1
      from jsonb_object_keys(nutriments) as key_name
      where key_name like '%\_100ml' escape '\'
    )
  then
    base_suffix := '_100ml';
    base_unit := 'ml';
  end if;

  energy_kcal_value := public.off_nutrient_value_for_suffix(
    nutriments,
    'energy-kcal',
    'energy-kcal_unit',
    'kcal',
    base_suffix,
    nutrition_data_per
  );

  if energy_kcal_value is null then
    energy_kcal_value := public.off_nutrient_value_for_suffix(
      nutriments,
      'energy-kj',
      'energy-kj_unit',
      'kcal',
      base_suffix,
      nutrition_data_per,
      'energy',
      'energy_unit'
    );
  end if;

  protein_value := public.off_nutrient_value_for_suffix(
    nutriments,
    'proteins',
    'proteins_unit',
    'g',
    base_suffix,
    nutrition_data_per
  );
  carbohydrate_value := public.off_nutrient_value_for_suffix(
    nutriments,
    'carbohydrates',
    'carbohydrates_unit',
    'g',
    base_suffix,
    nutrition_data_per
  );
  fat_value := public.off_nutrient_value_for_suffix(
    nutriments,
    'fat',
    'fat_unit',
    'g',
    base_suffix,
    nutrition_data_per
  );
  fiber_value := public.off_nutrient_value_for_suffix(
    nutriments,
    'fiber',
    'fiber_unit',
    'g',
    base_suffix,
    nutrition_data_per
  );
  sugars_value := public.off_nutrient_value_for_suffix(
    nutriments,
    'sugars',
    'sugars_unit',
    'g',
    base_suffix,
    nutrition_data_per
  );
  sodium_value := public.off_nutrient_value_for_suffix(
    nutriments,
    'sodium',
    'sodium_unit',
    'mg',
    base_suffix,
    nutrition_data_per
  );

  if sodium_value is null then
    salt_fallback_value := public.off_nutrient_value_for_suffix(
      nutriments,
      'salt',
      'salt_unit',
      'mg',
      base_suffix,
      nutrition_data_per
    );

    if salt_fallback_value is not null then
      sodium_value := round(salt_fallback_value * 0.3934, 4);
    end if;
  end if;

  potassium_value := public.off_nutrient_value_for_suffix(
    nutriments,
    'potassium',
    'potassium_unit',
    'mg',
    base_suffix,
    nutrition_data_per
  );
  calcium_value := public.off_nutrient_value_for_suffix(
    nutriments,
    'calcium',
    'calcium_unit',
    'mg',
    base_suffix,
    nutrition_data_per
  );
  iron_value := public.off_nutrient_value_for_suffix(
    nutriments,
    'iron',
    'iron_unit',
    'mg',
    base_suffix,
    nutrition_data_per
  );
  vitamin_c_value := public.off_nutrient_value_for_suffix(
    nutriments,
    'vitamin-c',
    'vitamin-c_unit',
    'mg',
    base_suffix,
    nutrition_data_per
  );
  vitamin_d_value := public.off_nutrient_value_for_suffix(
    nutriments,
    'vitamin-d',
    'vitamin-d_unit',
    'mcg',
    base_suffix,
    nutrition_data_per
  );
  saturated_fat_value := public.off_nutrient_value_for_suffix(
    nutriments,
    'saturated-fat',
    'saturated-fat_unit',
    'g',
    base_suffix,
    nutrition_data_per
  );
  cholesterol_value := public.off_nutrient_value_for_suffix(
    nutriments,
    'cholesterol',
    'cholesterol_unit',
    'mg',
    base_suffix,
    nutrition_data_per
  );

  if energy_kcal_value is null then
    required_missing := array_append(required_missing, 'energy_kcal');
  end if;

  if protein_value is null then
    required_missing := array_append(required_missing, 'protein');
  end if;

  if carbohydrate_value is null then
    required_missing := array_append(required_missing, 'carbohydrate');
  end if;

  if fat_value is null then
    required_missing := array_append(required_missing, 'fat');
  end if;

  if fiber_value is null then
    required_missing := array_append(required_missing, 'fiber');
  end if;

  if sodium_value is null then
    required_missing := array_append(required_missing, 'sodium');
  end if;

  if array_length(required_missing, 1) is not null then
    return query
    select
      'incomplete'::text,
      null::uuid,
      resolved_product_name,
      resolved_brand_name,
      'Product found, but nutrition information is incomplete.'::text;
    return;
  end if;

  base_values := jsonb_strip_nulls(
    jsonb_build_object(
      'energy_kcal', energy_kcal_value,
      'protein', protein_value,
      'carbohydrate', carbohydrate_value,
      'fat', fat_value,
      'fiber', fiber_value,
      'sugars', sugars_value,
      'sodium', sodium_value,
      'potassium', potassium_value,
      'calcium', calcium_value,
      'iron', iron_value,
      'vitamin_c', vitamin_c_value,
      'vitamin_d', vitamin_d_value,
      'saturated_fat', saturated_fat_value,
      'cholesterol', cholesterol_value
    )
  );

  completeness_value := round(
    extensions.jsonb_object_length(base_values)::numeric / 14::numeric,
    4
  );

  serving_energy_value := public.off_nutrient_value_for_suffix(
    nutriments,
    'energy-kcal',
    'energy-kcal_unit',
    'kcal',
    '_serving',
    nutrition_data_per
  );

  if serving_energy_value is null then
    serving_energy_value := public.off_nutrient_value_for_suffix(
      nutriments,
      'energy-kj',
      'energy-kj_unit',
      'kcal',
      '_serving',
      nutrition_data_per,
      'energy',
      'energy_unit'
    );
  end if;

  serving_protein_value := public.off_nutrient_value_for_suffix(
    nutriments,
    'proteins',
    'proteins_unit',
    'g',
    '_serving',
    nutrition_data_per
  );
  serving_carbohydrate_value := public.off_nutrient_value_for_suffix(
    nutriments,
    'carbohydrates',
    'carbohydrates_unit',
    'g',
    '_serving',
    nutrition_data_per
  );
  serving_fat_value := public.off_nutrient_value_for_suffix(
    nutriments,
    'fat',
    'fat_unit',
    'g',
    '_serving',
    nutrition_data_per
  );
  serving_fiber_value := public.off_nutrient_value_for_suffix(
    nutriments,
    'fiber',
    'fiber_unit',
    'g',
    '_serving',
    nutrition_data_per
  );
  serving_sugars_value := public.off_nutrient_value_for_suffix(
    nutriments,
    'sugars',
    'sugars_unit',
    'g',
    '_serving',
    nutrition_data_per
  );
  serving_sodium_value := public.off_nutrient_value_for_suffix(
    nutriments,
    'sodium',
    'sodium_unit',
    'mg',
    '_serving',
    nutrition_data_per
  );

  if serving_sodium_value is null then
    salt_fallback_value := public.off_nutrient_value_for_suffix(
      nutriments,
      'salt',
      'salt_unit',
      'mg',
      '_serving',
      nutrition_data_per
    );

    if salt_fallback_value is not null then
      serving_sodium_value := round(salt_fallback_value * 0.3934, 4);
    end if;
  end if;

  serving_potassium_value := public.off_nutrient_value_for_suffix(
    nutriments,
    'potassium',
    'potassium_unit',
    'mg',
    '_serving',
    nutrition_data_per
  );
  serving_calcium_value := public.off_nutrient_value_for_suffix(
    nutriments,
    'calcium',
    'calcium_unit',
    'mg',
    '_serving',
    nutrition_data_per
  );
  serving_iron_value := public.off_nutrient_value_for_suffix(
    nutriments,
    'iron',
    'iron_unit',
    'mg',
    '_serving',
    nutrition_data_per
  );
  serving_vitamin_c_value := public.off_nutrient_value_for_suffix(
    nutriments,
    'vitamin-c',
    'vitamin-c_unit',
    'mg',
    '_serving',
    nutrition_data_per
  );
  serving_vitamin_d_value := public.off_nutrient_value_for_suffix(
    nutriments,
    'vitamin-d',
    'vitamin-d_unit',
    'mcg',
    '_serving',
    nutrition_data_per
  );
  serving_saturated_fat_value := public.off_nutrient_value_for_suffix(
    nutriments,
    'saturated-fat',
    'saturated-fat_unit',
    'g',
    '_serving',
    nutrition_data_per
  );
  serving_cholesterol_value := public.off_nutrient_value_for_suffix(
    nutriments,
    'cholesterol',
    'cholesterol_unit',
    'mg',
    '_serving',
    nutrition_data_per
  );

  if serving_text is not null then
    select *
    into serving_measurement
    from public.parse_packaged_measurement(serving_text)
    limit 1;

    serving_values := jsonb_strip_nulls(
      jsonb_build_object(
        'energy_kcal', serving_energy_value,
        'protein', serving_protein_value,
        'carbohydrate', serving_carbohydrate_value,
        'fat', serving_fat_value,
        'fiber', serving_fiber_value,
        'sugars', serving_sugars_value,
        'sodium', serving_sodium_value,
        'potassium', serving_potassium_value,
        'calcium', serving_calcium_value,
        'iron', serving_iron_value,
        'vitamin_c', serving_vitamin_c_value,
        'vitamin_d', serving_vitamin_d_value,
        'saturated_fat', serving_saturated_fat_value,
        'cholesterol', serving_cholesterol_value
      )
    );

    should_insert_serving := extensions.jsonb_object_length(coalesce(serving_values, '{}'::jsonb)) > 0
      or serving_measurement.quantity is not null
      or serving_measurement.gram_weight is not null
      or serving_measurement.milliliter_volume is not null;

    if should_insert_serving and serving_measurement.quantity is not null then
      if serving_measurement.gram_weight is not null and base_unit = 'g' then
        serving_values := serving_values
          || jsonb_strip_nulls(
            jsonb_build_object(
              'energy_kcal', coalesce(serving_energy_value, round((energy_kcal_value * serving_measurement.gram_weight) / 100, 4)),
              'protein', coalesce(serving_protein_value, round((protein_value * serving_measurement.gram_weight) / 100, 4)),
              'carbohydrate', coalesce(serving_carbohydrate_value, round((carbohydrate_value * serving_measurement.gram_weight) / 100, 4)),
              'fat', coalesce(serving_fat_value, round((fat_value * serving_measurement.gram_weight) / 100, 4)),
              'fiber', coalesce(serving_fiber_value, round((fiber_value * serving_measurement.gram_weight) / 100, 4)),
              'sugars', case when sugars_value is null then serving_sugars_value else coalesce(serving_sugars_value, round((sugars_value * serving_measurement.gram_weight) / 100, 4)) end,
              'sodium', coalesce(serving_sodium_value, round((sodium_value * serving_measurement.gram_weight) / 100, 4)),
              'potassium', case when potassium_value is null then serving_potassium_value else coalesce(serving_potassium_value, round((potassium_value * serving_measurement.gram_weight) / 100, 4)) end,
              'calcium', case when calcium_value is null then serving_calcium_value else coalesce(serving_calcium_value, round((calcium_value * serving_measurement.gram_weight) / 100, 4)) end,
              'iron', case when iron_value is null then serving_iron_value else coalesce(serving_iron_value, round((iron_value * serving_measurement.gram_weight) / 100, 4)) end,
              'vitamin_c', case when vitamin_c_value is null then serving_vitamin_c_value else coalesce(serving_vitamin_c_value, round((vitamin_c_value * serving_measurement.gram_weight) / 100, 4)) end,
              'vitamin_d', case when vitamin_d_value is null then serving_vitamin_d_value else coalesce(serving_vitamin_d_value, round((vitamin_d_value * serving_measurement.gram_weight) / 100, 4)) end,
              'saturated_fat', case when saturated_fat_value is null then serving_saturated_fat_value else coalesce(serving_saturated_fat_value, round((saturated_fat_value * serving_measurement.gram_weight) / 100, 4)) end,
              'cholesterol', case when cholesterol_value is null then serving_cholesterol_value else coalesce(serving_cholesterol_value, round((cholesterol_value * serving_measurement.gram_weight) / 100, 4)) end
            )
          );
      elsif serving_measurement.milliliter_volume is not null and base_unit = 'ml' then
        serving_values := serving_values
          || jsonb_strip_nulls(
            jsonb_build_object(
              'energy_kcal', coalesce(serving_energy_value, round((energy_kcal_value * serving_measurement.milliliter_volume) / 100, 4)),
              'protein', coalesce(serving_protein_value, round((protein_value * serving_measurement.milliliter_volume) / 100, 4)),
              'carbohydrate', coalesce(serving_carbohydrate_value, round((carbohydrate_value * serving_measurement.milliliter_volume) / 100, 4)),
              'fat', coalesce(serving_fat_value, round((fat_value * serving_measurement.milliliter_volume) / 100, 4)),
              'fiber', coalesce(serving_fiber_value, round((fiber_value * serving_measurement.milliliter_volume) / 100, 4)),
              'sugars', case when sugars_value is null then serving_sugars_value else coalesce(serving_sugars_value, round((sugars_value * serving_measurement.milliliter_volume) / 100, 4)) end,
              'sodium', coalesce(serving_sodium_value, round((sodium_value * serving_measurement.milliliter_volume) / 100, 4)),
              'potassium', case when potassium_value is null then serving_potassium_value else coalesce(serving_potassium_value, round((potassium_value * serving_measurement.milliliter_volume) / 100, 4)) end,
              'calcium', case when calcium_value is null then serving_calcium_value else coalesce(serving_calcium_value, round((calcium_value * serving_measurement.milliliter_volume) / 100, 4)) end,
              'iron', case when iron_value is null then serving_iron_value else coalesce(serving_iron_value, round((iron_value * serving_measurement.milliliter_volume) / 100, 4)) end,
              'vitamin_c', case when vitamin_c_value is null then serving_vitamin_c_value else coalesce(serving_vitamin_c_value, round((vitamin_c_value * serving_measurement.milliliter_volume) / 100, 4)) end,
              'vitamin_d', case when vitamin_d_value is null then serving_vitamin_d_value else coalesce(serving_vitamin_d_value, round((vitamin_d_value * serving_measurement.milliliter_volume) / 100, 4)) end,
              'saturated_fat', case when saturated_fat_value is null then serving_saturated_fat_value else coalesce(serving_saturated_fat_value, round((saturated_fat_value * serving_measurement.milliliter_volume) / 100, 4)) end,
              'cholesterol', case when cholesterol_value is null then serving_cholesterol_value else coalesce(serving_cholesterol_value, round((cholesterol_value * serving_measurement.milliliter_volume) / 100, 4)) end
            )
          );
      end if;
    end if;
  end if;

  select id
  into open_food_facts_source_id
  from public.food_sources
  where code = 'OPEN_FOOD_FACTS';

  if open_food_facts_source_id is null then
    raise exception 'Missing OPEN_FOOD_FACTS source definition.';
  end if;

  metadata_value := jsonb_strip_nulls(
    jsonb_build_object(
      'openFoodFacts',
      jsonb_strip_nulls(
        jsonb_build_object(
          'code', open_food_facts_id,
          'productUrl', 'https://world.openfoodfacts.org/product/' || open_food_facts_id,
          'imageFrontSmallUrl', nullif(trim(product ->> 'image_front_small_url'), ''),
          'productQuantity', public.jsonb_numeric_or_null(product -> 'product_quantity'),
          'productQuantityUnit', nullif(trim(product ->> 'product_quantity_unit'), ''),
          'quantity', nullif(trim(product ->> 'quantity'), ''),
          'servingSize', serving_text,
          'nutritionData', nullif(trim(product ->> 'nutrition_data'), ''),
          'nutritionDataPer', nullif(trim(product ->> 'nutrition_data_per'), ''),
          'updatedAtUnix', public.jsonb_numeric_or_null(product -> 'updated_t'),
          'countriesTags', case when jsonb_typeof(countries_tags) = 'array' then countries_tags else null end,
          'miscTags', case when jsonb_typeof(misc_tags) = 'array' then misc_tags else null end
        )
      ),
      'barcode',
      jsonb_strip_nulls(
        jsonb_build_object(
          'normalized', normalized_barcode,
          'original', case
            when original_barcode is not null
              and trim(original_barcode) <> ''
              and trim(original_barcode) <> normalized_barcode
              then trim(original_barcode)
            else null
          end
        )
      )
    )
  );

  insert into public.catalog_foods (
    source_id,
    source_food_id,
    food_type,
    name,
    description,
    brand_name,
    country_code,
    verification_level,
    data_completeness,
    base_amount,
    base_unit,
    is_active,
    metadata
  )
  values (
    open_food_facts_source_id,
    open_food_facts_id,
    'branded',
    resolved_product_name,
    resolved_description,
    resolved_brand_name,
    normalized_country_code,
    'community',
    completeness_value,
    100,
    base_unit,
    true,
    metadata_value
  )
  on conflict (source_id, source_food_id)
  where source_food_id is not null
  do update set
    food_type = excluded.food_type,
    name = excluded.name,
    description = excluded.description,
    brand_name = excluded.brand_name,
    country_code = excluded.country_code,
    verification_level = excluded.verification_level,
    data_completeness = excluded.data_completeness,
    base_amount = excluded.base_amount,
    base_unit = excluded.base_unit,
    is_active = excluded.is_active,
    metadata = excluded.metadata
  returning id
  into resolved_food_id;

  delete from public.food_nutrients as target_nutrients
  where target_nutrients.food_id = resolved_food_id;

  insert into public.food_nutrients (
    food_id,
    nutrient_id,
    amount,
    data_origin
  )
  select
    resolved_food_id,
    nutrient_row.id,
    (base_values ->> nutrient_row.code)::numeric,
    'Open Food Facts ' || open_food_facts_id
  from public.nutrients nutrient_row
  where nutrient_row.code = any(
    array[
      'energy_kcal',
      'protein',
      'carbohydrate',
      'fat',
      'fiber',
      'sugars',
      'sodium',
      'potassium',
      'calcium',
      'iron',
      'vitamin_c',
      'vitamin_d',
      'saturated_fat',
      'cholesterol'
    ]
  )
    and base_values ? nutrient_row.code;

  delete from public.food_servings as target_servings
  where target_servings.food_id = resolved_food_id;

  base_serving_default := not should_insert_serving;

  insert into public.food_servings (
    food_id,
    serving_name,
    quantity,
    gram_weight,
    milliliter_volume,
    household_unit,
    is_default,
    source_serving_id,
    nutrient_values
  )
  values (
    resolved_food_id,
    '100 ' || base_unit,
    100,
    case when base_unit = 'g' then 100 else null end,
    case when base_unit = 'ml' then 100 else null end,
    base_unit,
    base_serving_default,
    'off-base-' || base_unit,
    base_values
  );

  if should_insert_serving then
    insert into public.food_servings (
      food_id,
      serving_name,
      quantity,
      gram_weight,
      milliliter_volume,
      household_unit,
      is_default,
      source_serving_id,
      nutrient_values
    )
    values (
      resolved_food_id,
      coalesce(serving_text, '1 serving'),
      coalesce(serving_measurement.quantity, 1),
      serving_measurement.gram_weight,
      serving_measurement.milliliter_volume,
      coalesce(serving_measurement.household_unit, 'serving'),
      true,
      'off-serving',
      nullif(serving_values, '{}'::jsonb)
    );
  end if;

  delete from public.food_barcodes as target_barcodes
  where target_barcodes.food_id = resolved_food_id;

  insert into public.food_barcodes (
    food_id,
    barcode,
    country_code,
    is_primary
  )
  values (
    resolved_food_id,
    normalized_barcode,
    normalized_country_code,
    true
  );

  return query
  select
    'imported'::text,
    resolved_food_id,
    resolved_product_name,
    resolved_brand_name,
    null::text;
end;
$$;
