#!/usr/bin/env tsx
/**
 * Seed production database with full data migration
 *
 * This script seeds the production D1 database with:
 * - Users (from Clerk migration)
 * - OAuth accounts (from Clerk migration)
 * - Palettes (from Convex snapshot)
 * - Likes (from Convex snapshot, with Clerk->BetterAuth ID mapping)
 *
 * Usage:
 *   pnpm db:seed:prod --db=<DATABASE_NAME>
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const DATA_DIR = path.join(__dirname, '../data');
const PROJECT_ROOT = path.join(__dirname, '../../../..');
const SNAPSHOT_ZIP = path.join(PROJECT_ROOT, 'snapshot.zip');
const SNAPSHOT_TEMP_DIR = path.join(PROJECT_ROOT, '.snapshot-temp');

// Data files
const USERS_FILE = path.join(DATA_DIR, 'prod-users.jsonl');
const ACCOUNTS_FILE = path.join(DATA_DIR, 'prod-accounts.jsonl');
const ID_MAP_FILE = path.join(DATA_DIR, 'clerk-to-betterauth-id-map.json');

interface User {
  id: string;
  email: string;
  emailVerified: boolean;
  username: string | null;
  image: string | null;
  createdAt: number;
  updatedAt: number;
}

interface Account {
  id: string;
  userId: string;
  providerId: string;
  accountId: string;
  createdAt: number;
  updatedAt: number;
}

interface ConvexCollection {
  _id: string;
  _creationTime: number;
  seed: string;
  style: string;
  steps: number;
  angle: number;
}

interface ConvexLike {
  _id: string;
  _creationTime: number;
  seed: string;
  userId: string;
  steps: number;
  style: string;
  angle: number;
}

function loadJsonl<T>(filePath: string): T[] {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  return fs.readFileSync(filePath, 'utf-8')
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

function escapeSql(value: string): string {
  return value.replace(/'/g, "''");
}

function executeD1(dbName: string, sql: string): void {
  const escapedSql = sql.replace(/"/g, '\\"');
  execSync(`pnpm wrangler d1 execute ${dbName} --remote --env production --command "${escapedSql}"`, {
    stdio: 'inherit',
    cwd: path.join(__dirname, '../../../../apps/user-application'),
  });
}

function executeD1File(dbName: string, filePath: string): void {
  execSync(`pnpm wrangler d1 execute ${dbName} --remote --env production --file "${filePath}"`, {
    stdio: 'inherit',
    cwd: path.join(__dirname, '../../../../apps/user-application'),
  });
}

function extractSnapshot(): { collectionsFile: string; likesFile: string } {
  if (!fs.existsSync(SNAPSHOT_ZIP)) {
    throw new Error(`Snapshot zip not found: ${SNAPSHOT_ZIP}`);
  }

  // Clean up any existing temp dir
  if (fs.existsSync(SNAPSHOT_TEMP_DIR)) {
    fs.rmSync(SNAPSHOT_TEMP_DIR, { recursive: true });
  }

  console.log('📦 Extracting snapshot.zip...');
  execSync(`unzip -q "${SNAPSHOT_ZIP}" -d "${SNAPSHOT_TEMP_DIR}"`);

  return {
    collectionsFile: path.join(SNAPSHOT_TEMP_DIR, 'collections/documents.jsonl'),
    likesFile: path.join(SNAPSHOT_TEMP_DIR, 'likes/documents.jsonl'),
  };
}

function cleanupSnapshot(): void {
  if (fs.existsSync(SNAPSHOT_TEMP_DIR)) {
    fs.rmSync(SNAPSHOT_TEMP_DIR, { recursive: true });
    console.log('🧹 Cleaned up temp files');
  }
}

async function seedProduction(dbName: string) {
  console.log('🚀 Production Database Seeding (Fast Mode)');
  console.log('==========================================\n');
  console.log(`📂 Database: ${dbName}\n`);

  // Extract snapshot
  const { collectionsFile, likesFile } = extractSnapshot();

  // Load data
  console.log('📖 Loading data files...');
  const users = loadJsonl<User>(USERS_FILE);
  const accounts = loadJsonl<Account>(ACCOUNTS_FILE);
  const clerkToBetterAuthMap: Record<string, string> = JSON.parse(fs.readFileSync(ID_MAP_FILE, 'utf-8'));
  const collections = loadJsonl<ConvexCollection>(collectionsFile);
  const likes = loadJsonl<ConvexLike>(likesFile);

  console.log(`   Users: ${users.length}`);
  console.log(`   Accounts: ${accounts.length}`);
  console.log(`   Palettes: ${collections.length}`);
  console.log(`   Likes: ${likes.length}`);
  console.log(`   Clerk ID mappings: ${Object.keys(clerkToBetterAuthMap).length}\n`);

  // Build email-based mapping for likes migration
  // This ensures likes are matched by email, not by Clerk ID
  console.log('🔗 Building email-based user mapping...');

  // Map: Better Auth ID -> email (from prod-users.jsonl)
  const betterAuthIdToEmail: Record<string, string> = {};
  for (const user of users) {
    betterAuthIdToEmail[user.id] = user.email.toLowerCase();
  }

  // Map: email -> Better Auth ID (for looking up users by email)
  const emailToBetterAuthId: Record<string, string> = {};
  for (const user of users) {
    emailToBetterAuthId[user.email.toLowerCase()] = user.id;
  }

  // Map: Clerk ID -> email (derived from clerkToBetterAuthMap + betterAuthIdToEmail)
  const clerkIdToEmail: Record<string, string> = {};
  for (const [clerkId, betterAuthId] of Object.entries(clerkToBetterAuthMap)) {
    const email = betterAuthIdToEmail[betterAuthId];
    if (email) {
      clerkIdToEmail[clerkId] = email;
    }
  }

  console.log(`   Clerk ID -> Email mappings: ${Object.keys(clerkIdToEmail).length}`);
  console.log(`   Email -> Better Auth ID mappings: ${Object.keys(emailToBetterAuthId).length}\n`);

  // Build SQL file
  const sqlFile = path.join(PROJECT_ROOT, '.seed-production.sql');
  const sqlStatements: string[] = [];

  // Clear existing data
  console.log('📝 Building SQL file...');
  sqlStatements.push('-- Clear existing data');
  sqlStatements.push('DELETE FROM likes;');
  sqlStatements.push('DELETE FROM palettes;');
  sqlStatements.push('DELETE FROM auth_account;');
  sqlStatements.push('DELETE FROM auth_session;');
  sqlStatements.push('DELETE FROM auth_user;');
  sqlStatements.push('');

  // Insert users (batch by 100 for readability)
  console.log(`   Adding ${users.length} users...`);
  sqlStatements.push('-- Insert users');
  const userBatchSize = 100;
  for (let i = 0; i < users.length; i += userBatchSize) {
    const batch = users.slice(i, i + userBatchSize);
    const values = batch.map(u => {
      const email = escapeSql(u.email);
      const username = u.username ? `'${escapeSql(u.username)}'` : 'NULL';
      const image = u.image ? `'${escapeSql(u.image)}'` : 'NULL';
      return `('${u.id}', '${email}', ${u.emailVerified ? 1 : 0}, ${username}, ${image}, ${u.createdAt}, ${u.updatedAt})`;
    }).join(',\n       ');
    sqlStatements.push(`INSERT INTO auth_user (id, email, email_verified, username, image, created_at, updated_at) VALUES ${values};`);
  }
  sqlStatements.push('');

  // Insert accounts
  console.log(`   Adding ${accounts.length} OAuth accounts...`);
  sqlStatements.push('-- Insert accounts');
  const accountBatchSize = 100;
  for (let i = 0; i < accounts.length; i += accountBatchSize) {
    const batch = accounts.slice(i, i + accountBatchSize);
    const values = batch.map(a => {
      return `('${a.id}', '${escapeSql(a.accountId)}', '${a.providerId}', '${a.userId}', ${a.createdAt}, ${a.updatedAt})`;
    }).join(',\n       ');
    sqlStatements.push(`INSERT INTO auth_account (id, account_id, provider_id, user_id, created_at, updated_at) VALUES ${values};`);
  }
  sqlStatements.push('');

  // Insert palettes
  console.log(`   Adding ${collections.length} palettes...`);
  sqlStatements.push('-- Insert palettes');
  const paletteBatchSize = 100;
  for (let i = 0; i < collections.length; i += paletteBatchSize) {
    const batch = collections.slice(i, i + paletteBatchSize);
    const values = batch.map(c => {
      const id = escapeSql(c.seed);
      return `('${id}', '${c.style}', ${Math.round(c.steps)}, ${Math.round(c.angle)}, ${Math.round(c._creationTime)})`;
    }).join(',\n       ');
    sqlStatements.push(`INSERT INTO palettes (id, style, steps, angle, created_at) VALUES ${values};`);
  }
  sqlStatements.push('');

  // Insert likes (with email-based ID mapping)
  console.log(`   Adding likes (with email-based mapping)...`);
  sqlStatements.push('-- Insert likes');
  let likesInserted = 0;
  let likesSkipped = 0;
  let likesSkippedNoEmail = 0;
  let likesSkippedNoUser = 0;
  const mappedLikes: Array<{ odLike: ConvexLike; newUserId: string }> = [];

  for (const like of likes) {
    // Step 1: Clerk ID -> Email
    const email = clerkIdToEmail[like.userId];
    if (!email) {
      likesSkippedNoEmail++;
      continue;
    }

    // Step 2: Email -> Better Auth ID
    const newUserId = emailToBetterAuthId[email];
    if (!newUserId) {
      likesSkippedNoUser++;
      continue;
    }

    mappedLikes.push({ odLike: like, newUserId });
  }

  likesSkipped = likesSkippedNoEmail + likesSkippedNoUser;

  const likeBatchSize = 100;
  for (let i = 0; i < mappedLikes.length; i += likeBatchSize) {
    const batch = mappedLikes.slice(i, i + likeBatchSize);
    const values = batch.map(({ odLike, newUserId }) => {
      const paletteId = escapeSql(odLike.seed);
      return `('${newUserId}', '${paletteId}', ${Math.round(odLike.steps)}, '${odLike.style}', ${Math.round(odLike.angle)}, ${Math.round(odLike._creationTime)})`;
    }).join(',\n       ');
    sqlStatements.push(`INSERT INTO likes (user_id, palette_id, steps, style, angle, created_at) VALUES ${values};`);
    likesInserted += batch.length;
  }

  // Write SQL file
  console.log(`\n📄 Writing SQL file (${sqlStatements.length} statements)...`);
  fs.writeFileSync(sqlFile, sqlStatements.join('\n'), 'utf-8');

  // Execute SQL file in one go
  console.log('🚀 Executing SQL file on remote database...');
  executeD1File(dbName, sqlFile);

  // Cleanup
  console.log('🧹 Cleaning up...');
  fs.unlinkSync(sqlFile);
  cleanupSnapshot();

  console.log('\n✅ Production database seeded successfully!');
  console.log('\n📊 Summary:');
  console.log(`   Users: ${users.length}`);
  console.log(`   OAuth accounts: ${accounts.length}`);
  console.log(`   Palettes: ${collections.length}`);
  console.log(`   Likes inserted: ${likesInserted}`);
  console.log(`   Likes skipped: ${likesSkipped}`);
  console.log(`     - No email mapping for Clerk ID: ${likesSkippedNoEmail}`);
  console.log(`     - No user found for email: ${likesSkippedNoUser}`);
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const dbName = args.find(arg => arg.startsWith('--db='))?.split('=')[1];

  if (!dbName) {
    console.error('❌ Error: --db=<DATABASE_NAME> is required\n');
    console.log('Usage:');
    console.log('  pnpm db:seed:prod --db=<DATABASE_NAME>');
    process.exit(1);
  }

  seedProduction(dbName)
    .then(() => {
      console.log('\n✨ Done!');
      process.exit(0);
    })
    .catch((error) => {
      cleanupSnapshot(); // Cleanup on error too
      console.error('\n❌ Seeding failed:', error);
      process.exit(1);
    });
}

export { seedProduction };
