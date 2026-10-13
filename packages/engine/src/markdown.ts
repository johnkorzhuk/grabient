/* A palette as Markdown: what it is, its colors, the CSS that draws it, its keyframes, where it is held and every other
   form. The Worker serves it at the palette's address plus .md and the editor's MD tab shows the same text, so the
   two never part. What only the database knows is handed in: the words written for the palette that its colors bear
   out, and the public collections that hold it. A file for programs, always in English. */
import { decodePalette } from "./codec.ts";
import { oklchOf } from "./css.ts";
import { sampleStops } from "./curve.ts";
import { paletteJson } from "./document.ts";
import { paletteDescription, paletteTitle, seedReading } from "./name.ts";
import { toSpec } from "./spec.ts";
import { styleWords, type View } from "./view.ts";

/** The words written for a palette that its colors bear out: its title, and its description cut to MARKDOWN_LEAD. */
export interface PaletteWords {
  title: string;
  lead?: string;
}
/** How much of a written description the file gives: more than a page's own line has room for. */
export const MARKDOWN_LEAD = 400;

/** Text a title or description holds, made Markdown it cannot break out of: one line, its marks escaped. */
export const plain = (s: string) =>
  s
    .replace(/[\r\n]+/g, " ")
    .replace(/([\\`*_{}[\]<>|])/g, "\\$1")
    .trim();

export function paletteMarkdown(
  seed: string,
  origin: string,
  view: Partial<View>,
  written: PaletteWords | null,
  heldBy: readonly { slug: string; title: string }[]
): string | null {
  const P = decodePalette(seed);
  const doc = P && paletteJson(seed, origin, view);
  const reading = doc && seedReading(seed, doc.style, doc.steps);
  if (!P || !doc || !reading) return null;
  const base = origin.replace(/\/$/, "");
  const stops = sampleStops(P, doc.steps);
  const title = written?.title ?? paletteTitle(reading, doc.style);
  const lead = written?.lead || paletteDescription(reading, doc, doc.colors);
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

- Seed: \`${doc.seed}\`
- Page: ${doc.url}
- Drawn as: ${styleWords(doc.style)}, ${doc.steps} steps, ${doc.angle} degrees
${doc.kinds.length ? `- Kinds: ${doc.kinds.join(", ")}\n` : ""}- Hues: ${doc.harmony}
- Contrast of its darkest and lightest colors: ${doc.contrast.ends} to 1

## Colors

The name most people give each color, and the text color that reads on it with its contrast.

| Stop | Hex | OKLCH | Name | Text on it |
| --- | --- | --- | --- | --- |
${colors.join("\n")}

## CSS

\`\`\`css
${doc.css.hex}
${doc.css.oklch}
\`\`\`

## Keyframes

${keyframes.length} OKLCH keyframes joined by a Catmull-Rom spline. Hue is unwrapped degrees.

| Keyframe | Lightness | Chroma | Hue |
| --- | --- | --- | --- |
${keyframes.join("\n")}
${held}
## Other forms

- [JSON](${doc.links.json})
- [PNG](${doc.links.png})
- [SVG](${doc.links.svg})
- [CSS](${doc.links.css})
- [ASE](${doc.links.ase})
- [GPL](${doc.links.gpl})
- [GRD](${doc.links.grd})
- [Design tokens](${doc.links.tokens})
- [Social card](${doc.links.og})
- [Palettes like this one](${base}/palettes?q=${encodeURIComponent(doc.seed)})
- [Guide for agents](${base}/llms.txt)
`;
}
