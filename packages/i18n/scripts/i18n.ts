/* The languages' messages: what the code says, what each language has, and what is missing.
     pnpm i18n extract                 rewrite messages/en.json from the code, keeping each message's note
     pnpm i18n check [--strict]        en.json against the code, and every translation against its English;
                                       --strict also fails on a missing translation
     pnpm i18n pending <tag> [--all]   what a language lacks, as JSON to translate
     pnpm i18n merge <tag> <file>      a translated JSON into the language's file, each translation checked
     pnpm i18n prune                   drop translations of messages the code no longer says
   A message is the English in t(), msg(), rich() or translate(). The English is the key, so a changed sentence is a new
   message. en.json is the master English: each message, where the code says it, and a note for the translator written
   by hand. */
import { type Dirent, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSync } from "vite";
import { messageShape, parseMessage } from "../src/format.ts";
import { DEFAULT_LOCALE, isLocale, LOCALES, type Locale } from "../src/locales.ts";

/** Where the product's words are: the app, the design system, the letters and the palette names. */
const SOURCES = ["apps/web/src", "packages/ui/src", "packages/email/src", "packages/engine/src"];
const MESSAGE_ARGUMENT: Record<string, number> = { t: 0, msg: 0, rich: 0, translate: 1 };
const FUNCTIONS = new Set([
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunctionExpression",
  "StaticBlock"
]);
const TRANSLATED = LOCALES.filter(l => l !== DEFAULT_LOCALE);

interface Node {
  type: string;
  start: number;
  [key: string]: unknown;
}
interface Entry {
  note?: string;
  refs: string[];
}
export interface Scan {
  /** each message (a context's as "context\u0004English") and where the code says it */
  messages: Map<string, string[]>;
  problems: string[];
}

const isNode = (value: unknown): value is Node =>
  typeof value === "object" && value !== null && typeof (value as Node).type === "string";

function children(node: Node): Node[] {
  const out: Node[] = [];
  for (const [key, value] of Object.entries(node)) {
    if (key === "type") continue;
    if (Array.isArray(value)) out.push(...value.filter(isNode));
    else if (isNode(value)) out.push(value);
  }
  return out;
}

const unwrap = (node: Node | undefined): Node | undefined =>
  node?.type === "ParenthesizedExpression" ? unwrap(node.expression as Node) : node;

function literal(node: Node | undefined): string | null {
  if (node?.type === "Literal" && typeof node.value === "string") return node.value;
  if (node?.type === "TemplateLiteral" && (node.expressions as Node[]).length === 0) {
    return (node.quasis as { value: { cooked: string } }[])[0].value.cooked;
  }
  return null;
}

const calleeName = (node: Node | undefined): string | undefined => {
  const callee = node?.type === "CallExpression" ? (node.callee as Node) : undefined;
  return callee?.type === "Identifier" ? (callee.name as string) : undefined;
};

/** The context a call names: msg("Saved", "order") or t(label, { $context: "order" }). */
function contextOf(name: string, argument: Node | undefined): string | null {
  if (name === "msg") return literal(argument);
  if (argument?.type !== "ObjectExpression") return null;
  for (const property of argument.properties as Node[]) {
    const key = property.key as Node | undefined;
    const keyName = key?.type === "Identifier" ? key.name : literal(key);
    if (property.type === "Property" && keyName === "$context")
      return literal(property.value as Node);
  }
  return null;
}

function sourceFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "node_modules") walk(full);
      } else if (/\.tsx?$/.test(entry.name) && !/\.(d|test)\.tsx?$/.test(entry.name)) {
        out.push(relative(root, full).split(sep).join("/"));
      }
    }
  };
  for (const dir of SOURCES) walk(join(root, dir));
  return out.sort();
}

