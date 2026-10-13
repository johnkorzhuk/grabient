/* The words the design system draws itself (Copy, Skip to content, a key's name) are messages of the site's catalog,
   keyed by their English, and every component takes them from this module alone. Here they are the English, formatted
   as English: the names and signatures are the translation runtime's (t, msg, formatNumber), so pointing this module
   at it changes no component. */

export type Params = Readonly<Record<string, string | number | undefined>>;

/** A number as the reader writes it. */
export const formatNumber = (value: number, options?: Intl.NumberFormatOptions): string =>
  new Intl.NumberFormat("en", options).format(value);

/** A message named where no reader is yet (a key map's row), translated later with t(). */
export const msg = (message: string, _context?: string): string => message;

const FORM = /(=\d+|zero|one|two|few|many|other)\s*\{([^{}]*)\}/g;
const ARGUMENT = /\{(\w+), plural,((?:\s*(?:=\d+|\w+)\s*\{[^{}]*\})+)\s*\}|\{(\w+)\}/g;

/** The message in the reader's language with its values in: `t("Grabient, {label}", { label })`, and a plural's
    forms (`{count, plural, one {# star} other {# stars}}`). `$context` tells two messages of the same English apart. */
export function t(message: string, params: Params = {}): string {
  return message.replace(ARGUMENT, (whole, name?: string, forms?: string, value?: string) => {
    if (value) return params[value] === undefined ? whole : String(params[value]);
    const n = Number(params[name ?? ""]);
    const form = new Map([...(forms ?? "").matchAll(FORM)].map(m => [m[1], m[2]]));
    const text =
      form.get(`=${n}`) ?? form.get(n === 1 ? "one" : "other") ?? form.get("other") ?? "";
    return text.replace(/#/g, formatNumber(n));
  });
}
