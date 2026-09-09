# Progress System

The ONE UP Progress foundation uses real Supabase workout and body data without redesigning the existing Progress UI.

## Scope

- `body_weight_entries` stores private historical weigh-ins.
- `body_measurements` stores private historical body measurements.
- Workout analytics and PRs are derived from `workout_sessions`, `workout_session_exercises`, and `workout_sets`.
- Gamification, XP, levels, streak rewards, and AI coaching are intentionally out of scope for this stage.

## Canonical Units

- Body weight is stored in `kg`.
- Circumference measurements are stored in `cm`.
- Body fat is stored as a user-entered `%`.
- Workout load history remains canonical in `kg`, `meters`, and `seconds`.
- UI conversion happens at the app layer using shared conversion helpers.

## Data Model

```text
auth.users
  -> profiles
  -> body_weight_entries
  -> body_measurements
  -> workout_sessions
       -> workout_session_exercises
            -> workout_sets
                 -> derived Progress analytics / PR RPCs

exercises
  -> exercise_muscles
  -> workout_session_exercises / workout_sets
```

## Weight History Sync

- `body_weight_entries` is the authoritative historical source.
- `profiles.current_weight_kg` is a convenience cache of the newest historical weight.
- Inserts, updates, and deletes on `body_weight_entries` automatically recalculate `profiles.current_weight_kg`.
- Direct profile writes to `current_weight_kg` automatically insert a `body_weight_entries` row with `source = 'profile_sync'`.
- Existing profile weights are backfilled once through the migration with `source = 'backfill'`.
- If the latest weight is deleted, the profile falls back to the next-latest historical entry.
- If no weight history remains, `profiles.current_weight_kg` becomes `null`.

## Measurement Types

Supported historical measurement types:

- `waist`
- `chest`
- `hips`
- `left_arm`
- `right_arm`
- `left_thigh`
- `right_thigh`
- `neck`
- `body_fat_percentage`

## Progress RPCs

- `get_activity_buckets(range, timezone, reference_at)`
  - Returns week buckets (Mon-Sun) or a rolling 4-week view.
- `get_training_summary(timezone, reference_at)`
  - Returns completed workouts, working sets, weekly volume, goal completion, primary muscle sets, secondary muscle sets, and top exercises.
- `get_exercise_progress(exercise_id, limit)`
  - Returns completed exercise set history from completed sessions.
- `get_personal_records(exercise_id, limit)`
  - Returns current best rows with the achieved date and previous-best context.

## PR Rules

- Source of truth: completed `workout_sets` from completed `workout_sessions`.
- Warmups are excluded from PRs.
- Incomplete sets are excluded from PRs.
- Cancelled sessions are excluded from PRs.
- PR rows are derived live from raw history, so future workout-history edits can be reflected without stale caches.

### Record Types

- `heaviest_load`
  - For `external_weight` and `bodyweight_plus_load`.
- `estimated_one_rep_max`
  - For `external_weight` and `bodyweight_plus_load`.
- `max_reps`
  - For rep-based external-weight, bodyweight, weighted-bodyweight, and assisted movements.
- `least_assistance`
  - For `assisted` exercises.
- `longest_duration`
  - For `duration` and `distance_duration`.
- `longest_distance`
  - For `distance_duration`.

### e1RM Formula

ONE UP uses the Epley formula consistently:

```text
e1RM = load × (1 + reps / 30)
```

Rules:

- Only evaluated for reps `1` through `12`.
- For `bodyweight_plus_load`, the load is `bodyweight_kg_snapshot + external_weight_kg`.
- e1RM is labeled as estimated, not as an actual lifted 1RM.

### Dumbbell / Unilateral Semantics

- PRs use the stored workout load exactly as it was logged in the workout UI.
- ONE UP does not auto-double dumbbell loads.
- ONE UP does not auto-double unilateral reps or volume.

## Volume Rules

Initial volume semantics are intentionally conservative:

- External-weight volume = `weight_kg × reps`
- Applies to `external_weight` and `bodyweight_plus_load`
- Does not invent tonnage for pure bodyweight, assisted, or duration-only movements

## Weekly Analytics

- Week start is Monday.
- Calendar boundaries are derived from the caller-provided timezone.
- Summary queries return:
  - completed workouts this week
  - completed workouts last 7 days
  - completed workouts last 30 days
  - completed working sets this week
  - external-load volume this week
  - top exercises this week

## Muscle Analytics

- Primary muscles count as `1.0` set per completed non-warmup set.
- Secondary muscles use a transparent `0.5` support-set heuristic for the UI.
- No fake activation percentages are stored or inferred.

## UI Integration

- The existing Progress tab layout is retained.
- Real Supabase-backed data now drives:
  - weekly activity
  - weight card
  - body-progress summaries
  - personal-record previews
- New minimal screens support:
  - weight add/edit/delete
  - body-measurement add/edit/delete
  - activity detail
  - personal-record detail
- Fitness Score, XP, levels, and streak surfaces remain explicitly non-authoritative placeholders until Gamification defines real formulas.

## Progress Photos

Progress photos are intentionally deferred to future work. A future implementation should use private user-owned Supabase Storage with database metadata and RLS. No progress photo functionality is implemented in the current scope.

## RLS / Security

- `body_weight_entries` is private to `auth.uid()`.
- `body_measurements` is private to `auth.uid()`.
- Progress RPCs scope results to `auth.uid()`.
- The raw workout model remains the only authoritative performance history.

## Future Gamification Compatibility

The current raw model is sufficient to derive future events such as:

- first completed workout
- total completed workouts
- new PR events
- weekly training consistency
- body-weight logging frequency

That future system can consume:

- `workout_sessions`
- `workout_sets`
- `body_weight_entries`
- `body_measurements`
- `get_personal_records`

without changing the underlying Progress raw tables.

## Future AI Coach Compatibility

This stage exposes the right building blocks for later coaching:

- exercise history
- current PRs
- recent volume
- weekly adherence
- body-weight history
- body-measurement history

No coaching recommendations are generated in this stage.
