/* Markup as strings. Mail apps a decade apart read an email, and Outlook on Windows lays it out with Word, so an email
   is tables, attributes and inline styles. Text is escaped where it is written, never by the caller; only `raw` lets
   markup through. */

export interface Html {
  readonly html: string;
}
export type Child = Html | string | number | false | null | undefined | readonly Child[];
/** Declarations by their CSS names. An empty value leaves its declaration out. */
export type Style = Readonly<Record<string, string | number | false | null | undefined>>;
export type Attrs = Readonly<Record<string, string | number | boolean | null | undefined | Style>>;

/** Numeric references: the sign-in suites read an emailed link back from this form. */
export const escapeHtml = (text: string): string =>
  text.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
export const raw = (html: string): Html => ({ html });

const VOID = new Set(["br", "img", "meta", "source"]);

const css = (style: Style): string =>
  Object.entries(style)
    .filter(([, value]) => value !== false && value != null && value !== "")
    .map(([name, value]) => `${name}:${value}`)
    .join(";");

function write(child: Child): string {
  if (child === false || child == null) return "";
  if (typeof child === "string") return escapeHtml(child);
  if (typeof child === "number") return String(child);
  if ("html" in child) return child.html;
  return child.map(write).join("");
}

/** One element. A string child is text; an object attribute is a style, left out when it declares nothing. */
export function h(tag: string, attrs: Attrs | null, ...children: Child[]): Html {
  let open = tag;
  for (const [name, value] of Object.entries(attrs ?? {})) {
    if (value === false || value == null) continue;
    if (value === true) open += ` ${name}`;
    else if (typeof value !== "object") open += ` ${name}="${escapeHtml(String(value))}"`;
    else if (css(value)) open += ` ${name}="${escapeHtml(css(value))}"`;
  }
  return raw(VOID.has(tag) ? `<${open}>` : `<${open}>${write(children)}</${tag}>`);
}

export const join = (...children: Child[]): Html => raw(write(children));

/** A table that lays out and holds no data: every table in an email. */
export const table = (attrs: Attrs | null, ...rows: Child[]): Html =>
  h(
    "table",
    { role: "presentation", border: 0, cellpadding: 0, cellspacing: 0, ...attrs },
    ...rows
  );
export const tr = (...cells: Child[]): Html => h("tr", null, ...cells);

/** For Outlook on Windows alone. */
export const mso = (...children: Child[]): Html =>
  raw(`<!--[if mso]>${write(children)}<![endif]-->`);
/** For every app but that Outlook. */
export const notMso = (...children: Child[]): Html =>
  raw(`<!--[if !mso]><!-->${write(children)}<!--<![endif]-->`);
