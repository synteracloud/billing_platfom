const fs = require('fs/promises');
const path = require('path');
const { Pool } = require('pg');

async function run() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL must be provided');
  }

  const migrationsDir = path.resolve(__dirname, '..', 'infrastructure', 'migrations');
  const files = (await fs.readdir(migrationsDir))
    .filter((file) => file.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));

  const pool = new Pool({ connectionString: databaseUrl, application_name: 'billing-platform-migrator' });
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const alreadyAppliedRows = await client.query('SELECT version FROM schema_migrations');
    const appliedVersions = new Set(alreadyAppliedRows.rows.map((row) => row.version));

    for (const file of files) {
      if (appliedVersions.has(file)) {
        continue;
      }

      const sql = await fs.readFile(path.join(migrationsDir, file), 'utf8');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations(version) VALUES ($1)', [file]);
      console.log(`Applied migration ${file}`);
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
