# ONE UP Profile + Onboarding Foundation

## Current State Audit Before This Work

Before this profile foundation landed, the app had:

- no onboarding screens
- no login/signup screens
- no app-wide auth gate
- no `profiles` table in Supabase
- no local AsyncStorage onboarding flag
- no server-side onboarding completion state
- mock profile content rendered directly in the UI

### Screen Audit

| Screen / Area | Field or State | Type | Required in UI? | Previous Storage | Previously Persisted? | Previously Hard-coded? |
| --- | --- | --- | --- | --- | --- | --- |
| `ProfileScreen` hero | display name (`USER`) | text | displayed only | inline component constant | no | yes |
| `ProfileScreen` hero | level / tier / progress | text + percent | displayed only | inline component constant | no | yes |
| `Profile > Personal Information` | display name | text | displayed only | inline `DETAIL_CONTENT` | no | yes |
| `Profile > Personal Information` | email | text | displayed only | inline `DETAIL_CONTENT` | no | yes |
| `Profile > Personal Information` | phone | text | displayed only | inline `DETAIL_CONTENT` | no | yes |
| `Profile > Personal Information` | age | number | displayed only | inline `DETAIL_CONTENT` | no | yes |
| `Profile > Personal Information` | height | number + unit | displayed only | inline `DETAIL_CONTENT` | no | yes |
| `Profile > Personal Information` | weight | number + unit | displayed only | inline `DETAIL_CONTENT` | no | yes |
| `Profile > Personal Information` | primary goal | text | displayed only | inline `DETAIL_CONTENT` | no | yes |
| `Profile > Settings` | measurement units | text | displayed only | inline `DETAIL_CONTENT` | no | yes |
| app navigation | onboarding complete decision | boolean | n/a | none | no | n/a |
| Supabase | user profile row | record | n/a | none | no | n/a |

### Existing Auth Behavior Before This Work

- The shared Supabase client already persisted sessions.
- Nutrition created an anonymous session on demand if no session existed.
- No other app areas had a central auth/profile bootstrap.
- The root router always entered the tab app directly.

## Final Database Model

`public.profiles` is now the single authoritative source for private onboarding and profile preferences.

Relationship:

```text
auth.users (id)
   1:1
public.profiles (id)
```

`profiles.id` is the same UUID as `auth.users.id`.

## Stored Fields

| Field | Type | Required? | Purpose |
| --- | --- | --- | --- |
| `id` | `uuid` | required | Matches `auth.users.id` |
| `display_name` | `text` | required for completed onboarding | User-facing name across the app |
| `phone_number` | `text` | optional | Private contact field shown in profile |
| `age_years` | `smallint` | required for completed onboarding | Current age value because the UI does not collect date of birth |
| `height_cm` | `numeric(6,2)` | required for completed onboarding | Canonical height storage |
| `current_weight_kg` | `numeric(7,2)` | required for completed onboarding | Canonical current weight storage |
| `target_weight_kg` | `numeric(7,2)` | optional | Optional target weight |
| `fitness_goal` | `text` | required for completed onboarding | Canonical goal value |
| `experience_level` | `text` | required for completed onboarding | Training experience level |
| `preferred_training_days_per_week` | `smallint` | required for completed onboarding | Integer training frequency |
| `preferred_training_days` | `text[]` | required by app flow when frequency is chosen | Normalized weekdays for future scheduling |
| `preferred_workout_location` | `text` | required for completed onboarding | `home`, `gym`, or `both` |
| `preferred_units` | `text` | required for completed onboarding | `metric` or `imperial` display preference |
| `onboarding_completed` | `boolean` | required | Authoritative server onboarding status |
| `onboarding_completed_at` | `timestamptz` | optional | Server timestamp set when onboarding becomes complete |
| `created_at` | `timestamptz` | required | Row creation timestamp |
| `updated_at` | `timestamptz` | required | Last update timestamp |

## Canonical Units

- Height is stored canonically in centimeters.
- Weight values are stored canonically in kilograms.
- `preferred_units` controls how the UI displays and edits those values.
- Switching units changes display/input format only. It does not overwrite the canonical stored meaning.

Important:

- `current_weight_kg` is a convenience latest-known value.
- It is not a replacement for future progress-history tables.

## Onboarding Flow

```text
Launch app
  ↓
Load Supabase session
  ↓
No session?
  ↓
YES → /auth
NO
  ↓
Load or create own profiles row
  ↓
onboarding_completed = true ?
  ↓
NO → /onboarding
YES → /(tabs)
```

Completion rule:

```text
user finishes final onboarding step
  ↓
validate
  ↓
save profile row in Supabase
  ↓
database success
  ↓
onboarding_completed = true
  ↓
enter main app
```

## Existing User Handling

- A new auth trigger now creates a minimal profile row for new auth users.
- The migration backfilled minimal `profiles` rows for every existing `auth.users` record.
- Unknown values remain `NULL`.
- Existing users without completed data are routed through onboarding instead of getting fabricated defaults.

## Partial Onboarding Behavior

- The onboarding UI keeps draft state locally while the user moves through steps.
- The server profile row already exists, but `onboarding_completed` stays `false` until the final successful save.
- Closing the app mid-flow does not create duplicate profiles and does not incorrectly mark completion.

## RLS

`profiles` has row-level security enabled with authenticated-user-only access:

- users can `select` only their own row
- users can `insert` only their own row
- users can `update` only their own row
- client-side delete is not granted

Ownership is always derived from `auth.uid()`.

## Constraints

The table rejects invalid values for:

- blank `display_name`
- blank `phone_number`
- invalid `age_years`
- invalid `height_cm`
- invalid `current_weight_kg`
- invalid `target_weight_kg`
- invalid `fitness_goal`
- invalid `experience_level`
- invalid `preferred_training_days_per_week`
- invalid `preferred_training_days`
- invalid `preferred_workout_location`
- invalid `preferred_units`
- premature `onboarding_completed = true` without required core fields

## Future Dependency Contract

This foundation is intentionally limited to private profile/onboarding data, but it is the dependency base for later systems:

```text
Profile
  ↓
Workout recommendations
  ↓
Progress targets
  ↓
Gamification
  ↓
AI coaching
```

Those later systems are intentionally not implemented in this stage.
