#!/usr/bin/env tsx
/**
 * Migrate users from Clerk to Better Auth
 *
 * This script:
 * 1. Fetches all users from Clerk API
 * 2. Creates Better Auth user records with deterministic IDs (derived from Clerk ID)
 * 3. Creates auth_account records for OAuth providers
 * 4. Outputs a mapping file (clerk_id -> better_auth_id) for likes migration
 *
 * IMPORTANT: IDs are deterministic - running this script multiple times produces
 * identical output. This allows safe re-runs before production deployment.
 *
 * Usage:
 *   CLERK_SECRET_KEY=sk_xxx pnpm migrate:clerk-users
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const OUTPUT_DIR = path.join(__dirname, '../data');
const USERS_OUTPUT = path.join(OUTPUT_DIR, 'prod-users.jsonl');
const ACCOUNTS_OUTPUT = path.join(OUTPUT_DIR, 'prod-accounts.jsonl');
const ID_MAP_OUTPUT = path.join(OUTPUT_DIR, 'clerk-to-betterauth-id-map.json');

interface ClerkUser {
  id: string;
  email_addresses: Array<{
    id: string;
    email_address: string;
    verification: { status: string } | null;
  }>;
  primary_email_address_id: string;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  image_url: string | null;
  profile_image_url: string | null;
  external_accounts: Array<{
    id: string;
    provider: string;
    provider_user_id: string;
    email_address: string;
  }>;
  created_at: number;
  updated_at: number;
}

interface BetterAuthUser {
  id: string;
  email: string;
  emailVerified: boolean;
  username: string | null;
  image: string | null;
  createdAt: number;
  updatedAt: number;
}

interface BetterAuthAccount {
  id: string;
  userId: string;
  providerId: string;
  accountId: string;
  createdAt: number;
  updatedAt: number;
}

async function fetchAllClerkUsers(): Promise<ClerkUser[]> {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    throw new Error('CLERK_SECRET_KEY environment variable is required');
  }

  const allUsers: ClerkUser[] = [];
  let offset = 0;
  const limit = 100;

  console.log('📡 Fetching users from Clerk API...');

  while (true) {
    const url = `https://api.clerk.com/v1/users?limit=${limit}&offset=${offset}`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Clerk API error: ${response.status} ${errorText}`);
    }

    const users: ClerkUser[] = await response.json();

    if (users.length === 0) {
      break;
    }

    allUsers.push(...users);
    console.log(`  ✓ Fetched ${allUsers.length} users...`);

    if (users.length < limit) {
      break;
    }

    offset += limit;
  }

  return allUsers;
}

function getPrimaryEmail(user: ClerkUser): { email: string; verified: boolean } | null {
  const primaryEmail = user.email_addresses.find(
    e => e.id === user.primary_email_address_id
  );

  if (!primaryEmail) {
    // Fallback to first email
    const firstEmail = user.email_addresses[0];
    if (firstEmail) {
      return {
        email: firstEmail.email_address,
        verified: firstEmail.verification?.status === 'verified',
      };
    }
    return null;
  }

  return {
    email: primaryEmail.email_address,
    verified: primaryEmail.verification?.status === 'verified',
  };
}

function mapProviderName(clerkProvider: string): string {
  // Clerk uses oauth_google, oauth_github, etc.
  // Better Auth uses google, github, etc.
  return clerkProvider.replace(/^oauth_/, '');
}

/**
 * Generate a deterministic ID from a Clerk ID.
 * Same input always produces same output, making migrations repeatable.
 */
function deterministicId(clerkId: string, suffix = ''): string {
  const input = suffix ? `${clerkId}:${suffix}` : clerkId;
  const hash = crypto.createHash('sha256').update(input).digest('base64url');
  // Take first 21 chars to match nanoid default length
  return hash.slice(0, 21);
}

async function migrateUsers() {
  console.log('🚀 Clerk to Better Auth User Migration');
  console.log('======================================\n');
  console.log('ℹ️  Using deterministic IDs (safe to re-run)\n');

  const clerkUsers = await fetchAllClerkUsers();
  console.log(`\n✅ Total users fetched: ${clerkUsers.length}\n`);

  const idMap: Record<string, string> = {};
  const betterAuthUsers: BetterAuthUser[] = [];
  const betterAuthAccounts: BetterAuthAccount[] = [];

  let skipped = 0;

  for (const clerkUser of clerkUsers) {
    const emailInfo = getPrimaryEmail(clerkUser);

    if (!emailInfo) {
      console.warn(`  ⚠️  Skipping user ${clerkUser.id} - no email address`);
      skipped++;
      continue;
    }

    // Generate deterministic Better Auth ID from Clerk ID
    const betterAuthId = deterministicId(clerkUser.id);
    idMap[clerkUser.id] = betterAuthId;

    // Create user record
    const user: BetterAuthUser = {
      id: betterAuthId,
      email: emailInfo.email,
      emailVerified: emailInfo.verified,
      username: clerkUser.username,
      image: clerkUser.image_url || clerkUser.profile_image_url,
      createdAt: clerkUser.created_at,
      updatedAt: clerkUser.updated_at,
    };
    betterAuthUsers.push(user);

    // Create account records for external providers
    for (const externalAccount of clerkUser.external_accounts) {
      const account: BetterAuthAccount = {
        // Deterministic account ID based on clerk user + provider
        id: deterministicId(clerkUser.id, `account:${externalAccount.provider}`),
        userId: betterAuthId,
        providerId: mapProviderName(externalAccount.provider),
        accountId: externalAccount.provider_user_id,
        createdAt: clerkUser.created_at,
        updatedAt: clerkUser.updated_at,
      };
      betterAuthAccounts.push(account);
    }
  }

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Write users JSONL
  const usersJsonl = betterAuthUsers.map(u => JSON.stringify(u)).join('\n');
  fs.writeFileSync(USERS_OUTPUT, usersJsonl);
  console.log(`📝 Users written to: ${USERS_OUTPUT}`);

  // Write accounts JSONL
  const accountsJsonl = betterAuthAccounts.map(a => JSON.stringify(a)).join('\n');
  fs.writeFileSync(ACCOUNTS_OUTPUT, accountsJsonl);
  console.log(`📝 Accounts written to: ${ACCOUNTS_OUTPUT}`);

  // Write ID mapping
  fs.writeFileSync(ID_MAP_OUTPUT, JSON.stringify(idMap, null, 2));
  console.log(`📝 ID mapping written to: ${ID_MAP_OUTPUT}`);

  console.log('\n📊 Migration Summary:');
  console.log(`   Users migrated: ${betterAuthUsers.length}`);
  console.log(`   OAuth accounts: ${betterAuthAccounts.length}`);
  console.log(`   Users skipped: ${skipped}`);
  console.log('\n✅ Migration data generated successfully!');
  console.log('\nNext steps:');
  console.log('  1. Run the production seed script to insert this data into D1');
  console.log('  2. The seed script will use the ID map to transform likes');
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  migrateUsers()
    .then(() => {
      console.log('\n✨ Done!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Migration failed:', error);
      process.exit(1);
    });
}

export { migrateUsers, fetchAllClerkUsers };