/** Every message the code says, with where, and the mistakes a reader would meet. */
export function scan(root: string): Scan {
  const messages = new Map<string, string[]>();
  const problems: string[] = [];
  for (const file of sourceFiles(root)) {
    const text = readFileSync(join(root, file), "utf8");
    if (!/\b(t|msg|rich|translate)\(/.test(text)) continue;
    const { program, errors } = parseSync(file, text, {
      lang: file.endsWith(".tsx") ? "tsx" : "ts"
    });
    if (errors.length) problems.push(`${file} could not be read: ${errors[0].message}`);
    const lineStarts = [0];
    for (let i = text.indexOf("\n"); i >= 0; i = text.indexOf("\n", i + 1)) lineStarts.push(i + 1);
    const where = (node: Node) => {
      let line = lineStarts.findIndex(start => start > node.start);
      if (line < 0) line = lineStarts.length;
      return `${file}:${line}`;
    };
    const visit = (node: Node, inFunction: boolean) => {
      const name = calleeName(node);
      if (name !== undefined && name in MESSAGE_ARGUMENT) {
        const args = node.arguments as Node[];
        const english = literal(args[MESSAGE_ARGUMENT[name]]);
        if (english !== null) {
          const context = contextOf(name, args[MESSAGE_ARGUMENT[name] + 1]);
          const message = context ? `${context}\u0004${english}` : english;
          messages.set(message, [...(messages.get(message) ?? []), where(node)]);
          try {
            parseMessage(english);
          } catch (error) {
            problems.push(`${where(node)} a malformed message: ${(error as Error).message}`);
          }
          if (name !== "msg" && !inFunction) {
            problems.push(
              `${where(node)} ${name}() at a module's top level runs once, in English, for every request: name the message with msg() and translate it where it is read`
            );
          }
          if (/^\s|\s$/.test(english)) {
            problems.push(
              `${where(node)} a message with spaces at its edge: ${JSON.stringify(english)}`
            );
          }
        }
      }
      // Solid compiles a conditional at the root of a prop into a memo, which breaks when the prop is read outside
      // rendering (a ref, a handler): one t() of a msg() chosen inside, or a function call, never does.
      if (
        node.type === "JSXAttribute" &&
        (node.value as Node | null)?.type === "JSXExpressionContainer"
      ) {
        const value = unwrap((node.value as Node).expression as Node);
        const sides =
          value?.type === "ConditionalExpression"
            ? [value.consequent, value.alternate]
            : value?.type === "LogicalExpression" && value.operator !== "??"
              ? [value.left, value.right]
              : [];
        if (sides.some(side => ["t", "rich"].includes(calleeName(unwrap(side as Node)) ?? ""))) {
          const prop = String((node.name as Node).name);
          problems.push(
            `${where(node)} the prop ${prop} is a conditional around t(): write t(cond ? msg("A") : msg("B")), or call a function`
          );
        }
      }
      for (const child of children(node)) visit(child, inFunction || FUNCTIONS.has(node.type));
    };
    visit(program as unknown as Node, false);
  }
  return { messages, problems };
}

const english = (message: string) => message.slice(message.indexOf("\u0004") + 1);

/** What is wrong with a translation of `source` into `tag`: its values, tags and plural forms. */
export function compare(tag: Locale, source: string, text: string): string[] {
  let shape: ReturnType<typeof messageShape>;
  try {
    shape = messageShape(text);
  } catch (error) {
    return [`malformed: ${(error as Error).message}`];
  }
  let wanted: ReturnType<typeof messageShape>;
  try {
    wanted = messageShape(english(source));
  } catch {
    return [];
  }
  const errors: string[] = [];
  if (wanted.args.join() !== shape.args.join()) {
    errors.push(
      `values ${JSON.stringify(shape.args)} where the English has ${JSON.stringify(wanted.args)}`
    );
  }
  if (wanted.tags.join() !== shape.tags.join()) {
    errors.push(
      `tags ${JSON.stringify(shape.tags)} where the English has ${JSON.stringify(wanted.tags)}`
    );
  }
  const forms = new Intl.PluralRules(tag).resolvedOptions().pluralCategories;
  for (const plural of shape.plurals) {
    const missing = forms.filter(form => !plural.cases.includes(form));
    // exact cases and other write every count, whatever forms the language has
    const exactAndOther =
      plural.cases.some(c => c.startsWith("=")) &&
      plural.cases.every(c => c === "other" || c.startsWith("="));
    if (missing.length && !exactAndOther)
      errors.push(`the plural {${plural.name}} lacks ${missing.join(", ")} for ${tag}`);
  }
  // a language with one form may write a count without plural syntax
  if (wanted.plurals.some(p => p.cases.length > 1) && !shape.plurals.length && forms.length > 1) {
    errors.push("a plural in the English is not one here");
  }
  return errors;
}

/* the files */
type Json = Record<string, unknown>;
function readJson<T = Json>(file: string): T {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {} as T;
    throw new Error(`${file}: ${(error as Error).message}`);
  }
}
const writeJson = (file: string, value: Json) => {
  const sorted = Object.fromEntries(
    Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  );
  writeFileSync(file, `${JSON.stringify(sorted, null, 2)}\n`);
};

