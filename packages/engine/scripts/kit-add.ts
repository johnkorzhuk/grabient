/* `pnpm kit:add <file> label="Zen garden" words="zen garden"`: a chosen field effect made one of the site's
   (kit/README.md, step 2 from a candidate to a site effect). It copies the file to kit/fields/<kind>.ts, the kind its
   default export's, its imports of the engine made relative from there, refusing any absolute path left, and drops its
   about's `label` and `words` once they are found to be the names given, since kit/names.ts holds those in every
   language. A kind not yet registered then takes its place in kit/kinds.ts, its line in kit/registry.ts, its two names
   in kit/names.ts and its embed script's entry, apps/web/src/embed/<kind>.ts, written as zen.ts is, refused where a
   file its name makes is there already (KIND_MAKES: the embed's own grain.ts, say); a kind already
   registered has its file replaced and nothing else. Every file it writes is formatted by biome as `pnpm format`
   would, and nothing is written unless every one of them can be and the effect's kernel compiles within the budget
   (kit/compile.ts), from the file as given, whose lines a refusal names, and as written to kit/fields/: kit:gen
   compiles it once the files are written, where a refusal would leave a kind registered with no kernel. Then it runs
   `pnpm kit:gen` and prints what is left (the app's tests take a new kind from the kit, so none is among it).

     pnpm kit:add W/kit/picks/lava/lava.ts label="Lava lamp" words="lava lamp"
     pnpm kit:add W/kit/picks/zen/zen.ts

   file: a module whose default export is a FieldEffect with its about (types.ts FieldAbout), found from where pnpm
   was run, as root is; label: its name on the Appearance menu's tile; words: what stands in a gradient's style's place
   in a palette's title, lower case. Either may come from the file's about instead, and a registered kind keeps
   names.ts's. root: the repository it writes to (this one), which kit-add.test.ts points at a copy of the files it
   edits; kit:gen runs where the root has it. */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, posix, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { BANDS_STYLE } from "../src/bands.ts";
import { EFFECTS } from "../src/effect.ts";
import { compileKernel, KIT_KERNEL_BUDGET } from "../src/kit/compile.ts";
import { KIT_KINDS } from "../src/kit/kinds.ts";
import type { FieldEffect } from "../src/kit/types.ts";

/** This repository, whose biome formats what kit-add writes into any root. */
const REPO = fileURLToPath(new URL("../../../", import.meta.url));

/** What kit-add writes, from a repository's root. */
export const KIT_ADD_PATHS = {
  kinds: "packages/engine/src/kit/kinds.ts",
  registry: "packages/engine/src/kit/registry.ts",
  names: "packages/engine/src/kit/names.ts",
  field: (kind: string) => `packages/engine/src/kit/fields/${kind}.ts`,
  embed: (kind: string) => `apps/web/src/embed/${kind}.ts`
};
/** The files a new kind's name makes, which no file may hold already: its file and its embed entry (kit-add's own),
    its kernel's GLSL and WGSL (kit:gen's) and its example page (examples:kit's). A kind named for one of the embed's
    own modules (grain.ts, mount.ts, kit.ts, address.ts, build.ts, ground.ts, shares.ts) would write its entry over it,
    and every effect's script would then fail to build. */
const KIND_MAKES = (kind: string) => [
  KIT_ADD_PATHS.field(kind),
  KIT_ADD_PATHS.embed(kind),
  `packages/engine/src/kit/gen/${kind}.ts`,
  `apps/web/public/examples/background-${kind}.html`
];

/** Kinds an effect cannot take: the effects drawn by code of their own, the kit's demo, the animated SVG's style, and
    words a module cannot bind, since registry.ts and the embed's entry import the effect by its kind. */
const TAKEN = new Set<string>([
  ...EFFECTS.filter(kind => !(KIT_KINDS as readonly string[]).includes(kind)),
  "demo",
  BANDS_STYLE,
  ..."arguments await break case catch class const continue debugger default delete do else enum eval export extends false finally for function if implements import in instanceof interface let new null package private protected public return static super switch this throw true try typeof var void while with yield".split(
    " "
  )
]);

