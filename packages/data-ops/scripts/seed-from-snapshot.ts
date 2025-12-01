import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { palettes, likes } from "../src/drizzle/app-schema";

// Path to the extracted snapshot data
const SNAPSHOT_DIR = path.join(
  __dirname,
  "../../../snapshot_data"
);

// Collections JSONL path
const COLLECTIONS_FILE = path.join(
  SNAPSHOT_DIR,
  "collections/documents.jsonl"
);

// Likes JSONL path
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

async function seed() {
  console.log("🌱 Starting database seeding...");

  // Create in-memory database for local testing
  // For production, you'd connect to your actual D1 database via wrangler
  const sqlite = new Database(
    path.join(__dirname, "../../../.wrangler/state/v3/d1/miniflare-D1DatabaseObject/acb5748b-2b55-404e-8a15-2718a8524b86.sqlite")
  );
  const db = drizzle(sqlite);

  try {
    // Parse collections
    console.log("📦 Parsing collections...");
    const collectionsData = await parseJSONL<ConvexCollection>(
      COLLECTIONS_FILE
    );
    console.log(`Found ${collectionsData.length} collections`);

    // Parse likes
    console.log("❤️  Parsing likes...");
    const likesData = await parseJSONL<ConvexLike>(LIKES_FILE);
    console.log(`Found ${likesData.length} likes`);

    // Insert collections in batches
    console.log("💾 Inserting collections...");
    const BATCH_SIZE = 100;
    for (let i = 0; i < collectionsData.length; i += BATCH_SIZE) {
      const batch = collectionsData.slice(i, i + BATCH_SIZE);
      await db.insert(palettes).values(
        batch.map((c) => ({
          id: c._id,
          seed: c.seed,
          style: c.style,
          steps: Math.round(c.steps),
          angle: Math.round(c.angle),
          likes: Math.round(c.likes),
          createdAt: new Date(c._creationTime),
        }))
      );
      console.log(
        `  Inserted ${Math.min(i + BATCH_SIZE, collectionsData.length)}/${collectionsData.length}`
      );
    }

    // Insert likes in batches
    console.log("💾 Inserting likes...");
    for (let i = 0; i < likesData.length; i += BATCH_SIZE) {
      const batch = likesData.slice(i, i + BATCH_SIZE);
      await db.insert(likes).values(
        batch.map((l) => ({
          id: l._id,
          seed: l.seed,
          userId: l.userId,
          steps: Math.round(l.steps),
          style: l.style,
          angle: Math.round(l.angle),
          isPublic: l.isPublic,
          createdAt: new Date(l._creationTime),
        }))
      );
      console.log(
        `  Inserted ${Math.min(i + BATCH_SIZE, likesData.length)}/${likesData.length}`
      );
    }

    console.log("✅ Database seeded successfully!");
    console.log(`   Collections: ${collectionsData.length}`);
    console.log(`   Likes: ${likesData.length}`);
  } catch (error) {
    console.error("❌ Error seeding database:", error);
    throw error;
  } finally {
    sqlite.close();
  }
}

seed().catch(console.error);
