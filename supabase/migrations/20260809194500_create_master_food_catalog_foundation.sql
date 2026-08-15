create extension if not exists pg_trgm with schema extensions;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table public.food_sources (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  website_url text,
  data_type text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint food_sources_code_not_blank check (char_length(trim(code)) > 0),
  constraint food_sources_name_not_blank check (char_length(trim(name)) > 0)
);

create table public.nutrients (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  unit text not null,
  category text not null,
  display_order integer,
  is_core boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint nutrients_code_not_blank check (char_length(trim(code)) > 0),
  constraint nutrients_name_not_blank check (char_length(trim(name)) > 0),
  constraint nutrients_unit_not_blank check (char_length(trim(unit)) > 0),
  constraint nutrients_category_check check (
    category in ('energy', 'macro', 'vitamin', 'mineral', 'fatty_acid', 'amino_acid', 'other')
  ),
  constraint nutrients_display_order_non_negative check (
    display_order is null or display_order >= 0
  )
);

create table public.catalog_foods (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.food_sources (id) on delete restrict,
  source_food_id text,
  food_type text not null,
  name text not null,
  description text,
  brand_name text,
  country_code text,
  verification_level text not null default 'unknown',
  data_completeness numeric(5, 4),
  base_amount numeric(10, 3) not null default 100,
  base_unit text not null default 'g',
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  search_document tsvector generated always as (
    setweight(to_tsvector('simple', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(brand_name, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(description, '')), 'C')
  ) stored,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint catalog_foods_food_type_check check (
    food_type in ('common', 'branded', 'restaurant', 'ingredient')
  ),
  constraint catalog_foods_verification_level_check check (
    verification_level in ('research', 'verified', 'manufacturer', 'community', 'unknown')
  ),
  constraint catalog_foods_name_not_blank check (char_length(trim(name)) > 0),
  constraint catalog_foods_source_food_id_not_blank check (
    source_food_id is null or char_length(trim(source_food_id)) > 0
  ),
  constraint catalog_foods_country_code_length check (
    country_code is null or char_length(trim(country_code)) between 2 and 3
  ),
  constraint catalog_foods_data_completeness_range check (
    data_completeness is null or (data_completeness >= 0 and data_completeness <= 1)
  ),
  constraint catalog_foods_base_amount_positive check (base_amount > 0),
  constraint catalog_foods_base_unit_not_blank check (char_length(trim(base_unit)) > 0)
);

create table public.food_nutrients (
  food_id uuid not null references public.catalog_foods (id) on delete cascade,
  nutrient_id uuid not null references public.nutrients (id) on delete restrict,
  amount numeric(12, 4) not null,
  data_origin text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (food_id, nutrient_id),
  constraint food_nutrients_amount_non_negative check (amount >= 0)
);

create table public.food_servings (
  id uuid primary key default gen_random_uuid(),
  food_id uuid not null references public.catalog_foods (id) on delete cascade,
  serving_name text not null,
  quantity numeric(10, 3) not null default 1,
  gram_weight numeric(10, 3),
  milliliter_volume numeric(10, 3),
  household_unit text,
  is_default boolean not null default false,
  source_serving_id text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint food_servings_name_not_blank check (char_length(trim(serving_name)) > 0),
  constraint food_servings_quantity_positive check (quantity > 0),
  constraint food_servings_gram_weight_positive check (
    gram_weight is null or gram_weight > 0
  ),
  constraint food_servings_milliliter_volume_positive check (
    milliliter_volume is null or milliliter_volume > 0
  ),
  constraint food_servings_household_unit_not_blank check (
    household_unit is null or char_length(trim(household_unit)) > 0
  ),
  constraint food_servings_source_serving_id_not_blank check (
    source_serving_id is null or char_length(trim(source_serving_id)) > 0
  ),
  constraint food_servings_has_measure check (
    gram_weight is not null
    or milliliter_volume is not null
    or household_unit is not null
  )
);

create table public.food_barcodes (
  id uuid primary key default gen_random_uuid(),
  food_id uuid not null references public.catalog_foods (id) on delete cascade,
  barcode text not null,
  country_code text,
  is_primary boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint food_barcodes_barcode_not_blank check (char_length(trim(barcode)) > 0),
  constraint food_barcodes_country_code_length check (
    country_code is null or char_length(trim(country_code)) between 2 and 3
  )
);

create table public.food_aliases (
  id uuid primary key default gen_random_uuid(),
  food_id uuid not null references public.catalog_foods (id) on delete cascade,
  alias text not null,
  language_code text,
  alias_type text,
  search_document tsvector generated always as (
    to_tsvector('simple', coalesce(alias, ''))
  ) stored,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint food_aliases_alias_not_blank check (char_length(trim(alias)) > 0),
  constraint food_aliases_language_code_length check (
    language_code is null or char_length(trim(language_code)) between 2 and 10
  ),
  constraint food_aliases_alias_type_not_blank check (
    alias_type is null or char_length(trim(alias_type)) > 0
  )
);

create unique index catalog_foods_source_source_food_id_unique_idx
on public.catalog_foods (source_id, source_food_id)
where source_food_id is not null;

create index catalog_foods_source_id_idx
on public.catalog_foods (source_id);

create index catalog_foods_food_type_idx
on public.catalog_foods (food_type);

create index catalog_foods_country_code_idx
on public.catalog_foods (country_code);

create index catalog_foods_search_document_idx
on public.catalog_foods
using gin (search_document);

create index catalog_foods_name_trgm_idx
on public.catalog_foods
using gin (lower(name) gin_trgm_ops);

create index catalog_foods_brand_name_trgm_idx
on public.catalog_foods
using gin (lower(brand_name) gin_trgm_ops)
where brand_name is not null;

create index food_nutrients_nutrient_id_idx
on public.food_nutrients (nutrient_id);

create index food_servings_food_id_idx
on public.food_servings (food_id);

create unique index food_servings_default_per_food_unique_idx
on public.food_servings (food_id)
where is_default;

create unique index food_servings_food_source_serving_unique_idx
on public.food_servings (food_id, source_serving_id)
where source_serving_id is not null;

create index food_barcodes_food_id_idx
on public.food_barcodes (food_id);

create index food_barcodes_lookup_idx
on public.food_barcodes (barcode, country_code);

create unique index food_barcodes_food_barcode_country_unique_idx
on public.food_barcodes (food_id, barcode, coalesce(country_code, ''));

create unique index food_barcodes_primary_per_food_unique_idx
on public.food_barcodes (food_id)
where is_primary;

create index food_aliases_food_id_idx
on public.food_aliases (food_id);

create index food_aliases_search_document_idx
on public.food_aliases
using gin (search_document);

create index food_aliases_alias_trgm_idx
on public.food_aliases
using gin (lower(alias) gin_trgm_ops);

create unique index food_aliases_food_alias_language_unique_idx
on public.food_aliases (food_id, lower(alias), coalesce(language_code, ''));

drop trigger if exists set_food_sources_updated_at on public.food_sources;
create trigger set_food_sources_updated_at
before update on public.food_sources
for each row
execute function public.set_updated_at();

drop trigger if exists set_nutrients_updated_at on public.nutrients;
create trigger set_nutrients_updated_at
before update on public.nutrients
for each row
execute function public.set_updated_at();

drop trigger if exists set_catalog_foods_updated_at on public.catalog_foods;
create trigger set_catalog_foods_updated_at
before update on public.catalog_foods
for each row
execute function public.set_updated_at();

drop trigger if exists set_food_nutrients_updated_at on public.food_nutrients;
create trigger set_food_nutrients_updated_at
before update on public.food_nutrients
for each row
execute function public.set_updated_at();

drop trigger if exists set_food_servings_updated_at on public.food_servings;
create trigger set_food_servings_updated_at
before update on public.food_servings
for each row
execute function public.set_updated_at();

drop trigger if exists set_food_barcodes_updated_at on public.food_barcodes;
create trigger set_food_barcodes_updated_at
before update on public.food_barcodes
for each row
execute function public.set_updated_at();

drop trigger if exists set_food_aliases_updated_at on public.food_aliases;
create trigger set_food_aliases_updated_at
before update on public.food_aliases
for each row
execute function public.set_updated_at();

grant select on table public.food_sources to anon, authenticated;
grant select on table public.nutrients to anon, authenticated;
grant select on table public.catalog_foods to anon, authenticated;
grant select on table public.food_nutrients to anon, authenticated;
grant select on table public.food_servings to anon, authenticated;
grant select on table public.food_barcodes to anon, authenticated;
grant select on table public.food_aliases to anon, authenticated;

grant select, insert, update, delete on table public.food_sources to service_role;
grant select, insert, update, delete on table public.nutrients to service_role;
grant select, insert, update, delete on table public.catalog_foods to service_role;
grant select, insert, update, delete on table public.food_nutrients to service_role;
grant select, insert, update, delete on table public.food_servings to service_role;
grant select, insert, update, delete on table public.food_barcodes to service_role;
grant select, insert, update, delete on table public.food_aliases to service_role;

alter table public.food_sources enable row level security;
alter table public.nutrients enable row level security;
alter table public.catalog_foods enable row level security;
alter table public.food_nutrients enable row level security;
alter table public.food_servings enable row level security;
alter table public.food_barcodes enable row level security;
alter table public.food_aliases enable row level security;

create policy "Food sources are readable when active"
on public.food_sources
for select
to anon, authenticated
using (is_active);

create policy "Nutrients are publicly readable"
on public.nutrients
for select
to anon, authenticated
using (true);

create policy "Catalog foods are readable when active"
on public.catalog_foods
for select
to anon, authenticated
using (is_active);

create policy "Food nutrients are readable for active foods"
on public.food_nutrients
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.catalog_foods
    where catalog_foods.id = food_nutrients.food_id
      and catalog_foods.is_active
  )
);

