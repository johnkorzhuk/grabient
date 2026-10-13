import { LOCALE_INFO, type Locale } from "./locales.ts";

/* Messages in a subset of ICU MessageFormat:
     {name}                                  a value; a number is written the reader's way (1,234 or 1.234)
     {n, number}  {n, number, percent}       a number in a style (percent, integer)
     {count, plural, =0 {…} one {# palette} other {# palettes}}
                                             the language picks the form; =N matches first; # is the count
     {n, selectordinal, one {#st} … other {#th}}
     {kind, select, mine {…} other {…}}      a choice by value
     <link>words</link>  <br/>               a part the page draws itself (rich); as text, a tag keeps its words
   An apostrophe before a brace, a < or a plural's # quotes up to the next apostrophe, and two are one apostrophe; any
   other apostrophe is literal, so "don't" needs nothing. */

export type Params = Readonly<Record<string, string | number | null | undefined>>;
/** How the page draws each tag: it gets the tag's words, already formatted. */
export type RichTags<T> = Readonly<Record<string, (children: (string | T)[]) => T>>;

type Part = string | Arg | Tag | Count;
interface Arg {
  kind: "arg";
  name: string;
  type?: string;
  style?: string;
  cases?: Record<string, Part[]>;
}
interface Tag {
  kind: "tag";
  name: string;
  children: Part[] | null;
}
interface Count {
  kind: "count";
}

const CHOICES = new Set(["plural", "selectordinal", "select"]);
const OPEN_TAG = /^<([A-Za-z][\w-]*)\s*(\/?)>/;
const CLOSE_TAG = /^<\/([A-Za-z][\w-]*)\s*>/;

/** The message as parts. Throws a SyntaxError naming the place when it is malformed. */
export function parseMessage(message: string): Part[] {
  let i = 0;
  const fail = (why: string): never => {
    throw new SyntaxError(`${why} at ${i} in ${JSON.stringify(message)}`);
  };
  const skipSpace = () => {
    while (i < message.length && /\s/.test(message[i])) i++;
  };
  const word = (): string => {
    const found = /^[^\s{},]+/.exec(message.slice(i))?.[0] ?? fail("Expected a name");
    i += found.length;
    return found;
  };

  function parts(inPlural: boolean, end: string | null): Part[] {
    const out: Part[] = [];
    let text = "";
    const flush = () => {
      if (text) out.push(text);
      text = "";
    };
    while (i < message.length) {
      const c = message[i];
      const next = message[i + 1];
      if (c === "'" && next === "'") {
        text += "'";
        i += 2;
      } else if (
        c === "'" &&
        (next === "{" || next === "}" || next === "<" || (inPlural && next === "#"))
      ) {
        i++;
        while (i < message.length) {
          if (message[i] !== "'") text += message[i++];
          else if (message[i + 1] === "'") {
            text += "'";
            i += 2;
          } else {
            i++;
            break;
          }
        }
      } else if (c === "{") {
        flush();
        i++;
        out.push(argument(inPlural));
      } else if (c === "}") {
        if (end !== "}") fail("Unexpected }");
        flush();
        i++;
        return out;
      } else if (c === "#" && inPlural) {
        flush();
        out.push({ kind: "count" });
        i++;
      } else if (c === "<" && CLOSE_TAG.test(message.slice(i))) {
        const [closing, name] = CLOSE_TAG.exec(message.slice(i))!;
        if (end !== name) fail(`Unexpected </${name}>`);
        flush();
        i += closing.length;
        return out;
      } else if (c === "<" && OPEN_TAG.test(message.slice(i))) {
        const [opening, name, selfClosing] = OPEN_TAG.exec(message.slice(i))!;
        flush();
        i += opening.length;
        out.push({ kind: "tag", name, children: selfClosing ? null : parts(inPlural, name) });
      } else {
        text += c;
        i++;
      }
    }
    if (end !== null) fail(end === "}" ? "Missing }" : `Missing </${end}>`);
    flush();
    return out;
  }

  function argument(inPlural: boolean): Arg {
    skipSpace();
    const name = word();
    skipSpace();
    if (message[i] === "}") {
      i++;
      return { kind: "arg", name };
    }
    if (message[i] !== ",") fail("Expected , or }");
    i++;
    skipSpace();
    const type = word();
    skipSpace();
    if (message[i] === "}") {
      i++;
      return { kind: "arg", name, type };
    }
    if (message[i] !== ",") fail("Expected , or }");
    i++;
    skipSpace();
    if (!CHOICES.has(type)) {
      const close = message.indexOf("}", i);
      if (close < 0) {
        i = message.length;
        fail("Missing }");
      }
      const style = message.slice(i, close).trim();
      i = close + 1;
      return { kind: "arg", name, type, style };
    }
    const cases: Record<string, Part[]> = {};
    while (i < message.length && message[i] !== "}") {
      const key = word();
      skipSpace();
      if (message[i] !== "{") fail("Expected { after a case");
      i++;
      // a select's cases keep the plural around it, so its # is still that count
      cases[key] = parts(type === "select" ? inPlural : true, "}");
      skipSpace();
    }
    if (message[i] !== "}") fail("Missing } after the cases");
    i++;
    if (!("other" in cases)) fail("A plural or select needs an other case");
    return { kind: "arg", name, type, cases };
  }

  return parts(false, null);
}

/** Western digits in every language: numbers sit beside hex codes, CSS and inputs written that way. */
export const intlTag = (locale: Locale) => `${locale}-u-nu-latn`;

