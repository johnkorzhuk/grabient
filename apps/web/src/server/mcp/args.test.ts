import { describe, expect, it } from "vitest";
import { paletteNamed, readArgs } from "./args.ts";
import namedGolden from "./fixtures/paletteNamed.json" with { type: "json" };
import readGolden from "./fixtures/read-args.json" with { type: "json" };
import accountGolden from "./fixtures/tools-account.json" with { type: "json" };

const SEED = "kSWUkczDNDewdRK";

describe("an account tool's arguments", () => {
  it("are read and refused word for word as the schema says", () => {
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
});
