# Nutrition Database Foundation

This repository now has a Supabase/PostgreSQL master food catalog designed for large-scale nutrition data, branded-food barcode resolution, private user foods, recipes, and immutable meal logging.

The current app-facing `foods`, `food_logs`, and `nutrition_goals` tables still exist for compatibility, but the live Nutrition flow now also reads from and writes through the shared master catalog so we can import real datasets without redesigning the screen.

## Tables

### `food_sources`
- Purpose: Tracks where each catalog food originated.
- Stores stable source codes such as `USDA_FOUNDATION`, `USDA_FNDDS`, `USDA_BRANDED`, `OPEN_FOOD_FACTS`, and future verified local sources.
- Keeps provenance separate from food rows so imported records remain traceable.
- Also stores source-level licensing and reuse metadata such as `license_name`, `license_url`, `attribution_text`, `bulk_import_status`, and `reuse_notes`.

### `nutrients`
- Purpose: Central nutrient definition table.
- Stores nutrient metadata like code, unit, category, display order, and whether the nutrient is core.
- Prevents schema churn when we add more micronutrients later.

### `catalog_foods`
- Purpose: Canonical master food catalog.
- Each row represents one source-specific food or product, not a cross-source deduplicated concept.
- Preserves `source_food_id` plus `metadata` so external IDs and source-specific details are never lost.

### `food_nutrients`
- Purpose: Stores nutrient amounts for each food.
- Nutrients are stored per `catalog_foods.base_amount` and `catalog_foods.base_unit`, which usually starts as `100 g`.
- Uses a composite primary key on `food_id + nutrient_id`.

### `food_servings`
- Purpose: Stores multiple serving-size options per food.
- Supports weights, volumes, or household units such as `1 large`, `1 cup`, `100 g`, or `1 oz`.
- Enforces at most one default serving per food.

### `food_barcodes`
- Purpose: Stores exact barcode identifiers for branded foods.
- Barcodes are stored as `TEXT`, not integers, to preserve leading zeroes and large values.
- Uses a lookup index for fast exact barcode search.

### `food_aliases`
- Purpose: Stores alternate names, local names, translations, and spelling variants.
- This is where future Filipino/local terms like `kangkong` can be attached to a canonical food record.
- Keeps search enrichment normalized instead of duplicating foods.

## Relationships

```text
food_sources
  |
  └── catalog_foods
        |
        ├── food_nutrients ─── nutrients
        ├── food_servings
        ├── food_barcodes
        └── food_aliases
```

## Why Nutrients Are Normalized

We intentionally do not store `protein`, `carbs`, `fat`, `fiber`, `sodium`, and every future micronutrient directly on `catalog_foods`.

Using `nutrients` plus `food_nutrients` means:
- adding new nutrients does not require schema changes
- USDA and future sources can provide richer micronutrient coverage
- source-specific nutrient sets can coexist cleanly
- the schema remains scalable as the catalog grows

## How Serving Sizes Work

`catalog_foods` stores the nutrient basis, usually `100 g`.

`food_servings` stores the selectable serving options for the same food:
- `quantity` for the serving count
- `gram_weight` for mass-based servings
- `milliliter_volume` for liquid volume servings
- `household_unit` for labels like `cup`, `slice`, or `large`

This lets one food support multiple serving sizes without duplicating the food row.

## How External Source IDs Are Preserved

Each `catalog_foods` row keeps:
- `source_id`
- `source_food_id`
- `metadata`

This means USDA, Open Food Facts, and future sources can be imported without losing the original source identifiers or source-specific context.

The unique index on `source_id + source_food_id` prevents duplicate imports from the same upstream dataset when `source_food_id` is present.

## How Barcode Lookup Works

`food_barcodes` is separate from `catalog_foods` so a single food can hold one or more barcodes.

Important choices:
- barcode is stored as `TEXT`
- barcode lookup is indexed for exact matching
- barcode is not globally unique across the entire database

That last point is intentional so we can later reconcile duplicates across datasets without blocking imports too early.

## How Aliases Help Philippine and Local Food Search

`food_aliases` supports:
- Filipino food terms
- alternate spellings
- translations
- regional names
- branded shorthand

Examples for a future food:
- `kangkong`
- `ong choy`
- `swamp cabbage`

