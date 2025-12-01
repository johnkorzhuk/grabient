/**
 * Seed script for remote D1 database
 *
 * This script generates SQL INSERT statements that can be executed
 * against the remote D1 database using wrangler.
 *
 * Usage:
 * 1. Run: pnpm tsx scripts/seed-remote.ts > seed.sql
 * 2. Execute: cd ../../apps/user-application && pnpx wrangler d1 execute grabient --file=../../packages/data-ops/scripts/seed.sql --remote
 */

import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";

const SNAPSHOT_DIR = path.join(__dirname, "../../../snapshot_data");
const COLLECTIONS_FILE = path.join(SNAPSHOT_DIR, "collections/documents.jsonl");
const LIKES_FILE = path.join(SNAPSHOT_DIR, "likes/documents.jsonl");

interface ConvexCollection {
  _id: string;
  _creationTime: number;
  seed: string;
  style: string;
  steps: number;
  angle: number;
  likes: number;
}

interface ConvexLike {
  _id: string;
  _creationTime: number;
  seed: string;
  userId: string;
  steps: number;
  style: string;
  angle: number;
  isPublic: boolean;
}

async function parseJSONL<T>(filePath: string): Promise<T[]> {
  const records: T[] = [];
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (line.trim()) {
      records.push(JSON.parse(line));
    }
  }

  return records;
}

function escapeSQL(str: string): string {
  return str.replace(/'/g, "''");
}

async function generateSQL() {
  console.error("🌱 Generating SQL for database seeding...");

  // Parse collections
  console.error("📦 Parsing collections...");
  const collectionsData = await parseJSONL<ConvexCollection>(COLLECTIONS_FILE);
  console.error(`Found ${collectionsData.length} collections`);

  // Parse likes
  console.error("❤️  Parsing likes...");
  const likesData = await parseJSONL<ConvexLike>(LIKES_FILE);
  console.error(`Found ${likesData.length} likes`);

  // Generate INSERT statements for collections
  console.error("💾 Generating collections SQL...");
  for (const c of collectionsData) {
    const createdAt = Math.floor(c._creationTime);
    console.log(
      `INSERT INTO collections (id, seed, style, steps, angle, likes, created_at) VALUES ('${c._id}', '${escapeSQL(c.seed)}', '${c.style}', ${Math.round(c.steps)}, ${Math.round(c.angle)}, ${Math.round(c.likes)}, ${createdAt});`
    );
  }

  // Generate INSERT statements for likes
  console.error("💾 Generating likes SQL...");
  for (const l of likesData) {
    const createdAt = Math.floor(l._creationTime);
    const isPublic = l.isPublic ? 1 : 0;
    console.log(
      `INSERT INTO likes (id, seed, user_id, steps, style, angle, is_public, created_at) VALUES ('${l._id}', '${escapeSQL(l.seed)}', '${escapeSQL(l.userId)}', ${Math.round(l.steps)}, '${l.style}', ${Math.round(l.angle)}, ${isPublic}, ${createdAt});`
    );
  }

  console.error("✅ SQL generation complete!");
  console.error(`   Collections: ${collectionsData.length}`);
  console.error(`   Likes: ${likesData.length}`);
}

generateSQL().catch(console.error);