/** What the effect is called (kit/names.ts): its menu's label and its title's words. */
export interface KitNames {
  label?: string;
  words?: string;
}

/** What kit-add did: the kind, whether it was new, its names, and the files it wrote, from the root. */
export interface KitAdded extends Required<KitNames> {
  kind: string;
  added: boolean;
  wrote: string[];
}

/** A file's text as biome writes it at that path in this repository (`biome check --write`: formatted, its imports
    sorted), read and written through biome's standard streams so the file may lie in any root. */
export function formatted(path: string, text: string): string {
  const run = spawnSync(
    join(REPO, "node_modules/.bin/biome"),
    ["check", "--write", `--stdin-file-path=${path}`],
    { cwd: REPO, input: text, encoding: "utf8" }
  );
  if (run.status !== 0 || !run.stdout)
    throw new Error(`biome on ${path}: ${run.stderr || run.status}`);
  return run.stdout;
}

/** The end of the bracketed text opening at `open`, past its matching close, strings, templates and comments read as
    such. */
function closing(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (c === '"' || c === "'" || c === "`") {
      for (i++; i < text.length && text[i] !== c; i++) if (text[i] === "\\") i++;
    } else if (c === "/" && text[i + 1] === "/") i = text.indexOf("\n", i);
    else if (c === "/" && text[i + 1] === "*") i = text.indexOf("*/", i) + 1;
    else if (c === "{" || c === "[" || c === "(") depth++;
    else if ((c === "}" || c === "]" || c === ")") && --depth === 0) return i + 1;
    if (i < 0) break;
  }
  throw new Error(`no close to the bracket at ${open}`);
}

