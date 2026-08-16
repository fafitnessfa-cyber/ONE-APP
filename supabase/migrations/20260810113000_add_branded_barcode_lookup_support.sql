create extension if not exists http with schema extensions;

alter table public.food_servings
  add column if not exists nutrient_values jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.food_servings'::regclass
      and conname = 'food_servings_nutrient_values_object_check'
  ) then
    alter table public.food_servings
      add constraint food_servings_nutrient_values_object_check
      check (
        nutrient_values is null
        or (
          jsonb_typeof(nutrient_values) = 'object'
          and extensions.jsonb_object_length(nutrient_values) > 0
        )
      );
  end if;
end
$$;

create or replace function public.jsonb_numeric_or_null(value jsonb)
returns numeric
language plpgsql
immutable
as $$
declare
  normalized_text text;
begin
  if value is null or jsonb_typeof(value) not in ('number', 'string') then
    return null;
  end if;

  normalized_text := replace(trim(both '"' from value::text), ',', '.');

  if normalized_text = '' then
    return null;
  end if;

  begin
    return normalized_text::numeric;
  exception
    when others then
      return null;
  end;
end;
$$;

create or replace function public.barcode_gtin_check_digit(body text)
returns integer
language plpgsql
immutable
strict
as $$
declare
  total integer := 0;
  body_length integer;
  digit_offset integer;
begin
  if body !~ '^\d+$' then
    return null;
  end if;

  body_length := char_length(body);

  for digit_offset in 0..body_length - 1 loop
    total := total
      + substring(body from body_length - digit_offset for 1)::integer
        * case when digit_offset % 2 = 0 then 3 else 1 end;
  end loop;

  return (10 - (total % 10)) % 10;
end;
$$;

create or replace function public.is_valid_gtin(barcode text)
returns boolean
language plpgsql
immutable
as $$
declare
  normalized_barcode text := trim(coalesce(barcode, ''));
  body text;
begin
  if normalized_barcode !~ '^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$' then
    return false;
  end if;

  body := left(normalized_barcode, char_length(normalized_barcode) - 1);

  return public.barcode_gtin_check_digit(body)
    = right(normalized_barcode, 1)::integer;
end;
$$;

create or replace function public.convert_nutrient_unit(
  amount numeric,
  source_unit text,
  target_unit text
)
returns numeric
language plpgsql
immutable
as $$
declare
  normalized_source text := lower(replace(trim(coalesce(source_unit, target_unit, '')), 'µ', 'u'));
  normalized_target text := lower(replace(trim(coalesce(target_unit, '')), 'µ', 'u'));
  converted numeric;
begin
  if amount is null or normalized_target = '' then
    return null;
  end if;

  if normalized_source = '' then
    normalized_source := normalized_target;
  end if;

  if normalized_target = 'kcal' then
    if normalized_source in ('kcal', 'cal') then
      converted := amount;
    elsif normalized_source in ('kj', 'kilojoule', 'kilojoules') then
      converted := amount / 4.184;
    else
      return null;
    end if;

    return round(converted, 4);
  end if;

  if normalized_target = 'g' then
    if normalized_source in ('g', 'gram', 'grams') then
      converted := amount;
    elsif normalized_source in ('mg', 'milligram', 'milligrams') then
      converted := amount / 1000;
    elsif normalized_source in ('mcg', 'ug', 'microgram', 'micrograms') then
      converted := amount / 1000000;
    else
      return null;
    end if;

    return round(converted, 4);
  end if;

  if normalized_target = 'mg' then
    if normalized_source in ('g', 'gram', 'grams') then
      converted := amount * 1000;
    elsif normalized_source in ('mg', 'milligram', 'milligrams') then
      converted := amount;
    elsif normalized_source in ('mcg', 'ug', 'microgram', 'micrograms') then
      converted := amount / 1000;
    else
      return null;
    end if;

    return round(converted, 4);
  end if;

  if normalized_target = 'mcg' then
    if normalized_source in ('g', 'gram', 'grams') then
      converted := amount * 1000000;
    elsif normalized_source in ('mg', 'milligram', 'milligrams') then
      converted := amount * 1000;
    elsif normalized_source in ('mcg', 'ug', 'microgram', 'micrograms') then
      converted := amount;
    else
      return null;
    end if;

    return round(converted, 4);
  end if;

  return null;
end;
$$;

create or replace function public.off_nutriment_value(
  nutriments jsonb,
  value_keys text[],
  unit_keys text[],
  target_unit text
)
returns numeric
language plpgsql
immutable
as $$
declare
  idx integer;
  candidate_amount numeric;
  candidate_unit text;
  converted_amount numeric;
