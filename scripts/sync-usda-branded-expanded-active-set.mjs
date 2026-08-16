import process from 'node:process';
import pg from 'pg';

const { Client: PgClient } = pg;

const TARGET_RELEASE_ID = '2026-04-30';
const TARGET_IMPORT_PROFILE = 'usda_branded_expanded_v1';

function assertEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

async function createDbClient() {
  const client = new PgClient({
    connectionString: assertEnv('SUPABASE_DB_URL'),
    ssl: {
      rejectUnauthorized: false,
    },
  });
  await client.connect();
  return client;
}

async function loadCounts(client) {
  const { rows } = await client.query(
    `select
       coalesce(cf.metadata ->> 'lastImportProfile', '<null>') as last_import_profile,
       count(*)::integer as total_rows,
       count(*) filter (where cf.is_active)::integer as active_rows,
       count(*) filter (where not cf.is_active)::integer as inactive_rows
     from public.catalog_foods cf
     join public.food_sources fs on fs.id = cf.source_id
     where fs.code = 'USDA_BRANDED'
       and cf.metadata #>> '{usda,releaseId}' = $1
     group by 1
     order by 1`,
    [TARGET_RELEASE_ID],
  );

  return rows;
}

async function syncActiveSet(client) {
  await client.query('begin');

  try {
    await client.query(`set local statement_timeout = '0'`);

    const { rows: deactivateRows } = await client.query(
      `update public.catalog_foods as cf
       set is_active = false
       from public.food_sources fs
       where fs.id = cf.source_id
         and fs.code = 'USDA_BRANDED'
         and cf.is_active
         and cf.metadata #>> '{usda,releaseId}' = $1
         and coalesce(cf.metadata ->> 'lastImportProfile', '') <> $2
       returning cf.id`,
      [TARGET_RELEASE_ID, TARGET_IMPORT_PROFILE],
    );

    const { rows: reactivateRows } = await client.query(
      `update public.catalog_foods as cf
       set is_active = true
       from public.food_sources fs
       where fs.id = cf.source_id
         and fs.code = 'USDA_BRANDED'
         and not cf.is_active
         and cf.metadata #>> '{usda,releaseId}' = $1
         and coalesce(cf.metadata ->> 'lastImportProfile', '') = $2
       returning cf.id`,
      [TARGET_RELEASE_ID, TARGET_IMPORT_PROFILE],
    );

    await client.query('commit');

    return {
      deactivatedRows: deactivateRows.length,
      reactivatedRows: reactivateRows.length,
    };
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}

async function run() {
  const client = await createDbClient();

  try {
    const before = await loadCounts(client);
    const result = await syncActiveSet(client);
    const after = await loadCounts(client);

    console.log(
      JSON.stringify(
        {
          targetReleaseId: TARGET_RELEASE_ID,
          targetImportProfile: TARGET_IMPORT_PROFILE,
          result,
          before,
          after,
        },
        null,
        2,
      ),
    );
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
