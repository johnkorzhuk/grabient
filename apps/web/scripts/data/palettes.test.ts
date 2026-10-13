import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readAliases, readOriginals, unmapped } from "./palettes.ts";

const dir = (files: Record<string, unknown>) => {
  const at = mkdtempSync(join(tmpdir(), "grabient-palettes-"));
  for (const [name, value] of Object.entries(files))
    writeFileSync(join(at, name), JSON.stringify(value));
  return at;
};

describe("the palette import's data", () => {
  it("takes the migrated gallery's seed where both maps name an id", () => {
    const aliases = readAliases(
      dir({ "legacy-links.json": { _a: "kOne", _b: "kTwo" }, "legacy-k.json": { _a: "kThree" } })
    );
    expect(Object.fromEntries(aliases)).toEqual({ _a: "kThree", _b: "kTwo" });
    expect(unmapped([{ id: "_a" }, { id: "_c" }], aliases)).toEqual([{ id: "_c" }]);
  });

  it("reads the first Grabient's gradients, each with a date and a seed or a view", () => {
    expect(readOriginals()).toHaveLength(25);
    const bad = { items: [{ kseed: "kAbc", createdAt: 1, style: "nope", steps: 7, angle: 0 }] };
    expect(() => readOriginals(dir({ "original-gradients.json": bad }))).toThrow(/kAbc/);
  });
});
