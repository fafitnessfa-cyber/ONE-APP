create table if not exists public.food_favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  catalog_food_id uuid not null references public.catalog_foods (id) on delete cascade,
  catalog_serving_id uuid references public.food_servings (id) on delete set null,
  serving_label text not null,
  serving_quantity numeric(12,4) not null default 1,
  effective_grams numeric(12,4),
  display_name text,
  sort_order integer not null default 0,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now()),
  constraint food_favorites_serving_label_not_blank_ck
    check (char_length(trim(serving_label)) > 0),
  constraint food_favorites_serving_quantity_positive_ck
    check (serving_quantity > 0),
  constraint food_favorites_effective_grams_positive_ck
    check (effective_grams is null or effective_grams > 0),
  constraint food_favorites_display_name_not_blank_ck
    check (display_name is null or char_length(trim(display_name)) > 0),
  constraint food_favorites_sort_order_non_negative_ck
    check (sort_order >= 0)
);

create unique index if not exists food_favorites_user_configuration_unique_idx
  on public.food_favorites (
    user_id,
    catalog_food_id,
    coalesce(catalog_serving_id, '00000000-0000-0000-0000-000000000000'::uuid),
    serving_quantity
  );

create index if not exists food_favorites_user_sort_order_updated_idx
  on public.food_favorites (user_id, sort_order asc, updated_at desc);

create index if not exists food_logs_user_catalog_food_logged_at_idx
  on public.food_logs (user_id, catalog_food_id, logged_at desc)
  where catalog_food_id is not null;

create index if not exists food_logs_user_legacy_food_logged_at_idx
  on public.food_logs (user_id, food_id, logged_at desc)
  where catalog_food_id is null and food_id is not null;

create index if not exists food_logs_user_meal_logged_at_idx
  on public.food_logs (user_id, meal, logged_at desc);

create or replace function public.set_food_favorites_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

drop trigger if exists set_food_favorites_updated_at on public.food_favorites;

create trigger set_food_favorites_updated_at
before update on public.food_favorites
for each row
execute function public.set_food_favorites_updated_at();

alter table public.food_favorites enable row level security;

drop policy if exists "Users can read their own food favorites" on public.food_favorites;
drop policy if exists "Users can create their own food favorites" on public.food_favorites;
drop policy if exists "Users can update their own food favorites" on public.food_favorites;
drop policy if exists "Users can delete their own food favorites" on public.food_favorites;

create policy "Users can read their own food favorites"
on public.food_favorites
for select
to authenticated
using (user_id = auth.uid());

create policy "Users can create their own food favorites"
on public.food_favorites
for insert
to authenticated
with check (user_id = auth.uid());

create policy "Users can update their own food favorites"
on public.food_favorites
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Users can delete their own food favorites"
on public.food_favorites
for delete
to authenticated
using (user_id = auth.uid());

comment on table public.food_favorites is
  'User-owned reusable food shortcuts that preserve preferred serving configuration without storing historical nutrition snapshots.';

comment on column public.food_favorites.serving_label is
  'Preferred serving label captured for display and fallback if the linked serving is later removed.';

comment on column public.food_favorites.serving_quantity is
  'Preferred quantity for this shortcut. A new food log still recalculates nutrition from the current catalog when used.';

create or replace function public.get_recent_foods(
  result_limit integer default 20
)
returns table (
  reference_key text,
  entry_type text,
  catalog_food_id uuid,
  food_id uuid,
  catalog_serving_id uuid,
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
      case
        when fl.catalog_food_id is not null then 'catalog:' || fl.catalog_food_id::text
        else 'legacy:' || fl.food_id::text
      end as reference_key,
      case
        when fl.catalog_food_id is not null then 'catalog'
        else 'legacy'
      end as entry_type,
      fl.*,
      row_number() over (
        partition by
          case
            when fl.catalog_food_id is not null then 'catalog:' || fl.catalog_food_id::text
            else 'legacy:' || fl.food_id::text
          end
        order by fl.logged_at desc, fl.id desc
      ) as recent_rank,
      count(*) over (
        partition by
          case
            when fl.catalog_food_id is not null then 'catalog:' || fl.catalog_food_id::text
            else 'legacy:' || fl.food_id::text
          end
      ) as log_count
    from public.food_logs fl
    where fl.user_id = auth.uid()
  )
  select
    sl.reference_key,
    sl.entry_type,
    sl.catalog_food_id,
    sl.food_id,
    sl.catalog_serving_id,
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
  catalog_serving_id uuid,
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
      case
        when fl.catalog_food_id is not null then 'catalog:' || fl.catalog_food_id::text
        else 'legacy:' || fl.food_id::text
      end as reference_key,
      case
        when fl.catalog_food_id is not null then 'catalog'
        else 'legacy'
      end as entry_type,
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
      ml.catalog_serving_id,
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
    lr.catalog_serving_id,
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
      + greatest(
          0::double precision,
          24::double precision
            - least(
                extract(epoch from (timezone('utc'::text, now()) - a.last_logged_at)) / 86400::double precision,
                60::double precision
              ) * 0.4
        )
      + least(18::double precision, ln((a.log_count + 1)::numeric)::double precision * 6)
    ) as history_score
  from aggregated a
  join latest_rows lr on lr.reference_key = a.reference_key
  cross join query_state qs
  order by history_score desc, a.last_logged_at desc, lr.food_name asc
  limit (select capped_limit from query_state);