create policy "Food servings are readable for active foods"
on public.food_servings
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.catalog_foods
    where catalog_foods.id = food_servings.food_id
      and catalog_foods.is_active
  )
);

create policy "Food barcodes are readable for active foods"
on public.food_barcodes
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.catalog_foods
    where catalog_foods.id = food_barcodes.food_id
      and catalog_foods.is_active
  )
);

create policy "Food aliases are readable for active foods"
on public.food_aliases
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.catalog_foods
    where catalog_foods.id = food_aliases.food_id
      and catalog_foods.is_active
  )
);

insert into public.food_sources (
  code,
  name,
  description,
  website_url,
  data_type,
  is_active
)
values
  (
    'USDA_FDC',
    'USDA FoodData Central',
    'Umbrella source definition for USDA FoodData Central records.',
    'https://fdc.nal.usda.gov/',
    'reference',
    true
  ),
  (
    'USDA_FNDDS',
    'USDA FNDDS',
    'USDA Food and Nutrient Database for Dietary Studies source definition.',
    'https://www.ars.usda.gov/nea/bhnrc/fsrg',
    'survey',
    true
  ),
  (
    'USDA_FOUNDATION',
    'USDA Foundation Foods',
    'USDA Foundation Foods source definition.',
    'https://fdc.nal.usda.gov/',
    'reference',
    true
  ),
  (
    'USDA_BRANDED',
    'USDA Branded Foods',
    'USDA branded foods source definition.',
    'https://fdc.nal.usda.gov/',
    'branded',
    true
  ),
  (
    'OPEN_FOOD_FACTS',
    'Open Food Facts',
    'Open Food Facts source definition.',
    'https://world.openfoodfacts.org/',
    'community',
    true
  ),
  (
    'PHILFCT',
    'Philippine Food Composition Tables',
    'Source definition only. Bulk import should wait until licensing and reuse permission are confirmed.',
    'https://i.fnri.dost.gov.ph/fct/library',
    'reference',
    true
  ),
  (
    'ONEUP_VERIFIED',
    'ONE UP Verified',
    'Curated foods verified directly by ONE UP.',
    null,
    'curated',
    true
  )
