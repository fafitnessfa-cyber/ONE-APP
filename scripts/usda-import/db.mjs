import pg from 'pg';
import { USDA_CANONICAL_NUTRIENTS } from './config.mjs';

const { Pool } = pg;

export function createDbPool(connectionString) {
  return new Pool({
    connectionString,
    ssl: {
      rejectUnauthorized: false,
    },
  });
}

export function createDryRunReferenceData(datasets) {
  return {
    sourceIdByCode: new Map(datasets.map((dataset) => [dataset.sourceCode, dataset.sourceCode])),
    nutrientIdByCode: new Map(
      USDA_CANONICAL_NUTRIENTS.map((nutrient) => [nutrient.code, nutrient.code]),
    ),
  };
}

export async function loadReferenceData(client, datasets) {
  const sourceCodes = datasets.map((dataset) => dataset.sourceCode);
  const nutrientCodes = USDA_CANONICAL_NUTRIENTS.map((nutrient) => nutrient.code);

  const [{ rows: sources }, { rows: nutrients }] = await Promise.all([
    client.query(
      `select id, code
       from public.food_sources
       where code = any($1::text[])`,
      [sourceCodes],
    ),
    client.query(
      `select id, code
       from public.nutrients
       where code = any($1::text[])`,
      [nutrientCodes],
    ),
  ]);

  const sourceIdByCode = new Map(sources.map((row) => [row.code, row.id]));
  const nutrientIdByCode = new Map(nutrients.map((row) => [row.code, row.id]));

  for (const sourceCode of sourceCodes) {
    if (!sourceIdByCode.has(sourceCode)) {
      throw new Error(`Missing food_sources row for ${sourceCode}.`);
    }
  }

  for (const nutrientCode of nutrientCodes) {
    if (!nutrientIdByCode.has(nutrientCode)) {
      throw new Error(`Missing nutrients row for ${nutrientCode}.`);
    }
  }

  return { sourceIdByCode, nutrientIdByCode };
}

async function upsertCatalogFoods(client, catalogRows) {
  const { rows } = await client.query(
    `with input as (
       select *
       from jsonb_to_recordset($1::jsonb) as x(
         source_id uuid,
         source_food_id text,
         food_type text,
         name text,
         description text,
         brand_name text,
         country_code text,
         verification_level text,
         data_completeness numeric,
         base_amount numeric,
         base_unit text,
         is_active boolean,
         metadata jsonb
       )
     ),
     upserted as (
       insert into public.catalog_foods (
         source_id,
         source_food_id,
         food_type,
         name,
         description,
         brand_name,
         country_code,
         verification_level,
         data_completeness,
         base_amount,
         base_unit,
         is_active,
         metadata
       )
       select
         source_id,
         source_food_id,
         food_type,
         name,
         description,
         brand_name,
         country_code,
         verification_level,
         data_completeness,
         base_amount,
         base_unit,
         is_active,
         metadata
       from input
       on conflict (source_id, source_food_id)
       where source_food_id is not null
       do update set
         food_type = excluded.food_type,
         name = excluded.name,
         description = excluded.description,
         brand_name = excluded.brand_name,
         country_code = excluded.country_code,
         verification_level = excluded.verification_level,
         data_completeness = excluded.data_completeness,
         base_amount = excluded.base_amount,
         base_unit = excluded.base_unit,
         is_active = excluded.is_active,
         metadata = jsonb_set(
           jsonb_set(
             excluded.metadata,
             '{importProfiles}',
             coalesce(
               (
                 select to_jsonb(array_agg(distinct profile order by profile))
                 from (
                   select jsonb_array_elements_text(
                     coalesce(catalog_foods.metadata -> 'importProfiles', '[]'::jsonb)
                     || case
                       when catalog_foods.metadata ? 'importProfile'
                         then jsonb_build_array(catalog_foods.metadata ->> 'importProfile')
                       else '[]'::jsonb
                     end
                     || coalesce(excluded.metadata -> 'importProfiles', '[]'::jsonb)
                     || case
                       when excluded.metadata ? 'importProfile'
                         then jsonb_build_array(excluded.metadata ->> 'importProfile')
                       else '[]'::jsonb
                     end
                   ) as profile
                 ) merged_profiles
               ),
               '[]'::jsonb
             ),
             true
           ),
           '{lastImportProfile}',
           to_jsonb(excluded.metadata ->> 'importProfile'),
           true
         )
       returning id, source_id, source_food_id
     )
     select id, source_id, source_food_id
     from upserted`,
    [JSON.stringify(catalogRows)],
  );

  return rows;
}

