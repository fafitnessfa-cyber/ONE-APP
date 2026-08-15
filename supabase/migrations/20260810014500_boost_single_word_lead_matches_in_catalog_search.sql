create or replace function public.search_catalog_foods(
  search_query text,
  result_limit integer default 20,
  filter_food_type text default null,
  filter_source_code text default null,
  filter_country_code text default null
)
returns table (
  food_id uuid,
  source_code text,
  source_food_id text,
  food_type text,
  name text,
  description text,
  brand_name text,
  country_code text,
  verification_level text,
  data_completeness numeric,
  matched_alias text,
  relevance_score double precision
)
language sql
stable
set search_path = public, extensions
as $$
  with input as (
    select
      public.normalize_food_search_text(search_query) as normalized_query,
      trim(regexp_replace(lower(coalesce(search_query, '')), '\s+', ' ', 'g')) as raw_query_for_trgm,
      greatest(1, least(coalesce(result_limit, 20), 100)) as capped_limit,
      nullif(lower(trim(coalesce(filter_food_type, ''))), '') as normalized_food_type,
      nullif(upper(trim(coalesce(filter_source_code, ''))), '') as normalized_source_code,
      nullif(upper(trim(coalesce(filter_country_code, ''))), '') as normalized_country_code
  ),
  query_state as (
    select
      normalized_query,
      raw_query_for_trgm,
      capped_limit,
      normalized_food_type,
      normalized_source_code,
      normalized_country_code,
      char_length(normalized_query) as query_length,
      case
        when normalized_query = '' then 0
        else cardinality(regexp_split_to_array(normalized_query, ' '))
      end as query_token_count,
      case
        when normalized_query = '' then array[]::text[]
        else regexp_split_to_array(normalized_query, ' ')
      end as query_tokens,
      case
        when char_length(normalized_query) >= 3
          then plainto_tsquery('simple', normalized_query)
        else null
      end as plain_tsquery,
      case
        when char_length(normalized_query) >= 3 and position(' ' in normalized_query) > 0
          then phraseto_tsquery('simple', normalized_query)
        else null
      end as phrase_tsquery
    from input
  ),
  name_exact_candidates as (
    select cf.id
    from public.catalog_foods cf
    join public.food_sources fs on fs.id = cf.source_id
    cross join query_state qs
    where qs.normalized_query <> ''
      and cf.is_active
      and (qs.normalized_food_type is null or cf.food_type = qs.normalized_food_type)
      and (qs.normalized_source_code is null or fs.code = qs.normalized_source_code)
      and (
        qs.normalized_country_code is null
        or upper(coalesce(cf.country_code, '')) = qs.normalized_country_code
      )
      and public.normalize_food_search_text(cf.name) = qs.normalized_query
  ),
  name_prefix_candidates as (
    select cf.id
    from public.catalog_foods cf
    join public.food_sources fs on fs.id = cf.source_id
    cross join query_state qs
    where qs.normalized_query <> ''
      and cf.is_active
      and (qs.normalized_food_type is null or cf.food_type = qs.normalized_food_type)
      and (qs.normalized_source_code is null or fs.code = qs.normalized_source_code)
      and (
        qs.normalized_country_code is null
        or upper(coalesce(cf.country_code, '')) = qs.normalized_country_code
      )
      and public.normalize_food_search_text(cf.name) like qs.normalized_query || '%'
  ),
  fts_candidates as (
    select cf.id
    from public.catalog_foods cf
    join public.food_sources fs on fs.id = cf.source_id
    cross join query_state qs
    where qs.query_length >= 3
      and qs.plain_tsquery is not null
      and cf.is_active
      and (qs.normalized_food_type is null or cf.food_type = qs.normalized_food_type)
      and (qs.normalized_source_code is null or fs.code = qs.normalized_source_code)
      and (
        qs.normalized_country_code is null
        or upper(coalesce(cf.country_code, '')) = qs.normalized_country_code
      )
      and cf.search_document @@ qs.plain_tsquery
  ),
  trigram_candidates as (
    select cf.id
    from public.catalog_foods cf
    join public.food_sources fs on fs.id = cf.source_id
    cross join query_state qs
    where qs.query_length >= 3
      and cf.is_active
      and (qs.normalized_food_type is null or cf.food_type = qs.normalized_food_type)
      and (qs.normalized_source_code is null or fs.code = qs.normalized_source_code)
      and (
        qs.normalized_country_code is null
        or upper(coalesce(cf.country_code, '')) = qs.normalized_country_code
      )
      and lower(cf.name) % qs.raw_query_for_trgm
  ),
  alias_candidates as (
    select fa.food_id as id
    from public.food_aliases fa
    join public.catalog_foods cf on cf.id = fa.food_id
    join public.food_sources fs on fs.id = cf.source_id
    cross join query_state qs
    where qs.normalized_query <> ''
      and cf.is_active
      and (qs.normalized_food_type is null or cf.food_type = qs.normalized_food_type)
      and (qs.normalized_source_code is null or fs.code = qs.normalized_source_code)
      and (
        qs.normalized_country_code is null
        or upper(coalesce(cf.country_code, '')) = qs.normalized_country_code
      )
      and (
        public.normalize_food_search_text(fa.alias) = qs.normalized_query
        or public.normalize_food_search_text(fa.alias) like qs.normalized_query || '%'
        or (
          qs.query_length >= 3
          and qs.plain_tsquery is not null
          and fa.search_document @@ qs.plain_tsquery
        )
        or (
          qs.query_length >= 3
          and lower(fa.alias) % qs.raw_query_for_trgm
        )
      )
  ),
  indexed_candidate_ids as (
    select id from name_exact_candidates
    union
    select id from name_prefix_candidates
    union
    select id from fts_candidates
    union
    select id from trigram_candidates
    union
    select id from alias_candidates
  ),
  fuzzy_fallback_candidates as (
    select cf.id
    from public.catalog_foods cf
    join public.food_sources fs on fs.id = cf.source_id
    cross join query_state qs
    where qs.query_length >= 5
      and cf.is_active
      and (qs.normalized_food_type is null or cf.food_type = qs.normalized_food_type)
      and (qs.normalized_source_code is null or fs.code = qs.normalized_source_code)
      and (
        qs.normalized_country_code is null
        or upper(coalesce(cf.country_code, '')) = qs.normalized_country_code
      )
      and not exists (select 1 from indexed_candidate_ids)
      and word_similarity(qs.raw_query_for_trgm, lower(cf.name)) >= 0.42
  ),
  candidate_ids as (
    select id from indexed_candidate_ids
    union
    select id from fuzzy_fallback_candidates
  ),
  alias_rank as (
    select
      fa.food_id,
      bool_or(public.normalize_food_search_text(fa.alias) = qs.normalized_query) as exact_alias_match,
      bool_or(public.normalize_food_search_text(fa.alias) like qs.normalized_query || '%') as alias_prefix_match,
      max(
        greatest(
          case
            when qs.query_length >= 3 then similarity(lower(fa.alias), qs.raw_query_for_trgm)
            else 0
          end,
          case
            when qs.query_length >= 5 then word_similarity(qs.raw_query_for_trgm, lower(fa.alias))
            else 0
          end
        )
      ) as alias_fuzzy_similarity,
      min(fa.alias) filter (
        where public.normalize_food_search_text(fa.alias) = qs.normalized_query
      ) as exact_alias,
      min(fa.alias) filter (
        where public.normalize_food_search_text(fa.alias) like qs.normalized_query || '%'
      ) as prefix_alias
    from public.food_aliases fa
    join candidate_ids ci on ci.id = fa.food_id
    cross join query_state qs
    group by fa.food_id
  ),
  scored as (
    select
      cf.id as food_id,
      fs.code as source_code,
      cf.source_food_id,
      cf.food_type,
      cf.name,
      cf.description,
      cf.brand_name,
      cf.country_code,
      cf.verification_level,
      cf.data_completeness,
      name_data.normalized_name,
      name_data.name_tokens,
      char_length(name_data.normalized_name) as normalized_name_length,
      cardinality(name_data.name_tokens) as normalized_name_token_count,
      qs.query_token_count,
      qs.query_tokens,
      qs.capped_limit,
      (name_data.normalized_name = qs.normalized_query) as exact_name_match,
      (name_data.normalized_name like qs.normalized_query || '%') as name_prefix_match,
      coalesce(ar.exact_alias_match, false) as exact_alias_match,
      coalesce(ar.alias_prefix_match, false) as alias_prefix_match,
      case
        when qs.phrase_tsquery is not null then cf.search_document @@ qs.phrase_tsquery
        else false
      end as phrase_match,
      case
        when qs.query_length >= 3
          and qs.plain_tsquery is not null
          and cf.search_document @@ qs.plain_tsquery
          then ts_rank(cf.search_document, qs.plain_tsquery)
        else 0
      end as fulltext_rank,
      greatest(
        case
          when qs.query_length >= 3 and lower(cf.name) % qs.raw_query_for_trgm
            then similarity(lower(cf.name), qs.raw_query_for_trgm)
          else 0
        end,
        case
          when qs.query_length >= 5
            then word_similarity(qs.raw_query_for_trgm, lower(cf.name))
          else 0
        end
      ) as fuzzy_similarity,
      case
        when qs.query_length >= 3
          then position(qs.normalized_query in name_data.normalized_name) > 0
        else false
      end as contains_match,
      case
        when qs.query_token_count = 0 then false
        else qs.query_tokens <@
          name_data.name_tokens[
            1:least(cardinality(name_data.name_tokens), qs.query_token_count + 1)
          ]
      end as leading_token_window_match,
      case
        when qs.query_token_count = 1
          and cardinality(name_data.name_tokens) >= 1
          then name_data.name_tokens[1] = qs.query_tokens[1]
        else false
      end as single_word_first_token_match,
      coalesce(leading_token_scores.leading_fuzzy_token_similarity, 0) as leading_fuzzy_token_similarity,
      position(',' in cf.name) > 0 as taxonomy_style_name,
      nullif(cf.metadata #>> '{usda,inputFoodCount}', '')::integer as input_food_count,
      category_data.normalized_category,
      category_data.category_tokens,
      (
        category_data.normalized_category <> ''
        and category_data.normalized_category like qs.normalized_query || '%'
      ) as category_prefix_match,
      coalesce(category_token_scores.category_overlap_count, 0) as category_overlap_count,
      (
        category_data.normalized_category ~
        '(^| )(mixed|combination|combinations|sandwich|sandwiches|burger|burgers|pizza|pizzas|burrito|burritos|taco|tacos|casserole|casseroles|soup|soups|stew|stews|salad|salads|dessert|desserts|cookie|cookies|cake|cakes|pie|pies)( |$)'
      ) as composite_category_match,
      coalesce(ar.alias_fuzzy_similarity, 0) as alias_fuzzy_similarity,
      coalesce(ar.exact_alias, ar.prefix_alias) as matched_alias
    from candidate_ids ci
    join public.catalog_foods cf on cf.id = ci.id
    join public.food_sources fs on fs.id = cf.source_id
    cross join query_state qs
    cross join lateral (
      select
        public.normalize_food_search_text(cf.name) as normalized_name,
        regexp_split_to_array(public.normalize_food_search_text(cf.name), ' ') as name_tokens
    ) name_data
    cross join lateral (
      select
        public.normalize_food_search_text(
          coalesce(
            cf.metadata #>> '{usda,categoryDescription}',
            cf.metadata #>> '{usda,foodCategoryDescription}',
            ''
          )
        ) as normalized_category,
        case
          when public.normalize_food_search_text(
            coalesce(
              cf.metadata #>> '{usda,categoryDescription}',
              cf.metadata #>> '{usda,foodCategoryDescription}',
              ''
            )
          ) = '' then array[]::text[]
          else regexp_split_to_array(
            public.normalize_food_search_text(
              coalesce(
                cf.metadata #>> '{usda,categoryDescription}',
                cf.metadata #>> '{usda,foodCategoryDescription}',
                ''
              )
            ),
            ' '
          )
        end as category_tokens
    ) category_data
    cross join lateral (
      select max(
        greatest(
          similarity(token, qs.raw_query_for_trgm),
          word_similarity(qs.raw_query_for_trgm, token)
        )
      ) as leading_fuzzy_token_similarity
      from unnest(
        name_data.name_tokens[
          1:least(cardinality(name_data.name_tokens), greatest(qs.query_token_count, 1) + 1)
        ]
      ) as token
    ) leading_token_scores
    cross join lateral (
      select count(*)::integer as category_overlap_count
      from unnest(qs.query_tokens) as query_token
      where exists (
        select 1
        from unnest(category_data.category_tokens) as category_token
        where category_token = query_token
           or category_token like query_token || '%'
           or query_token like category_token || '%'
      )
    ) category_token_scores
    left join alias_rank ar on ar.food_id = cf.id
  ),
  ranked as (
    select
      food_id,
      source_code,
      source_food_id,
      food_type,
      name,
      description,
      brand_name,
      country_code,
      verification_level,
      data_completeness,
      matched_alias,
      exact_name_match,
      exact_alias_match,
      normalized_name_length,
      (
        case when exact_name_match then 100000 else 0 end +
        case when exact_alias_match then 90000 else 0 end +
        case
          when leading_token_window_match and query_token_count >= 2 then 30000
          when leading_token_window_match then 12000
          else 0
        end +
        case
          when single_word_first_token_match and not composite_category_match then 9000
          else 0
        end +
        case
          when not name_prefix_match and leading_token_window_match and taxonomy_style_name then 12000
          else 0
        end +
        case
          when category_prefix_match and query_token_count = 1 then 7000
          when category_prefix_match then 4000
          else 0
        end +
        (category_overlap_count * 2500) +
        case
          when coalesce(input_food_count, 9999) <= 1 then 5000
          when coalesce(input_food_count, 9999) = 2 then 2500
          else 0
        end +
        case
          when name_prefix_match and query_token_count >= 2 then 6000
          when name_prefix_match then 2500
          else 0
        end +
        case
          when alias_prefix_match and query_token_count >= 2 then 5000
          when alias_prefix_match then 2000
          else 0
        end +
        case when phrase_match then 2000 else 0 end +
        (fulltext_rank * 2000) +
        (leading_fuzzy_token_similarity * 4000) +
        (greatest(fuzzy_similarity, alias_fuzzy_similarity) * 1000) +
        case
          when not leading_token_window_match
            and taxonomy_style_name
            and leading_fuzzy_token_similarity >= 0.42
            then 12000
          else 0
        end +
        case when contains_match then 100 else 0 end -
        case when composite_category_match then 7000 else 0 end -
        (greatest(normalized_name_token_count - query_token_count, 0) * 50) -
        (normalized_name_length * 0.1)
      )::double precision as relevance_score
    from scored
  )
  select
    food_id,
    source_code,
    source_food_id,
    food_type,
    name,
    description,
    brand_name,
    country_code,
    verification_level,
    data_completeness,
    matched_alias,
    relevance_score
  from ranked
  order by
    exact_name_match desc,
    exact_alias_match desc,
    relevance_score desc,
    normalized_name_length asc,
    name asc,
    source_food_id asc
  limit (
    select capped_limit
    from query_state
  );
$$;

grant execute on function public.search_catalog_foods(text, integer, text, text, text)
to anon, authenticated, service_role;