This helps search quality without creating duplicate foods for each spelling or language variant.

## Search Design

The schema is prepared for PostgreSQL-native search only:
- `tsvector` generated columns for maintainable full-text search
- `pg_trgm` indexes for fuzzy typo matching
- exact normalized-name lookup via `catalog_foods_name_normalized_pattern_idx`
- exact barcode indexes for packaged food lookup
- filtering indexes for `food_type`, `source_id`, and `country_code`

This should scale much better than ad hoc `ILIKE` queries as the catalog grows into hundreds of thousands or millions of foods.

The current catalog search entry point is the PostgreSQL RPC:
- `public.search_catalog_foods(search_query text, result_limit integer default 20, filter_food_type text default null, filter_source_code text default null, filter_country_code text default null, preferred_market_country_code text default null)`

Current search behavior:
- exact normalized name matches are checked first
- case and whitespace are normalized
- exact/prefix name signals outrank broader matches
- exact/prefix brand matches can promote branded results when the query shows clear branded intent
- alias matching is already wired into ranking, even though `food_aliases` is still empty
- USDA category metadata is used as a ranking signal to keep simple/common foods ahead of many mixed-dish matches
- short generic queries can softly protect `common` and `ingredient` foods from getting buried under large branded catalogs
- a preferred market country can add a small deterministic ranking boost without becoming a hard filter
- 1-2 character queries avoid full fuzzy search noise
- 3+ character queries can use full-text and trigram search
- 5+ character queries can use a fallback fuzzy path when indexed candidates do not exist

## Import Guidance

USDA and Open Food Facts imports should:
- map each upstream dataset to a row in `food_sources`
- insert one source-specific row per imported food into `catalog_foods`
- preserve the upstream identifier in `source_food_id`
- preserve raw source payload details in `metadata`
- insert nutrient rows into `food_nutrients`
- insert serving rows into `food_servings`
- add barcodes and aliases only when the source provides them

For branded-food lookups, Open Food Facts is intentionally an exact-barcode fallback only. It is not used for search-as-you-type in the client.

Do not blindly merge foods across sources just because their names are similar. Deduplication is a separate later step.

## USDA Importer Architecture

The USDA importer now lives under `scripts/import-usda-foods.mjs` plus helper modules in `scripts/usda-import/`.

Responsibilities are split into:
- release/file configuration
- CLI mode parsing
- USDA download cache handling
- streaming JSON parsing
- food normalization and validation
- nutrient mapping
- serving mapping and filtering
- batched PostgreSQL upserts
- progress/statistics reporting

This keeps one shared importer path for test and pilot runs instead of separate throwaway scripts.

## USDA Release Configuration

USDA release metadata is centralized in `scripts/usda-import/config.mjs`.

Each dataset entry captures:
- dataset key
- `food_sources.code`
- USDA release identifier
- official USDA download URL
- cached zip filename
- extracted JSON filename
- top-level JSON array key
- enabled flag
- default `food_type`
- default `verification_level`

The current importer supports:
- `foundation` → `USDA_FOUNDATION`
- `fndds` → `USDA_FNDDS`
- `branded` → `USDA_BRANDED`

Future USDA release updates should mostly be manifest edits, not importer rewrites.

## USDA Importer Modes

Supported commands:
- `npm run import:usda:test`
- `npm run import:usda:pilot:dry-run`
- `npm run import:usda:pilot`
- `npm run import:usda:branded:pilot:dry-run`
- `npm run import:usda:branded:pilot`
- `npm run import:usda:branded:expanded:dry-run`
- `npm run import:usda:branded:expanded`
- `npm run import:usda:common:dry-run`
- `npm run import:usda:common`
- `npm run import:philfct -- --input=/path/to/authorized-export.json`

Supported flags:
- `--mode=test|pilot|common|branded-pilot|branded-expanded`
- `--datasets=foundation,fndds,branded`
- `--limit=<number>`
- `--batch-size=<number>`
- `--progress-every=<number>`
- `--dry-run`

`test` mode remains a curated regression sample.

`pilot` mode is deterministic: it processes USDA datasets in manifest order, takes all valid Foundation foods first, then fills the remaining limit from FNDDS.

