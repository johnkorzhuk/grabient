#!/usr/bin/env tsx
/**
 * Seed database with top 100 popular palettes
 *
 * Usage:
 *   pnpm db:seed                              # Seeds local database
 *   pnpm db:seed local                        # Seeds local database (explicit)
 *   pnpm db:seed remote --db=<DATABASE_NAME>  # Seeds remote/staging database
 *
 * The seed data comes from packages/data-ops/src/data/seed-palettes.jsonl
 */

import * as fs from 'fs';
import * as path from 'path';

const SEED_DATA_FILE = path.join(__dirname, '../data/seed-palettes.jsonl');

interface SeedPalette {
  id: string;
  style: string;
  steps: number;
  angle: number;
}

function loadSeedData(): SeedPalette[] {
  if (!fs.existsSync(SEED_DATA_FILE)) {
    throw new Error(`Seed data file not found: ${SEED_DATA_FILE}`);
  }
  return fs.readFileSync(SEED_DATA_FILE, 'utf-8')
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

async function seedLocalDatabase() {
  const Database = (await import('better-sqlite3')).default;
  const { drizzle } = await import('drizzle-orm/better-sqlite3');
  const { palettes } = await import('../drizzle/app-schema');
  const { sql } = await import('drizzle-orm');
  const { existsSync } = await import('fs');
  const { join } = await import('path');

  const { readdirSync } = await import('fs');

  // Miniflare names the SQLite file after the D1 database id, so glob the
  // directory rather than hardcoding the hash.
  const stateDirs = [
    join(process.cwd(), '../../apps/web/.wrangler/state/v3/d1/miniflare-D1DatabaseObject'),
    join(process.cwd(), '../apps/web/.wrangler/state/v3/d1/miniflare-D1DatabaseObject'),
  ];

  let dbPath: string | null = null;
  for (const dir of stateDirs) {
    if (!existsSync(dir)) continue;
    const sqlite = readdirSync(dir).find((f) => f.endsWith('.sqlite'));
    if (sqlite) {
      dbPath = join(dir, sqlite);
      break;
    }
  }

  if (!dbPath) {
    throw new Error(
      'Could not find local database file.\n' +
      'Run `pnpm dev` at least once to initialize the local D1 database.'
    );
  }

  console.log(`📂 Using database: ${dbPath}\n`);

  const seedPalettes = loadSeedData();

  const sqlite = new Database(dbPath);
  const db = drizzle(sqlite);

  console.log('🗑️  Clearing existing palettes...');
  db.run(sql`DELETE FROM ${palettes}`);

  console.log(`📝 Inserting ${seedPalettes.length} palettes...`);

  const now = Date.now();
  const palettesToInsert = seedPalettes.map((p, index) => ({
    id: p.id,
    style: p.style as 'linearGradient' | 'angularGradient' | 'linearSwatches' | 'angularSwatches',
    steps: p.steps,
    angle: p.angle,
    createdAt: new Date(now - (seedPalettes.length - index) * 60000),
  }));

  // Insert in batches
  const batchSize = 50;
  for (let i = 0; i < palettesToInsert.length; i += batchSize) {
    const batch = palettesToInsert.slice(i, i + batchSize);
    db.insert(palettes).values(batch).run();
    console.log(`  ✓ Inserted ${Math.min(i + batchSize, palettesToInsert.length)}/${palettesToInsert.length}`);
  }

  sqlite.close();
  console.log('\n✅ Local database seeded successfully!');
  console.log(`   Palettes: ${palettesToInsert.length}`);
}

async function seedRemoteDatabase(databaseName: string) {
  const { execSync } = await import('child_process');

  console.log(`🌐 Using remote database: ${databaseName}\n`);

  const seedPalettes = loadSeedData();

  console.log('🗑️  Clearing existing palettes...');
  try {
    execSync(`pnpm wrangler d1 execute ${databaseName} --command "DELETE FROM palettes"`, { stdio: 'inherit' });
  } catch (error) {
    console.error('Failed to clear existing palettes');
    throw error;
  }

  console.log(`📝 Inserting ${seedPalettes.length} palettes...`);

  const now = Date.now();
  const batchSize = 25;

  for (let i = 0; i < seedPalettes.length; i += batchSize) {
    const batch = seedPalettes.slice(i, i + batchSize);
    const values = batch.map((p, index) => {
      const timestamp = now - (seedPalettes.length - (i + index)) * 60000;
      // Escape single quotes in the id (seed string)
      const escapedId = p.id.replace(/'/g, "''");
      return `('${escapedId}', '${p.style}', ${p.steps}, ${p.angle}, ${timestamp})`;
    }).join(',');

    const insertSql = `INSERT INTO palettes (id, style, steps, angle, created_at) VALUES ${values}`;

    try {
      execSync(
        `pnpm wrangler d1 execute ${databaseName} --command "${insertSql.replace(/"/g, '\\"')}"`,
        { stdio: 'inherit' }
      );
      console.log(`  ✓ Inserted ${Math.min(i + batchSize, seedPalettes.length)}/${seedPalettes.length}`);
    } catch (error) {
      console.error(`Failed to insert batch starting at ${i}`);
      throw error;
    }
  }

  console.log('\n✅ Remote database seeded successfully!');
  console.log(`   Palettes: ${seedPalettes.length}`);
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const target = args[0] || 'local';
  const dbName = args.find(arg => arg.startsWith('--db='))?.split('=')[1];

  console.log('🌱 Database Seeding');
  console.log('===================\n');

  if (target === 'local') {
    seedLocalDatabase()
      .then(() => {
        console.log('\n✨ Done!');
        process.exit(0);
      })
      .catch((error) => {
        console.error('\n❌ Seeding failed:', error.message || error);
        process.exit(1);
      });
  } else if (target === 'remote') {
    if (!dbName) {
      console.error('❌ Error: --db=<DATABASE_NAME> is required for remote seeding\n');
      console.log('Usage:');
      console.log('  pnpm db:seed                              # Seeds local database');
      console.log('  pnpm db:seed local                        # Seeds local database (explicit)');
      console.log('  pnpm db:seed remote --db=<DATABASE_NAME>  # Seeds remote/staging database');
      process.exit(1);
    }

    seedRemoteDatabase(dbName)
      .then(() => {
        console.log('\n✨ Done!');
        process.exit(0);
      })
      .catch((error) => {
        console.error('\n❌ Seeding failed:', error.message || error);
        process.exit(1);
      });
  } else {
    console.error(`❌ Error: Invalid target "${target}"\n`);
    console.log('Usage:');
    console.log('  pnpm db:seed                              # Seeds local database');
    console.log('  pnpm db:seed local                        # Seeds local database (explicit)');
    console.log('  pnpm db:seed remote --db=<DATABASE_NAME>  # Seeds remote/staging database');
    process.exit(1);
  }
}

export { seedLocalDatabase, seedRemoteDatabase };