begin
  if nutriments is null or jsonb_typeof(nutriments) <> 'object' then
    return null;
  end if;

  for idx in 1..coalesce(array_length(value_keys, 1), 0) loop
    candidate_amount := public.jsonb_numeric_or_null(nutriments -> value_keys[idx]);

    if candidate_amount is null then
      continue;
    end if;

    candidate_unit := null;

    if idx <= coalesce(array_length(unit_keys, 1), 0) then
      candidate_unit := nullif(trim(nutriments ->> unit_keys[idx]), '');
    end if;

    converted_amount := public.convert_nutrient_unit(
      candidate_amount,
      candidate_unit,
      target_unit
    );

    if converted_amount is not null then
      return converted_amount;
    end if;
  end loop;

  return null;
end;
$$;

create or replace function public.off_nutrient_value_for_suffix(
  nutriments jsonb,
  nutrient_key text,
  unit_key text,
  target_unit text,
  suffix text,
  nutrition_data_per text,
  alt_nutrient_key text default null,
  alt_unit_key text default null
)
returns numeric
language plpgsql
immutable
as $$
declare
  value_keys text[] := array[]::text[];
  unit_keys text[] := array[]::text[];
  suffix_label text := replace(coalesce(suffix, ''), '_', '');
begin
  if suffix is not null and suffix <> '' then
    value_keys := array_append(value_keys, nutrient_key || suffix);
    unit_keys := array_append(unit_keys, unit_key);

    if alt_nutrient_key is not null then
      value_keys := array_append(value_keys, alt_nutrient_key || suffix);
      unit_keys := array_append(unit_keys, coalesce(alt_unit_key, unit_key));
    end if;
  end if;

  if coalesce(lower(trim(nutrition_data_per)), '') = lower(suffix_label) then
    value_keys := array_append(value_keys, nutrient_key);
    unit_keys := array_append(unit_keys, unit_key);

    if alt_nutrient_key is not null then
      value_keys := array_append(value_keys, alt_nutrient_key);
      unit_keys := array_append(unit_keys, coalesce(alt_unit_key, unit_key));
    end if;
  end if;

  return public.off_nutriment_value(
    nutriments,
    value_keys,
    unit_keys,
    target_unit
  );
end;
$$;

create or replace function public.food_source_priority(source_code text)
returns integer
language sql
immutable
as $$
  select case upper(coalesce(source_code, ''))
    when 'USDA_BRANDED' then 500
    when 'OPEN_FOOD_FACTS' then 400
    when 'USDA_FOUNDATION' then 300
    when 'USDA_FNDDS' then 250
    else 0
  end
$$;

create or replace function public.normalize_country_code(input_country_code text)
returns text
language sql
immutable
as $$
  select case
    when input_country_code is null then null
    when char_length(trim(input_country_code)) between 2 and 3
      then upper(trim(input_country_code))
    else null
  end
$$;

create or replace function public.parse_packaged_measurement(measurement_text text)
returns table(
  quantity numeric,
  household_unit text,
  gram_weight numeric,
  milliliter_volume numeric
)
language plpgsql
immutable
as $$
declare
  normalized_text text := trim(coalesce(measurement_text, ''));
  parts text[];
  lead_value numeric;
  measure_value numeric;
  measure_unit text;
begin
  if normalized_text = '' then
    return;
  end if;

  parts := regexp_match(
    normalized_text,
    '^([0-9]+(?:[.,][0-9]+)?)\s+(.+?)\s*\(([0-9]+(?:[.,][0-9]+)?)\s*(g|gram|grams|kg|ml|mL|cl|l)\)$',
    'i'
  );

  if parts is not null then
    lead_value := replace(parts[1], ',', '.')::numeric;
    measure_value := replace(parts[3], ',', '.')::numeric;
    measure_unit := lower(parts[4]);

    return query
    select
      lead_value,
      trim(parts[2]),
      case
        when measure_unit in ('g', 'gram', 'grams') then measure_value
        when measure_unit = 'kg' then measure_value * 1000
        else null
      end,
      case
        when measure_unit in ('ml', 'mL') then measure_value
        when measure_unit = 'cl' then measure_value * 10
        when measure_unit = 'l' then measure_value * 1000
        else null
      end;
    return;
  end if;

  parts := regexp_match(
    normalized_text,
    '^([0-9]+(?:[.,][0-9]+)?)\s*(g|gram|grams|kg|ml|mL|cl|l)$',
    'i'
  );

  if parts is not null then
    measure_value := replace(parts[1], ',', '.')::numeric;
    measure_unit := lower(parts[2]);

    return query
    select
      measure_value,
      lower(parts[2]),
      case
        when measure_unit in ('g', 'gram', 'grams') then measure_value
        when measure_unit = 'kg' then measure_value * 1000
        else null
      end,
      case
        when measure_unit in ('ml', 'mL') then measure_value
        when measure_unit = 'cl' then measure_value * 10
        when measure_unit = 'l' then measure_value * 1000
        else null
      end;
    return;
  end if;

  parts := regexp_match(
    normalized_text,
    '^([0-9]+(?:[.,][0-9]+)?)\s+(.+)$',
    'i'
  );

  if parts is not null then
    return query
    select
      replace(parts[1], ',', '.')::numeric,
      trim(parts[2]),
      null::numeric,
      null::numeric;
    return;
  end if;

  return query
  select
    1::numeric,
    normalized_text,
    null::numeric,
    null::numeric;
