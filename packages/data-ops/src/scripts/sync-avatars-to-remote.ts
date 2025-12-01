#!/usr/bin/env tsx
/**
 * Sync avatars from local R2 to remote R2
 *
 * This script copies all avatar files from the local R2 bucket to the remote production bucket.
 * Run this after the migration script uploaded to local instead of remote.
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const PROJECT_ROOT = path.join(__dirname, '../../../..');
const USER_APP_DIR = path.join(PROJECT_ROOT, 'apps/user-application');
const BUCKET_NAME = 'grabient-uploads';

interface AvatarObject {
  key: string;
  size: number;
}

function getLocalAvatars(): AvatarObject[] {
  console.log('📊 Listing local R2 avatars...');

  try {
    // Get all objects from local bucket with avatars/ prefix
    const result = execSync(
      `pnpm wrangler r2 object list ${BUCKET_NAME} --prefix "avatars/"`,
      { stdio: 'pipe', cwd: USER_APP_DIR }
    );

    const output = result.toString();
    const lines = output.split('\n').filter(Boolean);
    const avatars: AvatarObject[] = [];

    for (const line of lines) {
      // Parse the output format
      const match = line.match(/^(avatars\/[^\s]+)\s+(\d+)/);
      if (match) {
        avatars.push({
          key: match[1],
          size: parseInt(match[2], 10)
        });
      }
    }

    return avatars;
  } catch (error) {
    console.error('Failed to list local avatars:', error);
    return [];
  }
}

async function syncAvatarToRemote(key: string): Promise<boolean> {
  const tempFile = path.join(PROJECT_ROOT, `.avatar-sync-${Date.now()}`);

  try {
    // Download from local
    execSync(
      `pnpm wrangler r2 object get "${BUCKET_NAME}/${key}" --file "${tempFile}"`,
      { stdio: 'pipe', cwd: USER_APP_DIR }
    );

    // Upload to remote
    execSync(
      `pnpm wrangler r2 object put "${BUCKET_NAME}/${key}" --file "${tempFile}" --content-type "image/webp" --remote`,
      { stdio: 'pipe', cwd: USER_APP_DIR }
    );

    return true;
  } catch (error) {
    console.error(`Failed to sync ${key}:`, error);
    return false;
  } finally {
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  }
}

async function main() {
  console.log('🔄 Avatar Sync: Local → Remote R2');
  console.log('==================================\n');

  // Query database for all cdn.grabient.com avatar URLs to get the keys
  console.log('📊 Querying database for avatar URLs...');

  const result = execSync(
    `pnpm wrangler d1 execute grabient-prod --remote --env production --command "SELECT image FROM auth_user WHERE image LIKE '%cdn.grabient.com%'" --json`,
    { stdio: 'pipe', cwd: USER_APP_DIR }
  );

  const parsed = JSON.parse(result.toString());
  const users = parsed[0]?.results || [];

  console.log(`   Found ${users.length} avatar URLs to sync\n`);

  if (users.length === 0) {
    console.log('✅ No avatars to sync');
    return;
  }

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    const progress = `[${i + 1}/${users.length}]`;

    // Extract key from URL: https://cdn.grabient.com/avatars/userId/timestamp.webp
    const url = user.image as string;
    const key = url.replace('https://cdn.grabient.com/', '');

    process.stdout.write(`${progress} ${key}... `);

    const success = await syncAvatarToRemote(key);

    if (success) {
      console.log('✅');
      successCount++;
    } else {
      console.log('❌');
      failCount++;
    }
  }

  console.log('\n📊 Summary:');
  console.log(`   ✅ Success: ${successCount}`);
  console.log(`   ❌ Failed: ${failCount}`);
  console.log('\n✨ Done!');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Sync failed:', error);
    process.exit(1);
  });
