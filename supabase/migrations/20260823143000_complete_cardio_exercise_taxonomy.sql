update public.exercises
set
  movement_pattern = 'locomotion',
  mechanic = 'compound'
where slug in ('stationary-bike', 'treadmill-run')
  and (
    movement_pattern is distinct from 'locomotion'
    or mechanic is distinct from 'compound'
  );
