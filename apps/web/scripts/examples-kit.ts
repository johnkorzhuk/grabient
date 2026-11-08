/* `pnpm --filter web examples:kit`: each field effect's example page, public/examples/background-<kind>.html, whose
   own background plays the effect from the two tags in its head. Each is written from the strings' page
   (background-strings.html), as the zen garden's and the sandstone's first were (8 Nov 2026): the still and the grain
   as the Worker's stylesheet paints them (effect-code.ts effectStill and effectLayers, effect-embed.ts
   effectLayerCss), the script's tag, the heading and its lead, the snippet with the pictures' data cut short, the
   stylesheet's and the palette's links, and the text in white or near black, whichever reads better on every color
   the picture lays (kit/colors.ts). Then every example page's footer links every other, by its heading's words, in
   EFFECTS' order. A new field effect is one entry in PAGE_OF, which holds one for every kind of the kit's (KitKind),
   so `pnpm typecheck` names a kind with none; a changed still is a run.

     pnpm --filter web examples:kit
     pnpm --filter web examples:kit out=<dir>     (the pages written to another folder, to compare)
*/
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import { decodePalette } from "@grabient/engine/codec.ts";
import { contrast } from "@grabient/engine/contrast.ts";
import { EFFECTS, type EffectKind, parseEffect } from "@grabient/engine/effect.ts";
import { effectLayers, effectStill } from "@grabient/engine/effect-code.ts";
import { effectLayerCss } from "@grabient/engine/effect-embed.ts";
import { grainPng } from "@grabient/engine/grain.ts";
import { kitColors } from "@grabient/engine/kit/colors.ts";
import { KIT_KINDS, type KitKind } from "@grabient/engine/kit/kinds.ts";

/** A field effect's page: the palette it plays (picked by looking at the effect in it), the query after its style
    (its tags', its links'), its tab's title, its heading, "This page sits on " and the effect's words with their
    article and a full stop ("This page sits on a zen garden.", "This page sits on sandstone."), whose words name it
    in every page's footer (nameOf), and the paragraph under it. */
interface KitPage {
  kind: KitKind;
  seed: string;
  query: string;
  title: string;
  h1: string;
  lead: string;
}

/* every field effect's page, by its kind: one for each, or the type says which is missing */
const PAGE_OF: Readonly<Record<KitKind, Omit<KitPage, "kind">>> = {
  zen: {
    seed: "kYNh-6rw818GUvVJB75wwtTjQcvy",
    query: "grain=20",
    title: "Zen garden background",
    h1: "This page sits on a zen garden.",
    lead: "The background is a Grabient palette playing as a zen garden, sand raked in its colors round a group of stones, the rings round them swelling and drawing back while the raked lines drift slowly, with film grain over it. Two tags in the head put it there."
  },
  strata: {
    seed: "kW4j4y3y-8Uy2O-9obqrBo6I",
    query: "grain=20",
    title: "Sandstone background",
    h1: "This page sits on sandstone.",
    lead: "The background is a Grabient palette playing as sandstone, its colors laid down as a canyon wall's strata swept round two swirls that drift and reshape the sweep, with film grain over it. Two tags in the head put it there."
  }
};
/* in the kit's order, each kind's page found, the type aside (a run from a tree whose kinds outran its types) */
const PAGES: readonly KitPage[] = KIT_KINDS.map(kind => {
  const page = PAGE_OF[kind];
  if (!page)
    throw new Error(
      `the ${kind} has no example page: write its entry in PAGE_OF (apps/web/scripts/examples-kit.ts)`
    );
  return { kind, ...page };
});

const EXAMPLES = fileURLToPath(new URL("../public/examples/", import.meta.url));
/** An effect's page: the glass's is the first, background.html. */
const pageOf = (kind: EffectKind) =>
  kind === "glass" ? "background.html" : `background-${kind}.html`;
const esc = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** A text with the first match of `from` replaced, which must be there, by text as written or by what the match's
    groups make. */
function swap(
  html: string,
  from: RegExp | string,
  to: string | ((...groups: string[]) => string),
  page: string
): string {
  let found = false;
  const out = html.replace(from, (...match: string[]) => {
    found = true;
    return typeof to === "string" ? to : to(...match.slice(1));
  });
  if (!found) throw new Error(`${page}: no ${from} to replace`);
  return out;
}

