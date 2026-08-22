create or replace function public.search_catalog_foods(
  search_query text,
  result_limit integer default 20,
  filter_food_type text default null,
  filter_source_code text default null,
  filter_country_code text default null,
  preferred_market_country_code text default null
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
security definer
language plpgsql
stable
set search_path = public, extensions
set plan_cache_mode = force_custom_plan
as $$
declare
  v_normalized_query text;
  v_raw_query_for_trgm text;
  v_capped_limit integer;
  v_normalized_food_type text;
  v_normalized_source_code text;
  v_normalized_country_code text;
  v_normalized_preferred_market_country_code text;
  v_filtered_source_id uuid;
  v_query_length integer;
  v_query_token_count integer;
  v_first_query_token text;
  v_plain_tsquery tsquery;
  v_prefix_candidate_limit integer;
  v_search_candidate_limit integer;
  v_prefix_upper_bound text;
  v_fast_candidate_count integer := 0;
  v_combined_fast_fts_candidate_count integer := 0;
  v_use_fts_search boolean := true;
  v_use_trigram_search boolean := true;
begin
  v_normalized_query := public.normalize_food_search_text(search_query);
  v_raw_query_for_trgm := trim(regexp_replace(lower(coalesce(search_query, '')), '\s+', ' ', 'g'));
  v_capped_limit := greatest(1, least(coalesce(result_limit, 20), 100));
  v_normalized_food_type := nullif(lower(trim(coalesce(filter_food_type, ''))), '');
  v_normalized_source_code := nullif(upper(trim(coalesce(filter_source_code, ''))), '');
  v_normalized_country_code := nullif(upper(trim(coalesce(filter_country_code, ''))), '');
  v_normalized_preferred_market_country_code := nullif(
    upper(trim(coalesce(preferred_market_country_code, ''))),
    ''
  );
  v_query_length := char_length(v_normalized_query);
  v_query_token_count := case
    when v_normalized_query = '' then 0
    else cardinality(regexp_split_to_array(v_normalized_query, ' '))
  end;
  v_first_query_token := split_part(v_normalized_query, ' ', 1);
  v_plain_tsquery := case
    when v_query_length >= 3 then plainto_tsquery('simple', v_normalized_query)
    else null
  end;
  v_prefix_candidate_limit := greatest(40, v_capped_limit * 8);
  v_search_candidate_limit := greatest(80, v_capped_limit * 12);
  v_prefix_upper_bound := v_normalized_query || '~';

  if v_normalized_query = '' then
    return;
  end if;

  if v_normalized_source_code is not null then
    select fs.id
    into v_filtered_source_id
    from public.food_sources fs
    where fs.code = v_normalized_source_code
    limit 1;

    if v_filtered_source_id is null then
      return;
    end if;
  end if;

  with fast_candidate_scores as (
    select
      id,
      max(branch_score) as branch_score
    from (
      select
        cf.id,
        (
          case
            when v_query_token_count = 1 and cf.food_type = 'branded' then 65000
            else 100000
          end
        )::double precision as branch_score
      from public.catalog_foods cf
      where cf.is_active
        and (v_normalized_food_type is null or cf.food_type = v_normalized_food_type)
        and (v_filtered_source_id is null or cf.source_id = v_filtered_source_id)
        and (
          v_normalized_country_code is null
          or upper(coalesce(cf.country_code, '')) = v_normalized_country_code
        )
        and public.normalize_food_search_text(cf.name) = v_normalized_query

      union all

      select
        fa.food_id as id,
        95000::double precision as branch_score
      from public.food_aliases fa
      join public.catalog_foods cf on cf.id = fa.food_id
      where cf.is_active
        and (v_normalized_food_type is null or cf.food_type = v_normalized_food_type)
        and (v_filtered_source_id is null or cf.source_id = v_filtered_source_id)
        and (
          v_normalized_country_code is null
          or upper(coalesce(cf.country_code, '')) = v_normalized_country_code
        )
        and public.normalize_food_search_text(fa.alias) = v_normalized_query

      union all

      select
        cf.id,
        60000::double precision as branch_score
      from public.catalog_foods cf
      where cf.is_active
        and cf.brand_name is not null
        and (v_normalized_food_type is null or cf.food_type = v_normalized_food_type)
        and (v_filtered_source_id is null or cf.source_id = v_filtered_source_id)
        and (
          v_normalized_country_code is null
          or upper(coalesce(cf.country_code, '')) = v_normalized_country_code
        )
        and public.normalize_food_search_text(cf.brand_name) = v_normalized_query

      union all

      select ranked.id, ranked.branch_score
      from (
        select
          cf.id,
          (
            20000
            - least(char_length(public.normalize_food_search_text(cf.name))::double precision, 1000) * 0.1
          )::double precision as branch_score,
          char_length(public.normalize_food_search_text(cf.name)) as normalized_name_length,
          cf.name,
          cf.source_food_id
        from public.catalog_foods cf
        where cf.is_active
          and (v_normalized_food_type is null or cf.food_type = v_normalized_food_type)
          and (v_filtered_source_id is null or cf.source_id = v_filtered_source_id)
          and (
            v_normalized_country_code is null
            or upper(coalesce(cf.country_code, '')) = v_normalized_country_code
          )
          and public.normalize_food_search_text(cf.name) >= v_normalized_query
          and public.normalize_food_search_text(cf.name) < v_prefix_upper_bound
        order by normalized_name_length asc, cf.name asc, cf.source_food_id asc
        limit v_prefix_candidate_limit
      ) ranked

      union all

      select ranked.id, ranked.branch_score
      from (
        select
          fa.food_id as id,
          (
            18000
            - least(char_length(public.normalize_food_search_text(fa.alias))::double precision, 1000) * 0.1
          )::double precision as branch_score,
          char_length(public.normalize_food_search_text(fa.alias)) as normalized_alias_length,
          fa.alias,
          cf.source_food_id
        from public.food_aliases fa
        join public.catalog_foods cf on cf.id = fa.food_id
        where cf.is_active
          and (v_normalized_food_type is null or cf.food_type = v_normalized_food_type)
          and (v_filtered_source_id is null or cf.source_id = v_filtered_source_id)
          and (
            v_normalized_country_code is null
            or upper(coalesce(cf.country_code, '')) = v_normalized_country_code
          )
          and public.normalize_food_search_text(fa.alias) >= v_normalized_query
          and public.normalize_food_search_text(fa.alias) < v_prefix_upper_bound
        order by normalized_alias_length asc, fa.alias asc, cf.source_food_id asc
        limit v_prefix_candidate_limit
      ) ranked

      union all

      select ranked.id, ranked.branch_score
      from (
        select
          cf.id,
          (
            12000
            - least(char_length(public.normalize_food_search_text(cf.brand_name))::double precision, 1000) * 0.1
          )::double precision as branch_score,
          char_length(public.normalize_food_search_text(cf.brand_name)) as normalized_brand_length,
          cf.brand_name,
          cf.name,
          cf.source_food_id
        from public.catalog_foods cf
        where cf.is_active
          and cf.brand_name is not null
          and (v_normalized_food_type is null or cf.food_type = v_normalized_food_type)
          and (v_filtered_source_id is null or cf.source_id = v_filtered_source_id)
          and (
            v_normalized_country_code is null
            or upper(coalesce(cf.country_code, '')) = v_normalized_country_code
          )
          and public.normalize_food_search_text(cf.brand_name) >= v_normalized_query
          and public.normalize_food_search_text(cf.brand_name) < v_prefix_upper_bound
        order by normalized_brand_length asc, cf.brand_name asc, cf.name asc, cf.source_food_id asc
        limit v_prefix_candidate_limit
      ) ranked
    ) fast_branches
    group by id
  )
  select count(*)::integer
  into v_fast_candidate_count
  from fast_candidate_scores;

  if v_fast_candidate_count >= v_capped_limit then
    v_use_fts_search := false;
    v_use_trigram_search := false;
  else
    with fast_candidate_scores as (
      select
        id,
        max(branch_score) as branch_score
      from (
        select
          cf.id,
          (
            case
              when v_query_token_count = 1 and cf.food_type = 'branded' then 65000
              else 100000
            end
          )::double precision as branch_score
        from public.catalog_foods cf
        where cf.is_active
          and (v_normalized_food_type is null or cf.food_type = v_normalized_food_type)
          and (v_filtered_source_id is null or cf.source_id = v_filtered_source_id)
          and (
            v_normalized_country_code is null
            or upper(coalesce(cf.country_code, '')) = v_normalized_country_code
          )
          and public.normalize_food_search_text(cf.name) = v_normalized_query

        union all

        select
          fa.food_id as id,
          95000::double precision as branch_score
        from public.food_aliases fa
        join public.catalog_foods cf on cf.id = fa.food_id
        where cf.is_active
          and (v_normalized_food_type is null or cf.food_type = v_normalized_food_type)
          and (v_filtered_source_id is null or cf.source_id = v_filtered_source_id)
          and (
            v_normalized_country_code is null
            or upper(coalesce(cf.country_code, '')) = v_normalized_country_code
          )
          and public.normalize_food_search_text(fa.alias) = v_normalized_query

        union all

        select
          cf.id,
          60000::double precision as branch_score
        from public.catalog_foods cf
        where cf.is_active
          and cf.brand_name is not null
          and (v_normalized_food_type is null or cf.food_type = v_normalized_food_type)
          and (v_filtered_source_id is null or cf.source_id = v_filtered_source_id)
          and (
            v_normalized_country_code is null
            or upper(coalesce(cf.country_code, '')) = v_normalized_country_code
          )
          and public.normalize_food_search_text(cf.brand_name) = v_normalized_query

        union all

        select ranked.id, ranked.branch_score
        from (
          select
            cf.id,
            (
              20000
              - least(char_length(public.normalize_food_search_text(cf.name))::double precision, 1000) * 0.1
            )::double precision as branch_score,
            char_length(public.normalize_food_search_text(cf.name)) as normalized_name_length,
            cf.name,
            cf.source_food_id
          from public.catalog_foods cf
          where cf.is_active
            and (v_normalized_food_type is null or cf.food_type = v_normalized_food_type)
            and (v_filtered_source_id is null or cf.source_id = v_filtered_source_id)
            and (
              v_normalized_country_code is null
              or upper(coalesce(cf.country_code, '')) = v_normalized_country_code
            )
            and public.normalize_food_search_text(cf.name) >= v_normalized_query
            and public.normalize_food_search_text(cf.name) < v_prefix_upper_bound
          order by normalized_name_length asc, cf.name asc, cf.source_food_id asc
          limit v_prefix_candidate_limit
        ) ranked

        union all

        select ranked.id, ranked.branch_score
        from (
          select
            fa.food_id as id,
            (
              18000
              - least(char_length(public.normalize_food_search_text(fa.alias))::double precision, 1000) * 0.1
            )::double precision as branch_score,
            char_length(public.normalize_food_search_text(fa.alias)) as normalized_alias_length,
            fa.alias,
            cf.source_food_id
          from public.food_aliases fa
          join public.catalog_foods cf on cf.id = fa.food_id
          where cf.is_active
            and (v_normalized_food_type is null or cf.food_type = v_normalized_food_type)
            and (v_filtered_source_id is null or cf.source_id = v_filtered_source_id)
            and (
              v_normalized_country_code is null
              or upper(coalesce(cf.country_code, '')) = v_normalized_country_code
            )
            and public.normalize_food_search_text(fa.alias) >= v_normalized_query
            and public.normalize_food_search_text(fa.alias) < v_prefix_upper_bound
          order by normalized_alias_length asc, fa.alias asc, cf.source_food_id asc
          limit v_prefix_candidate_limit
        ) ranked

        union all

        select ranked.id, ranked.branch_score
        from (
          select
            cf.id,
            (
              12000
              - least(char_length(public.normalize_food_search_text(cf.brand_name))::double precision, 1000) * 0.1
            )::double precision as branch_score,
            char_length(public.normalize_food_search_text(cf.brand_name)) as normalized_brand_length,
            cf.brand_name,
            cf.name,
            cf.source_food_id
          from public.catalog_foods cf
          where cf.is_active
            and cf.brand_name is not null
            and (v_normalized_food_type is null or cf.food_type = v_normalized_food_type)
            and (v_filtered_source_id is null or cf.source_id = v_filtered_source_id)
            and (
              v_normalized_country_code is null
              or upper(coalesce(cf.country_code, '')) = v_normalized_country_code
            )
            and public.normalize_food_search_text(cf.brand_name) >= v_normalized_query
            and public.normalize_food_search_text(cf.brand_name) < v_prefix_upper_bound
          order by normalized_brand_length asc, cf.brand_name asc, cf.name asc, cf.source_food_id asc
          limit v_prefix_candidate_limit
        ) ranked
      ) fast_branches
      group by id
    ),
    fts_candidates as (
      select ranked.id, ranked.branch_score
      from (
        select
          cf.id,
          (
            12000
            + ts_rank(cf.search_document, v_plain_tsquery) * 5000
            + coalesce(cf.data_completeness, 0) * 500
          )::double precision as branch_score,
          ts_rank(cf.search_document, v_plain_tsquery) as fulltext_rank,
          coalesce(cf.data_completeness, 0) as completeness_score,
          cf.name,
          cf.source_food_id
        from public.catalog_foods cf
        where v_query_length >= 3
          and v_plain_tsquery is not null
          and cf.is_active
          and (v_normalized_food_type is null or cf.food_type = v_normalized_food_type)
          and (v_filtered_source_id is null or cf.source_id = v_filtered_source_id)
          and (
            v_normalized_country_code is null
            or upper(coalesce(cf.country_code, '')) = v_normalized_country_code
          )
          and cf.search_document @@ v_plain_tsquery
        order by fulltext_rank desc, completeness_score desc, cf.name asc, cf.source_food_id asc
        limit v_search_candidate_limit
      ) ranked
    ),
    candidate_scores as materialized (
      select id from fast_candidate_scores
      union
      select id from fts_candidates
    )
    select count(*)::integer
    into v_combined_fast_fts_candidate_count
    from candidate_scores;

    if v_query_token_count >= 2 and (
      v_fast_candidate_count > 0
      or v_combined_fast_fts_candidate_count >= greatest(1, least(v_capped_limit, 4))
      or (v_query_token_count >= 3 and v_combined_fast_fts_candidate_count > 0)
    ) then
      v_use_trigram_search := false;
    end if;
  end if;

  if v_use_trigram_search then
    perform set_config(
      'pg_trgm.similarity_threshold',
      case
        when v_query_token_count >= 2 then '0.64'
        else '0.55'
      end,
      true
    );
  end if;

  return query
  with fast_candidate_scores as (
    select
      id,
      max(branch_score) as branch_score
    from (
      select
        cf.id,
        (
          case
            when v_query_token_count = 1 and cf.food_type = 'branded' then 65000
            else 100000
          end
        )::double precision as branch_score
      from public.catalog_foods cf
      where cf.is_active
        and (v_normalized_food_type is null or cf.food_type = v_normalized_food_type)
        and (v_filtered_source_id is null or cf.source_id = v_filtered_source_id)
        and (
          v_normalized_country_code is null
          or upper(coalesce(cf.country_code, '')) = v_normalized_country_code
        )
        and public.normalize_food_search_text(cf.name) = v_normalized_query

      union all

      select
        fa.food_id as id,
        95000::double precision as branch_score
      from public.food_aliases fa
      join public.catalog_foods cf on cf.id = fa.food_id
      where cf.is_active
        and (v_normalized_food_type is null or cf.food_type = v_normalized_food_type)
        and (v_filtered_source_id is null or cf.source_id = v_filtered_source_id)
        and (
          v_normalized_country_code is null
          or upper(coalesce(cf.country_code, '')) = v_normalized_country_code
        )
        and public.normalize_food_search_text(fa.alias) = v_normalized_query

      union all

      select
        cf.id,
        60000::double precision as branch_score
      from public.catalog_foods cf
      where cf.is_active
        and cf.brand_name is not null
        and (v_normalized_food_type is null or cf.food_type = v_normalized_food_type)
        and (v_filtered_source_id is null or cf.source_id = v_filtered_source_id)
        and (
          v_normalized_country_code is null
          or upper(coalesce(cf.country_code, '')) = v_normalized_country_code
        )
        and public.normalize_food_search_text(cf.brand_name) = v_normalized_query

      union all

      select ranked.id, ranked.branch_score
      from (
        select
          cf.id,
          (
            20000
            - least(char_length(public.normalize_food_search_text(cf.name))::double precision, 1000) * 0.1
          )::double precision as branch_score,
          char_length(public.normalize_food_search_text(cf.name)) as normalized_name_length,
          cf.name,
          cf.source_food_id
        from public.catalog_foods cf
        where cf.is_active
          and (v_normalized_food_type is null or cf.food_type = v_normalized_food_type)
          and (v_filtered_source_id is null or cf.source_id = v_filtered_source_id)
          and (
            v_normalized_country_code is null
            or upper(coalesce(cf.country_code, '')) = v_normalized_country_code
          )
          and public.normalize_food_search_text(cf.name) >= v_normalized_query
          and public.normalize_food_search_text(cf.name) < v_prefix_upper_bound
        order by normalized_name_length asc, cf.name asc, cf.source_food_id asc
        limit v_prefix_candidate_limit
      ) ranked

      union all

      select ranked.id, ranked.branch_score
      from (
        select
          fa.food_id as id,
          (
            18000
            - least(char_length(public.normalize_food_search_text(fa.alias))::double precision, 1000) * 0.1
          )::double precision as branch_score,
          char_length(public.normalize_food_search_text(fa.alias)) as normalized_alias_length,
          fa.alias,
          cf.source_food_id
        from public.food_aliases fa
        join public.catalog_foods cf on cf.id = fa.food_id
        where cf.is_active
          and (v_normalized_food_type is null or cf.food_type = v_normalized_food_type)
          and (v_filtered_source_id is null or cf.source_id = v_filtered_source_id)
          and (
            v_normalized_country_code is null
            or upper(coalesce(cf.country_code, '')) = v_normalized_country_code
          )
          and public.normalize_food_search_text(fa.alias) >= v_normalized_query
          and public.normalize_food_search_text(fa.alias) < v_prefix_upper_bound
        order by normalized_alias_length asc, fa.alias asc, cf.source_food_id asc
        limit v_prefix_candidate_limit
      ) ranked

      union all

      select ranked.id, ranked.branch_score
      from (
        select
          cf.id,
          (
            12000
            - least(char_length(public.normalize_food_search_text(cf.brand_name))::double precision, 1000) * 0.1
          )::double precision as branch_score,
          char_length(public.normalize_food_search_text(cf.brand_name)) as normalized_brand_length,
          cf.brand_name,
          cf.name,
          cf.source_food_id
        from public.catalog_foods cf
        where cf.is_active
          and cf.brand_name is not null
          and (v_normalized_food_type is null or cf.food_type = v_normalized_food_type)
          and (v_filtered_source_id is null or cf.source_id = v_filtered_source_id)
          and (
            v_normalized_country_code is null
            or upper(coalesce(cf.country_code, '')) = v_normalized_country_code
          )
          and public.normalize_food_search_text(cf.brand_name) >= v_normalized_query
          and public.normalize_food_search_text(cf.brand_name) < v_prefix_upper_bound
        order by normalized_brand_length asc, cf.brand_name asc, cf.name asc, cf.source_food_id asc
        limit v_prefix_candidate_limit
      ) ranked
    ) fast_branches
    group by id
  ),
  fts_candidates as (
    select ranked.id, ranked.branch_score
    from (
      select
        cf.id,
        (
          12000
          + ts_rank(cf.search_document, v_plain_tsquery) * 5000
          + coalesce(cf.data_completeness, 0) * 500
        )::double precision as branch_score,
        ts_rank(cf.search_document, v_plain_tsquery) as fulltext_rank,
        coalesce(cf.data_completeness, 0) as completeness_score,
        cf.name,
        cf.source_food_id
      from public.catalog_foods cf
      where v_use_fts_search
        and v_query_length >= 3
        and v_plain_tsquery is not null
        and cf.is_active
        and (v_normalized_food_type is null or cf.food_type = v_normalized_food_type)
        and (v_filtered_source_id is null or cf.source_id = v_filtered_source_id)
        and (
          v_normalized_country_code is null
          or upper(coalesce(cf.country_code, '')) = v_normalized_country_code
        )
        and cf.search_document @@ v_plain_tsquery
      order by fulltext_rank desc, completeness_score desc, cf.name asc, cf.source_food_id asc
      limit v_search_candidate_limit
    ) ranked
  ),
  name_trigram_candidates as (
    select ranked.id, ranked.branch_score
    from (
      select
        cf.id,
        (similarity(lower(cf.name), v_raw_query_for_trgm) * 7000)::double precision as branch_score,
        coalesce(cf.data_completeness, 0) as completeness_score,
        cf.name,
        cf.source_food_id
      from public.catalog_foods cf
      where v_use_trigram_search
        and v_query_length >= 4
        and (v_query_token_count >= 2 or v_query_length >= 5)
        and cf.is_active
        and (v_normalized_food_type is null or cf.food_type = v_normalized_food_type)
        and (v_filtered_source_id is null or cf.source_id = v_filtered_source_id)
        and (
          v_normalized_country_code is null
          or upper(coalesce(cf.country_code, '')) = v_normalized_country_code
        )
        and lower(cf.name) % v_raw_query_for_trgm
      order by branch_score desc, completeness_score desc, cf.name asc, cf.source_food_id asc
      limit v_search_candidate_limit
    ) ranked
  ),
  brand_trigram_candidates as (
    select ranked.id, ranked.branch_score
    from (
      select
        cf.id,
        (similarity(lower(cf.brand_name), v_raw_query_for_trgm) * 6500)::double precision as branch_score,
        coalesce(cf.data_completeness, 0) as completeness_score,
        cf.brand_name,
        cf.name,
        cf.source_food_id
      from public.catalog_foods cf
      where v_use_trigram_search
        and v_query_token_count >= 2
        and v_query_length >= 4
        and cf.is_active
        and cf.brand_name is not null
        and (v_normalized_food_type is null or cf.food_type = v_normalized_food_type)
        and (v_filtered_source_id is null or cf.source_id = v_filtered_source_id)
        and (
          v_normalized_country_code is null
          or upper(coalesce(cf.country_code, '')) = v_normalized_country_code
        )
        and lower(cf.brand_name) % v_raw_query_for_trgm
      order by branch_score desc, completeness_score desc, cf.brand_name asc, cf.name asc, cf.source_food_id asc
      limit v_search_candidate_limit
    ) ranked
  ),
  candidate_scores as materialized (
    select
      id,
      max(branch_score) as branch_score
    from (
      select id, branch_score from fast_candidate_scores
      union all
      select id, branch_score from fts_candidates
      union all
      select id, branch_score from name_trigram_candidates
      union all
      select id, branch_score from brand_trigram_candidates
    ) branch_candidates
    group by id
  ),
  alias_rank as (
    select
      fa.food_id,
      min(fa.alias) filter (
        where public.normalize_food_search_text(fa.alias) = v_normalized_query
      ) as exact_alias,
      min(fa.alias) filter (
        where public.normalize_food_search_text(fa.alias) >= v_normalized_query
          and public.normalize_food_search_text(fa.alias) < v_prefix_upper_bound
      ) as prefix_alias
    from public.food_aliases fa
    join candidate_scores cs on cs.id = fa.food_id
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
      coalesce(ar.exact_alias, ar.prefix_alias) as matched_alias,
      cs.branch_score,
      name_data.normalized_name,
      split_part(name_data.normalized_name, ' ', 1) as first_name_token,
      (name_data.normalized_name = v_normalized_query) as exact_name_match,
      (ar.exact_alias is not null) as exact_alias_match
    from candidate_scores cs
    join public.catalog_foods cf on cf.id = cs.id
    join public.food_sources fs on fs.id = cf.source_id
    cross join lateral (
      select public.normalize_food_search_text(cf.name) as normalized_name
    ) name_data
    left join alias_rank ar on ar.food_id = cf.id
  ),
  ranked as (
    select
      s.food_id,
      s.source_code,
      s.source_food_id,
      s.food_type,
      s.name,
      s.description,
      s.brand_name,
      s.country_code,
      s.verification_level,
      s.data_completeness,
      s.matched_alias,
      s.exact_name_match,
      s.exact_alias_match,
      (
        s.branch_score +
        case
          when v_query_token_count = 1
            and s.first_name_token = v_first_query_token
            and s.food_type in ('common', 'ingredient')
            then 35000
          else 0
        end +
        case
          when v_query_token_count = 1 and s.first_name_token = v_first_query_token then 10000
          else 0
        end +
        case
          when v_query_token_count = 1
            and s.food_type in ('common', 'ingredient')
            then 5000
          else 0
        end +
        case
          when v_normalized_preferred_market_country_code is not null
            and upper(coalesce(s.country_code, '')) = v_normalized_preferred_market_country_code
            then case when s.food_type = 'branded' then 350 else 125 end
          else 0
        end +
        (coalesce(s.data_completeness, 0) * 500) -
        (char_length(s.normalized_name) * 0.1)
      )::double precision as relevance_score
    from scored s
  )
  select
    r.food_id,
    r.source_code,
    r.source_food_id,
    r.food_type,
    r.name,
    r.description,
    r.brand_name,
    r.country_code,
    r.verification_level,
    r.data_completeness,
    r.matched_alias,
    r.relevance_score
  from ranked r
  order by
    r.exact_name_match desc,
    r.exact_alias_match desc,
    r.relevance_score desc,
    char_length(r.name) asc,
    r.name asc,
    r.source_food_id asc
  limit v_capped_limit;
end;
$$;

grant execute on function public.search_catalog_foods(text, integer, text, text, text, text)
to anon, authenticated, service_role;
