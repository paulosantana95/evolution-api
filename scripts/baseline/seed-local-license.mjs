#!/usr/bin/env node
/**
 * Seeds RuntimeConfig so initializeRuntime() activates locally without contacting
 * the real licensing server. Remote /v1/activate is fire-and-forget after that.
 *
 * Usage:
 *   DATABASE_CONNECTION_URI=postgresql://... node scripts/baseline/seed-local-license.mjs
 *   node scripts/baseline/seed-local-license.mjs --clear
 */
import pg from 'pg';

const uri = process.env.DATABASE_CONNECTION_URI || 'postgresql://evolution:evolution@127.0.0.1:5432/evolution_db';
const schema = new URL(uri.replace(/^postgresql:/, 'http:')).searchParams.get('schema') || 'evolution_api';
const clear = process.argv.includes('--clear');

const client = new pg.Client({ connectionString: uri });
await client.connect();
await client.query(`SET search_path TO ${schema}, public`);

if (clear) {
  await client.query(`DELETE FROM "RuntimeConfig" WHERE key IN ('api_key', 'tier', 'customer_id')`);
  console.log('cleared RuntimeConfig license rows (instance_id kept)');
} else {
  const rows = [
    ['api_key', process.env.BASELINE_LICENSE_KEY || 'baseline-local-license-not-a-real-key'],
    ['tier', 'evolution-api'],
    ['customer_id', '0'],
  ];
  for (const [key, value] of rows) {
    await client.query(
      `INSERT INTO "RuntimeConfig" (key, value, "createdAt", "updatedAt")
       VALUES ($1, $2, NOW(), NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, "updatedAt" = NOW()`,
      [key, value],
    );
  }
  console.log('seeded local license into RuntimeConfig');
}

await client.end();