/** A field effect's page from the strings' page. */
async function kitPage(template: string, page: KitPage): Promise<string> {
  const { kind, seed, title, h1, lead } = page;
  const file = pageOf(kind);
  const P = decodePalette(seed);
  const q = `style=${kind}&${page.query}`;
  const params = new URLSearchParams(q);
  const effect = parseEffect(params);
  if (!P || !effect) throw new Error(`${file}: no palette ${seed} or no effect in ${q}`);
  const angle = Number(params.get("angle") ?? 90);
  const finish = {
    soft: Number(params.get("soft")) || undefined,
    grain: Number(params.get("grain")) || undefined
  };
  const png = finish.grain ? await grainPng(finish.grain, bytes => deflateSync(bytes)) : null;
  const grain = png && `url("data:image/png;base64,${Buffer.from(png).toString("base64")}")`;
  const css = effectLayerCss(
    effectStill(P, effect, angle),
    effectLayers(P, effect, angle, finish, grain)
  );
  /* the ink that reads better on every color the picture lays */
  const colors = kitColors(kind, P);
  const worst = (ink: string) => Math.min(...colors.map(c => contrast(ink, c)));
  const dark = worst("#ffffff") >= worst("#17171b");
  console.log(
    `${file}: ${dark ? "white" : "near black"} text, contrast ${Math.max(worst("#ffffff"), worst("#17171b")).toFixed(2)} at worst; its style ${(css.length / 1024).toFixed(1)} KiB`
  );
  const shown = css
    .replace(/url\("data:image\/svg\+xml,[^"]*"\)/, 'url("data:image/svg+xml,%3Csvg xmlns…")')
    .replace(/url\("data:image\/png;base64,[^"]*"\)/, 'url("data:image/png;base64,iVBORw0K…")');
  const tags = `<style>\n${shown}\n</style>\n<script src="https://staging.grabient.com/${seed}.js?${q.replace(/&/g, "&amp;")}" async></script>`;
  let html = template;
  const to = (from: RegExp | string, text: string | ((...groups: string[]) => string)) => {
    html = swap(html, from, text, file);
  };
  to(/<title>[^<]*<\/title>/, `<title>${title}</title>`);
  to(
    /<style id="grabient-still">[\s\S]*?<\/style>/,
    `<style id="grabient-still">\n${css}\n</style>`
  );
  to(
    /<script id="grabient-script" src="[^"]*" async><\/script>/,
    `<script id="grabient-script" src="/${seed}.js?${esc(q)}" async></script>`
  );
  if (!dark) {
    to(":root { color-scheme: dark; }", ":root { color-scheme: light; }");
    to("    color: #fff;\n  }\n  main", "    color: #17171b;\n  }\n  main");
    /* the snippet's box stays dark: its words their own light, never the page's dark ink */
    to("    background: #0d0d10;\n", "    background: #0d0d10;\n    color: #f4f4f6;\n");
  }
  to(/<h1>[^<]*<\/h1>/, `<h1>${h1}</h1>`);
  to(/(<h1>[^<]*<\/h1>\n {2}<p>)[^<]*(<\/p>)/, (open, close) => `${open}${lead}${close}`);
  to(/<pre><code>[\s\S]*?<\/code><\/pre>/, `<pre><code>${esc(tags)}</code></pre>`);
  to(
    "a plain SVG of the threads, each a stroked path.",
    "a plain SVG of the field's levels, each a filled path."
  );
  to(
    /<code>&lt;link rel="stylesheet" href="https:\/\/staging\.grabient\.com\/[^"]*"&gt;<\/code>/,
    `<code>&lt;link rel="stylesheet" href="https://staging.grabient.com/${seed}.css?${esc(q.replace(/&/g, "&amp;"))}"&gt;</code>`
  );
  to(
    /<a href="\/[^"]*">Open the palette<\/a>/,
    `<a href="/${seed}?${esc(q)}">Open the palette</a>`
  );
  return html;
}

/** The words a page's heading names its effect by, as its footer's link to it says them: "A zen garden". */
function nameOf(html: string, file: string): string {
  const said = /<h1>This page sits on ([^<]+)\.<\/h1>/.exec(html)?.[1];
  if (!said) throw new Error(`${file}: no heading "This page sits on …."`);
  return said[0].toUpperCase() + said.slice(1);
}

/** Every example page's footer: a link to every other page, then its palette's. */
function withFooter(
  html: string,
  file: string,
  pages: readonly (readonly [string, string])[]
): string {
  const links = pages
    .filter(([other]) => other !== file)
    .map(([other, name]) => `<a href="${other}">${name}</a>`);
  return swap(
    html,
    /^ {2}<p>(?:<a href="background[^"]*\.html">[^<]*<\/a> · )*(<a href="\/[^"]*">Open the palette<\/a>)<\/p>$/m,
    open => `  <p>${links.join(" · ")} · ${open}</p>`,
    file
  );
}

if (import.meta.main) {
  const asked = process.argv.slice(2).find(a => a.startsWith("out="));
  const out = asked ? resolve(process.env.INIT_CWD ?? process.cwd(), asked.slice(4)) : EXAMPLES;
  const template = readFileSync(join(EXAMPLES, "background-strings.html"), "utf8");
  const pages = new Map<string, string>();
  for (const page of PAGES) pages.set(pageOf(page.kind), await kitPage(template, page));
  /* every effect's page there is, in EFFECTS' order */
  const files = EFFECTS.map(pageOf).filter(
    file => pages.has(file) || existsSync(join(EXAMPLES, file))
  );
  for (const file of files)
    if (!pages.has(file)) pages.set(file, readFileSync(join(EXAMPLES, file), "utf8"));
  const named = files.map(file => [file, nameOf(pages.get(file)!, file)] as const);
  mkdirSync(out, { recursive: true });
  for (const file of files) {
    const html = withFooter(pages.get(file)!, file, named);
    const path = join(out, file);
    const was = existsSync(path) ? readFileSync(path, "utf8") : null;
    if (html === was) continue;
    writeFileSync(path, html);
    console.log(`wrote ${path}`);
  }
}
