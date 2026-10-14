/* D1 through cf, by the database ids in cloudflare.config.ts. Without --remote it is the local database `vite dev`
   serves, kept in .cloudflare/state; with --remote it is staging's, or the mode's.

     node scripts/d1.ts setup                     every migration and the gallery's palettes, on both local databases:
                                                  `vite dev`'s, and the one `vite preview` of a staging build reads
     node scripts/d1.ts migrate [--remote] [--mode staging|previews|production]
     node scripts/d1.ts file <path.sql> [--remote] [--mode staging|previews|production]

   cf has no command that runs a SQL file, so `file` cuts one into statements and sends them in batches. */

import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { DATABASES } from "../cloudflare.config.ts";

const WEB = resolve(import.meta.dirname, "..");
// The database's migrations belong to the server package, which every Worker on this database shares.
const MIGRATIONS = resolve(WEB, "../../packages/server/migrations");
// Where the Vite plugin keeps local development's bindings, so both see one database.
const STATE = ".cloudflare/state";
// D1 refuses a statement over 100 KB, and one request carries about a megabyte of SQL.
const REQUEST_BYTES = 1_000_000;
const ROWS_PER_INSERT = 200;
const REMOTE = ["staging", "previews", "production"] as const;

interface Target {
  id: string;
  where: string[];
}

const local = (id: string): Target => ({ id, where: ["--local", "--persist-to", STATE] });

function target(remote: boolean, mode: string | undefined): Target {
  if (!remote) {
    if (mode) throw new Error(`The ${mode} database has no local copy: add --remote.`);
    return local(DATABASES.development.id);
  }
  const name = mode ?? "staging";
  if (!REMOTE.some(known => known === name)) {
    throw new Error(`No database for mode ${name}: staging, previews or production.`);
  }
  return { id: DATABASES[name as (typeof REMOTE)[number]].id, where: [] };
}

/** cf's JSON answer. A local command can print its answer and never exit while `vite dev` holds the database, so the
    child is ended once its output parses and has been quiet for a moment. */
function cf(args: string[], timeout = 600_000): Promise<unknown> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(join(WEB, "node_modules/.bin/cf"), args, { cwd: WEB });
    const named = `cf ${args.slice(0, 3).join(" ")}`;
    let out = "";
    let err = "";
    let settled = false;
    let quiet: ReturnType<typeof setTimeout> | undefined;
    const parsed = (): { value: unknown } | null => {
      try {
        return { value: JSON.parse(out) };
      } catch {
        return null;
      }
    };
    const finish = (error: Error | null, value?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(quiet);
      clearTimeout(limit);
      child.kill();
      if (error) reject(error);
      else resolvePromise(value);
    };
    const limit = setTimeout(
      () =>
        finish(
          new Error(
            `${named} gave no answer in ${timeout / 1000} s. Is vite dev holding the database?`
          )
        ),
      timeout
    );
    child.stdout.on("data", chunk => {
      out += chunk;
      clearTimeout(quiet);
      quiet = setTimeout(() => {
        const answer = parsed();
        if (answer) finish(null, answer.value);
      }, 500);
    });
    child.stderr.on("data", chunk => {
      err += chunk;
    });
    child.on("error", error => finish(error));
    child.on("close", code => {
      if (code === 0) finish(null, parsed()?.value ?? out);
      else finish(new Error(`${named} failed: ${err || out}`));
    });
  });
}

const OPENS = new Set(["CASE"]);

