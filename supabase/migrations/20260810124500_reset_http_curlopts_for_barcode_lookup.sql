create or replace function public.lookup_food_barcode(
  raw_barcode text,
  input_normalized_barcode text,
  requested_country_code text default null
)
returns table (
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

  perform extensions.http_reset_curlopt();
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '5000');
  perform extensions.http_set_curlopt('CURLOPT_CONNECTTIMEOUT_MS', '2000');

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
      perform extensions.http_reset_curlopt();

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

  perform extensions.http_reset_curlopt();

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
