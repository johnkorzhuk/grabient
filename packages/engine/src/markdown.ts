/* A palette as Markdown: what it is, its colors, the CSS that draws it, its keyframes, where it is held and every other
   form. The Worker serves it at the palette's address plus .md and the editor's MD tab shows the same text, so the
   two never part. What only the database knows is handed in: the words written for the palette that its colors bear
   out with the view it was saved in, and the public collections that hold it. Where the address plays an effect, the
   file says so: what plays and how, and the tags that play it behind a page in the CSS's place. A file for programs,
   always in English. */
import { decodePalette } from "./codec.ts";
import { oklchOf } from "./css.ts";
import { sampleStops } from "./curve.ts";
import { paletteJson } from "./document.ts";
import { type Effect, effectFileAddress } from "./effect.ts";
import { glassColors } from "./glass-colors.ts";
import { paletteDescription, paletteTitle, readingName, seedReading } from "./name.ts";
import type { Namer } from "./precise-names.ts";
import { toSpec } from "./spec.ts";
import { asSaved, styleWords, type View } from "./view.ts";

/** The words written for a palette that its colors bear out: its title, its description cut to MARKDOWN_LEAD, and the
    view it was saved in when they were written, the one view they describe. */
export interface PaletteWords {
  title: string;
  lead?: string;
  view: Pick<View, "style" | "steps" | "angle">;
}
/** How much of a written description the file gives: more than a page's own line has room for. */
export const MARKDOWN_LEAD = 400;

/** Text a title or description holds, made Markdown it cannot break out of: one line, its marks escaped. */
export const plain = (s: string) =>
  s
    .replace(/[\r\n]+/g, " ")
    .replace(/([\\`*_{}[\]<>|])/g, "\\$1")
    .trim();

/** How an effect is drawn and plays, as its address sets it. */
function effectDrawn(effect: Effect, angle: number): string {
  const { shape, frost, bg } = effect.look;
  const play =
    effect.speed === 0
      ? "held on its first frame"
      : `speed ${effect.speed}, up to ${effect.fps} frames a second`;
  return effect.kind === "glass"
    ? `fluted glass, its ribs at ${angle} degrees, shape ${shape ?? 0}, ${play}`
    : `a blob, the palette across it at ${angle} degrees${shape === null ? "" : `, shape ${shape}`}, frost ${frost}, ${bg ? `on ${bg}` : "on no ground"}, ${play}`;
}

export function paletteMarkdown(
  seed: string,
  origin: string,
  view: Partial<View>,
  written: PaletteWords | null,
  heldBy: readonly { slug: string; title: string }[],
  names?: Namer | null,
  effect?: Effect | null
): string | null {
  const P = decodePalette(seed);
  const doc = P && paletteJson(seed, origin, view, names, null, effect);
  const reading = doc && seedReading(seed, doc.style, doc.steps);
  if (!P || !doc || !reading) return null;
  const base = origin.replace(/\/$/, "");
  const stops = sampleStops(P, doc.steps);
  const plays = effect && doc.effect ? { ...doc.effect, effect } : null;
  /* drawn as it was saved, its written words name and describe it, and what its colors call it stays beside them for a
     reader or a program that looks for the colors; in any other view, an effect among them, its colors name it alone */
  const own = !plays && written && asSaved(P, doc, written.view) ? written : null;
  const name = readingName(reading);
  const called = plays
    ? `${name} ${plays.effect.kind === "glass" ? "fluted glass" : "blob"}`
    : paletteTitle(reading, doc.style);
  const title = own?.title ?? called;
  const lead = plays
    ? plays.effect.kind === "glass"
      ? `${name} played as fluted glass: its colors ${glassColors(P).join(", ")} drift behind ribbed glass. Two tags play it behind any page.`
      : `${name} played as a frosted blob: the palette's colors ${doc.colors.join(", ")} melt into one another as it drifts. Two tags play it behind any page.`
    : own?.lead || paletteDescription(reading, doc, doc.colors);
  const drawn = plays
    ? effectDrawn(plays.effect, doc.angle)
    : `${styleWords(doc.style)}, ${doc.steps} steps, ${doc.angle} degrees`;
  const code = plays
    ? `## Behind a page

In the page's head, the stylesheet paints the first frame in the page's first paint, and the script plays it from there with WebGL. Without WebGL, or for a reader who asks for less motion, the first frame stays.

\`\`\`html
${plays.html}
\`\`\``
    : `## CSS

\`\`\`css
${doc.css.hex}
${doc.css.oklch}
\`\`\``;
  /* an effect's own files where it has them: the palette's JSON naming it, its first frame, its moving SVG, its
     stylesheet and script, and its card */
  const files = plays
    ? {
        ...plays.links,
        json: effectFileAddress(base, seed, plays.effect, doc.angle, "json"),
        script: `- [Script](${plays.links.js})\n`
      }
    : { ...doc.links, page: doc.url, script: "" };
  const colors = stops.map((stop, i) => {
    const ink = doc.contrast.text[i] === "#ffffff" ? "white" : "black";
    return `| ${i + 1} | \`${stop.hex}\` | \`${oklchOf(stop)}\` | ${doc.names[i]} | ${ink}, ${doc.contrast.ratios[i]} to 1 |`;
  });
  const keyframes = toSpec(P).anchors.map((a, i) => `| ${i + 1} | ${a.l} | ${a.c} | ${a.h} |`);
  const held = heldBy.length
    ? `\n## In these collections\n\n${heldBy.map(c => `- [${plain(c.title)}](${base}/${c.slug})`).join("\n")}\n`
    : "";
  return `# ${plain(title)}

${plain(lead)}

${own ? `- Also called: ${plain(called)}\n` : ""}- Seed: \`${doc.seed}\`
- Page: ${files.page}
- Drawn as: ${drawn}
${doc.kinds.length ? `- Kinds: ${doc.kinds.join(", ")}\n` : ""}- Hues: ${doc.harmony}
- Contrast of its darkest and lightest colors: ${doc.contrast.ends} to 1

## Colors

The name most people give each color, and the text color that reads on it with its contrast.

| Stop | Hex | OKLCH | Name | Text on it |
| --- | --- | --- | --- | --- |
${colors.join("\n")}

${code}

## Keyframes

${keyframes.length} OKLCH keyframes joined by a Catmull-Rom spline. Hue is unwrapped degrees.

| Keyframe | Lightness | Chroma | Hue |
| --- | --- | --- | --- |
${keyframes.join("\n")}
${held}
## Other forms

- [JSON](${files.json})
- [PNG](${files.png})
- [SVG](${files.svg})
- [CSS](${files.css})
${files.script}- [ASE](${doc.links.ase})
- [GPL](${doc.links.gpl})
- [GRD](${doc.links.grd})
- [Design tokens](${doc.links.tokens})
- [Social card](${files.og})
- [Palettes like this one](${base}/palettes?q=${encodeURIComponent(doc.seed)})
- [Guide for agents](${base}/llms.txt)
`;
}
