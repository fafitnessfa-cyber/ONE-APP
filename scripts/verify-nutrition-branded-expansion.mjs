import process from 'node:process';
import pg from 'pg';

const { Client: PgClient } = pg;

const COMMON_QUERIES = [
  'banana',
  'egg',
  'chicken breast',
  'white rice',
  'brown rice',
  'milk',
  'salmon',
  'tuna',
  'oatmeal',
  'bread',
];

const PH_TERMS = [
  'adobo',
  'sinigang',
  'tinola',
  'bangus',
  'tilapia',
  'kangkong',
  'malunggay',
  'pandesal',
  'longganisa',
  'tocino',
  'tapa',
  'taho',
  'lumpia',
  'pancit',
  'palabok',
  'kare-kare',
  'lechon',
  'sisig',
  'dinuguan',
  'arroz caldo',
  'champorado',
  'pinakbet',
  'bicol express',
  'ensaymada',
  'puto',
];

function assertEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function createDbClient() {
  return new PgClient({
    connectionString: assertEnv('SUPABASE_DB_URL'),
    ssl: {
      rejectUnauthorized: false,
    },
  });
}

function buildTypo(value) {
  const tokens = value.trim().split(/\s+/).filter(Boolean);

  if (!tokens.length) {
    return value;
  }

  const token = tokens.find((item) => item.length >= 5) ?? tokens[0];

  if (token.length <= 3) {
    return value;
  }

  const typoToken = `${token.slice(0, 2)}${token.slice(3)}`;
  return value.replace(token, typoToken);
}

async function runSearch(db, query, preferredMarketCountryCode = null, resultLimit = 8) {
  const startedAt = Date.now();
  const { rows } = await db.query(
    `select
       food_id,
       source_code,
       food_type,
       name,
       brand_name,
       country_code,
       relevance_score
     from public.search_catalog_foods($1, $2, null, null, null, $3)`,
    [query, resultLimit, preferredMarketCountryCode],
  );

  return {
    query,
    preferredMarketCountryCode,
    elapsedMs: Date.now() - startedAt,
    rows: rows.map((row) => ({
      sourceCode: row.source_code,
      foodType: row.food_type,
      name: row.name,
      brandName: row.brand_name,
      countryCode: row.country_code,
      relevanceScore: Number(row.relevance_score),
    })),
  };
}

async function explainSearch(db, query) {
  const { rows } = await db.query(
    `explain (analyze, buffers, format json)
     select *
     from public.search_catalog_foods($1, 8, null, null, null, null)`,
    [query],
  );

  const plan = rows[0]['QUERY PLAN'][0];

  return {
    planningTimeMs: Number(plan['Planning Time'].toFixed(3)),
    executionTimeMs: Number(plan['Execution Time'].toFixed(3)),
    sharedHitBlocks: plan?.Plan?.['Shared Hit Blocks'] ?? null,
    sharedReadBlocks: plan?.Plan?.['Shared Read Blocks'] ?? null,
  };
}

async function loadCountsBySource(db) {
  const { rows } = await db.query(
    `select
       fs.code as source_code,
       count(*)::integer as total_foods,
       count(*) filter (where cf.is_active)::integer as active_foods,
       count(*) filter (where not cf.is_active)::integer as inactive_foods
     from public.catalog_foods cf
     join public.food_sources fs on fs.id = cf.source_id
     group by fs.code
     order by fs.code`,
  );

  return rows;
}

async function loadChildCountsBySource(db) {
  const { rows } = await db.query(
    `with nutrient_counts as (
       select fs.code as source_code, count(*)::integer as nutrient_rows
       from public.food_nutrients fn
       join public.catalog_foods cf on cf.id = fn.food_id
       join public.food_sources fs on fs.id = cf.source_id
       group by fs.code
     ),
     serving_counts as (
       select fs.code as source_code, count(*)::integer as serving_rows
       from public.food_servings fsrv
       join public.catalog_foods cf on cf.id = fsrv.food_id
       join public.food_sources fs on fs.id = cf.source_id
       group by fs.code
     ),
     barcode_counts as (
       select fs.code as source_code, count(*)::integer as barcode_rows
       from public.food_barcodes fb
       join public.catalog_foods cf on cf.id = fb.food_id
       join public.food_sources fs on fs.id = cf.source_id
       group by fs.code
     )
     select
       coalesce(n.source_code, s.source_code, b.source_code) as source_code,
       coalesce(n.nutrient_rows, 0) as nutrient_rows,
       coalesce(s.serving_rows, 0) as serving_rows,
       coalesce(b.barcode_rows, 0) as barcode_rows
     from nutrient_counts n
     full outer join serving_counts s on s.source_code = n.source_code
     full outer join barcode_counts b
       on b.source_code = coalesce(n.source_code, s.source_code)
     order by 1`,
  );

  return rows;
}

