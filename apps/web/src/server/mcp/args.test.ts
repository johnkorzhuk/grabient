import { beforeAll, describe, expect, it } from "vitest";
import { readyOldIds } from "../seo/legacy.ts";
import { paletteNamed, readArgs } from "./args.ts";
import namedGolden from "./fixtures/paletteNamed.json" with { type: "json" };
import readGolden from "./fixtures/read-args.json" with { type: "json" };
import accountGolden from "./fixtures/tools-account.json" with { type: "json" };

// the old addresses' maps load on first need; these tests read them through the plain functions
beforeAll(readyOldIds);

const SEED = "kSWUkczDNDewdRK";

describe("an account tool's arguments", () => {
  it("are read as the schema says, each change said, and refused only for what a tool cannot do without", () => {
    for (const golden of readGolden) {
      const schema = accountGolden.find(tool => tool.name === golden.tool)!.inputSchema;
      expect(readArgs(schema, golden.args), golden.tool).toEqual(golden.read);
    }
  });

  it("name a palette by its seed or any of its addresses, carrying the address's view", () => {
    const named = [
      SEED,
      `https://x.test/${SEED}.svg?style=linearSwatches&steps=4`,
      `/api/og?seed=${SEED}&angle=10`,
      "k-nope",
      "x".repeat(401)
    ];
    expect(named.map(paletteNamed)).toEqual(namedGolden.map(golden => golden.read));
  });

  it("name a palette by an address that plays a look: the look, the angle it names, and no gradient it names none of", () => {
    expect(paletteNamed(`https://x.test/${SEED}?speed=2&style=glass&angle=30`)).toEqual({
      seed: SEED,
      angle: 30,
      look: "style=glass&angle=30&speed=2"
    });
    expect(paletteNamed(`/${SEED}?style=blob&shape=12`)).toEqual({
      seed: SEED,
      look: "style=blob&shape=12"
    });
    // the sandstone's steps are its look's, within its range; another effect's address names none
    expect(paletteNamed(`/${SEED}?steps=12&style=strata`)).toEqual({
      seed: SEED,
      look: "style=strata&steps=12"
    });
    expect(paletteNamed(`/${SEED}?style=strata&steps=99`)?.look).toBe("style=strata&steps=40");
    expect(paletteNamed(`/${SEED}?style=strata&steps=28`)?.look).toBe("style=strata");
    expect(paletteNamed(`/${SEED}?style=papercut&steps=12`)?.look).toBe("style=papercut");
    // the strings' ground is their look's, a clear one too; another effect's address names none
    expect(paletteNamed(`/${SEED}?bg=%23f4efe6&style=strings&shape=3`)).toEqual({
      seed: SEED,
      look: "style=strings&shape=3&bg=%23f4efe6"
    });
    expect(paletteNamed(`/${SEED}?style=strings&bg=%2300000000`)?.look).toBe(
      "style=strings&bg=%2300000000"
    );
    expect(paletteNamed(`/${SEED}?style=silk&bg=%23f4efe6`)?.look).toBe("style=silk");
    // a gradient's address names its view, which is all it says
    expect(paletteNamed(`/${SEED}?style=radialGradient&angle=30`)).toEqual({
      seed: SEED,
      style: "radialGradient",
      steps: 7,
      angle: 30
    });
    // so does one whose style is no gradient's and no effect's, an effect the site plays no more among them (the zen
    // garden, style=zen, 8 to 10 Nov 2026): the palette in the default style, with what else the address says
    for (const style of ["zen", "wobble"])
      expect(paletteNamed(`/${SEED}?style=${style}&steps=12&shape=7&speed=2`), style).toEqual({
        seed: SEED,
        style: "linearGradient",
        steps: 12,
        angle: 90
      });
  });

  it("name a palette by its old grabient.com id, alone or in its old address", () => {
    const old = "_gQxgJrgI8f-cgENf8Gf3_f5vf1hgBDf-wgBu";
    const seed = "kY4mpDazO-mUuu_fuLqXU49dvVP6";
    expect(paletteNamed(old)).toEqual({ seed });
    expect(paletteNamed(`https://grabient.com/${old}?style=radialGradient`)).toEqual({
      seed,
      style: "radialGradient",
      steps: 7,
      angle: 90
    });
  });
});
