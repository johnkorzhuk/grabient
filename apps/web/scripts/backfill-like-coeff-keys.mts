// Backfill likes.coeff_key (added by data-ops migration 0020) for existing
// rows. paletteCoeffKey is JS-only, so this cannot be a pure SQL migration:
// the script reads the distinct palette ids still missing a key, computes
// each key locally, and applies batched UPDATEs through wrangler.
//
// Usage (from apps/web):
//   pnpm exec tsx scripts/backfill-like-coeff-keys.mts staging --remote
//   pnpm exec tsx scripts/backfill-like-coeff-keys.mts production --remote
//
// Safe to re-run: only rows WHERE coeff_key IS NULL are touched. Run AFTER
// `wrangler d1 migrations apply DB --env <env> --remote` and BEFORE deploying
// worker code that reads coeff_key.
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// Source import (not the package export): tsx compiles the TS directly, so
// the script never depends on a stale data-ops dist build. data-ops has no
// `"type": "module"`, so tsx emits it as CJS — hence the default-import
// destructure instead of a named import.
import serialization from "../../../packages/data-ops/src/serialization.ts";

const { paletteCoeffKey } = serialization as unknown as {
  paletteCoeffKey: (seed: string) => string | null;
};

const env = process.argv[2];
if (!env || !["staging", "production"].includes(env)) {
  console.error(
    "Usage: pnpm exec tsx scripts/backfill-like-coeff-keys.mts <staging|production> [--remote]",
  );
  process.exit(1);
}
const remote = process.argv.includes("--remote") ? ["--remote"] : ["--local"];

function d1(args: string[]): string {
  return execFileSync(
    "pnpm",
    ["exec", "wrangler", "d1", "execute", "DB", "--env", env, ...remote, ...args],
    { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
  );
}

const raw = d1([
  "--json",
  "--command",
  "SELECT DISTINCT palette_id FROM likes WHERE coeff_key IS NULL",
]);
const ids: string[] = JSON.parse(raw)
  .flatMap((r: { results?: { palette_id: string }[] }) => r.results ?? [])
  .map((row: { palette_id: string }) => row.palette_id);

if (!ids.length) {
  console.log("Nothing to backfill: every likes row already has a coeff_key.");
  process.exit(0);
}

const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
const statements = ids.map((id) => {
  const key = paletteCoeffKey(id) ?? id;
  return `UPDATE likes SET coeff_key = ${quote(key)} WHERE palette_id = ${quote(id)} AND coeff_key IS NULL;`;
});

const file = join(mkdtempSync(join(tmpdir(), "likes-backfill-")), "backfill.sql");
writeFileSync(file, statements.join("\n") + "\n");
console.log(`Backfilling coeff_key for ${ids.length} distinct palette ids (${file})…`);
d1(["--file", file]);

const remaining = JSON.parse(
  d1(["--json", "--command", "SELECT COUNT(*) AS missing FROM likes WHERE coeff_key IS NULL"]),
).flatMap((r: { results?: { missing: number }[] }) => r.results ?? [])[0]?.missing;
console.log(`Done. Rows still missing coeff_key: ${remaining}`);
