#!/usr/bin/env tsx
/**
 * Migrate user avatars from Clerk URLs to R2 storage
 *
 * This script:
 * 1. Queries production D1 database for users with Clerk avatar URLs
 * 2. Downloads each Clerk avatar image
 * 3. Uploads to R2 bucket with key: avatars/{userId}/{timestamp}.webp
 * 4. Generates SQL to update auth_user.image URLs
 *
 * For jkorzhuk@gmail.com: deletes existing R2 avatar first (for validation)
 *
 * Usage:
 *   pnpm migrate:avatars --db=<DATABASE_NAME> --dry-run    # Preview only
 *   pnpm migrate:avatars --db=<DATABASE_NAME>              # Execute migration
 *
 * R2 credentials are read from .dev.vars (R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)
 * Production bucket config is hardcoded for safety (grabient-uploads)
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import * as dotenv from 'dotenv';

const PROJECT_ROOT = path.join(__dirname, '../../../..');
const USER_APP_DIR = path.join(PROJECT_ROOT, 'apps/user-application');
const DEV_VARS_PATH = path.join(USER_APP_DIR, '.dev.vars');

// Load .dev.vars for R2 credentials (keys only)
dotenv.config({ path: DEV_VARS_PATH });

const PROD_R2_CONFIG = {
  accountId: 'f846204052f664d57da7acde8f6803cd',
  bucketName: 'grabient-uploads',
  publicUrl: 'https://pub-f6df953a27f148e3996ab995736c8522.r2.dev',
};

interface User {
  id: string;
  email: string;
  emailVerified: boolean;
  username: string | null;
  image: string | null;
  createdAt: number;
  updatedAt: number;
}

interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicUrl: string;
}

function queryD1(dbName: string, sql: string): string {
  try {
    const result = execSync(
      `pnpm wrangler d1 execute ${dbName} --remote --env production --command "${sql.replace(/"/g, '\\"')}" --json`,
      { stdio: 'pipe', cwd: USER_APP_DIR }
    );
    return result.toString();
  } catch (error) {
    console.error('D1 query failed:', error);
    throw error;
  }
}

function getUsersWithClerkAvatars(dbName: string): User[] {
  console.log('📊 Querying production database for users with Clerk avatars...');

  const sql = `SELECT id, email, image FROM auth_user WHERE image LIKE '%img.clerk.com%'`;
  const result = queryD1(dbName, sql);

  try {
    const parsed = JSON.parse(result);
    // D1 returns results in an array format
    if (parsed && Array.isArray(parsed) && parsed[0]?.results) {
      const users = parsed[0].results as User[];
      console.log(`   Found ${users.length} users with Clerk avatars`);
      return users;
    }
    return [];
  } catch (error) {
    console.error('Failed to parse D1 response:', error);
    return [];
  }
}

function escapeSql(value: string): string {
  return value.replace(/'/g, "''");
}

function executeD1File(dbName: string, filePath: string): void {
  execSync(`pnpm wrangler d1 execute ${dbName} --remote --env production --file "${filePath}"`, {
    stdio: 'inherit',
    cwd: USER_APP_DIR,
  });
}

async function downloadImage(url: string): Promise<Buffer | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AvatarMigration/1.0)',
      },
    });

    if (!response.ok) {
      console.error(`   Failed to download ${url}: ${response.status}`);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    console.error(`   Error downloading ${url}:`, error);
    return null;
  }
}

async function uploadToR2(
  config: R2Config,
  key: string,
  data: Buffer,
  contentType: string
): Promise<boolean> {
  const tempFile = path.join(PROJECT_ROOT, `.avatar-temp-${Date.now()}`);

  try {
    fs.writeFileSync(tempFile, data);

    execSync(
      `pnpm wrangler r2 object put "${config.bucketName}/${key}" --file "${tempFile}" --content-type "${contentType}"`,
      { stdio: 'pipe', cwd: USER_APP_DIR }
    );

    return true;
  } catch (error) {
    console.error(`   Failed to upload to R2: ${key}`, error);
    return false;
  } finally {
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  }
}

async function deleteFromR2(config: R2Config, key: string): Promise<boolean> {
  try {
    execSync(
      `pnpm wrangler r2 object delete "${config.bucketName}/${key}"`,
      { stdio: 'pipe', cwd: USER_APP_DIR }
    );
    return true;
  } catch {
    // Object may not exist, which is fine
    return false;
  }
}

async function listR2Objects(config: R2Config, prefix: string): Promise<string[]> {
  try {
    const result = execSync(
      `pnpm wrangler r2 object list "${config.bucketName}" --prefix "${prefix}"`,
      { stdio: 'pipe', cwd: USER_APP_DIR }
    );

    // Parse the output to get keys
    const output = result.toString();
    const lines = output.split('\n').filter(Boolean);
    const keys: string[] = [];

    for (const line of lines) {
      // wrangler r2 object list outputs JSON or table format
      try {
        const parsed = JSON.parse(line);
        if (Array.isArray(parsed)) {
          for (const obj of parsed) {
            if (obj.key) keys.push(obj.key);
          }
        }
      } catch {
        // Try to parse as table format (key is usually first column)
        const match = line.match(/^(\S+)/);
        if (match && match[1].startsWith(prefix)) {
          keys.push(match[1]);
        }
      }
    }

    return keys;
  } catch {
    return [];
  }
}

function detectImageType(buffer: Buffer): { type: string; extension: string } | null {
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return { type: 'image/jpeg', extension: 'jpg' };
  }
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    return { type: 'image/png', extension: 'png' };
  }
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
      buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
    return { type: 'image/webp', extension: 'webp' };
  }
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
    return { type: 'image/gif', extension: 'gif' };
  }
  return null;
}

async function migrateAvatars(dbName: string, dryRun: boolean) {
  console.log('🖼️  Avatar Migration');
  console.log('====================\n');
  console.log(`📂 Database: ${dbName}`);
  console.log(`🏃 Mode: ${dryRun ? 'DRY RUN (preview only)' : 'LIVE MIGRATION'}\n`);

  // Build R2 config using hardcoded production values + credentials from .dev.vars
  const r2Config: R2Config = {
    accountId: PROD_R2_CONFIG.accountId,
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    bucketName: PROD_R2_CONFIG.bucketName,
    publicUrl: PROD_R2_CONFIG.publicUrl,
  };

  console.log(`📦 R2 Bucket: ${r2Config.bucketName}`);
  console.log(`🔗 Public URL: ${r2Config.publicUrl}\n`);

  if (!r2Config.accessKeyId || !r2Config.secretAccessKey) {
    console.error('❌ Missing R2 credentials in .dev.vars');
    console.error('   Required: R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY');
    process.exit(1);
  }

  // Query production DB for users with Clerk avatars
  const usersWithClerkAvatars = getUsersWithClerkAvatars(dbName);

  console.log(`   Users with Clerk avatars: ${usersWithClerkAvatars.length}\n`);

  if (usersWithClerkAvatars.length === 0) {
    console.log('✅ No users with Clerk avatars to migrate');
    return;
  }

  // Special handling for jkorzhuk@gmail.com - find the user and delete existing R2 avatar
  const validationEmail = 'jkorzhuk@gmail.com';
  const validationUser = usersWithClerkAvatars.find(u => u.email === validationEmail);

  if (validationUser) {
    console.log(`🔍 Found validation user: ${validationEmail} (${validationUser.id})`);
    if (!dryRun) {
      console.log(`   Checking for existing R2 avatars to delete...`);
      const existingKeys = await listR2Objects(r2Config, `avatars/${validationUser.id}/`);
      for (const key of existingKeys) {
        console.log(`   Deleting existing avatar: ${key}`);
        await deleteFromR2(r2Config, key);
      }
    }
    console.log('');
  }

  // Process avatars
  const sqlStatements: string[] = [];
  const timestamp = Date.now();
  let successCount = 0;
  let failCount = 0;
  let skipCount = 0;

  console.log('🔄 Processing avatars...\n');

  for (let i = 0; i < usersWithClerkAvatars.length; i++) {
    const user = usersWithClerkAvatars[i];
    const progress = `[${i + 1}/${usersWithClerkAvatars.length}]`;

    console.log(`${progress} ${user.email}`);

    if (!user.image) {
      console.log('   ⏭️  No image URL, skipping');
      skipCount++;
      continue;
    }

    // Download image
    const imageData = await downloadImage(user.image);
    if (!imageData) {
      console.log('   ❌ Download failed');
      failCount++;
      continue;
    }

    // Detect image type
    const imageType = detectImageType(imageData);
    if (!imageType) {
      console.log('   ❌ Unknown image format');
      failCount++;
      continue;
    }

    console.log(`   📥 Downloaded: ${(imageData.length / 1024).toFixed(1)}KB (${imageType.type})`);

    // Generate R2 key - use webp extension for consistency with existing pattern
    const r2Key = `avatars/${user.id}/${timestamp}.webp`;
    const publicUrl = `${r2Config.publicUrl}/${r2Key}`;

    if (dryRun) {
      console.log(`   📤 Would upload to: ${r2Key}`);
      console.log(`   🔗 New URL: ${publicUrl}`);
    } else {
      // Upload to R2
      const uploaded = await uploadToR2(r2Config, r2Key, imageData, imageType.type);
      if (!uploaded) {
        console.log('   ❌ Upload failed');
        failCount++;
        continue;
      }
      console.log(`   📤 Uploaded to: ${r2Key}`);
    }

    // Add SQL update
    sqlStatements.push(
      `UPDATE auth_user SET image = '${escapeSql(publicUrl)}', updated_at = ${Date.now()} WHERE id = '${user.id}';`
    );

    successCount++;
    console.log(`   ✅ Success`);
  }

  console.log('\n📊 Summary:');
  console.log(`   ✅ Success: ${successCount}`);
  console.log(`   ❌ Failed: ${failCount}`);
  console.log(`   ⏭️  Skipped: ${skipCount}`);

  if (sqlStatements.length === 0) {
    console.log('\n⚠️  No SQL updates to apply');
    return;
  }

  // Write SQL file
  const sqlFile = path.join(PROJECT_ROOT, '.avatar-migration.sql');
  fs.writeFileSync(sqlFile, sqlStatements.join('\n'), 'utf-8');
  console.log(`\n📄 SQL file written: ${sqlFile} (${sqlStatements.length} statements)`);

  if (dryRun) {
    console.log('\n🏃 DRY RUN complete. Run without --dry-run to apply changes.');
    console.log(`   Preview SQL: cat ${sqlFile}`);
  } else {
    // Execute SQL
    console.log('\n🚀 Applying database updates...');
    executeD1File(dbName, sqlFile);
    console.log('✅ Database updated!');

    // Cleanup
    fs.unlinkSync(sqlFile);
    console.log('🧹 Cleaned up temp files');
  }

  console.log('\n✨ Done!');
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const dbName = args.find(arg => arg.startsWith('--db='))?.split('=')[1];
  const dryRun = args.includes('--dry-run');

  if (!dbName) {
    console.error('❌ Error: --db=<DATABASE_NAME> is required\n');
    console.log('Usage:');
    console.log('  pnpm migrate:avatars --db=<DATABASE_NAME> --dry-run  # Preview');
    console.log('  pnpm migrate:avatars --db=<DATABASE_NAME>            # Execute');
    process.exit(1);
  }

  migrateAvatars(dbName, dryRun)
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('\n❌ Migration failed:', error);
      process.exit(1);
    });
}

export { migrateAvatars };