/** Line numbers and text of what a file still says of a place on this machine. */
const absoluteLeft = (text: string): string[] =>
  text
    .split("\n")
    .map((line, i) => [i + 1, line] as const)
    .filter(
      ([, line]) => line.includes(`${homedir()}/`) || /(["'`])\/[\w.-]+\/[^"'`\s]*\1/.test(line)
    )
    .map(([n, line]) => `${n}: ${line.trim()}`);

/** The effect's file as kit/fields/<kind>.ts holds it: each import of the engine (by absolute path, or relative to
    where the file lies) made relative from kit/fields/, and its about's label and words dropped, with the type it
    widened its about to for them. Refuses an import from outside the engine's src and any absolute path left. */
export function fieldText(source: string, file: string): string {
  const engine = "/packages/engine/src/";
  let text = source.replace(
    /(\bfrom\s+|^import\s+)(["'])([^"']+)\2/gm,
    (whole, lead: string, quote: string, spec: string) => {
      if (!spec.startsWith("/") && !spec.startsWith(".")) return whole;
      const path = resolve(dirname(file), spec);
      const at = path.lastIndexOf(engine);
      if (at < 0)
        throw new Error(
          `${file}: it imports ${spec}, outside the engine: an effect is its one file`
        );
      const relative = posix.relative("kit/fields", path.slice(at + engine.length));
      return `${lead}${quote}${relative.startsWith(".") ? relative : `./${relative}`}${quote}`;
    }
  );
  const left = absoluteLeft(text);
  if (left.length)
    throw new Error(`${file}: an absolute path is left, line ${left.join("; line ")}`);
  /* the about's label and words, and the type its object was widened to for them */
  const about = /\n\s*about:\s*\{/.exec(text);
  if (about) {
    const open = about.index + about[0].length - 1;
    const end = closing(text, open);
    const body = text
      .slice(open, end)
      .replace(/\n\s*(?:label|words):\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'),?/g, "");
    text = text.slice(0, open) + body + text.slice(end);
  }
  const widened = /:\s*FieldEffect\s*&\s*\{\s*about:\s*(\w+);?\s*\}/.exec(text);
  if (widened) {
    const type = widened[1];
    text = text.replace(widened[0], ": FieldEffect");
    const declared = new RegExp(
      `\\n(?:/\\*\\*(?:(?!\\*/)[\\s\\S])*\\*/\\n)?(?:export )?interface ${type} \\{`
    ).exec(text);
    if (declared) {
      const end = closing(text, declared.index + declared[0].length - 1);
      const rest = text.slice(0, declared.index) + text.slice(end);
      if (!new RegExp(`\\b${type}\\b`).test(rest)) text = rest;
    }
  }
  return text;
}

/** The kinds a kinds.ts registers. */
const kindsIn = (text: string): string[] => {
  const list = /export const KIT_KINDS = \[([^\]]*)\] as const;/.exec(text);
  if (!list) throw new Error(`${KIT_ADD_PATHS.kinds}: no KIT_KINDS = [...] as const`);
  return [...list[1].matchAll(/"([a-z]+)"/g)].map(m => m[1]);
};

/** A names.ts table's span: from its opening brace to its close. */
function tableIn(text: string, table: "KIT_LABELS" | "KIT_WORDS"): { open: number; end: number } {
  const at = text.indexOf(`export const ${table}`);
  const open = at < 0 ? -1 : text.indexOf("= {", at) + 2;
  if (open < 2) throw new Error(`${KIT_ADD_PATHS.names}: no ${table} = { ... }`);
  return { open, end: closing(text, open) };
}
/** A names.ts table's message for a kind. */
function nameIn(text: string, table: "KIT_LABELS" | "KIT_WORDS", kind: string): string | undefined {
  const { open, end } = tableIn(text, table);
  const entry = new RegExp(`\\b${kind}: msg\\(("(?:[^"\\\\]|\\\\.)*")\\)`).exec(
    text.slice(open, end)
  );
  return entry ? JSON.parse(entry[1]) : undefined;
}
/** A names.ts table with a kind's message last. */
function withName(
  text: string,
  table: "KIT_LABELS" | "KIT_WORDS",
  kind: string,
  name: string
): string {
  const { open, end } = tableIn(text, table);
  const entries = text.slice(open + 1, end - 1).replace(/,?\s*$/, "");
  return `${text.slice(0, open + 1)}${entries},\n  ${kind}: msg(${JSON.stringify(name)})\n${text.slice(end - 1)}`;
}

/** A registry.ts with a kind's import among the fields' in their order (where biome would sort it: moved there by
    biome, the import first in the file parts from the header with a blank line) and its entry last in EFFECTS. */
function withEntry(text: string, kind: string): string {
  const imports = [...text.matchAll(/^import \w+ from "\.\/fields\/(\w+)\.ts";$/gm)];
  const effects = /(const EFFECTS[^=]*= \{)([^}]*)(\};)/.exec(text);
  if (!imports.length || !effects)
    throw new Error(`${KIT_ADD_PATHS.registry}: no fields' imports or EFFECTS`);
  const next = imports.find(m => m[1] > kind);
  const last = imports[imports.length - 1];
  const at = next ? next.index : last.index + last[0].length + 1;
  const named = effects[2]
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
  const table = `${effects[1]} ${[...named, kind].join(", ")} ${effects[3]}`;
  return `${text.slice(0, at)}import ${kind} from "./fields/${kind}.ts";\n${text.slice(at)}`.replace(
    effects[0],
    table
  );
}

/** An effect's embed script's entry, as zen.ts is written. */
export const embedText = (kind: string, words: string): string =>
  `/* The ${words} behind any page: \`<script src="https://grabient.com/{seed}.js?style=${kind}" async></script>\` (kit.ts).
   Built into one classic script by build.ts, which the Worker serves at /{seed}.js?style=${kind}. */
import ${kind} from "@grabient/engine/kit/fields/${kind}.ts";
import { KERNEL_GLSL } from "@grabient/engine/kit/gen/${kind}.ts";
import { mountKit } from "./kit.ts";

mountKit(${kind}, KERNEL_GLSL);
`;

/** Adds the effect a file holds to the site in `root` (this repository unless said), or replaces its file where its
    kind is registered, as the header says; kit:gen is the caller's. */
export async function kitAdd(file: string, given: KitNames = {}, root = REPO): Promise<KitAdded> {
  const def: FieldEffect | undefined = (await import(pathToFileURL(file).href)).default;
  if (!def?.field) throw new Error(`${file} exports no FieldEffect as its default`);
  const { kind, about } = def;
  if (!/^[a-z]+$/.test(kind) || TAKEN.has(kind))
    throw new Error(
      `${file}: its kind "${kind}" is not lower-case letters, or names another effect or a word`
    );
  const missing = (["shows", "video", "describe", "what"] as const).filter(
    k => typeof about?.[k] !== "string" || !about[k]
  );
  if (missing.length)
    throw new Error(
      `${file}: its about lacks ${missing.join(", ")} (types.ts FieldAbout): write them first`
    );
  const read = (path: string) => readFileSync(join(root, path), "utf8");
  const kinds = read(KIT_ADD_PATHS.kinds);
  const names = read(KIT_ADD_PATHS.names);
  const added = !kindsIn(kinds).includes(kind);
  /* a new kind writes over nothing: a file its name makes that is there already is another's */
  const there = added ? KIND_MAKES(kind).filter(path => existsSync(join(root, path))) : [];
  if (there.length)
    throw new Error(
      `${file}: its kind "${kind}" would write over ${there.join(" and ")}, which no field effect's name made: name it otherwise`
    );
  /* each name: the one given, the file's own, names.ts's for a registered kind, and all of them alike */
  const own = about as KitNames & typeof about;
  const name = (key: keyof KitNames, table: "KIT_LABELS" | "KIT_WORDS"): string => {
    const said = [given[key], own[key], added ? undefined : nameIn(names, table, kind)];
    const kept = said.filter((v): v is string => typeof v === "string");
    if (!kept.length) throw new Error(`${file}: no ${key}: give ${key}="..."`);
    if (kept.some(v => v !== kept[0]))
      throw new Error(
        `${file}: its ${key} is said as ${kept.map(v => JSON.stringify(v)).join(" and ")}`
      );
    return kept[0];
  };
  const label = name("label", "KIT_LABELS");
  const words = name("words", "KIT_WORDS");
  /* its text as kit/fields/ holds it, refused where it imports from outside the engine; then its kernel, compiled as
     kit:gen will compile it, within the budget: from the file as given, whose lines and columns a refusal names as
     kit-check's does, and from its text as written to kit/fields/ below */
  const source = readFileSync(file, "utf8");
  const field = fieldText(source, file);
  const kernel = (text: string, at: string) =>
    compileKernel(text, {
      name: def.field.name,
      kind,
      uniforms: def.uniforms,
      tracks: def.tracks,
      file: at
    });
  const { cost } = kernel(source, file);
  if (cost > KIT_KERNEL_BUDGET)
    throw new Error(
      `${file}: its kernel costs ${cost}, past the budget of ${KIT_KERNEL_BUDGET} (kit/compile.ts)`
    );
  const files = new Map<string, string>([[KIT_ADD_PATHS.field(kind), field]]);
  if (added) {
    files.set(
      KIT_ADD_PATHS.kinds,
      kinds.replace(
        /export const KIT_KINDS = \[[^\]]*\] as const;/,
        `export const KIT_KINDS = [${[...kindsIn(kinds), kind].map(k => `"${k}"`).join(", ")}] as const;`
      )
    );
    files.set(KIT_ADD_PATHS.registry, withEntry(read(KIT_ADD_PATHS.registry), kind));
    files.set(
      KIT_ADD_PATHS.names,
      withName(withName(names, "KIT_LABELS", kind, label), "KIT_WORDS", kind, words)
    );
    files.set(KIT_ADD_PATHS.embed(kind), embedText(kind, words));
  }
  const out = new Map([...files].map(([path, text]) => [path, formatted(path, text)]));
  kernel(out.get(KIT_ADD_PATHS.field(kind))!, KIT_ADD_PATHS.field(kind));
  for (const [path, text] of out) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return { kind, added, label, words, wrote: [...out.keys()] };
}

/** What is left once kit-add has run (kit/README.md's steps 3 to 6). */
function left({ kind, added, label, words }: KitAdded): string {
  const steps = [
    added
      ? `3. Its names in every language: pnpm i18n extract, a note for translators on "${label}" and "${words}" in packages/i18n/messages/en.json (what each is, where it shows, what it must not be confused with), each language's translations through pnpm i18n merge, and a row each in packages/i18n/glossary (ja's effect table two columns, the others three).`
      : "3. Its names stay as they were.",
    `4. Its example page: ${added ? `its entry in PAGE_OF in apps/web/scripts/examples-kit.ts (kind "${kind}": a seed, its query, title, h1 "This page sits on <its words with their article>." and lead; pnpm typecheck names it until it is written), then ` : ""}pnpm --filter web examples:kit, which writes its still anew.`,
    `5. The words: pnpm vitest run apps/web/src/server/seo/agents.test.ts -u (the -u last) for the llms texts${added ? `; skills/grabient/SKILL.md by hand (its words where an effect plays behind a page, a sentence for style=${kind}, and ${kind} in a list's styles); then grep -rnw zen apps packages skills --exclude-dir=fixtures --exclude-dir=node_modules for any other hand list of effects` : ""}.`,
    `6. The clips' module: ZIG=~/.local/zig/zig sh packages/engine/src/video/build.sh, which writes VIDEO_MODULE in packages/engine/src/video.ts (the container's image is then pushed by its owner, pnpm --filter web video:image); its clips' weight, node packages/engine/test/kit-weight.ts kind=${kind} three or four times on a quiet machine, the most rounded up written as clipWeight: { weight, cost } in its file; its gate for the gallery, node packages/engine/test/kit-check.ts def=packages/engine/src/kit/fields/${kind}.ts palettes=all json=~/.cache/grabient-final-work/kit/checks/site-${kind}.json. Then every check: pnpm check on Node 24, CONFORMANCE=deep pnpm vitest run --project unit packages/engine/src/effect-conformance.test.ts -t "the ${kind}", pnpm --filter web e2e:gpu, E2E_SERVED=off pnpm --filter web e2e -g "vector|embed|video|examples", pnpm i18n check --strict, and pnpm build && pnpm --filter web budget (a new effect adds about 0.8 KB to the MP4 worker and 0.7 KiB to the Worker: raise them with a dated reason).`
  ];
  return `Left (kit/README.md, from a candidate to a site effect):\n${steps.join("\n")}`;
}

if (import.meta.main) {
  const given = process.argv.slice(2);
  const args = Object.fromEntries(
    given
      .filter(a => a.includes("="))
      .map(a => [a.slice(0, a.indexOf("=")), a.slice(a.indexOf("=") + 1)])
  );
  const files = given.filter(a => !a.includes("="));
  if (files.length !== 1)
    throw new Error('pnpm kit:add <file> label="..." words="..." [root=<dir>]');
  const here = process.env.INIT_CWD ?? process.cwd();
  const root = args.root ? resolve(here, args.root) : REPO;
  const file = resolve(here, files[0]);
  const done = await kitAdd(file, { label: args.label, words: args.words }, root);
  console.log(`${done.added ? "added" : "replaced"} the ${done.kind}: ${done.wrote.join(", ")}`);
  const gen = join(root, "packages/engine/scripts/kit-gen.ts");
  const ran = existsSync(gen)
    ? spawnSync(process.execPath, [gen], { cwd: root, stdio: "inherit" })
    : null;
  if (!ran) console.log(`${root} has no kit-gen.ts: run pnpm kit:gen there`);
  else if (ran.status !== 0) {
    console.log(
      "pnpm kit:gen failed, saying why above: fix the effect's file and run kit:add again"
    );
    process.exitCode = 1;
  }
  console.log(left(done));
}
