alter table public.food_logs
  add column if not exists catalog_food_id uuid references public.catalog_foods (id) on delete set null;

create index if not exists food_logs_catalog_food_id_idx
  on public.food_logs (catalog_food_id);