const numberFormats = new Map<string, Intl.NumberFormat>();
export function numberFormat(
  locale: Locale,
  options?: Intl.NumberFormatOptions
): Intl.NumberFormat {
  const key = options ? `${locale}|${JSON.stringify(options)}` : locale;
  let format = numberFormats.get(key);
  if (!format) {
    format = new Intl.NumberFormat(intlTag(locale), options);
    numberFormats.set(key, format);
  }
  return format;
}

const pluralRules = new Map<string, Intl.PluralRules>();
function pluralRule(locale: Locale, type: Intl.PluralRuleType): Intl.PluralRules {
  const key = `${locale}|${type}`;
  let rules = pluralRules.get(key);
  if (!rules) {
    rules = new Intl.PluralRules(intlTag(locale), { type });
    pluralRules.set(key, rules);
  }
  return rules;
}

const STYLES: Record<string, Intl.NumberFormatOptions> = {
  percent: { style: "percent" },
  integer: { maximumFractionDigits: 0 }
};

/* A message the format cannot read is shown as it is: a server's sentence or a reader's words can reach t(), and
   translating must never be what breaks a page. */
const parsedMessages = new Map<string, Part[]>();
function parsed(message: string): Part[] {
  let parts = parsedMessages.get(message);
  if (!parts) {
    try {
      parts = parseMessage(message);
    } catch {
      parts = [message];
    }
    if (parsedMessages.size < 4000) parsedMessages.set(message, parts);
  }
  return parts;
}

/* In a right-to-left language each value set into a sentence is isolated (FSI … PDI), so it keeps its own direction:
   without it "#ff00aa" after a Persian word reads "ff00aa#" and 1920 × 1080 reads 1080 × 1920. A plural's own count
   needs none, and no translator ever reorders a value to make it display. */
const isolated = (text: string, locale: Locale) =>
  text && LOCALE_INFO[locale].dir === "rtl" ? `⁨${text}⁩` : text;

function push<T>(out: (string | T)[], item: string | T) {
  if (typeof item !== "string") out.push(item);
  else if (item && typeof out[out.length - 1] === "string") out[out.length - 1] += item;
  else if (item) out.push(item);
}

function render<T>(
  parts: readonly Part[],
  params: Params | undefined,
  locale: Locale,
  tags: RichTags<T> | undefined,
  count: number | undefined,
  out: (string | T)[]
) {
  for (const part of parts) {
    if (typeof part === "string") push(out, part);
    else if (part.kind === "count") {
      push(out, count === undefined ? "#" : numberFormat(locale).format(count));
    } else if (part.kind === "tag") {
      const children: (string | T)[] = [];
      if (part.children) render(part.children, params, locale, tags, count, children);
      const draw = tags?.[part.name];
      if (draw) out.push(draw(children));
      else for (const child of children) push(out, child);
    } else {
      const value = params?.[part.name];
      if (part.cases && part.type === "select") {
        const chosen = part.cases[value == null ? "other" : String(value)] ?? part.cases.other;
        render(chosen, params, locale, tags, count, out);
      } else if (part.cases) {
        const n = Number(value);
        const type = part.type === "selectordinal" ? "ordinal" : "cardinal";
        const key = `=${n}` in part.cases ? `=${n}` : pluralRule(locale, type).select(n);
        render(part.cases[key] ?? part.cases.other, params, locale, tags, n, out);
      } else if (part.type === "number" && typeof value === "number") {
        const style = part.style ? STYLES[part.style] : undefined;
        push(out, isolated(numberFormat(locale, style).format(value), locale));
      } else {
        const text =
          value == null
            ? ""
            : typeof value === "number"
              ? numberFormat(locale).format(value)
              : String(value);
        push(out, isolated(text, locale));
      }
    }
  }
}

const plain = (message: string) => !/[{<']/.test(message);

/** The message with its values in, as text. A tag keeps only its words. */
export function formatMessage(message: string, params: Params | undefined, locale: Locale): string {
  if (plain(message)) return message;
  const out: string[] = [];
  render<string>(parsed(message), params, locale, undefined, undefined, out);
  return out.join("");
}

/** The message with its values in and each tag drawn by the page: text and the page's parts, in order. */
export function formatRich<T>(
  message: string,
  params: Params | undefined,
  locale: Locale,
  tags: RichTags<T>
): (string | T)[] {
  if (plain(message)) return [message];
  const out: (string | T)[] = [];
  render(parsed(message), params, locale, tags, undefined, out);
  return out;
}

export interface MessageShape {
  args: string[];
  tags: string[];
  plurals: { name: string; cases: string[] }[];
}

/** What a message asks for: its values, its tags, and the forms its plurals offer. The check compares each
    translation's shape with its source's. Throws when the message is malformed. */
export function messageShape(message: string): MessageShape {
  const args = new Set<string>();
  const tags = new Set<string>();
  const plurals: MessageShape["plurals"] = [];
  const walk = (parts: readonly Part[]) => {
    for (const part of parts) {
      if (typeof part === "string" || part.kind === "count") continue;
      if (part.kind === "tag") {
        tags.add(part.name);
        if (part.children) walk(part.children);
        continue;
      }
      args.add(part.name);
      if (!part.cases) continue;
      if (part.type !== "select") plurals.push({ name: part.name, cases: Object.keys(part.cases) });
      for (const chosen of Object.values(part.cases)) walk(chosen);
    }
  };
  walk(parseMessage(message));
  return { args: [...args].sort(), tags: [...tags].sort(), plurals };
}
