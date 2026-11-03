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
  /* the silk and the rosette as effects (2 Nov 2026), which every page's start carries as names and settings alone
     (engine/effect.ts's kinds, the menu's tiles and labels; their drawing, stills and players load as one shows), took
     it from 284.6 to 285.0 */
  /* soft and grain over every gradient style (2 Nov 2026): the Appearance menu's two fields, the view's two parts in
     every address the lists, the editor and the tab write, and the pictures that lay the grain's tile and place a
     soft view's stops (lib/picture.ts); the blur itself (engine/soft.ts, 1.8 KB), the grain's files and what a copy
     carries load as a soft view or a copy asks for them, took it from 285.5 to 287.3 */
  /* the color reader (engine/written-color.ts, 3 Nov 2026): rgb(), hsl(), oklch() and every other form CSS writes a
     color in, read wherever search reads hex codes, a page's title among them, so the page and the Worker read a
     search alike, took it from 287.7 to 290.1 */
  "/": { route: "src/routes/index.tsx", budget: 291 },
  /* the same took it from 288.9 to 290.7; soft and grain over the effects (their pictures blurred over the gradient,
     the menu's fields beside an effect's, the summary naming them) and the editor's glass after a move (e3636f12) to
     291.2 on 3 Nov 2026 */
  /* the color reader, as "/", took it from 291.2 to 293.5 on 3 Nov 2026 */
  /* it stood at 294.1 at the effects' finished SVG (d5cdb607, 3 Nov 2026), and papercut as an effect (its name and
     settings, as every page, and a card's strip offering the copies and links of the kind it plays) took it to 294.2 */
  "/palettes": { route: "src/routes/palettes/{-$order}.{-$frame}.tsx", budget: 295 },
  /* the list window's answer to a first move and its reach (ui/window.ts), 0.3 KB on every list's start, took this one
     to 285.3 on 2 Nov 2026, with the glass and the blob already in it */
  /* the silk and the rosette as effects (their names and settings, as every page) took it from 285.4 to 286.0 on
     2 Nov 2026 */
  /* soft and grain, as "/", took it from 286.3 to 288.1 on 2 Nov 2026 */
  /* the color reader, as "/", took it from 288.6 to 290.9 on 3 Nov 2026 */
  "/collections": { route: "src/routes/collections/{-$order}.{-$frame}.tsx", budget: 292 },
  /* a collection's own code loads apart from its address's route, which a palette's page shares, and its document
     names it, so the browser has it before it hydrates: it is counted here (31 Oct 2026). Its cards playing the look
     each palette was saved in, an effect and its settings (features/list/appearance.ts's lookEffect and cardPlays,
     ItemCard's look), took it from 280.0 to 280.1 on 2 Nov 2026 */
  "a collection": {
    route: "src/routes/$id/index.tsx",
    also: ["src/features/collections/CollectionRoute.tsx"],
    /* soft and grain, as "/", took it from 280.9 to 282.7 on 2 Nov 2026, and over the effects (as /palettes) to 283.2
       on 3 Nov 2026 */
    /* the color reader, as "/", took it from 283.2 to 285.5 on 3 Nov 2026 */
    /* it stood at 286.1 at the effects' finished SVG (d5cdb607, 3 Nov 2026), and papercut, as /palettes, took it to
       286.2 */
    budget: 287
  },
  /* the editor's code is asked for as the page starts, while the static page holds its place, and its sheet's with it
     beside the page or once the first screen stands on a phone. The effects (the fluted glass and the blob as styles:
     their settings in the address, the menu's tiles, the header's still) took it from 347.8 KB to 351.7 on 30 Oct
     2026; their drawing, players and fields load when the menu opens or an effect plays. The sheet's cards drawing the
     effect the page plays, and its band of effects while a gradient shows, took it to 355.2 on 31 Oct 2026: what is
     here is the cards' picture slot and the sheet's switches, the pictures load as the sheet needs them. The band gave
     way to the row that leads to the palette's examples (/{seed}/examples), whose route and head took it to 356.1. It
     stood at 357.0 on 31 Oct 2026 when a collection's page left it, which the route asks for with a collection's data
     (features/collections/CollectionRoute.tsx and all only it reaches: Add to collection's lists, curation, tags):
     325.5; then the selection's export screen, asked for as the selection is about to open (selection/ExportScreen.tsx:
     the column and the preview, their grid, the copies and the zip): 320.0, the budget 3 KB over it */
  /* it stood at 323.0 on 2 Nov 2026 once the saved look was in it, and the silk's and the rosette's layers made one a
     kind, so none reads a kind its condition no longer holds (the editor fell to its static page as a tile under the
     pointer turned the picture), took it a few hundredths past */
  "a palette": {
    route: "src/routes/$id/index.tsx",
    also: ["src/features/editor/Editor.tsx", "src/features/editor/Sheet.tsx"],
    /* soft and grain (as "/", and the editor's own: its view's two parts, the stage's and the corner's pictures, the
       code pane's and the copies' blurred stops and elided tile) took it from 323.1 to 326.0 on 2 Nov 2026 */
    /* the color reader, as "/", took it from 326.7 to 329.0 on 3 Nov 2026 */
    budget: 330
  },
  /* a palette's examples (/{seed}/examples), a page of its own since 31 Oct 2026: six sections, its code split from
     the editor's, 282.3 KB as it starts; counted with the pages, its route no longer the largest chunk a press loads.
     Each section turned by swipe, press or key (5e406210) took it to 286.7 on 1 Nov 2026, and the lists' Appearance
     fields made smooth (the water reading its boxes only as they can move, the menu's settings one object), which
     every page's start carries, to 287.1; the silk and the rosette as effects took it from 287.8 to 290.0 on 2 Nov
     2026: their names and settings, and the cards' picture (editor/EffectArt.tsx, which this page's cards and headline
     draw with) holding their still's holder (FxArt.tsx), which a list's server-drawn cards need at hydration, their
     drawing and players loading as a card shows one */
  /* soft and grain, as "/", took it from 290.2 to 292.4 on 2 Nov 2026 */
  /* the color reader, as "/", took it from 292.8 to 295.1 on 3 Nov 2026 */
  /* it stood at 295.9 with papercut as an effect (d5cdb607 and sg/papercut, 3 Nov 2026); the vector stills drawn a
     task's and a frame's share at a time (FxArt.tsx, which this page's cards draw with: a list's papercut stills held
     the page up to 0.7 s at once) and the effects' kind fact for a still that stands in for its first frame took it
     to 296.2 */
  "a palette's examples": { route: "src/routes/$id/examples.tsx", budget: 297 },
  /* the silk and the rosette as effects took it from 224.7 to 225.1 on 2 Nov 2026, as every page; soft and grain (the
     view's parts in every address, the header's swatch) from 225.2 to 226.6 */
  /* the color reader, as "/", took it from 226.8 to 229.2 on 3 Nov 2026 */
  "/newsletter": { route: "src/routes/newsletter.tsx", budget: 230 },
  /* soft and grain, as /newsletter, took it from 249.3 to 250.8 on 2 Nov 2026, and over the effects (as /palettes)
     to 251.0 on 3 Nov 2026 */
  /* the color reader, as "/", took it from 251.0 to 253.4 on 3 Nov 2026 */
  "/about": { route: "src/routes/about.tsx", budget: 254 }
};
/** What every page asks for as it starts: the tab's icon, drawn again as the page first changes what it paints. */
const EVERY_PAGE = ["src/app/tab-icon.ts"];