`branded-pilot` is the deterministic branded-food pilot. It imports the first `2,000` branded USDA foods that pass validation in manifest order and writes barcode rows when valid GTIN data exists.

`branded-expanded` is the deterministic large-catalog branded mode. It does not take the first `100,000` valid rows in file order.

Instead it:
1. streams the full USDA branded release once to validate foods
2. scores each eligible food by data quality
3. retains the strongest `100,000` foods deterministically
4. streams the file a second time to upsert only the retained foods

Current quality scoring prefers:
- more canonical nutrients
- valid barcode presence
- usable brand information
- usable default household serving information
- country/category/ingredient context when available

Tie-breaking stays deterministic, so the same USDA release plus importer version selects the same foods.

`common` mode is the explicit full common-food import. It imports:
- USDA Foundation Foods
- USDA FNDDS

It does not import:
- USDA Branded Foods
- SR Legacy
- Experimental Foods
- Open Food Facts
- PhilFCT

`import:philfct` is intentionally authorization-safe. It will import from a future FNRI-authorized CSV, JSON, JSONL, or NDJSON export file, but it will not scrape or bulk copy the public PhilFCT website.

## Streaming And Chunking

The importer no longer loads USDA release JSON fully into memory.

It uses `stream-json` to:
- stream the USDA top-level array out of each release file
- parse one food at a time
- normalize each food incrementally
- flush accepted foods to PostgreSQL in batches

This is the same low-memory architecture we will need before ever attempting a full USDA import.

## Nutrient Mapping

The canonical nutrient mapping remains:
- `1008`, fallback `2048`, fallback `2047` → `energy_kcal`
- `1003` → `protein`
- `1005` → `carbohydrate`
- `1004` → `fat`
- `1079` → `fiber`
- `2000` → `sugars`
- `1093` → `sodium`
- `1092` → `potassium`
- `1087` → `calcium`
- `1089` → `iron`
- `1162` → `vitamin_c`
- `1114` → `vitamin_d`
- `1258` → `saturated_fat`
- `1253` → `cholesterol`

Missing nutrients remain absent.

The importer does not fabricate zero values when USDA omits a nutrient.

For energy, only the first available value from the fallback chain is kept, so each food gets at most one canonical `energy_kcal` row.

For branded foods and Open Food Facts imports, upstream label values are converted into the same canonical nutrient units used by the shared catalog:
- sodium is stored in `mg`
- vitamin D is stored in `mcg`
- energy is stored in `kcal`

Branded imports require the core macros to be present:
- `energy_kcal`
- `protein`
- `carbohydrate`
- `fat`

## Serving Filtering

Every imported USDA food receives a guaranteed base serving:
- `100 g`

Additional USDA portions are imported only when they are valid.

Current serving filters skip low-quality or invalid data such as:
- blank portion labels
- non-positive gram weights
- non-positive serving quantities
- USDA `Quantity not specified`
- Foundation `RACC` pseudo-portions

Household servings preserve:
- `source_serving_id`
- serving description
- quantity
- gram weight

The importer does not invent barcodes, household units, or missing measures.

## Branded Base Units And Servings

Branded foods are normalized around a measurable base unit before they are imported:
- `100 g` for mass-based products
- `100 ml` for liquids

Each accepted branded import also stores:
- a base serving row for the canonical `100 g` or `100 ml` basis
- a default household serving when USDA or Open Food Facts provides a valid serving description and serving size
- `food_servings.nutrient_values` so serving-level nutrient review can render without recalculating every field on the client

## Classification Mapping

Current dataset-level food classification is intentionally conservative:
- Foundation Foods → `food_type = ingredient`
- FNDDS → `food_type = common`
- Foundation/FNDDS → `verification_level = research`
- USDA Branded Foods → `food_type = branded`, `verification_level = manufacturer`
- Open Food Facts imports → `food_type = branded`, `verification_level = community`

This avoids fragile keyword-based classification while we stay within USDA reference and survey datasets.

## Batched Upserts And Idempotency

The importer batches:
- `catalog_foods`
- `food_nutrients`
- `food_servings`
- `food_barcodes`
- `food_aliases` for import paths that provide aliases, such as a future authorized PhilFCT export

`catalog_foods` uses the existing unique key:
- `source_id + source_food_id`

