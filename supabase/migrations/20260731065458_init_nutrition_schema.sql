create extension if not exists pgcrypto with schema extensions;

create type public.meal_type as enum ('Breakfast', 'Lunch', 'Dinner', 'Snack');

create table public.foods (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  brand text,
  serving_label text not null,
  serving_grams numeric(8, 2),
  calories integer not null check (calories >= 0),
  protein_g numeric(8, 2) not null default 0 check (protein_g >= 0),
  carbs_g numeric(8, 2) not null default 0 check (carbs_g >= 0),
  fat_g numeric(8, 2) not null default 0 check (fat_g >= 0),
  fiber_g numeric(8, 2) not null default 0 check (fiber_g >= 0),
  is_public boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.nutrition_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  goal_date date not null,
  calories_target integer not null check (calories_target > 0),
  protein_target_g numeric(8, 2) not null check (protein_target_g >= 0),
  carbs_target_g numeric(8, 2) not null check (carbs_target_g >= 0),
  fat_target_g numeric(8, 2) not null check (fat_target_g >= 0),
  hydration_target_ml integer not null default 3500 check (hydration_target_ml >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  unique (user_id, goal_date)
);

create table public.food_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  food_id uuid references public.foods (id) on delete set null,
  meal public.meal_type not null,
  servings numeric(8, 2) not null default 1 check (servings > 0),
  calories integer not null check (calories >= 0),
  protein_g numeric(8, 2) not null default 0 check (protein_g >= 0),
  carbs_g numeric(8, 2) not null default 0 check (carbs_g >= 0),
  fat_g numeric(8, 2) not null default 0 check (fat_g >= 0),
  fiber_g numeric(8, 2) not null default 0 check (fiber_g >= 0),
  logged_at timestamptz not null default timezone('utc', now()),
  note text
);

create index foods_name_idx on public.foods (lower(name));
create index nutrition_goals_user_date_idx on public.nutrition_goals (user_id, goal_date);
create index food_logs_user_logged_at_idx on public.food_logs (user_id, logged_at desc);

grant usage on schema public to anon, authenticated;

grant select on table public.foods to anon, authenticated;
grant insert, update on table public.foods to authenticated;
grant select, insert, update, delete on table public.nutrition_goals to authenticated;
grant select, insert, update, delete on table public.food_logs to authenticated;

alter table public.foods enable row level security;
alter table public.nutrition_goals enable row level security;
alter table public.food_logs enable row level security;

create policy "Foods are readable when public or owned"
on public.foods
for select
to anon, authenticated
using (is_public or created_by = auth.uid());

create policy "Authenticated users can create custom foods"
on public.foods
for insert
to authenticated
with check (created_by = auth.uid());

create policy "Authenticated users can update their own foods"
on public.foods
for update
to authenticated
using (created_by = auth.uid())
with check (created_by = auth.uid());

create policy "Users can read their own nutrition goals"
on public.nutrition_goals
for select
to authenticated
using (user_id = auth.uid());

create policy "Users can create their own nutrition goals"
on public.nutrition_goals
for insert
to authenticated
with check (user_id = auth.uid());

create policy "Users can update their own nutrition goals"
on public.nutrition_goals
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Users can delete their own nutrition goals"
on public.nutrition_goals
for delete
to authenticated
using (user_id = auth.uid());

create policy "Users can read their own food logs"
on public.food_logs
for select
to authenticated
using (user_id = auth.uid());

create policy "Users can create their own food logs"
on public.food_logs
for insert
to authenticated
with check (user_id = auth.uid());

create policy "Users can update their own food logs"
on public.food_logs
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Users can delete their own food logs"
on public.food_logs
for delete
to authenticated
using (user_id = auth.uid());
