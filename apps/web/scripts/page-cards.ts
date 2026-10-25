/* The share cards of the pages beside About in the side menu (Settings, Shortcuts, MCP, Contact), in About's frame
   (about-card.ts): a palette Random drew on the left, and on the right a pane holding what the page does, drawn as the
   site draws its controls, with the tokens' values. The panes carry keys, names, code, values and icons rather than
   sentences, so one picture serves every language. Each page's palette is a fixed seed's draw, and its colors light
   the pane: the key Random answers to, the palettes an app finds, the colors as Settings spells them, the press that
   sends. build-icons.ts draws each into public/{page}.png. */
import { readFile } from "node:fs/promises";
import { oklchOf } from "@grabient/engine/css.ts";
import { sampleStops } from "@grabient/engine/curve.ts";
import { ICONS, type IconName } from "@grabient/ui/icons.data.ts";
import { color, font, radius, size, space } from "@grabient/ui/tokens.ts";
import { type AboutDraw, aboutDraw, cardPage, seeded } from "./about-card.ts";

/** Each page's card: the file it is drawn into, and the seed of its palette's draw. */
export const PAGE_CARDS = {
  settings: { file: "settings.png", seed: 43 },
  bindings: { file: "bindings.png", seed: 54 },
  mcp: { file: "mcp-server.png", seed: 56 },
  contact: { file: "contact.png", seed: 40 }
} as const;
export type PageCard = keyof typeof PAGE_CARDS;

type Theme = "dark" | "light";
const icon = (name: IconName, px: number, width = 1.9) =>
  `<svg width="${px}" height="${px}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"><path d="${ICONS[name]}"/></svg>`;
/* the gradient through a palette's colors, left to right */
const ramp = (hexes: readonly string[]) => `linear-gradient(90deg, ${hexes.join(", ")})`;
/* black or white over a color, whichever reads */
const onColor = (hex: string) => {
  const v = Number.parseInt(hex.slice(1), 16);
  const lum = 0.2126 * ((v >> 16) & 255) + 0.7152 * ((v >> 8) & 255) + 0.0722 * (v & 255);
  return lum > 150 ? "#111114" : "#ffffff";
};

/* the controls every pane draws with, as the site's CSS draws them */
function controls(theme: Theme): string {
  const c = color[theme];
  return `.box{display:flex;flex-direction:column;justify-content:center;gap:${space.s4}px;color:${c.ink};font-family:Poppins,${font.sans}}
.mono{font-family:${font.mono}}
.field{display:flex;align-items:center;gap:${space.s2}px;height:40px;padding:0 ${space.s3}px;border:${size.hairline}px solid ${c.edge2};border-radius:${radius.control}px;background:${c.paper2};color:${c.ink2};font-weight:${font.medium};font-size:${font.fs3}px}
.field .grow{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.press{display:inline-flex;align-items:center;justify-content:center;gap:${space.s1}px;height:${size.controlSm + 4}px;padding:0 8px;border:${size.hairline}px solid ${c.edge2};border-radius:${radius.control}px;background:${c.paper2};color:${c.ink};font-weight:${font.bold};font-size:${font.fs2}px;white-space:nowrap}
.seg{display:flex;padding:3px;gap:3px;border:${size.hairline}px solid ${c.edge2};border-radius:${radius.control}px;background:${c.paper2}}
.seg>span{flex:1;display:flex;align-items:center;justify-content:center;height:${size.controlSm + 2}px;border-radius:${radius.tight + 1}px;color:${c.ink3};font-weight:${font.bold};font-size:${font.fs2}px}
.seg>span.on{background:${c.paper3};color:${c.ink};box-shadow:inset 0 0 0 1px ${c.edge2}}`;
}

/* Shortcuts: the editor's keys as caps, B lit in the palette it rolled */
function bindingsPane(hexes: readonly string[], theme: Theme) {
  const c = color[theme];
  const rows = [
    ["T", "U", "?"],
    ["B", "I", "E"],
    ["[", "]", "\\"],
    [",", ".", "Esc"]
  ];
  const cap = (k: string) =>
    `<span class="cap${k === "B" ? " lit" : ""}${k.length > 1 ? " wide" : ""}">${k === "\\" ? "&#92;" : k}</span>`;
  return {
    html: `<div class="keys">${rows.map(r => `<div class="row">${r.map(cap).join("")}</div>`).join("")}</div>`,
    css: `.keys{display:flex;flex-direction:column;align-items:center;gap:14px}
.row{display:flex;gap:14px}
.cap{display:flex;align-items:center;justify-content:center;width:64px;height:62px;border:${size.hairline}px solid ${c.edge2};border-radius:${radius.control}px;background:${c.paper2};box-shadow:0 4px 0 ${c.edge2};color:${c.ink};font-family:${font.mono};font-size:24px}
.cap.wide{font-size:18px}
.cap.lit{transform:translateY(3px);box-shadow:0 1px 0 ${c.edge2},0 0 28px ${hexes[Math.floor(hexes.length / 2)]}66;border-color:transparent;background:${ramp(hexes)};color:${onColor(hexes[Math.floor(hexes.length / 2)] ?? "#808080")}}`
  };
}