on conflict (code) do update
set
  name = excluded.name,
  description = excluded.description,
  website_url = excluded.website_url,
  data_type = excluded.data_type,
  is_active = excluded.is_active,
  updated_at = timezone('utc', now());

insert into public.nutrients (
  code,
  name,
  unit,
  category,
  display_order,
  is_core
)
values
  ('energy_kcal', 'Energy', 'kcal', 'energy', 1, true),
  ('protein', 'Protein', 'g', 'macro', 2, true),
  ('carbohydrate', 'Carbohydrate', 'g', 'macro', 3, true),
  ('fat', 'Total Fat', 'g', 'macro', 4, true),
  ('fiber', 'Fiber', 'g', 'macro', 5, false),
  ('sugars', 'Total Sugars', 'g', 'macro', 6, false),
  ('sodium', 'Sodium', 'mg', 'mineral', 7, false),
  ('potassium', 'Potassium', 'mg', 'mineral', 8, false),
  ('calcium', 'Calcium', 'mg', 'mineral', 9, false),
  ('iron', 'Iron', 'mg', 'mineral', 10, false),
  ('vitamin_c', 'Vitamin C', 'mg', 'vitamin', 11, false),
  ('vitamin_d', 'Vitamin D', 'mcg', 'vitamin', 12, false),
  ('saturated_fat', 'Saturated Fat', 'g', 'fatty_acid', 13, false),
  ('cholesterol', 'Cholesterol', 'mg', 'other', 14, false)
on conflict (code) do update
set
  name = excluded.name,
  unit = excluded.unit,
  category = excluded.category,
  display_order = excluded.display_order,
  is_core = excluded.is_core,
  updated_at = timezone('utc', now());
