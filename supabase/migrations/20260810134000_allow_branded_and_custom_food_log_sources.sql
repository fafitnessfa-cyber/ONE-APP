alter table public.food_logs
  drop constraint if exists food_logs_food_source_check;

alter table public.food_logs
  add constraint food_logs_food_source_check
  check (food_source in ('usda', 'branded', 'nutritionix', 'saved', 'recipe', 'custom'));
