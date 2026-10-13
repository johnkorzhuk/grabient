/* The search index, offline: the snapshot a deploy ships (public/search/snapshot.bin), which the Worker's scheduled
   builds start from, and the site's collections as training pairs. Day to day none of this runs: the Worker keeps its
   own snapshot current (src/server/search/sync.ts). A retrain needs a new base. Nothing here writes to D1, and the
   site is read and built by the Worker's own code.

     node scripts/search/index.ts export [--local] [--mode staging|production]   the public site -> cache/export.json
     node scripts/search/index.ts pairs     public collections as training pairs -> cache/app-pairs.json
     node scripts/search/index.ts build     public/search/snapshot.bin from the export, embedding through cf
     node scripts/search/index.ts status [origin]   what a deployed Worker answers from, beside the shipped base */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  buildSnapshot,
  decodeSnapshot,
  encodeSnapshot,
  subjectOf
} from "@grabient/search/snapshot.ts";
import { loadTower } from "@grabient/search/tower.ts";
import { DATABASES, ORIGINS } from "../../cloudflare.config.ts";
import type { Db } from "../../src/server/db/d1.ts";
import { readMark, readSite } from "../../src/server/search/sync.ts";
import { cf } from "./cf.ts";
import { type Embedder, embedTexts } from "./embed.ts";
import { CACHE, PUBLIC } from "./paths.ts";

const EXPORT = resolve(CACHE, "export.json");

/* A database as the Worker's reads ask it, answered by `cf d1 raw`: read-only, one statement at a time. */
function cfDatabase(remote: boolean, mode: "staging" | "production"): Db {
  const where = remote ? [] : ["--local", "--persist-to", ".cloudflare/state"];
  const id = remote ? DATABASES[mode].id : DATABASES.development.id;
  const select = async (sql: string, params: unknown[]) => {
    const args = [
      "d1",
      "raw",
      id,
      ...where,
      "--sql",
      sql,
      ...params.flatMap(p => ["--params", String(p)])
    ];
    const [answer] = (await cf(args)) as { results: { columns: string[]; rows: unknown[][] } }[];
    const { columns, rows } = answer.results;
    return rows.map(row => Object.fromEntries(columns.map((column, i) => [column, row[i]])));
  };
  const statement = (sql: string, params: unknown[] = []) => ({
    bind: (...values: unknown[]) => statement(sql, values),
    all: async () => ({ results: await select(sql, params) }),
    first: async () => (await select(sql, params))[0] ?? null
  });
  return { prepare: (sql: string) => statement(sql) } as unknown as Db;
}

interface Exported {
  exportedAt: number;
  source: string;
  version: string;
  mark: string;
  seeds: string[];
  titles: [string, string][];
  collections: {
    slug: string;
    title: string;
    description: string;
    tags: string[];
    seeds: string[];
  }[];
}

const model = () => loadTower(readFileSync(resolve(PUBLIC, "tower.bin")));

async function exportSite(local: boolean, mode: "staging" | "production") {
  const db = cfDatabase(!local, mode);
  const { version } = model();
  // the numbers the Worker's schedule compares: a base built from this export counts as built from the site as it is
  const mark = await readMark(db, version);
  const site = await readSite(db, mark);
  mkdirSync(CACHE, { recursive: true });
  const exported: Exported = {
    exportedAt: Date.now(),
    source: local ? "local" : mode,
    version,
    mark,
    seeds: site.seeds,
    titles: [...site.titles],
    collections: site.collections
  };
  writeFileSync(EXPORT, JSON.stringify(exported));
  console.log(
    `export: ${site.seeds.length} gallery palettes, ${site.collections.length} public collections, ${site.titles.size} titles`
  );
}

function readExport(): Exported {
  if (!existsSync(EXPORT))
    throw new Error("No export yet: run `node scripts/search/index.ts export` first.");
  return JSON.parse(readFileSync(EXPORT, "utf8")) as Exported;
}

/** The site's collections as training pairs: each title's subject with each of its palettes, a stable fifth of the
    palettes in each fold, so a measurement run can hold one out. */
function writePairs() {
  const site = readExport();
  const fold = (seed: string) =>
    [...seed].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 0) % 5;
  const pairs = site.collections.flatMap(c =>
    c.seeds.map(seed => ({
      phrase: subjectOf(c.title).toLowerCase(),
      category: "collection",
      source: "collection",
      seed,
      fold: fold(seed),
      slug: c.slug
    }))
  );
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(resolve(CACHE, "app-pairs.json"), JSON.stringify(pairs));
  console.log(`pairs: ${pairs.length} from ${site.collections.length} collections`);
}

async function build() {
  const site = readExport();
  const tower = model();
  if (site.version !== tower.version)
    throw new Error(`The export was made for model ${site.version}: export again.`);
  const alias: Embedder = tower.embedder.includes("gemma") ? "gemma" : "m3";
  const started = Date.now();
  // from nothing: every palette is measured here
  const { snapshot, stats } = await buildSnapshot(
    tower,
    { ...site, titles: new Map(site.titles) },
    null,
    {
      limit: Number.POSITIVE_INFINITY,
      now: site.exportedAt,
      embed: async texts => {
        const made = await embedTexts(alias, texts);
        return texts.map((_, i) => made.data.subarray(i * made.dims, (i + 1) * made.dims));
      }
    }
  );
  const bytes = encodeSnapshot(snapshot);
  writeFileSync(resolve(PUBLIC, "snapshot.bin"), bytes);
  const each = ((Date.now() - started) / Math.max(1, stats.palettes)).toFixed(2);
  console.log(
    `snapshot: ${stats.palettes} palettes (${stats.titled} titled, ${each} ms each), ${stats.collections} collections, ${(bytes.length / 1024).toFixed(0)} KB`
  );
  if (stats.withoutText)
    console.warn(
      `${stats.withoutText} collection texts were not embedded: is cf logged in (cf auth whoami)?`
    );
}

/** What a deployed Worker answers from, beside the base in this checkout. */
async function status(origin: string) {
  const live = (await (await fetch(`${origin.replace(/\/$/, "")}/api/search/status`)).json()) as {
    available: boolean;
    from?: string;
    builtAt?: number;
    palettes?: number;
    titled?: number;
    collections?: number;
    pending?: number;
  };
  const base = decodeSnapshot(readFileSync(resolve(PUBLIC, "snapshot.bin")));
  const when = (ms?: number) =>
    ms ? `${new Date(ms).toISOString().replace("T", " ").slice(0, 16)} UTC` : "never";
  console.log(origin);
  console.log(
    live.available
      ? `  answers from ${live.from === "store" ? "its own build" : "the shipped base"} of ${when(live.builtAt)}: ${live.palettes} palettes (${live.titled} titled), ${live.collections} collections${live.pending ? `, ${live.pending} owed` : ""}`
      : "  answers from nothing: the search files are missing"
  );
  console.log(
    `  base in this checkout: ${when(base.builtAt)}: ${base.seeds.length} palettes, ${base.slugs.length} collections`
  );
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    local: { type: "boolean", default: false },
    mode: { type: "string", default: "staging" }
  }
});
const [command, argument] = positionals;
const mode = values.mode === "production" ? "production" : "staging";
try {
  if (command === "export") await exportSite(values.local, mode);
  else if (command === "pairs") writePairs();
  else if (command === "build") await build();
  else if (command === "status") await status(argument ?? ORIGINS.staging);
  else
    throw new Error(
      "usage: node scripts/search/index.ts export [--local] [--mode staging|production] | pairs | build | status [origin]"
    );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