$$;

create or replace function public.get_food_go_tos(
  meal_context public.meal_type default null,
  result_limit integer default 8
)
returns table (
  reference_key text,
  entry_type text,
  catalog_food_id uuid,
  food_id uuid,
  catalog_serving_id uuid,
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
    select
      meal_context as requested_meal,
      greatest(1, least(coalesce(result_limit, 8), 20)) as capped_limit
  ),
  history_window as (
    select
      case
        when fl.catalog_food_id is not null then 'catalog:' || fl.catalog_food_id::text
        else 'legacy:' || fl.food_id::text
      end as reference_key,
      case
        when fl.catalog_food_id is not null then 'catalog'
        else 'legacy'
      end as entry_type,
      fl.*
    from public.food_logs fl
    where fl.user_id = auth.uid()
      and fl.logged_at >= timezone('utc'::text, now()) - interval '180 days'
  ),
  aggregated as (
    select
      hw.reference_key,
      hw.entry_type,
      max(hw.logged_at) as last_logged_at,
      count(*) as log_count,
      count(*) filter (where hw.meal = i.requested_meal) as meal_match_count
    from history_window hw
    cross join input i
    group by hw.reference_key, hw.entry_type
  ),
  latest_rows as (
    select distinct on (hw.reference_key)
      hw.reference_key,
      hw.catalog_food_id,
      hw.food_id,
      hw.catalog_serving_id,
      hw.food_name,
      hw.food_brand,
      hw.food_source,
      hw.serving_label,
      hw.serving_quantity,
      hw.effective_grams,
      hw.calories_per_serving,
      hw.protein_per_serving_g,
      hw.carbs_per_serving_g,
      hw.fat_per_serving_g,
      hw.fiber_per_serving_g,
      hw.sodium_mg_per_serving,
      hw.meal as latest_meal
    from history_window hw
    order by hw.reference_key, hw.logged_at desc, hw.id desc
  ),
  eligible as (
    select
      a.reference_key,
      a.entry_type,
      a.last_logged_at,
      a.log_count,
      a.meal_match_count,
      least(36::double precision, ln((a.log_count + 1)::numeric)::double precision * 14) as frequency_component,
      greatest(
        0::double precision,
        28::double precision
          - least(
              extract(epoch from (timezone('utc'::text, now()) - a.last_logged_at)) / 86400::double precision,
              45::double precision
            ) * 0.65
      ) as recency_component,
      case
        when i.requested_meal is null then 0::double precision
        when a.meal_match_count = 0 then 0::double precision
        else least(
          32::double precision,
          (a.meal_match_count::double precision * 10)
            + case
                when lr.latest_meal = i.requested_meal then 6::double precision
                else 0::double precision
              end
        )
      end as meal_context_component
    from aggregated a
    join latest_rows lr on lr.reference_key = a.reference_key
    cross join input i
    where a.log_count >= 2
      and (i.requested_meal is null or a.meal_match_count > 0)
  )
  select
    lr.reference_key,
    e.entry_type,
    lr.catalog_food_id,
    lr.food_id,
    lr.catalog_serving_id,
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
    e.last_logged_at,
    e.log_count,
    e.meal_match_count,
    (
      e.frequency_component
      + e.recency_component
      + e.meal_context_component
    ) as go_to_score
  from eligible e
  join latest_rows lr on lr.reference_key = e.reference_key
  cross join input i
  order by go_to_score desc, e.last_logged_at desc, lr.food_name asc
  limit (select capped_limit from input);
$$;

revoke all on function public.get_recent_foods(integer) from public;
revoke all on function public.search_food_history(text, integer) from public;
revoke all on function public.get_food_go_tos(public.meal_type, integer) from public;

grant execute on function public.get_recent_foods(integer) to authenticated, service_role;
grant execute on function public.search_food_history(text, integer) to authenticated, service_role;
grant execute on function public.get_food_go_tos(public.meal_type, integer) to authenticated, service_role;
