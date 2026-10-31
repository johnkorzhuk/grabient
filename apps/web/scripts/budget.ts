/* The build's size budgets: what a reader's phone downloads before a page can run, and what the Worker loads. Read
   from a build's output, staging's or production's; ci:build and deploy:production run it after their build, so a
   deploy over budget stops before it deploys. Prints every figure beside its budget and exits 1 when one is over, or
   when the site's ceilings no longer load on demand.
     node scripts/budget.ts [output folder, .cloudflare/output by default]
   Each budget is the trimmed figure and about 5% more, so a real regression fails and a small change does not. A
   change that needs more raises its budget here, in the same commit, saying why. */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

type Chunk = {
  file: string;
  isEntry?: boolean;
  isDynamicEntry?: boolean;
  imports?: string[];
  src?: string;
};
type Manifest = Record<string, Chunk>;

const KB = 1000;
const KIB = 1024;

/** Each page's start: the client's entry, the chunk its route's component is split into, and what the page asks for
    as it starts with no input, each with every chunk its static imports reach. Modules are named as the manifest keys
    them. */
const PAGES: Record<string, { route: string; also?: string[]; budget: number }> = {
  "/": { route: "src/routes/index.tsx", budget: 285 },
  "/palettes": { route: "src/routes/palettes/{-$order}.{-$frame}.tsx", budget: 290 },
  "/collections": { route: "src/routes/collections/{-$order}.{-$frame}.tsx", budget: 285 },
  "a collection": { route: "src/routes/$id/index.tsx", budget: 280 },
  /* the editor's code is asked for as the page starts, while the static page holds its place, and its sheet's with it
     beside the page or once the first screen stands on a phone. The effects (the fluted glass and the blob as styles:
     their settings in the address, the menu's tiles, the header's still) took it from 347.8 KB to 351.7 on 30 Oct
     2026; their drawing, players and fields load when the menu opens or an effect plays. The sheet's cards drawing the
     effect the page plays, and its band of effects while a gradient shows, took it to 355.2 on 31 Oct 2026: what is
     here is the cards' picture slot and the sheet's switches, the pictures load as the sheet needs them. The band gave
     way to the row that leads to the palette's examples (/{seed}/examples), whose route and head took it to 356.1 */
  "a palette": {
    route: "src/routes/$id/index.tsx",
    also: ["src/features/editor/Editor.tsx", "src/features/editor/Sheet.tsx"],
    budget: 357
  },
  "/newsletter": { route: "src/routes/newsletter.tsx", budget: 225 },
  "/about": { route: "src/routes/about.tsx", budget: 250 }
};
/** What every page asks for as it starts: the tab's icon, drawn again as the page first changes what it paints. */
const EVERY_PAGE = ["src/app/tab-icon.ts"];

const BUDGETS = {
  // the blob's controls and a collection's For the bots section (its bot, its picture and its strip) took the one
  // stylesheet from 28.8 KB to 29.1 on 30 Oct 2026; a palette's examples page (features/examples) to 30.6 on 31 Oct
  stylesheet: 31,
  onDemand: 12,
  names: 285,
  // the Worker counts the pages browsers load with the admins' reader of those counts (server/visits,
  // mcp/admin/visits.ts: 5 KiB). It starts with no language's messages and no old address's map: it reads a language's
  // catalog from the deploy's files when a request first needs it, and the maps when an address may first name an old
  // palette (server/i18n.ts, seo/legacy.ts), which took its start from 745 KiB to 226 on 24 Oct 2026
  worker: 1360,
  workerStart: 237,
  // the palette files' writers (files/palette-files.ts) load with the router rather than with the Worker's start, since
  // the cache keys read an SVG's size from files/address.ts: 6.5 KiB off the start, 5.6 on here (24 Oct 2026)
  firstRequest: 173
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
    if (!chunk) throw new Error(`The manifest has no chunk for ${key}: update budget.ts`);
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
  const files = closure(client, [entry, componentOf(route), ...EVERY_PAGE, ...also]);
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

const onDemand = chunks
  .filter(chunk => chunk.file.endsWith(".js") && !started.has(chunk.file))
  .map(chunk => ({ file: chunk.file, size: clientGzip(chunk.file) }))
  .sort((a, b) => b.size - a.size)[0];
if (onDemand) {
  const name = `largest on-demand chunk (${onDemand.file.replace(/^assets\//, "")})`;
  rows.push({ name, size: onDemand.size, budget: BUDGETS.onDemand, unit: KB });
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
const isolate = closure(server, [serverEntry]);
const bundleGzip = (files: string[]) =>
  files.reduce((sum, file) => sum + gzip(read(join(bundle, file))), 0);
rows.push({
  name: "Worker, isolate start",
  size: bundleGzip([...isolate]),
  budget: BUDGETS.workerStart,
  unit: KIB
});
/* What the first request through Start adds: the router and every chunk its static imports reach, each route's module
   among them. A handler's import that only its own requests need belongs inside the handler, and this catches one that
   is not. */
const routed = [...closure(server, ["src/router.tsx"])].filter(file => !isolate.has(file));
rows.push({
  name: "Worker, first request through Start",
  size: bundleGzip(routed),
  budget: BUDGETS.firstRequest,
  unit: KIB
});
/* The site's ceilings load with the first work no cache holds (server/ceiling.ts): an import from the start would fit
   either budget above and still slow every isolate's start, so its place is checked apart. */
const ceiling = server["src/server/ceiling.ts"];
const ceilingLazy =
  !!ceiling?.isDynamicEntry && !isolate.has(ceiling.file) && !routed.includes(ceiling.file);

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
  "gzip: each client file at level 9; the Worker at the default level, all of it as one and its parts chunk by chunk"
);
if (!ceilingLazy)
  console.error("the ceiling must load on demand: import src/server/ceiling.ts lazily");
if (over.length) {
  console.error(
    `${over.length} over budget: trim what grew, or raise its budget in scripts/budget.ts`
  );
}
if (over.length || !ceilingLazy) process.exit(1);
