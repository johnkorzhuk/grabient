/* The pictures the site serves as files, drawn by the code the Worker and the tabs draw with, so no file drifts from
   what the site draws:
   - public/grabient.png, the site's card: the default palette's share card, which stands in for any card that cannot
     be drawn and is every page's card that names none of its own;
   - public/email/head-sheet.png and head-letter.png, the heads of the emails that wear no palette;
   - favicon.svg and favicon-dark.svg, the mark in the brand's gradient (also the design document's);
   - the icons a browser takes as raster files, drawn from the mark by Chromium: favicon.ico, the bar alone in the light
     scheme's colors, for Safari, Google Search and tabs of a file that names no icon; favicon-tile.ico and its PNGs,
     the bar on a rounded tile of the dark ground (the design document shows it); and a home screen's full squares;
   - public/about-1.png on, About's cards, one a day: a palette Random draws, in a view drawn at random, beside the
     Color space pane's scene of it (about-card.ts), by Chromium, from fixed seeds, and each logged;
   - public/settings.png, bindings.png, mcp-server.png and contact.png, the cards of the pages beside About in the side
     menu: a palette Random drew beside what the page does (page-cards.ts), by Chromium.
   Run it by hand when what a card draws changes (with a new CARD_VERSION), or the brand's gradient, the mark, or what
   the color space or its pane draws: node apps/web/scripts/build-icons.ts */
import { writeFile } from "node:fs/promises";
import { decodePalette, encodePalette } from "@grabient/engine/codec.ts";
import { drawnView } from "@grabient/engine/view.ts";
import { MARK_FIXED, markSvg, markTileSvg } from "@grabient/ui/mark.ts";
import { color } from "@grabient/ui/tokens.ts";
import { chromium } from "@playwright/test";
import { ABOUT_CARDS, DEFAULT_SEED } from "../src/lib/page-meta.ts";
import { emailHead } from "../src/server/images/cards.ts";
import { drawCard, keyframeColors, lookOf } from "../src/server/images/paint.ts";
import { ABOUT_CARD, ABOUT_SEEDS, aboutCardHtml, aboutDraw, seeded } from "./about-card.ts";
import { PAGE_CARDS, type PageCard, pageCardHtml } from "./page-cards.ts";

const web = new URL("../public/", import.meta.url);
const design = new URL("../../design/public/", import.meta.url);
const write = (data: string | Uint8Array, name: string, ...roots: URL[]) =>
  Promise.all(roots.map(root => writeFile(new URL(name, root), data)));

const site = decodePalette(DEFAULT_SEED);
if (!site) throw new Error(`${DEFAULT_SEED} is no palette`);
await write(
  await drawCard(lookOf(site, drawnView(site)), keyframeColors(site), 1200, 630),
  "grabient.png",
  web
);
await write(await emailHead(undefined, 800, 200), "email/head-sheet.png", web);
await write(await emailHead(undefined, 1200, 300), "email/head-letter.png", web);
const mark = `${markSvg(MARK_FIXED)}\n`;
await write(mark, "favicon.svg", web, design);
await write(mark, "favicon-dark.svg", web);

/* An .ico may hold PNGs as they are: a six-byte header, a sixteen-byte entry per picture, then the pictures. */
function ico(frames: readonly { size: number; png: Uint8Array }[]): Uint8Array {
  const head = new DataView(new ArrayBuffer(6 + 16 * frames.length));
  head.setUint16(2, 1, true);
  head.setUint16(4, frames.length, true);
  let at = head.byteLength;
  frames.forEach(({ size, png }, i) => {
    const entry = 6 + 16 * i;
    head.setUint8(entry, size);
    head.setUint8(entry + 1, size);
    head.setUint16(entry + 4, 1, true);
    head.setUint16(entry + 6, 32, true);
    head.setUint32(entry + 8, png.length, true);
    head.setUint32(entry + 12, at, true);
    at += png.length;
  });
  const file = new Uint8Array(at);
  file.set(new Uint8Array(head.buffer));
  let offset = head.byteLength;
  for (const { png } of frames) {
    file.set(png, offset);
    offset += png.length;
  }
  return file;
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const draw = async (svg: string, size: number) => {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<style>html,body{margin:0;background:transparent}img{display:block;width:${size}px;height:${size}px}</style><img src="data:image/svg+xml,${encodeURIComponent(svg)}">`
    );
    await page.waitForFunction(() => document.images[0]?.complete);
    return page.screenshot({
      omitBackground: true,
      clip: { x: 0, y: 0, width: size, height: size }
    });
  };
  const square = markTileSvg(color.dark.bg, MARK_FIXED, "square");
  for (const [name, size] of [
    ["apple-touch-icon.png", 180],
    ["icon-192.png", 192],
    ["icon-512.png", 512],
    ["icon-maskable-512.png", 512],
    ["android-chrome-192x192.png", 192],
    ["android-chrome-512x512.png", 512]
  ] as const) {
    await write(await draw(square, size), name, web);
  }
  const frames = async (svg: string) => {
    const drawn = [];
    for (const size of [16, 32, 48]) drawn.push({ size, png: await draw(svg, size) });
    return drawn;
  };
  const tile = await frames(markTileSvg(color.dark.bg, MARK_FIXED, "tile"));
  await write(tile[0].png, "favicon-16x16.png", web);
  await write(tile[1].png, "favicon-32x32.png", web);
  await write(ico(tile), "favicon-tile.ico", web);
  await write(ico(await frames(markSvg(MARK_FIXED, "light"))), "favicon.ico", web);
  const about = await browser.newPage({
    viewport: { width: ABOUT_CARD.w, height: ABOUT_CARD.h },
    deviceScaleFactor: ABOUT_CARD.scale
  });
  if (ABOUT_SEEDS.length !== ABOUT_CARDS)
    throw new Error(`${ABOUT_SEEDS.length} seeds for About's ${ABOUT_CARDS} cards`);
  for (const [i, seed] of ABOUT_SEEDS.entries()) {
    const drawn = aboutDraw(seeded(seed));
    await about.setContent(await aboutCardHtml(drawn));
    await write(await about.screenshot(), `about-${i + 1}.png`, web);
    console.log(
      `about-${i + 1}.png: /${encodePalette(drawn.palette)}?style=${drawn.style}&steps=${drawn.steps}&angle=${drawn.angle}`
    );
  }
  for (const page of Object.keys(PAGE_CARDS) as PageCard[]) {
    await about.setContent(await pageCardHtml(page));
    await about.evaluate(() => document.fonts.ready);
    await write(await about.screenshot(), PAGE_CARDS[page].file, web);
  }
} finally {
  await browser.close();
}
console.log(
  "icons: grabient.png, the email heads, the favicons, the home screen's icons, About's cards and the pages' cards"
);
