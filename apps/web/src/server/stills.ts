/* What the effects' still writers share (glass-still.ts, blob-still.ts): the holders a page's markup names, and a
   style put at the head's end. A page names a still by an attribute on each element that shows it; the writers paint
   every name from the head, so the first paint has it and the browser's own render, which draws those elements again
   as the page starts, takes it as it stands. */

/** The most names a page's head paints: the cards of a first screen up to 2560 by 1440 and the header's swatch. A
    card past them is painted as the page reaches it, by the browser. */
export const FIRST_SCREEN_STILLS = 16;

/** Each name the holders of `attribute` give, once, in the order the page shows them. */
export function holderNames(html: string, attribute: string): string[] {
  const names = new Set<string>();
  for (const [, name] of html.matchAll(new RegExp(`\\s${attribute}="([^"]*)"`, "g")))
    names.add(name);
  return [...names];
}

/** The page with `style` at its head's end. */
export function intoHead(html: string, style: string): string {
  const head = html.indexOf("</head>");
  return head < 0 || !style ? html : html.slice(0, head) + style + html.slice(head);
}
