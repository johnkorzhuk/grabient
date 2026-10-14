/* The saved client metadata documents (src/server/oauth/client-documents.data.ts) against the ones their makers publish
   now: what differs in each, and with --write the file's block rewritten with the published ones, for review in a
   commit. Run by hand from a development machine, since some hosts refuse a Worker's fetch; the six-hour job emails the
   site's address when a document changes. From apps/web:
   node scripts/client-documents.ts [--write] */
import { readFileSync, writeFileSync } from "node:fs";
import { CLIENT_DOCUMENTS } from "../src/server/oauth/client-documents.data.ts";
import { differingFields, publishedDocument } from "../src/server/oauth/documents.ts";

const FILE = new URL("../src/server/oauth/client-documents.data.ts", import.meta.url);
const BEGIN = "// documents: begin\n";
const END = "// documents: end";
const TIMEOUT_MS = 10_000;

const published: Record<string, Readonly<Record<string, unknown>>> = {};
let changed = 0;
for (const [clientId, saved] of Object.entries(CLIENT_DOCUMENTS)) {
  const live = await publishedDocument(clientId, TIMEOUT_MS);
  if (typeof live === "string") {
    console.log(`${clientId}: unreachable (${live}), the saved copy stays`);
    published[clientId] = saved;
    continue;
  }
  published[clientId] = live;
  const fields = differingFields(saved, live);
  if (!fields.length) {
    console.log(`${clientId}: the same`);
    continue;
  }
  changed++;
  console.log(`${clientId}: changed`);
  for (const field of fields) {
    console.log(`  ${field}`);
    console.log(`    saved:     ${JSON.stringify(saved[field])}`);
    console.log(`    published: ${JSON.stringify(live[field])}`);
  }
}

if (changed && process.argv.includes("--write")) {
  const text = readFileSync(FILE, "utf8");
  const from = text.indexOf(BEGIN);
  const to = text.indexOf(END);
  if (from < 0 || to < from) throw new Error("The documents block is missing its markers.");
  const block = [
    "/** The day the copies below were fetched from their client_id URLs. */",
    `export const FETCHED = "${new Date().toISOString().slice(0, 10)}";`,
    "/** Each document as its maker publishes it at its own client_id URL, keyed by that URL. */",
    `export const CLIENT_DOCUMENTS: Readonly<Record<string, Readonly<Record<string, unknown>>>> = ${JSON.stringify(published, null, 2)};`,
    ""
  ].join("\n");
  writeFileSync(FILE, text.slice(0, from) + BEGIN + block + text.slice(to));
  console.log(
    `\nRewrote ${changed} document${changed === 1 ? "" : "s"}. Review the diff, run pnpm test, then commit.`
  );
} else if (changed) {
  console.log("\nRun again with --write to put the published documents in the file.");
}
