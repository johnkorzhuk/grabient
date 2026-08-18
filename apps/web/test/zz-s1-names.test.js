// Names for the QA seeds through the real palette-name pipeline (vitest gives
// us the TS + workspace alias resolution for free).
import { it } from "vitest";
import { renderPalette } from "/home/korz/projects/grabient33/grabient/apps/web/src/palette.ts";
import { describePaletteName, HEADLINE } from "/home/korz/projects/grabient33/grabient/apps/web/src/palette-name.ts";
const SEEDS = {
  C01: "_gM0gNRgOqgC_gCBgBJgGigMigIQgOYgH7gJw",
  C02: "_gMdgOjgP6gDPf-cf-Of6gf5yf0zgAgf9tf-x",
  C03: "_gCZgC4gCsgCfgEggDUgIngMJgKogEYgEYgEYdbn-tEgA",
  C04: "_gApf_ugA2gHegFGgHjgJpgFTgHRhhBhgshhf",
  C05: "_gLEgGFgaXgELgLAgRugEogBggBkgAWgBkgFbdgwsl1ff",
  C06: "_gPoflZgG-gAAgqFgQQgHQgBmgBigAAgOAgLt",
  C07: "_gMmgLvgL-gGNgGGgF6gBngCegClhCZhCPhCplRzSvvgK",
  C08: "_gqQfl4gPogjogpzgAAgBggBlgHjgIHgO2gAA",
  C09: "_gETgdQgN0gLVgbwgMVgEBgBogBpgK4gIDgIF",
  C10: "_gJygMFgLIgEXgDdgC5gI2gGwgGcgCOgDbgCWgA5ptIeu",
  C11: "_gGygFNgEzgIzgDFgDPgBkgJugLFgKbgHrgGx",
  C12: "_gkKgBKgBEgjfgA3gBHgBogVegP_gHWgGigIs",
  K01: "_gB5gIZgFtgBRgGKgG2gG9gAxgGShcdgIzg4D",
  K02: "_gEngEngEngFigFRgFMgJjgJMgJUhNtgckg6x",
  K03: "_gJ0gHlgDgf7Cf7YgHyf5kf7zgCwgVgf3ifxH",
  K04: "_gDXgDJgEFgKggKsgJSgEYgFbgDsgguhBdgAAlBoEwFfn",
  K05: "_gJDgH1gIagIjgL4gJtgDZgFrgDFgAAgguhBd",
  K06: "_gMIgLhgK1gCZgCcgChgGSgGcgGMgeUgerge1",
};
it("prints names", () => {
  for (const [tag, seed] of Object.entries(SEEDS)) {
    const v = renderPalette(seed, "linearGradient", 13, 90);
    const d = describePaletteName(v.appliedCoeffs, v.hexColors, HEADLINE);
    console.log(`${tag}: "${d.name}"   tags=[${d.tags.join(" ")}]`);
  }
});