async function deleteChildRows(client, foodIds) {
  await client.query('delete from public.food_nutrients where food_id = any($1::uuid[])', [
    foodIds,
  ]);
  await client.query('delete from public.food_servings where food_id = any($1::uuid[])', [
    foodIds,
  ]);
  await client.query('delete from public.food_barcodes where food_id = any($1::uuid[])', [
    foodIds,
  ]);
}

async function insertFoodNutrients(client, nutrientRows) {
  if (!nutrientRows.length) {
    return;
  }

  await client.query(
    `insert into public.food_nutrients (
       food_id,
       nutrient_id,
       amount,
       data_origin
     )
     select
       food_id,
       nutrient_id,
       amount,
       data_origin
     from jsonb_to_recordset($1::jsonb) as x(
       food_id uuid,
       nutrient_id uuid,
       amount numeric,
       data_origin text
     )`,
    [JSON.stringify(nutrientRows)],
  );
}

async function insertFoodServings(client, servingRows) {
  if (!servingRows.length) {
    return;
  }

  await client.query(
    `insert into public.food_servings (
       food_id,
       serving_name,
       quantity,
       gram_weight,
       milliliter_volume,
       household_unit,
       is_default,
       source_serving_id,
       nutrient_values
     )
     select
       food_id,
       serving_name,
       quantity,
       gram_weight,
       milliliter_volume,
       household_unit,
       is_default,
       source_serving_id,
       nutrient_values
     from jsonb_to_recordset($1::jsonb) as x(
       food_id uuid,
       serving_name text,
       quantity numeric,
       gram_weight numeric,
       milliliter_volume numeric,
       household_unit text,
       is_default boolean,
        source_serving_id text,
        nutrient_values jsonb
     )`,
    [JSON.stringify(servingRows)],
  );
}

async function insertFoodBarcodes(client, barcodeRows) {
  if (!barcodeRows.length) {
    return;
  }

  await client.query(
    `insert into public.food_barcodes (
       food_id,
       barcode,
       country_code,
       is_primary
     )
     select
       food_id,
       barcode,
       country_code,
       is_primary
     from jsonb_to_recordset($1::jsonb) as x(
       food_id uuid,
       barcode text,
       country_code text,
       is_primary boolean
     )`,
    [JSON.stringify(barcodeRows)],
  );
}

async function deleteFoodAliases(client, foodIds) {
  await client.query('delete from public.food_aliases where food_id = any($1::uuid[])', [
    foodIds,
  ]);
}

async function insertFoodAliases(client, aliasRows) {
  if (!aliasRows.length) {
    return;
  }

  await client.query(
    `insert into public.food_aliases (
       food_id,
       alias,
       language_code,
       alias_type
     )
     select
       food_id,
       alias,
       language_code,
       alias_type
     from jsonb_to_recordset($1::jsonb) as x(
       food_id uuid,
       alias text,
       language_code text,
       alias_type text
     )`,
    [JSON.stringify(aliasRows)],
  );
}