Per batch, the importer:
1. upserts catalog foods
2. resolves food IDs
3. deletes existing nutrient rows for those foods
4. deletes existing serving rows for those foods
5. deletes existing barcode rows for those foods
6. inserts the authoritative current nutrient set
7. inserts the authoritative current serving set
8. inserts the authoritative barcode set

This keeps reruns idempotent and prevents duplicate `100 g` servings, duplicate USDA portion rows, or duplicate branded barcode rows for reimported foods.

For the large USDA branded mode, reruns also preserve recovery:
- accepted foods are still upserted by `source_id + source_food_id`
- child rows are replaced authoritatively per food
- the active branded set can be resynced after import without deleting historical source rows

## Provenance And Version Tracking

USDA-specific provenance stays in `catalog_foods.metadata`.

Useful fields now preserved include:
- USDA FDC ID
- dataset key and source code
- USDA release identifier
- source JSON filename
- USDA data type
- USDA publication date
- USDA category ID/description when available
- scientific name when available
- USDA-specific identifiers like `foodCode` or `ndbNumber`
- import mode/profile labels
- brand owner and display brand
- market country
- original barcode context when a branded import comes from barcode resolution
- importer-side quality metadata for deterministic large branded selection

At the source-definition level, `food_sources` now also records reuse metadata so ONE UP can distinguish:
- sources safe for bulk import
- sources restricted to on-demand import
- sources that require explicit redistribution authorization before bulk ingestion

The importer does not store the full raw USDA payload in PostgreSQL.

## Download Cache

USDA archives and extracted JSON are cached locally under `tmp/usda` by default.

Behavior:
- reuse cached files when present
- download only when missing
- preserve release-specific filenames

You can override the cache location with `USDA_DOWNLOAD_DIR`.

## Current USDA Common Catalog Status

As of Monday, August 10, 2026, the current configured USDA common-food import is:
- Foundation Foods release `2026-04-30`
- FNDDS release `2024-10-31`
- import command: `npm run import:usda:common`

Current verified results:
- total catalog foods: `5,795`
- USDA Foundation foods: `363`
- USDA FNDDS foods: `5,432`
- foods added beyond the earlier 5,001-food pilot: `794`
- canonical nutrient rows: `79,290`
- average canonical nutrients per food: `13.6825`
- foods with all 14 canonical nutrients: `5,431`
- foods with zero canonical nutrients: `1`
- serving rows: `22,743`
- average servings per food: `3.9246`
- foods with only `100 g`: `286`
- foods with household servings: `5,795`
- duplicate `source_id + source_food_id`: `0`
- duplicate `food_id + nutrient_id`: `0`
- duplicate `food_id + source_serving_id` where present: `0`
- orphan nutrient rows: `0`
- orphan serving rows: `0`
- invalid nutrient values: `0`
- invalid serving weights/volumes: `0`

The one food with zero canonical nutrient rows is:
- USDA FNDDS `2705383`
- `Milk, human`

USDA's own FNDDS source record explicitly states that no nutrient values are provided for this item, so this is not currently treated as a mapping bug.

Approximate current master catalog footprint:
- total relevant catalog footprint: about `53 MB`
- earlier 5,001-food pilot footprint: about `47.2 MB`

Most of the increase comes from the larger `catalog_foods`, `food_nutrients`, and `food_servings` tables plus their supporting search and primary-key indexes.

## Current USDA Branded Catalog Status

As of Monday, August 10, 2026, the branded-food pilot is active in the hosted Supabase database.

Configured branded release:
- USDA Branded Foods release `2026-04-30`
- import command: `npm run import:usda:branded:pilot`

Current verified results:
- USDA Branded foods: `2,000`
- USDA Branded barcode rows: `1,860`
- Open Food Facts cached foods: `2`
- Open Food Facts barcode rows: `2`
- duplicate `source_id + source_food_id`: `0`
- duplicate `food_id + nutrient_id`: `0`
- duplicate primary barcode rows: `0`

The branded pilot intentionally skips low-quality upstream rows, most commonly when the source record is missing one of the required core macros.

