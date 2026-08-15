create or replace function extensions.jsonb_object_length(payload jsonb)
returns integer
language sql
immutable
parallel safe
as $$
  select count(*)::integer
  from jsonb_object_keys(coalesce(payload, '{}'::jsonb));
$$;
