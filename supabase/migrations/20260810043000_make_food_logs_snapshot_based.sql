alter table public.food_logs
  add column if not exists catalog_serving_id uuid references public.food_servings (id) on delete set null,
  add column if not exists serving_quantity numeric(12,4),
  add column if not exists effective_grams numeric(12,4),
  add column if not exists nutrients_snapshot jsonb;

alter table public.food_logs
  alter column servings type numeric(12,4),
  alter column calories type numeric(12,4) using calories::numeric(12,4),
  alter column protein_g type numeric(12,4),
  alter column carbs_g type numeric(12,4),
  alter column fat_g type numeric(12,4),
  alter column fiber_g type numeric(12,4),
  alter column calories_per_serving type numeric(12,4) using calories_per_serving::numeric(12,4),
  alter column protein_per_serving_g type numeric(12,4),
  alter column carbs_per_serving_g type numeric(12,4),
  alter column fat_per_serving_g type numeric(12,4),
  alter column fiber_per_serving_g type numeric(12,4),
  alter column sodium_mg_per_serving type numeric(12,4);

update public.food_logs
set serving_quantity = servings
where serving_quantity is null;

alter table public.food_logs
  alter column serving_quantity set default 1,
  alter column serving_quantity set not null;

alter table public.food_logs
  drop constraint if exists food_logs_single_food_reference_ck,
  drop constraint if exists food_logs_quantity_columns_match_ck,
  drop constraint if exists food_logs_serving_quantity_positive_ck,
  drop constraint if exists food_logs_effective_grams_positive_ck,
  drop constraint if exists food_logs_nutrients_snapshot_object_ck;

alter table public.food_logs
  add constraint food_logs_single_food_reference_ck
    check (num_nonnulls(food_id, catalog_food_id) = 1),
  add constraint food_logs_quantity_columns_match_ck
    check (servings = serving_quantity),
  add constraint food_logs_serving_quantity_positive_ck
    check (serving_quantity > 0),
  add constraint food_logs_effective_grams_positive_ck
    check (effective_grams is null or effective_grams > 0),
  add constraint food_logs_nutrients_snapshot_object_ck
    check (nutrients_snapshot is null or jsonb_typeof(nutrients_snapshot) = 'object');

create index if not exists food_logs_catalog_serving_id_idx
  on public.food_logs (catalog_serving_id);

comment on column public.food_logs.catalog_serving_id is
  'References the selected food_servings row when available. Historical rendering must still rely on the saved snapshot fields.';

comment on column public.food_logs.serving_quantity is
  'Immutable snapshot of the user-entered quantity for the saved serving definition.';

comment on column public.food_logs.effective_grams is
  'Immutable snapshot of the total gram amount represented by the saved quantity and serving when a gram conversion is available.';

comment on column public.food_logs.nutrients_snapshot is
  'Canonical nutrient totals captured at log-save time for historical stability and future micronutrient reporting.';