const BUDGETS = {
  // the blob's controls and a collection's For the bots section (its bot, its picture and its strip) took the one
  // stylesheet from 28.8 KB to 29.1 on 30 Oct 2026; a palette's examples page (features/examples) to 30.6 on 31 Oct,
  // and its rebuild as six sections with a masonry of ten media (10.4 KB of its own, gzipped alone) from 31.0 to 35.4
  // the same day
  stylesheet: 37,
  // the glass's Shadertoy text (engine/glass-shadertoy.ts: its six tabs, 41 KB as written), which loads only as a reader
  // picks the Shadertoy spelling of the glass's Shader tab, took the largest from 11.4 KB to 13.6 on 1 Nov 2026; its
  // GLSL and WebGL page and its WGSL and WebGPU page load apart, 4.0 and 6.7 KB, beside the pages' design, 5.7
  onDemand: 14,
  names: 285,
  // the Worker counts the pages browsers load with the admins' reader of those counts (server/visits,
  // mcp/admin/visits.ts: 5 KiB). It starts with no language's messages and no old address's map: it reads a language's
  // catalog from the deploy's files when a request first needs it, and the maps when an address may first name an old
  // palette (server/i18n.ts, seo/legacy.ts), which took its start from 745 KiB to 226 on 24 Oct 2026. The examples page's
  // six sections, which the Worker renders, took it from 1347.4 KiB to 1374.7 on 31 Oct 2026. The glass's still as a
  // WebP (server/images/still.ts and libwebp's glue, loaded with the first still an isolate draws) took it from 1422.1
  // KiB to 1430.0 on 3 Nov 2026; libwebp's module itself, 346 KB and 129 gzipped, is WebAssembly, which this counts
  // no more than it counts the video's
  worker: 1445,
  // soft and grain (2 Nov 2026): the view's two parts in every address the Worker reads and redirects, and the CSS
  // writer's grain, took it from 236.5 to 237.3; the blur and the grain's tile load with the first file that asks. The
  // color reader (engine/written-color.ts), which the search, the pages' titles and the MCP read, took it from 237.5
  // to 239.7 on 3 Nov 2026
  workerStart: 241,
  // the palette files' writers (files/palette-files.ts) load with the router rather than with the Worker's start, since
  // the cache keys read an SVG's size from files/address.ts: 6.5 KiB off the start, 5.6 on here (24 Oct 2026). Soft and
  // grain took it from 172.1 to 175.3 on 2 Nov 2026: the pages' Appearance fields and pictures as the server renders
  // them, the SVG writer's placed stops and grain pattern, the painter's soft reads and grain, and the pictures' keys.
  // It stood at 176.5 at the effects' finished SVG (d5cdb607, 3 Nov 2026: every SVG's grain laid as tiles of its image,
  // grain.ts grainTilesSvg, and an effect's SVG, card and addresses named by its soft and grain); papercut adds nothing
  // here, its drawing loading with the first file or card of it
  firstRequest: 177
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