/** A script's statements: split at semicolons outside quotes, comments, CASE expressions and trigger bodies. */
export function statements(sql: string): string[] {
  const out: string[] = [];
  let current = "";
  let depth = 0;
  for (let i = 0; i < sql.length; i++) {
    const char = sql[i]!;
    if (char === "'" || char === '"' || char === "`") {
      const end = sql.indexOf(char, i + 1);
      const stop = end < 0 ? sql.length : end + 1;
      current += sql.slice(i, stop);
      i = stop - 1;
    } else if (char === "-" && sql[i + 1] === "-") {
      const end = sql.indexOf("\n", i);
      i = end < 0 ? sql.length : end - 1;
    } else if (char === "/" && sql[i + 1] === "*") {
      const end = sql.indexOf("*/", i + 2);
      i = end < 0 ? sql.length : end + 1;
    } else if (/[A-Za-z_]/.test(char) && !/\w/.test(sql[i - 1] ?? "")) {
      const word = /^\w+/.exec(sql.slice(i))![0];
      const upper = word.toUpperCase();
      if (
        OPENS.has(upper) ||
        (upper === "BEGIN" && /^\s*CREATE\s+(TEMP\w*\s+)?TRIGGER\b/i.test(current))
      ) {
        depth++;
      } else if (upper === "END" && depth) depth--;
      current += word;
      i += word.length - 1;
    } else if (char === ";" && !depth) {
      if (current.trim()) out.push(current.trim());
      current = "";
    } else current += char;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

interface Answer {
  success: boolean;
  meta?: { changes?: number };
}

/** Runs the statements in order, a megabyte at a time, each request one transaction. */
async function run(all: string[], { id, where }: Target): Promise<Answer[]> {
  const requests: string[][] = [];
  let bytes = REQUEST_BYTES;
  for (const statement of all) {
    const size = Buffer.byteLength(statement);
    if (bytes + size > REQUEST_BYTES) {
      requests.push([]);
      bytes = 0;
    }
    requests.at(-1)!.push(statement);
    bytes += size;
  }
  const dir = mkdtempSync(join(tmpdir(), "grabient-d1-"));
  const answers: Answer[] = [];
  try {
    for (const request of requests) {
      const file = join(dir, "batch.json");
      writeFileSync(file, JSON.stringify(request.map(sql => ({ sql }))));
      const answer = (await cf(["d1", "raw", id, ...where, "--batch", `@${file}`])) as Answer[];
      const failed = answer.find(result => !result.success);
      if (failed) throw new Error(`D1 refused a batch: ${JSON.stringify(failed)}`);
      answers.push(...answer);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  return answers;
}

async function migrate(at: Target): Promise<void> {
  const args = ["d1", "migrations", "apply", at.id, ...at.where, "--dir", MIGRATIONS];
  // A list of what was applied, or words when there was nothing to apply.
  const applied = await cf(args);
  const names = Array.isArray(applied)
    ? (applied as { name: string; status: string }[]).map(({ name, status }) => `${status} ${name}`)
    : [];
  console.log(names.length ? names.join("\n") : "No migrations to apply.");
}

interface Palette {
  kseed: string;
  classes: string[];
  style: string;
  steps: number;
  angle: number;
  likes: number;
  createdAt: number;
}

const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
const readJson = <T>(path: string): T => JSON.parse(readFileSync(join(WEB, path), "utf8")) as T;

/** The gallery this repository ships: the palettes of public/corpus-k.json, with the likes they had when it was made,
    and the first Grabient's gradients dated as they were made. A palette already there is left as it is, and a date
    only ever moves back, so running it again changes nothing. */
function gallery(): string[] {
  const { items } = readJson<{ items: Palette[] }>("public/corpus-k.json");
  const rows = items.map(
    item =>
      `(${quote(item.kseed)}, ${quote(item.style)}, ${item.steps}, ${item.angle}, ${quote(JSON.stringify(item.classes))}, ${item.likes}, ${item.likes}, ${item.createdAt})`
  );
  const inserts: string[] = [];
  for (let at = 0; at < rows.length; at += ROWS_PER_INSERT) {
    inserts.push(
      `INSERT INTO k_palettes (seed, style, steps, angle, classes, legacy_likes_count, likes_count, created_at) VALUES\n${rows
        .slice(at, at + ROWS_PER_INSERT)
        .join(",\n")}\nON CONFLICT (seed) DO NOTHING`
    );
  }
  const originals = readJson<{ items: { kseed: string; createdAt: number }[] }>(
    "data/original-gradients.json"
  ).items;
  const dates = Map.groupBy(originals, original => original.createdAt);
  const dated = [...dates].map(
    ([at, group]) =>
      `UPDATE k_palettes SET created_at = ${at} WHERE created_at > ${at} AND seed IN (${group.map(original => quote(original.kseed)).join(", ")})`
  );
  return [...inserts, ...dated];
}

const USAGE =
  "usage: node scripts/d1.ts setup | migrate | file <path.sql>  [--remote] [--mode staging|previews|production]";

const changed = (answers: Answer[]) =>
  answers.reduce((sum, answer) => sum + (answer.meta?.changes ?? 0), 0);

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { remote: { type: "boolean", default: false }, mode: { type: "string" } }
  });
  const [command, path] = positionals;
  if (command === "setup") {
    if (values.remote || values.mode) throw new Error(USAGE);
    // a staging build served by `vite preview` reads a local database under staging's id
    for (const mode of ["development", "staging"] as const) {
      const at = local(DATABASES[mode].id);
      await migrate(at);
      const written = changed(await run(gallery(), at));
      console.log(
        `The local ${mode} gallery holds the shipped palettes (${written} rows written).`
      );
    }
  } else if (command === "migrate") {
    await migrate(target(values.remote, values.mode));
  } else if (command === "file" && path) {
    const sql = statements(readFileSync(resolve(path), "utf8"));
    console.log(
      `${path}: ${changed(await run(sql, target(values.remote, values.mode)))} rows changed`
    );
  } else throw new Error(USAGE);
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