end;
$$;

create or replace function public.resolve_catalog_food_barcode(
  normalized_barcode text,
  requested_country_code text default null
)
returns table(
  food_id uuid,
  source_code text,
  source_food_id text,
  food_name text,
  brand_name text,
  barcode text,
  country_code text,
  food_type text,
  verification_level text,
  data_completeness numeric,
  updated_at timestamptz,
  resolver_reason text
)
language sql
stable
set search_path = public
as $$
  with candidate_rows as (
    select
      cf.id as food_id,
      fs.code as source_code,
      cf.source_food_id,
      cf.name as food_name,
      cf.brand_name,
      fb.barcode,
      fb.country_code,
      cf.food_type,
      cf.verification_level,
      cf.data_completeness,
      cf.updated_at,
      case when cf.is_active then 1 else 0 end as active_rank,
      case
        when public.normalize_country_code(requested_country_code) is not null
          and fb.country_code = public.normalize_country_code(requested_country_code)
          then 2
        when fb.country_code is null then 1
        else 0
      end as country_rank,
      case cf.verification_level
        when 'manufacturer' then 5
        when 'research' then 4
        when 'verified' then 3
        when 'community' then 2
        else 1
      end as verification_rank,
      public.food_source_priority(fs.code) as source_rank,
      (
        select count(*)
        from public.food_nutrients fn
        join public.nutrients n
          on n.id = fn.nutrient_id
        where fn.food_id = cf.id
          and n.code in (
            'energy_kcal',
            'protein',
            'carbohydrate',
            'fat',
            'fiber',
            'sodium'
          )
      ) as required_nutrient_count
    from public.food_barcodes fb
    join public.catalog_foods cf
      on cf.id = fb.food_id
    join public.food_sources fs
      on fs.id = cf.source_id
    where fb.barcode = normalized_barcode
      and (
        public.normalize_country_code(requested_country_code) is null
        or fb.country_code is null
        or fb.country_code = public.normalize_country_code(requested_country_code)
      )
  )
  select
    food_id,
    source_code,
    source_food_id,
    food_name,
    brand_name,
    barcode,
    country_code,
    food_type,
    verification_level,
    data_completeness,
    updated_at,
    concat_ws(
      ' | ',
      case when country_rank = 2 then 'country-match' else 'global-match' end,
      'verification=' || verification_level,
      'source=' || source_code
    ) as resolver_reason
  from candidate_rows
  order by
    active_rank desc,
    country_rank desc,
    verification_rank desc,
    required_nutrient_count desc,
    coalesce(data_completeness, 0) desc,
    source_rank desc,
    updated_at desc,
    source_code asc,
    source_food_id asc,
    food_id asc
  limit 1
$$;

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

  delete from public.food_nutrients
  where food_id = resolved_food_id;

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

  delete from public.food_servings
  where food_id = resolved_food_id;

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

  delete from public.food_barcodes
  where food_id = resolved_food_id;

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

revoke all on function public.import_open_food_facts_product(jsonb, text, text, text) from public;
grant execute on function public.import_open_food_facts_product(jsonb, text, text, text) to service_role;