Verified search examples from the live database on Monday, August 10, 2026:
- `banana` still ranks `Banana, raw` first from `USDA_FNDDS`
- `apple jacks` ranks `KELLOGG APPLE JACKS .9OZ 100CT` first from `USDA_BRANDED`
- `kellogg` ranks the same branded cereal first
- `prince chocolat` ranks `Prince Goût Chocolat au blé complet` first from `OPEN_FOOD_FACTS`
- `lindt` ranks `Excellence Noir Prodigieux 90% Cacao` first from `OPEN_FOOD_FACTS`

## Barcode Resolution Architecture

The client barcode flow is intentionally local-first:
1. normalize the scanned or typed barcode
2. validate supported GTIN structure and check digit
3. query ONE UP's own `food_barcodes` data first
4. if found, return the existing shared catalog food immediately
5. if not found, perform one exact Open Food Facts barcode lookup server-side
6. validate and normalize the external product
7. upsert the branded catalog food, nutrients, servings, and barcode rows
8. return the resulting ONE UP catalog food

That means Open Food Facts is a cache-fill source, not a frontend search engine.

Supported normalized formats in the client helper:
- UPC-A
- UPC-E
- EAN-8
- EAN-13
- GTIN-14

Important implementation details:
- barcodes always remain `TEXT`
- leading zeroes are preserved
- invalid check digits fail before any external request
- the server stores normalized GTIN-14 values for local exact lookup
- external Open Food Facts requests use the cleaned raw digits when possible so valid EAN-13 barcodes still resolve upstream
- negative barcode results (`not_found` and `incomplete`) are cached client-side for five minutes to avoid repeated upstream requests during the same session

The main server-side entry point is:
- `public.lookup_food_barcode(raw_barcode text, input_normalized_barcode text, requested_country_code text default null)`

Possible statuses are:
- `found`
- `imported`
- `not_found`
- `incomplete`
- `invalid_barcode`
- `external_error`

## Open Food Facts Integration

Open Food Facts is used only for exact barcode resolution misses.

Current behavior:
- the request is issued server-side from PostgreSQL via the Supabase `http` extension
- requests send an identifying `User-Agent`
- `404` responses are normalized to `not_found`
- products missing required core nutrition stay `incomplete` and are not imported into the shared catalog
- successful imports are stored in ONE UP's own catalog so later lookups are local

This avoids exposing database credentials or any service-role credential in the Expo client.

## Current App Integration Boundary

The Nutrition UI now has two food layers during the rollout:
- legacy `foods` still exists for existing saved/recipe-style app data and older log compatibility
- master-catalog search uses `public.search_catalog_foods` plus `catalog_foods`, `food_nutrients`, and `food_servings`
- branded-food barcode lookup uses `public.lookup_food_barcode`

To let the current `food_logs` model accept master-catalog selections without replacing the full logging system yet:
- `food_logs.food_id` remains for legacy `foods`
- `food_logs.catalog_food_id` now optionally references `catalog_foods`
- per-serving calories/macros, food name, brand, label, and source continue to be denormalized into `food_logs`

The compact Nutrition UI is intentionally preserved:
- search still uses ONE UP's own PostgreSQL catalog
- large Quick Pick, Recents, and Go-To panels remain hidden
- branded logging is surfaced through a compact barcode action and modal, not a redesigned nutrition screen

This is intentionally a compatibility bridge, not the final catalog-native logging model.

## Private User Foods And Recipes

The Nutrition system now also supports private user-owned definitions alongside the shared USDA catalog.

### `user_foods`
- Purpose: Stores the current editable definition for a user's custom food.
- Each row is private to one user and stays soft-archivable via `is_active`.
- Holds identity and base-unit fields such as `name`, `brand_name`, `description`, `base_amount`, and `base_unit`.

### `user_food_nutrients`
- Purpose: Stores canonical nutrient amounts for a custom food at its base amount.
- Uses the same normalized `nutrients` table as the shared catalog.
- Keeps custom foods extensible so micronutrients can be stored without changing the schema.

### `user_food_servings`
- Purpose: Stores the selectable serving options for a custom food.
- Supports gram-, milliliter-, and household-style servings, plus one default serving.
- Lets a private food behave like a catalog food during serving selection and logging.

