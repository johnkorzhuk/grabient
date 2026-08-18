// LLM-authored markdown -> house HTML.
//
// `html: false` is the security boundary and it is not negotiable: raw HTML in
// the source is escaped to text, and markdown-it's own validateLink refuses
// every scheme outside http/https/mailto/relative — a `[x](javascript:…)`
// survives as literal text rather than as a link. That is why this worker does
// NOT need a sanitizer, which matters because DOMPurify cannot run here (no
// DOM) and there is no officially recommended DOM-free substitute.
//
// marked and micromark were both measured and rejected: each goes quadratic on
// unterminated link openers and needs >30s of CPU on a 256KB body (the cap
// reports.ts enforces). markdown-it does the same input in 86ms. Pinned to an
// exact version — treat a markdown-it bump as a security bump.

import MarkdownIt from "markdown-it";

export interface Heading {
  level: number;
  id: string;
  text: string;
}

const md = new MarkdownIt({ html: false, linkify: true, breaks: false, typographer: false });
const defaultFence = md.renderer.rules.fence?.bind(md.renderer);

/** Stable, unique, human-readable anchor targets — the TOC links to these. */
function slugifyHeading(text: string, seen: Set<string>): string {
  const base =
    text.toLowerCase().replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 60) ||
    "section";
  let slug = base;
  for (let n = 2; seen.has(slug); n++) slug = `${base}-${n}`;
  seen.add(slug);
  return slug;
}

export function renderMarkdown(source: string): { html: string; headings: Heading[] } {
  const headings: Heading[] = [];
  const seen = new Set<string>();

  // Renderer rules are assigned per render because they close over `headings`
  // — a module-level assignment collecting into module state would leak
  // between requests.
  const r = md.renderer.rules;
  r.heading_open = (tokens, i, opts, _env, self) => {
    const text = tokens[i + 1]?.content ?? "";
    const id = slugifyHeading(text, seen);
    const level = Number(tokens[i]!.tag.slice(1));
    if (level <= 3) headings.push({ level, id, text });
    tokens[i]!.attrSet("id", id);
    return self.renderToken(tokens, i, opts);
  };
  // Wide tables scroll inside the card instead of widening the page.
  r.table_open = () => `<div class="md-scroll"><table>`;
  r.table_close = () => `</table></div>`;
  r.link_open = (tokens, i, opts, _env, self) => {
    const href = String(tokens[i]!.attrGet("href") ?? "");
    // markdown-it permits protocol-relative //host; nothing in a report should
    // ever leave the site by an inherited scheme.
    if (href.startsWith("//")) tokens[i]!.attrSet("href", "");
    else if (/^https?:/i.test(href)) tokens[i]!.attrSet("rel", "noopener nofollow");
    return self.renderToken(tokens, i, opts);
  };
  if (defaultFence) r.fence = defaultFence;

  return { html: md.render(source), headings };
}
