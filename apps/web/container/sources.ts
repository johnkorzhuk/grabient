/* The hash of the container's own sources (every .ts here but the tests), which image.json records when its image is
   pushed (scripts/video-image.ts) and a test holds the image to, so a change here is pushed before it is deployed. */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";

export function containerSources(): string {
  const here = new URL(".", import.meta.url);
  const hash = createHash("sha256");
  for (const name of readdirSync(here).sort()) {
    if (!name.endsWith(".ts") || name.endsWith(".test.ts")) continue;
    hash
      .update(name)
      .update("\0")
      .update(readFileSync(new URL(name, here)))
      .update("\0");
  }
  return hash.digest("hex").slice(0, 16);
}
