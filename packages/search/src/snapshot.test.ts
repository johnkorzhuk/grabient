import { createHash } from "node:crypto";
import { encodePalette } from "@grabient/engine";
import { anchorsFromHexes } from "@grabient/engine/spec.ts";
import { describe, expect, test } from "vitest";
import { fakeEmbedding } from "../test/fake-embedding.ts";
import { fixture, searchFile } from "../test/files.ts";
import {
  buildSnapshot,
  decodeSnapshot,
  encodeSnapshot,
  type Site,
  snapshotHead,
  subjectOf,
  textMark
} from "./snapshot.ts";
import { loadTower } from "./tower.ts";
import { collectionText, seedVector } from "./vectors.ts";

const round = (x: number) => Math.round(x * 1e6) / 1e6;
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const model = loadTower(searchFile("tower.bin"));
const shipped = searchFile("snapshot.bin");
const snapshot = decodeSnapshot(shipped);

describe("the shipped snapshot", () => {
  const golden = fixture<{
    head: Record<string, unknown>;
    rows: { i: number; seed: string; harmony: string; title: string; scale: number; q: number[] }[];
    collections: {
      slug: string;
      words: string;
      subject: string;
      members: number;
      textOf: string;
    }[];
    measured: { seed: string; harmony: string; values: number[] }[];
  }>("snapshot.json");

  test("reads as G4 read it", () => {
    expect({
      format: 1,
      version: snapshot.version,
      d: snapshot.d,
      builtAt: snapshot.builtAt,
      mark: snapshot.mark,
      pending: snapshot.pending,
      palettes: snapshot.seeds.length,
      collections: snapshot.slugs.length,
      harmonies: snapshot.harmonies
    }).toEqual(golden.head);
    for (const row of golden.rows) {
      expect({
        i: row.i,
        seed: snapshot.seeds[row.i],
        harmony: snapshot.harmonies[snapshot.harmony[row.i]],
        title: snapshot.titles[row.i],
        scale: round(snapshot.palettes.scale[row.i]),
        q: [...snapshot.palettes.q.subarray(row.i * 64, (row.i + 1) * 64)]
      }).toEqual(row);
    }
    golden.collections.forEach((c, i) => {
      expect({
        slug: snapshot.slugs[i],
        ...snapshot.names[i],
        members: snapshot.names[i].members.length,
        textOf: snapshot.textOf[i]
      }).toEqual(c);
    });
  });

  test("encodes back to the same bytes", () => {
    expect(sha256(encodeSnapshot(snapshot))).toBe(sha256(shipped));
  });

  test("a palette's row stands for its own vector", () => {
    for (const m of golden.measured) {
      const own = seedVector(model, m.seed)!;
      expect({ seed: m.seed, harmony: own.harmony, values: own.values.map(round) }).toEqual(m);
      const i = snapshot.at.get(m.seed);
      if (i === undefined) continue;
      let dot = 0;
      for (let j = 0; j < 64; j++)
        dot += snapshot.palettes.q[i * 64 + j] * snapshot.palettes.scale[i] * own.values[j];
      expect(dot).toBeGreaterThan(0.9995);
    }
  });

  test("refuses another format or a body that does not match its head", () => {
    expect(() => decodeSnapshot(shipped.subarray(0, shipped.length - 1))).toThrow("do not match");
    const other = new TextEncoder().encode('{"format":2}\n');
    expect(() => decodeSnapshot(other)).toThrow("format 2");
    expect(() => decodeSnapshot(new Uint8Array([1, 2]))).toThrow("Not a search snapshot");
  });
});

describe("a build", () => {
  const golden = fixture<{
    first: {
      stats: object;
      names: object;
      textOf: string[];
      harmonies: string[];
      bytes: number;
      sha256: string;
      headLine: number;
    };
    capped: { stats: object; pending: number };
    next: { stats: object; sha256: string };
  }>("build.json");
  const gallery = snapshot.seeds.slice(0, 30);
  const members = snapshot.seeds.slice(30, 36);
  const site: Site = {
    seeds: gallery,
    titles: new Map([
      [gallery[0], "Zorblax Fizz inspired color palette"],
      [gallery[1], "Night swim"]
    ]),
    mark: "v1:f1:test",
    collections: [
      {
        slug: "ocean-deep",
        title: "Ocean deep gradients",
        description: "Cold water, far from shore.",
        tags: ["sea", "marine"],
        seeds: [...members.slice(0, 4), gallery[2]]
      },
      { slug: "empty-words", title: "", description: "", tags: [], seeds: members.slice(4) }
    ]
  };
  const embed = async (texts: string[]) => texts.map(text => fakeEmbedding(text, model.demb));
  const unseen = encodePalette(anchorsFromHexes(["#123456", "#fedcba", "#00aa55"])!);

  test("gives the same bytes from the same input", async () => {
    const { snapshot: built, stats } = await buildSnapshot(model, site, null, {
      embed,
      now: 1_800_000_000_000
    });
    const bytes = encodeSnapshot(built);
    expect(stats).toEqual(golden.first.stats);
    expect(built.names).toEqual(golden.first.names);
    expect(built.textOf).toEqual(golden.first.textOf);
    expect(built.harmonies).toEqual(golden.first.harmonies);
    expect(bytes.length).toBe(golden.first.bytes);
    expect(bytes.indexOf(0x0a)).toBe(golden.first.headLine);
    expect(sha256(bytes)).toBe(golden.first.sha256);

    const next = await buildSnapshot(model, { ...site, seeds: [...gallery, unseen] }, built, {
      embed,
      now: 1_800_000_000_002
    });
    expect(next.stats).toEqual(golden.next.stats);
    expect(sha256(encodeSnapshot(next.snapshot))).toBe(golden.next.sha256);
  });

  test("measures at most its limit and owes the rest", async () => {
    const capped = await buildSnapshot(model, site, null, { limit: 10, now: 1_800_000_000_001 });
    expect(capped.stats).toEqual(golden.capped.stats);
    expect(capped.snapshot.pending).toBe(golden.capped.pending);
  });

  test("owes a text it could not embed, and keeps the old vector meanwhile", async () => {
    const first = await buildSnapshot(model, site, null, { embed, now: 1 });
    const changed = {
      ...site,
      collections: [{ ...site.collections[0], description: "Warmer water." }, site.collections[1]]
    };
    const failed = await buildSnapshot(model, changed, first.snapshot, {
      embed: async () => [null],
      now: 2
    });
    expect(failed.stats.textsOwed).toBe(1);
    expect(failed.snapshot.pending).toBe(1);
    expect(failed.snapshot.textOf[0]).toBe(first.snapshot.textOf[0]);
    const repaid = await buildSnapshot(model, changed, failed.snapshot, { embed, now: 3 });
    expect([repaid.stats.embedded, repaid.snapshot.pending]).toEqual([1, 0]);
  });
});