### `recipes`
- Purpose: Stores the current editable definition of a user's private recipe.
- Recipes are user-owned, soft-archivable, and store the current cooked `final_weight_g`.
- `serving_count` remains optional so a recipe can be logged either by grams, by derived servings, or both.
- `total_nutrients` stores the current full-recipe nutrient totals for the latest saved recipe definition.

### `recipe_ingredients`
- Purpose: Stores the ingredient rows that make up a recipe.
- Each ingredient can reference exactly one shared `catalog_foods` row or one private `user_foods` row.
- Ingredient rows preserve the serving label, quantity, and effective gram weight used when the recipe was saved.

## Private Data Ownership And RLS

- `user_foods`, `user_food_nutrients`, `user_food_servings`, `recipes`, and `recipe_ingredients` all use row-level security.
- Authenticated users can read and mutate only their own private food and recipe definitions.
- Recipe ingredients may reference shared catalog foods, but private custom-food ingredients must belong to the same authenticated user.
- Archive flows use RPCs instead of public hard deletes:
  - `public.archive_user_food(target_food_id uuid)`
  - `public.archive_recipe(target_recipe_id uuid)`

## Source Model Inside `food_logs`

`food_logs` is now the common immutable logging table for four entry types:
- legacy app foods via `food_id`
- USDA/shared catalog foods, including branded foods, via `catalog_food_id`
- private custom foods via `user_food_id`
- private recipes via `recipe_id`

Serving references are also source-aware:
- `catalog_serving_id` points to the selected shared serving when the log came from the master catalog
- `user_food_serving_id` points to the selected private serving when the log came from a custom food or a custom-food ingredient workflow

The active source marker remains denormalized in `food_logs.food_source`, which now needs to stay aligned with the selected reference column.

Currently accepted source labels include:
- `usda`
- `branded`
- `nutritionix`
- `saved`
- `recipe`
- `custom`

`nutritionix` remains allowed as a compatibility label for older logs, but new branded catalog logs should use `branded`.

## Immutable Snapshot Logging

Historical meal logs must not change when a shared catalog food, custom food, or recipe is edited later.

For that reason, `food_logs` keeps a denormalized snapshot at log time, including:
- food name
- brand
- serving label
- per-serving calories and macros
- effective grams
- scalar macro totals
- `nutrients_snapshot`

Reference IDs such as `catalog_food_id`, `user_food_id`, `user_food_serving_id`, and `recipe_id` are retained for attribution, editing shortcuts, and personalization, but historical rendering and totals must continue to rely on the saved snapshot fields.

This means:
- editing a custom food updates future logs only
- editing a recipe updates future logs only
- older logs preserve the exact nutrition values that were saved when those logs were created

## Recipe Logging Model

Recipes are stored as full-recipe totals plus ingredient rows, then logged through the same snapshot pipeline as every other food source.

Important behavior:
- `final_weight_g` is the cooked weight basis for gram-accurate portion logging
- users can log a recipe by direct grams even after moisture loss changes the cooked yield
- `serving_count`, when present, defines a convenient derived serving option on top of the cooked weight
- recipe edits can change ingredients, totals, final weight, and serving count without mutating prior `food_logs`

## Search And UI Boundary

- Catalog search still comes from `public.search_catalog_foods(...)`.
- The optional `preferred_market_country_code` parameter is prepared for future country-aware ranking without changing the compact search-first UI.
- Private search is layered on top through app code that searches the user's own custom foods and recipes.
- Barcode lookup does not call Open Food Facts on every keystroke. It stays database-first and only falls back to one exact external barcode request on a miss.
- The personalization backend remains in place for favorites, recents/history, and meal-context Go-Tos.
- The barcode scanner and manual barcode entry sheet are compact add-ons to the existing logging flow.
- Large Quick Pick, Recents, Go-Tos, and other oversized recommendation panels are intentionally hidden from the current Nutrition logging UI so the screen stays focused on search, selection, serving, quantity, and logging.

## Licensing and Data Boundaries

- PhilFCT data must **not** be bulk copied until licensing and reuse permission are confirmed.
- `scripts/import-philfct.mjs` is ready for a future authorized export file and supports alias ingestion through `food_aliases`.
- NCC / MacroFactor proprietary data must **not** be copied.
- This architecture is meant to support similar capabilities, not reproduce proprietary datasets.