export async function writeImportBatch(client, foods, options = {}) {
  await client.query('begin');

  try {
    const catalogRows = foods.map((food) => food.catalogFood);
    const upsertedFoods = await upsertCatalogFoods(client, catalogRows);
    const foodIdBySourceKey = new Map(
      upsertedFoods.map((row) => [`${row.source_id}:${row.source_food_id}`, row.id]),
    );
    const foodIds = [...foodIdBySourceKey.values()];

    if (foodIds.length !== foods.length) {
      throw new Error(
        `Expected ${foods.length} catalog upserts but received ${foodIds.length} ids back.`,
      );
    }

    await deleteChildRows(client, foodIds);

    const nutrientRows = [];
    const servingRows = [];
    const barcodeRows = [];
    const aliasRows = [];

    for (const food of foods) {
      const sourceKey = `${food.catalogFood.source_id}:${food.catalogFood.source_food_id}`;
      const foodId = foodIdBySourceKey.get(sourceKey);

      if (!foodId) {
        throw new Error(`Missing catalog_foods id for ${sourceKey}.`);
      }

      for (const nutrientRow of food.nutrientRows) {
        nutrientRows.push({
          food_id: foodId,
          nutrient_id: nutrientRow.nutrientId,
          amount: nutrientRow.amount,
          data_origin: nutrientRow.dataOrigin,
        });
      }

      for (const servingRow of food.servingRows) {
        servingRows.push({
          food_id: foodId,
          serving_name: servingRow.servingName,
          quantity: servingRow.quantity,
          gram_weight: servingRow.gramWeight,
          milliliter_volume: servingRow.milliliterVolume,
          household_unit: servingRow.householdUnit,
          is_default: servingRow.isDefault,
          source_serving_id: servingRow.sourceServingId,
          nutrient_values: servingRow.nutrientValues ?? null,
        });
      }

      for (const barcodeRow of food.barcodeRows ?? []) {
        barcodeRows.push({
          food_id: foodId,
          barcode: barcodeRow.barcode,
          country_code: barcodeRow.countryCode ?? null,
          is_primary: barcodeRow.isPrimary ?? false,
        });
      }

      for (const aliasRow of food.aliasRows ?? []) {
        aliasRows.push({
          food_id: foodId,
          alias: aliasRow.alias,
          language_code: aliasRow.languageCode ?? null,
          alias_type: aliasRow.aliasType ?? null,
        });
      }
    }

    await insertFoodNutrients(client, nutrientRows);
    await insertFoodServings(client, servingRows);
    await insertFoodBarcodes(client, barcodeRows);

    if (options.replaceAliases) {
      await deleteFoodAliases(client, foodIds);
      await insertFoodAliases(client, aliasRows);
    }

    await client.query('commit');

    return {
      writtenFoods: foods.length,
      writtenNutrients: nutrientRows.length,
      writtenServings: servingRows.length,
      writtenBarcodes: barcodeRows.length,
      writtenAliases: options.replaceAliases ? aliasRows.length : 0,
    };
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}

export async function deactivateMissingSourceFoods(
  client,
  {
    sourceId,
    activeImportProfile,
    releaseId = null,
  },
) {
  if (!sourceId) {
    throw new Error('Missing sourceId for deactivateMissingSourceFoods.');
  }

  await client.query(
    `update public.catalog_foods as cf
     set is_active = false
     where cf.source_id = $1::uuid
       and cf.is_active
       and coalesce(cf.metadata ->> 'lastImportProfile', '') <> $2::text
       and (
         $3::text is null
         or cf.metadata #>> '{usda,releaseId}' = $3::text
       )`,
    [sourceId, activeImportProfile, releaseId],
  );

  await client.query(
    `update public.catalog_foods as cf
     set is_active = true
     where cf.source_id = $1::uuid
       and not cf.is_active
       and coalesce(cf.metadata ->> 'lastImportProfile', '') = $2::text
       and (
         $3::text is null
         or cf.metadata #>> '{usda,releaseId}' = $3::text
       )`,
    [sourceId, activeImportProfile, releaseId],
  );
}