async function loadStorageStats(db) {
  const { rows } = await db.query(
    `select
       relname as object_name,
       pg_size_pretty(pg_total_relation_size(c.oid)) as total_size,
       pg_size_pretty(pg_relation_size(c.oid)) as table_size,
       pg_size_pretty(
         pg_total_relation_size(c.oid) - pg_relation_size(c.oid)
       ) as index_size
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and relname in (
         'catalog_foods',
         'food_nutrients',
         'food_servings',
         'food_barcodes',
         'food_aliases',
         'food_sources'
       )
     order by relname`,
  );
  const { rows: dbSizeRows } = await db.query(
    `select pg_size_pretty(pg_database_size(current_database())) as database_size`,
  );

  return {
    databaseSize: dbSizeRows[0]?.database_size ?? null,
    objects: rows,
  };
}

async function loadCollisionStats(db) {
  const { rows: summaryRows } = await db.query(
    `with duplicates as (
       select barcode, count(distinct food_id)::integer as food_count
       from public.food_barcodes
       group by barcode
       having count(distinct food_id) > 1
     )
     select
       count(*)::integer as duplicate_barcode_count,
       coalesce(sum(food_count), 0)::integer as duplicate_food_links
     from duplicates`,
  );

  const { rows: sampleRows } = await db.query(
    `with duplicates as (
       select barcode
       from public.food_barcodes
       group by barcode
       having count(distinct food_id) > 1
     )
     select
       fb.barcode,
       count(distinct fb.food_id)::integer as food_count,
       array_agg(distinct cf.name order by cf.name)[:3] as sample_food_names
     from public.food_barcodes fb
     join duplicates d on d.barcode = fb.barcode
     join public.catalog_foods cf on cf.id = fb.food_id
     group by fb.barcode
     order by food_count desc, fb.barcode asc
     limit 10`,
  );

  return {
    summary: summaryRows[0],
    samples: sampleRows,
  };
}

async function loadBrandedSamples(db) {
  const { rows } = await db.query(
    `select
       cf.source_food_id,
       cf.name,
       cf.brand_name,
       cf.country_code,
       coalesce((cf.metadata #>> '{importQuality,qualityScore}')::integer, 0) as quality_score
     from public.catalog_foods cf
     join public.food_sources fs on fs.id = cf.source_id
     where fs.code = 'USDA_BRANDED'
       and cf.is_active
       and cf.brand_name is not null
     order by quality_score desc, cf.name asc, cf.source_food_id asc
     limit 3`,
  );

  return rows;
}

async function buildBrandedQueryChecks(db) {
  const samples = await loadBrandedSamples(db);

  return Promise.all(
    samples.map(async (sample) => {
      const productPhrase = sample.name.split(/\s+/).slice(0, 4).join(' ');
      const brandProductQuery = `${sample.brand_name} ${productPhrase}`.trim();

      return {
        sample,
        exactName: await runSearch(db, sample.name),
        brandOnly: await runSearch(db, sample.brand_name),
        brandPlusProduct: await runSearch(db, brandProductQuery),
        typo: await runSearch(db, buildTypo(brandProductQuery)),
      };
    }),
  );
}

async function buildPhilippineCoverage(db) {
  const coverage = [];

  for (const term of PH_TERMS) {
    const result = await runSearch(db, term, 'PH', 3);

    coverage.push({
      term,
      elapsedMs: result.elapsedMs,
      topMatches: result.rows,
    });
  }

  return coverage;
}

async function run() {
  const db = createDbClient();
  await db.connect();

  try {
    const [
      countsBySource,
      childCountsBySource,
      storage,
      collisionStats,
      brandedChecks,
      explainBanana,
      explainKellogg,
      philippineCoverage,
    ] = await Promise.all([
      loadCountsBySource(db),
      loadChildCountsBySource(db),
      loadStorageStats(db),
      loadCollisionStats(db),
      buildBrandedQueryChecks(db),
      explainSearch(db, 'banana'),
      explainSearch(db, 'kellogg'),
      buildPhilippineCoverage(db),
    ]);

    const commonSearches = [];

    for (const query of COMMON_QUERIES) {
      commonSearches.push(await runSearch(db, query));
    }

    console.log(
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          countsBySource,
          childCountsBySource,
          storage,
          collisionStats,
          commonSearches,
          brandedChecks,
          explain: {
            banana: explainBanana,
            kellogg: explainKellogg,
          },
          philippineCoverage,
        },
        null,
        2,
      ),
    );
  } finally {
    await db.end();
  }
}

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
