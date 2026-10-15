/* The build's size budgets: what a reader's phone downloads before a page can run, and what the Worker loads. Read
   from the output of `vite build --mode staging`; ci:build runs it after the build, so a deploy over budget stops before
   it deploys. Prints every figure beside its budget and exits 1 when one is over.
     node scripts/budget.ts [output folder, .cloudflare/output by default]
   Each budget is the trimmed figure and about 5% more, so a real regression fails and a small change does not. A
   change that needs more raises its budget here, in the same commit, saying why. */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

type Chunk = { file: string; isEntry?: boolean; imports?: string[]; src?: string };
type Manifest = Record<string, Chunk>;

const KB = 1000;
const KIB = 1024;

/** Each page's start: the client's entry, the chunk its route's component is split into, and what the page asks for
    as it starts, each with every chunk its static imports reach. Modules are named as the manifest keys them. */
const PAGES: Record<string, { route: string; also?: string[]; budget: number }> = {
  "/": { route: "src/routes/index.tsx", budget: 280 },
  "/palettes": { route: "src/routes/palettes/{-$order}.{-$frame}.tsx", budget: 280 },
  "/collections": { route: "src/routes/collections/{-$order}.{-$frame}.tsx", budget: 280 },
  "a collection": { route: "src/routes/$id/index.tsx", budget: 280 },
  // the editor's code is asked for as the page starts, while the static page holds its place
  "a palette": {
    route: "src/routes/$id/index.tsx",
    also: ["src/features/editor/Editor.tsx"],
    budget: 330
  },
  "/newsletter": { route: "src/routes/newsletter.tsx", budget: 215 },
  "/about": { route: "src/routes/about.tsx", budget: 245 }
};

/** The session recorder, loaded only where a reader allows a replay: measured on its own, so it hides no other chunk. */
const RECORDER = "/node_modules/posthog-js/";

const BUDGETS = {
  stylesheet: 28,
  onDemand: 20,
  recorder: 106,
  names: 285,
  worker: 1480,
  workerStart: 740
};

const out = process.argv[2] ?? ".cloudflare/output";
const assets = join(out, "v0/workers/default/assets");
const bundle = join(out, "v0/workers/default/bundle");
const read = (path: string) => readFileSync(path);
const manifestOf = (dir: string): Manifest =>
  JSON.parse(readFileSync(join(dir, ".vite/manifest.json"), "utf8"));

/** Every chunk the keys' static imports reach, the keys' own included. */
function closure(manifest: Manifest, keys: string[]): Set<string> {
  const reached = new Set<string>();
  const visit = (key: string) => {
    const chunk = manifest[key];
    if (!chunk)
      throw new Error(`The manifest has no chunk for ${key}: update the pages in budget.ts`);
    if (reached.has(chunk.file)) return;
    reached.add(chunk.file);
    for (const next of chunk.imports ?? []) visit(next);
  };
  for (const key of keys) visit(key);
  return reached;
}

const gzip = (bytes: Buffer, level?: number) => gzipSync(bytes, level ? { level } : {}).length;

const rows: { name: string; size: number; budget: number; unit: number }[] = [];

const client = manifestOf(assets);
const entry = Object.keys(client).find(key => client[key]?.isEntry);
if (!entry) throw new Error("The client's manifest names no entry");
// level 9 per file, as Vite's report measures, the closest of gzip's levels to the zstd and brotli readers receive
const clientGzip = (file: string) => gzip(read(join(assets, file)), 9);
const started = new Set<string>();
/** The manifest's key for the chunk a route's component is split into, with whatever the route groups with it. */
const componentOf = (route: string) => {
  const split = `${route}?tsr-split=`;
  const key = Object.keys(client).find(
    key => key.startsWith(split) && key.slice(split.length).split("---").includes("component")
  );
  if (!key)
    throw new Error(
      `The manifest has no component chunk for ${route}: update the pages in budget.ts`
    );
  return key;
};
for (const [page, { route, also = [], budget }] of Object.entries(PAGES)) {
  const files = closure(client, [entry, componentOf(route), ...also]);
  for (const file of files) started.add(file);
  const size = [...files].reduce((sum, file) => sum + clientGzip(file), 0);
  rows.push({ name: `start JS, ${page}`, size, budget, unit: KB });
}

const chunks = Object.values(client);
const sheet = chunks.find(chunk => chunk.file.endsWith(".css"));
if (!sheet) throw new Error("The client's manifest names no stylesheet");
rows.push({
  name: "stylesheet",
  size: clientGzip(sheet.file),
  budget: BUDGETS.stylesheet,
  unit: KB
});

const recorder = chunks.find(chunk => chunk.src?.includes(RECORDER));
const onDemand = chunks
  .filter(chunk => chunk.file.endsWith(".js") && !started.has(chunk.file) && chunk !== recorder)
  .map(chunk => ({ file: chunk.file, size: clientGzip(chunk.file) }))
  .sort((a, b) => b.size - a.size)[0];
if (onDemand) {
  const name = `largest on-demand chunk (${onDemand.file.replace(/^assets\//, "")})`;
  rows.push({ name, size: onDemand.size, budget: BUDGETS.onDemand, unit: KB });
}
if (recorder) {
  const size = clientGzip(recorder.file);
  rows.push({ name: "session recorder", size, budget: BUDGETS.recorder, unit: KB });
}

const names = readdirSync(join(assets, "assets")).find(file => /^color-names-.*\.txt$/.test(file));
if (!names) throw new Error("The build wrote no precise color names file");
rows.push({
  name: "precise color names",
  size: clientGzip(join("assets", names)),
  budget: BUDGETS.names,
  unit: KB
});

/* The Worker as its deploy measures it: every module, gzipped together at gzip's default level. */
const modules: string[] = [];
const walk = (dir: string) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (path.endsWith(".js")) modules.push(path);
  }
};
walk(bundle);
const worker = gzip(Buffer.concat(modules.map(read)));
rows.push({ name: "Worker, all modules", size: worker, budget: BUDGETS.worker, unit: KIB });

/* What an isolate loads and runs before its first answer: the entry and every chunk its static imports reach. */
const server = manifestOf(bundle);
const serverEntry = Object.keys(server).find(key => server[key]?.isEntry);
if (!serverEntry) throw new Error("The Worker's manifest names no entry");
const startSize = [...closure(server, [serverEntry])].reduce(
  (sum, file) => sum + gzip(read(join(bundle, file))),
  0
);
rows.push({
  name: "Worker, isolate start",
  size: startSize,
  budget: BUDGETS.workerStart,
  unit: KIB
});

const over = rows.filter(row => row.size > row.budget * row.unit);
const width = Math.max(...rows.map(row => row.name.length));
for (const row of rows) {
  const unit = row.unit === KB ? "KB" : "KiB";
  const size = (row.size / row.unit).toFixed(1).padStart(7);
  const budget = String(row.budget).padStart(5);
  const mark = over.includes(row) ? "  OVER" : "";
  console.log(`${row.name.padEnd(width)}  ${size} ${unit.padEnd(3)} of ${budget}${mark}`);
}
console.log(
  "gzip: each client file at level 9; the Worker's modules together at the default level"
);
if (over.length) {
  console.error(
    `${over.length} over budget: trim what grew, or raise its budget in scripts/budget.ts`
  );
  process.exit(1);
}