/* MCP: the address an app adds, the apps, and a search's answer: palettes */
function mcpPane(draw: AboutDraw, theme: Theme) {
  const c = color[theme];
  const more = [53, 41].map(seed => aboutDraw(seeded(seed)).palette);
  const strips = [draw.palette, ...more].map(p => ramp(sampleStops(p, 12).map(s => s.hex)));
  return {
    html: `<div class="field"><span class="grow mono">https://grabient.com/mcp</span>${icon("copy", 15)}</div>
<div class="apps"><span class="press">Claude</span><span class="press">ChatGPT</span><span class="press">Cursor</span><span class="press">VS Code</span></div>
<div class="call"><div class="tool mono">search_palettes</div>${strips.map(bg => `<div class="strip" style="background:${bg}"></div>`).join("")}</div>`,
    css: `.apps{display:flex;justify-content:space-between;gap:4px}
.call{display:flex;flex-direction:column;gap:${space.s2}px;padding:${space.s3}px;border:${size.hairline}px solid ${c.edge};border-radius:${radius.control}px;background:${c.paper}}
.tool{align-self:flex-start;padding:3px ${space.s2}px;border-radius:${radius.tight}px;background:${c.paper3};color:${c.ink2};font-size:${font.fs2}px}
.strip{height:30px;border-radius:${radius.tight}px;box-shadow:${c.rim}}`
  };
}

/* Settings: the theme and the color format as the page's segmented presses, and the palette spelled as OKLCH */
function settingsPane(draw: AboutDraw, theme: Theme) {
  const c = color[theme];
  const stops = sampleStops(draw.palette, 5);
  return {
    html: `<div class="seg"><span>${icon("sun", 16)}</span><span class="on">${icon("moon", 16)}</span><span>${icon("monitor", 16)}</span></div>
<div class="seg"><span class="on">OKLCH</span><span>HEX</span><span>RGB</span><span>HSL</span></div>
<div class="colors">${stops.map(s => `<div class="color"><span class="dot" style="background:${s.hex}"></span><span class="mono">${oklchOf(s)}</span></div>`).join("")}</div>`,
    css: `.colors{display:flex;flex-direction:column;gap:${space.s2}px;padding:${space.s3}px;border:${size.hairline}px solid ${c.edge};border-radius:${radius.control}px;background:${c.paper}}
.color{display:flex;align-items:center;gap:${space.s3}px;color:${c.ink2};font-size:${font.fs3}px}
.dot{width:22px;height:22px;border-radius:${radius.tight}px;box-shadow:${c.rim}}`
  };
}

/* Contact: a message on its way, its press in the palette, and the address to write to */
function contactPane(hexes: readonly string[], theme: Theme) {
  const c = color[theme];
  const line = (w: number) => `<span class="line" style="width:${w}%"></span>`;
  return {
    html: `<div class="field"><span class="grow placeholder">name@example.com</span></div>
<div class="message">${line(88)}${line(94)}${line(72)}${line(40)}<span class="caret"></span></div>
<div class="send"><span class="go">${icon("arrow", 18, 2.3)}</span></div>
<div class="field">${icon("mail", 16)}<span class="grow mono">hello@grabient.com</span>${icon("copy", 15)}</div>`,
    css: `.message{display:flex;flex-direction:column;gap:10px;height:118px;padding:${space.s4}px ${space.s3}px;border:${size.hairline}px solid ${c.edge2};border-radius:${radius.control}px;background:${c.paper2}}
.line{display:block;height:9px;border-radius:5px;background:${c.ink4}}
.caret{display:block;width:2px;height:16px;margin-top:-4px;background:${c.ink}}
.send{display:flex;justify-content:flex-end}
.placeholder{color:${c.ink3}}
.go{display:flex;align-items:center;justify-content:center;width:52px;height:40px;border-radius:${radius.control}px;background:${ramp(hexes)};color:${onColor(hexes[Math.floor(hexes.length / 2)] ?? "#808080")}}`
  };
}

/** A page's card as a page of the card's CSS size, Poppins inlined for the presses' names. */
export async function pageCardHtml(
  page: PageCard,
  theme: Theme = "dark",
  seed: number = PAGE_CARDS[page].seed
): Promise<string> {
  const draw = aboutDraw(seeded(seed));
  const hexes = sampleStops(draw.palette, 8).map(s => s.hex);
  const pane =
    page === "bindings"
      ? bindingsPane(hexes, theme)
      : page === "mcp"
        ? mcpPane(draw, theme)
        : page === "settings"
          ? settingsPane(draw, theme)
          : contactPane(hexes, theme);
  const face = async (weight: number) => {
    const file = await readFile(
      new URL(`../public/fonts/poppins-latin-${weight}-normal.woff2`, import.meta.url)
    );
    return `@font-face{font-family:Poppins;font-weight:${weight};src:url(data:font/woff2;base64,${file.toString("base64")}) format("woff2")}`;
  };
  const fonts = `${await face(font.medium)}\n${await face(font.bold)}`;
  return cardPage(
    draw,
    { html: pane.html, css: `${fonts}\n${controls(theme)}\n${pane.css}` },
    theme
  );
}
