/* `pnpm kit:add` (kit-add.ts) on a copy of the files it edits: a new kind takes its place in kinds.ts, registry.ts and
   names.ts, every other line of theirs as it was and each list read back as it was with the kind last, however biome
   lays it out (a list too long for a line goes a name a line), its embed script's entry is written as strata.ts is, and
   its file is the candidate's with the kit imported relatively and its about's names and their type gone; a second run
   with a newer file replaces that file and nothing else; and what it refuses, writing nothing. The candidate is the
   demo under a kind no effect has, so the test holds however many kinds the site registers, written as a designer
   writes one: the kit imported by absolute path, its label and words in its about, typed for them. */
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, expect, test } from "vitest";
import { KIT_KINDS } from "../src/kit/kinds.ts";
import { KIT_WORDS } from "../src/kit/names.ts";
import { embedText, formatted, KIT_ADD_PATHS, kitAdd } from "./kit-add.ts";

const REPO = fileURLToPath(new URL("../../../", import.meta.url));
const SRC = fileURLToPath(new URL("../src/", import.meta.url));
const DEMO = readFileSync(join(SRC, "kit/fields/demo.ts"), "utf8");
/** The candidate's kind and names, and a second kind for the refusals: no effect's. */
const KIND = "kitaddtest";
const LABEL = "Kit add test";
const WORDS = "kit add test";
const OTHER = "kitaddrefused";
const root = mkdtempSync(join(tmpdir(), "kit-add-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));
for (const path of [KIT_ADD_PATHS.kinds, KIT_ADD_PATHS.registry, KIT_ADD_PATHS.names])
  cpSync(join(REPO, path), join(root, path), { recursive: true });
const read = (path: string) => readFileSync(join(root, path), "utf8");
const before = (path: string) => readFileSync(join(REPO, path), "utf8");

/** The demo under a kind as kit/fields/<kind>.ts holds it, in biome's form. */
const demoAs = (kind: string) =>
  formatted(KIT_ADD_PATHS.field(kind), DEMO.replace(/\bdemo\b/g, kind));

/** The demo under a kind, a candidate file in its own folder. */
function candidate(name: string, edit: (text: string) => string = text => text, kind = KIND) {
  const about = `${kind[0].toUpperCase()}${kind.slice(1)}About`;
  const text = DEMO.replace(/\bdemo\b/g, kind)
    .replace('from "../scene.ts"', `from "${SRC}kit/scene.ts"`)
    .replace('from "../types.ts"', `from "${SRC}kit/types.ts"`)
    .replace(
      `export const ${kind}: FieldEffect = {`,
      `export const ${kind}: FieldEffect & { about: ${about} } = {`
    )
    .replace(
      /(\n {4}what: [^\n]*)\n {2}\},/,
      `$1,\n    label: ${JSON.stringify(LABEL)},\n    words: ${JSON.stringify(WORDS)}\n  },`
    )
    .replace(
      `export default ${kind};`,
      `/** What the site says of it, and its names. */\ninterface ${about} {\n  shows: string;\n  video: string;\n  describe: string;\n  what: string;\n  label: string;\n  words: string;\n}\n\nexport default ${kind};`
    );
  const file = join(root, "candidates", `${name}.ts`);
  mkdirSync(join(root, "candidates"), { recursive: true });
  writeFileSync(file, edit(text));
  return file;
}

/** The lines one text has that the other lacks, each way. */
function lineDiff(a: string, b: string): { removed: string[]; added: string[] } {
  const less = (x: string[], y: string[]) => {
    const left = [...y];
    return x.filter(line => {
      const i = left.indexOf(line);
      if (i < 0) return true;
      left.splice(i, 1);
      return false;
    });
  };
  const la = a.split("\n");
  const lb = b.split("\n");
  return { removed: less(la, lb), added: less(lb, la) };
}

/** A text cut at the first list a pattern opens (the pattern ending on its bracket): the text to the bracket, the
    list's entries, and the text from its closing bracket on. */
function cut(text: string, head: RegExp): [string, string, string] {
  const m = head.exec(text);
  if (!m) throw new Error(`no ${head}`);
  const open = m.index + m[0].length;
  const close = text.indexOf(m[0].endsWith("[") ? "]" : "}", open);
  return [text.slice(0, open), text.slice(open, close), text.slice(close)];
}
/** A list's names, quoted (KIT_KINDS) or bare (EFFECTS), on one line or a name a line. */
const namesIn = (list: string) =>
  list
    .split(",")
    .map(name => name.trim().replace(/^"(.*)"$/, "$1"))
    .filter(Boolean);
/** names.ts: its text around its two tables, and each table's entries. */
function tables(text: string) {
  const [head, labels, rest] = cut(text, /export const KIT_LABELS[^=]*= \{/);
  const [between, words, tail] = cut(rest, /export const KIT_WORDS[^=]*= \{/);
  const entries = (table: string) =>
    [...table.matchAll(/(\w+): msg\(("(?:[^"\\]|\\.)*")\)/g)].map(m => [m[1], JSON.parse(m[2])]);
  return { around: [head, between, tail], labels: entries(labels), words: entries(words) };
}

test("an effect's embed entry is written as each registered one's is", () => {
  for (const kind of KIT_KINDS)
    expect(embedText(kind, KIT_WORDS[kind])).toBe(before(KIT_ADD_PATHS.embed(kind)));
});

test("a new kind: its file, its kind, its line, its names and its embed entry, and nothing else", async () => {
  expect(KIT_KINDS).not.toContain(KIND);
  const done = await kitAdd(candidate(KIND), { label: LABEL, words: WORDS }, root);
  expect(done).toEqual({
    kind: KIND,
    added: true,
    label: LABEL,
    words: WORDS,
    wrote: [
      KIT_ADD_PATHS.field(KIND),
      KIT_ADD_PATHS.kinds,
      KIT_ADD_PATHS.registry,
      KIT_ADD_PATHS.names,
      KIT_ADD_PATHS.embed(KIND)
    ]
  });
  /* the demo's own file, the kind renamed: the kit imported relatively, the names and their type gone */
  expect(read(KIT_ADD_PATHS.field(KIND))).toBe(demoAs(KIND));

  /* kinds.ts: KIT_KINDS with the kind last, and the rest as it was */
  const KINDS = /export const KIT_KINDS = \[/;
  const [kindsHead, kinds, kindsTail] = cut(before(KIT_ADD_PATHS.kinds), KINDS);
  const [kindsHead1, kinds1, kindsTail1] = cut(read(KIT_ADD_PATHS.kinds), KINDS);
  expect([kindsHead1, kindsTail1]).toEqual([kindsHead, kindsTail]);
  expect(namesIn(kinds1)).toEqual([...namesIn(kinds), KIND]);

  /* registry.ts: the kind's import among the fields' in their order, EFFECTS with it last, and the rest as it was */
  const TABLE = /const EFFECTS[^=]*= \{/;
  const [head, effects, tail] = cut(before(KIT_ADD_PATHS.registry), TABLE);
  const [head1, effects1, tail1] = cut(read(KIT_ADD_PATHS.registry), TABLE);
  expect(lineDiff(head, head1)).toEqual({
    removed: [],
    added: [`import ${KIND} from "./fields/${KIND}.ts";`]
  });
  const imports = head1.match(/^import \w+ from "\.\/fields\/\w+\.ts";$/gm)!;
  expect(imports).toEqual([...imports].sort());
  expect(namesIn(effects1)).toEqual([...namesIn(effects), KIND]);
  expect(tail1).toBe(tail);

  /* names.ts: each table with the kind's message last, and the rest as it was */
  const names = tables(before(KIT_ADD_PATHS.names));
  expect(tables(read(KIT_ADD_PATHS.names))).toEqual({
    around: names.around,
    labels: [...names.labels, [KIND, LABEL]],
    words: [...names.words, [KIND, WORDS]]
  });
  expect(read(KIT_ADD_PATHS.embed(KIND))).toBe(embedText(KIND, WORDS));

  /* a newer file for the kind now registered replaces its file alone, its names names.ts's */
  const others = [
    KIT_ADD_PATHS.kinds,
    KIT_ADD_PATHS.registry,
    KIT_ADD_PATHS.names,
    KIT_ADD_PATHS.embed(KIND)
  ];
  const kept = others.map(read);
  const newer = candidate(`${KIND}-newer`, text =>
    text.replace("designedSeed: 1000", "designedSeed: 1001")
  );
  expect(await kitAdd(newer, {}, root)).toEqual({
    kind: KIND,
    added: false,
    label: LABEL,
    words: WORDS,
    wrote: [KIT_ADD_PATHS.field(KIND)]
  });
  expect(others.map(read)).toEqual(kept);
  expect(lineDiff(demoAs(KIND), read(KIT_ADD_PATHS.field(KIND)))).toEqual({
    removed: ["  designedSeed: 1000,"],
    added: ["  designedSeed: 1001,"]
  });
});

test("it refuses, writing nothing: names that disagree, another effect's kind, an import from outside the engine, a missing about, a kernel kit:gen could not compile or past the budget, and a new kind whose files are there already", async () => {
  const files = [
    KIT_ADD_PATHS.kinds,
    KIT_ADD_PATHS.registry,
    KIT_ADD_PATHS.names,
    KIT_ADD_PATHS.field(KIND)
  ];
  const kept = files.map(read);
  await expect(kitAdd(candidate("named"), { label: "Kit add" }, root)).rejects.toThrow(
    `its label is said as "Kit add" and ${JSON.stringify(LABEL)}`
  );
  await expect(
    kitAdd(
      candidate("silk", text => text.replace(`kind: "${KIND}"`, 'kind: "silk"')),
      {},
      root
    )
  ).rejects.toThrow(/names another effect/);
  writeFileSync(join(root, "candidates", "helper.ts"), "export const SHEARS = 2;\n");
  await expect(
    kitAdd(
      candidate("helped", text =>
        text.replace("const SHEARS = 2;", 'import { SHEARS } from "./helper.ts";')
      ),
      {},
      root
    )
  ).rejects.toThrow(/it imports \.\/helper\.ts, outside the engine/);
  await expect(
    kitAdd(
      candidate("mute", text => text.replace(/\n {4}what:/, "\n    whit:")),
      {},
      root
    )
  ).rejects.toThrow(/its about lacks what/);
  /* a new kind whose kernel leaves the subset: refused at its own line, as kit-check's check 1 says it */
  const rounded = candidate("rounded", text => text.replace("Math.sin(s)", "Math.round(s)"), OTHER);
  const line = readFileSync(rounded, "utf8")
    .split("\n")
    .findIndex(l => l.includes("Math.round"));
  const at = rounded.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  await expect(kitAdd(rounded, {}, root)).rejects.toThrow(
    new RegExp(`^${at}:${line + 1}:\\d+: Math\\.round is not in the kernel subset`)
  );
  await expect(
    kitAdd(
      candidate("costly", text => text.replace("const WAVES = 5;", "const WAVES = 50;"), OTHER),
      {},
      root
    )
  ).rejects.toThrow(/its kernel costs 787, past the budget of 160/);
  /* a new kind named for one of the embed's own modules (wood grain): its entry would be written over grain.ts, which
     every effect's script imports */
  const grain = KIT_ADD_PATHS.embed("grain");
  mkdirSync(join(root, grain, ".."), { recursive: true });
  cpSync(join(REPO, grain), join(root, grain));
  await expect(
    kitAdd(
      candidate("grain", text => text, "grain"),
      {},
      root
    )
  ).rejects.toThrow(
    `its kind "grain" would write over ${grain}, which no field effect's name made`
  );
  expect(read(grain)).toBe(before(grain));
  /* none of them wrote a thing */
  expect(files.map(read)).toEqual(kept);
  for (const path of [
    KIT_ADD_PATHS.field(OTHER),
    KIT_ADD_PATHS.embed(OTHER),
    KIT_ADD_PATHS.field("grain")
  ])
    expect(existsSync(join(root, path)), path).toBe(false);
});