export function run(argv: string[], root: string, log = console.log): number {
  const messagesDir = join(root, "packages/i18n/messages");
  const localeFile = (tag: string) => join(messagesDir, `${tag}.json`);
  const source = () => readJson<Record<string, Entry>>(localeFile("en"));
  const [command = "check", ...args] = argv;
  const flag = (name: string) => args.includes(name);

  if (command === "extract") {
    const { messages, problems } = scan(root);
    const previous = source();
    const out: Record<string, Entry> = {};
    for (const [message, refs] of messages) {
      const note = previous[message]?.note;
      out[message] = { ...(note ? { note } : {}), refs: [...new Set(refs)].sort() };
    }
    writeJson(localeFile("en"), out as unknown as Json);
    const added = [...messages.keys()].filter(m => !(m in previous)).length;
    const removed = Object.keys(previous).filter(m => !messages.has(m)).length;
    const bare = Object.keys(out).filter(m => !out[m].note);
    log(`${messages.size} messages (${added} new, ${removed} gone)`);
    if (bare.length)
      log(
        `${bare.length} without a note in en.json: ${bare
          .slice(0, 5)
          .map(m => JSON.stringify(english(m)))
          .join(", ")}`
      );
    for (const problem of problems) log(`  ${problem}`);
    return problems.length ? 1 : 0;
  }

  if (command === "check") {
    const { messages, problems } = scan(root);
    const recorded = source();
    let failed = false;
    const stale =
      [...messages.keys()].filter(m => !(m in recorded)).length +
      Object.keys(recorded).filter(m => !messages.has(m)).length;
    if (stale) {
      log(`en.json is behind the code by ${stale} messages: run pnpm i18n extract`);
      failed = true;
    }
    for (const problem of problems) log(`  ${problem}`);
    if (problems.length) failed = true;
    const all = Object.keys(recorded);
    let missingTotal = 0;
    for (const tag of TRANSLATED) {
      const have = readJson<Record<string, string>>(localeFile(tag));
      const missing = all.filter(m => !have[m]).length;
      const unused = Object.keys(have).filter(m => !(m in recorded)).length;
      const errors = all.flatMap(m =>
        have[m] ? compare(tag, m, have[m]).map(e => `${JSON.stringify(m).slice(0, 90)}: ${e}`) : []
      );
      missingTotal += missing;
      log(
        `${tag.padEnd(8)} ${String(all.length - missing).padStart(5)}/${all.length}` +
          (missing ? `  ${missing} missing` : "") +
          (unused ? `  ${unused} unused` : "") +
          (errors.length ? `  ${errors.length} wrong` : "")
      );
      for (const error of errors.slice(0, 40)) log(`    ${error}`);
      if (errors.length) failed = true;
    }
    if (flag("--strict") && missingTotal) {
      log(`${missingTotal} translations missing`);
      failed = true;
    }
    return failed ? 1 : 0;
  }

  if (command === "pending") {
    const [tag] = args;
    if (!isLocale(tag) || tag === DEFAULT_LOCALE)
      throw new Error(`Name a language: ${TRANSLATED.join(", ")}`);
    const have = readJson<Record<string, string>>(localeFile(tag));
    const out: Json = {};
    for (const [message, entry] of Object.entries(source())) {
      if (!flag("--all") && have[message]) continue;
      out[message] = {
        ...(entry.note ? { note: entry.note } : {}),
        refs: entry.refs.slice(0, 3),
        ...(have[message] ? { current: have[message] } : {})
      };
    }
    log(JSON.stringify(out, null, 2));
    return 0;
  }

  if (command === "merge") {
    const [tag, file] = args;
    if (!isLocale(tag) || tag === DEFAULT_LOCALE || !file)
      throw new Error("merge <tag> <file.json>");
    const english = source();
    const have = readJson<Record<string, string>>(localeFile(tag));
    let merged = 0;
    let rejected = 0;
    for (const [message, value] of Object.entries(readJson(resolve(file)))) {
      const text =
        typeof value === "string" ? value : (value as { translation?: unknown })?.translation;
      if (typeof text !== "string" || !text.trim()) continue;
      const errors = message in english ? compare(tag, message, text) : ["not a message"];
      if (errors.length) {
        log(`  ${JSON.stringify(message).slice(0, 90)}: ${errors.join("; ")}`);
        rejected++;
      } else {
        have[message] = text;
        merged++;
      }
    }
    writeJson(localeFile(tag), have);
    log(`${tag}: ${merged} merged, ${rejected} rejected`);
    return rejected ? 1 : 0;
  }

  if (command === "prune") {
    const english = source();
    for (const tag of TRANSLATED) {
      const have = readJson<Record<string, string>>(localeFile(tag));
      const kept = Object.fromEntries(Object.entries(have).filter(([m]) => m in english));
      const dropped = Object.keys(have).length - Object.keys(kept).length;
      if (dropped) {
        writeJson(localeFile(tag), kept);
        log(`${tag}: ${dropped} dropped`);
      }
    }
    return 0;
  }

  log(
    `Unknown command ${command}: extract, check [--strict], pending <tag> [--all], merge <tag> <file>, prune`
  );
  return 2;
}

if (import.meta.main) {
  process.exitCode = run(
    process.argv.slice(2),
    fileURLToPath(new URL("../../../", import.meta.url))
  );
}