describe("the words a palette is given", () => {
  const gallery = snapshot.seeds.slice(0, 4);
  const site: Site = {
    seeds: gallery,
    titles: new Map([[gallery[1], "Zorblax fizz\nSmashville gold"]]),
    described: new Map([[gallery[1], "bridgestone preds"]]),
    mark: "v1:f1:test",
    collections: []
  };
  const built = async (from: Site) => (await buildSnapshot(model, from, null, { now: 1 })).snapshot;
  const headOf = (bytes: Uint8Array) =>
    new TextDecoder().decode(bytes.subarray(0, bytes.indexOf(0x0a))).trimEnd();
  /* the same bytes under another head */
  const withHead = (bytes: Uint8Array, change: (head: Record<string, unknown>) => void) => {
    const head = JSON.parse(headOf(bytes)) as Record<string, unknown>;
    change(head);
    const line = new TextEncoder().encode(`${JSON.stringify(head)}\n`);
    const body = bytes.subarray(bytes.indexOf(0x0a) + 1);
    const out = new Uint8Array(line.length + body.length);
    out.set(line);
    out.set(body, line.length);
    return out;
  };

  test("are kept through a build, its bytes and their reading, the same bytes each time", async () => {
    const named = await built(site);
    expect([named.titles[1], named.described[1], named.described[0]]).toEqual([
      "Zorblax fizz\nSmashville gold",
      "bridgestone preds",
      ""
    ]);
    const bytes = encodeSnapshot(named);
    const back = decodeSnapshot(bytes);
    expect([back.titles, back.described]).toEqual([named.titles, named.described]);
    // after the collections, listing only the palettes described, on the one head line
    expect(headOf(bytes)).toMatch(
      /"collections":\[\],"described":\[\[1,"bridgestone preds"\]\]\}$/
    );
    expect(snapshotHead(bytes)).toMatchObject({ mark: "v1:f1:test", builtAt: 1, pending: 0 });
    expect(sha256(encodeSnapshot(await built(site)))).toBe(sha256(bytes));
    expect(headOf(encodeSnapshot(await built({ ...site, described: undefined })))).not.toContain(
      '"described"'
    );
  });

  test("a copy's names this code cannot read are passed over, and everything else reads as it was", async () => {
    const named = await built(site);
    const bytes = encodeSnapshot(named);
    const n = named.seeds.length;
    const none = new Array<string>(n).fill("");
    for (const described of [
      "w",
      [[-1, "w"]],
      [[n, "w"]],
      [[0.5, "w"]],
      [[0, 5]],
      [["w"]],
      [null]
    ]) {
      const back = decodeSnapshot(withHead(bytes, head => Object.assign(head, { described })));
      expect(back.described, JSON.stringify(described)).toEqual(none);
      expect({ ...back, described: named.described }).toEqual(named);
    }
    const mixed = decodeSnapshot(
      withHead(bytes, head =>
        Object.assign(head, {
          described: [
            [-1, "w"],
            [2, "kept"]
          ]
        })
      )
    );
    expect(mixed.described).toEqual(["", "", "kept", ""]);
  });
});

test("the words a build keeps", () => {
  expect(textMark("Sunset")).toBe("1rdvjd2bpqq.6");
  expect(textMark("")).toBe("wvjl67o803.0");
  expect(textMark("日本の秋")).toBe("1rhzq1ipi4u.4");
  expect(subjectOf("Sunset Gradient Palettes")).toBe("Sunset");
  expect(subjectOf("Retro colour schemes")).toBe("Retro colour schemes");
  expect(subjectOf("Gradients")).toBe("Gradients");
  expect(collectionText(" Spaced ", "  ", ["a", "b"])).toBe("Spaced. a, b");
  expect(
    collectionText("Ocean deep gradients", "Cold water, far from shore.", ["sea", "marine"])
  ).toBe("Ocean deep gradients. Cold water, far from shore.. sea, marine");
});