create or replace function public.lookup_food_barcode(
  raw_barcode text,
  input_normalized_barcode text,
  requested_country_code text default null
)
returns table(
  status text,
  lookup_path text,
  food_id uuid,
  source_code text,
  normalized_barcode text,
  product_name text,
  brand_name text,
  message text
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  trimmed_raw_barcode text := trim(coalesce(raw_barcode, ''));
  trimmed_normalized_barcode text := trim(coalesce(input_normalized_barcode, ''));
  normalized_country_code text := public.normalize_country_code(requested_country_code);
  existing_match record;
  imported_match record;
  http_response extensions.http_response;
  response_document jsonb;
  response_product jsonb;
  request_url text;
begin
  if trimmed_raw_barcode = '' or trimmed_normalized_barcode = '' then
    return query
    select
      'invalid_barcode'::text,
      'validation'::text,
      null::uuid,
      null::text,
      trimmed_normalized_barcode,
      null::text,
      null::text,
      'Enter a valid barcode to continue.'::text;
    return;
  end if;

  if not public.is_valid_gtin(trimmed_normalized_barcode) then
    return query
    select
      'invalid_barcode'::text,
      'validation'::text,
      null::uuid,
      null::text,
      trimmed_normalized_barcode,
      null::text,
      null::text,
      'That barcode format is not supported.'::text;
    return;
  end if;

  select *
  into existing_match
  from public.resolve_catalog_food_barcode(
    trimmed_normalized_barcode,
    normalized_country_code
  );

  if found then
    return query
    select
      'found'::text,
      'local'::text,
      existing_match.food_id,
      existing_match.source_code,
      trimmed_normalized_barcode,
      existing_match.food_name,
      existing_match.brand_name,
      existing_match.resolver_reason;
    return;
  end if;

  perform pg_advisory_xact_lock(
    hashtext('lookup_food_barcode'),
    hashtext(trimmed_normalized_barcode)
  );

  select *
  into existing_match
  from public.resolve_catalog_food_barcode(
    trimmed_normalized_barcode,
    normalized_country_code
  );

  if found then
    return query
    select
      'found'::text,
      'local'::text,
      existing_match.food_id,
      existing_match.source_code,
      trimmed_normalized_barcode,
      existing_match.food_name,
      existing_match.brand_name,
      existing_match.resolver_reason;
    return;
  end if;

  request_url := format(
    'https://world.openfoodfacts.org/api/v3/product/%s?fields=code,product_name,brands,nutriments,nutrition_data,nutrition_data_per,serving_size,quantity,product_quantity,product_quantity_unit,image_front_small_url,countries_tags,updated_t,misc_tags',
    trimmed_normalized_barcode
  );

  begin
    select *
    into http_response
    from extensions.http((
      'GET',
      request_url,
      extensions.http_headers(
        'User-Agent',
        'ONE-UP/0.1 (local-dev@oneup.invalid)',
        'Accept',
        'application/json'
      ),
      null,
      null
    )::extensions.http_request);
  exception
    when others then
      return query
      select
        'external_error'::text,
        'open_food_facts'::text,
        null::uuid,
        null::text,
        trimmed_normalized_barcode,
        null::text,
        null::text,
        'The packaged-food lookup service is unavailable right now.'::text;
      return;
  end;

  if http_response.status <> 200 then
    return query
    select
      'external_error'::text,
      'open_food_facts'::text,
      null::uuid,
      null::text,
      trimmed_normalized_barcode,
      null::text,
      null::text,
      'The packaged-food lookup service is unavailable right now.'::text;
    return;
  end if;

  begin
    response_document := http_response.content::jsonb;
  exception
    when others then
      return query
      select
        'external_error'::text,
        'open_food_facts'::text,
        null::uuid,
        null::text,
        trimmed_normalized_barcode,
        null::text,
        null::text,
        'The packaged-food lookup service returned invalid data.'::text;
      return;
  end;

  if coalesce(lower(response_document ->> 'status'), '') <> 'success' then
    return query
    select
      'not_found'::text,
      'open_food_facts'::text,
      null::uuid,
      null::text,
      trimmed_normalized_barcode,
      null::text,
      null::text,
      'Product not found.'::text;
    return;
  end if;

  response_product := response_document -> 'product';

  select *
  into imported_match
  from public.import_open_food_facts_product(
    response_product,
    trimmed_normalized_barcode,
    trimmed_raw_barcode,
    normalized_country_code
  );

  return query
  select
    imported_match.status,
    case
      when imported_match.status = 'imported' then 'external_import'
      else 'open_food_facts'
    end,
    imported_match.food_id,
    case when imported_match.food_id is not null then 'OPEN_FOOD_FACTS' else null end,
    trimmed_normalized_barcode,
    imported_match.product_name,
    imported_match.brand_name,
    imported_match.message;
end;
$$;

revoke all on function public.lookup_food_barcode(text, text, text) from public;
grant execute on function public.lookup_food_barcode(text, text, text) to authenticated, service_role;
