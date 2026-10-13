import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import folds from "./fixtures/fold.json" with { type: "json" };
import lists from "./fixtures/lists.json" with { type: "json" };
import rebases from "./fixtures/rebase.json" with { type: "json" };
import settles from "./fixtures/settled.json" with { type: "json" };
import {
  fold,
  type Maker,
  matchesWords,
  minePage,
  type Pending,
  pageOf,
  previewOf,
  rebase,
  SAVED_PAGED,
  type Snapshot,
  savedItems,
  settled,
  type View,
  withCollectionId
} from "./model.ts";
import { COLLECTION_MAX, type SyncCollection, type SyncOp, type SyncResponse } from "./wire.ts";

/* The cases grabient4's fixture generator ran (scratchpad fixtures/U08), built the same way: its palettes are the
   first of the shipped corpus. */
const corpus: { kseed: string }[] = JSON.parse(
  readFileSync(new URL("../../../public/corpus-k.json", import.meta.url), "utf8")
).items;
const seeds = corpus.slice(0, 16).map(item => item.kseed);
const view = { style: "linearGradient", steps: 7, angle: 90 } as const;
const likeOf = (seed: string, at = 1) => ({ seed, ...view, at, likes: 3 });
const docOf = (
  slug: string,
  list: string[],
  extra: Partial<SyncCollection> = {}
): SyncCollection => ({
  id: `id-${slug}`,
  slug,
  url: `https://g.test/${slug}`,
  title: slug,
  description: "",
  tags: [],
  visibility: "private",
  owner: { kind: "user", name: "ada", display: "Ada" },
  itemCount: list.length,
  createdAt: 1,
  updatedAt: 1,
  saves: 0,
  preview: [],
  items: list.map((seed, position) => ({
    kseed: seed,
    ...view,
    likes: position,
    createdAt: 1,
    position
  })),
  ...extra
});
const snapshot: Snapshot = {
  cursor: 5,
  admin: false,
  likes: new Map([[seeds[0]!, likeOf(seeds[0]!)]]),
  collections: new Map([["blue", docOf("blue", seeds.slice(0, 3))]])
};
let n = 0;
const change = (op: SyncOp, local?: Pending["local"], id = ++n): Pending => ({
  id,
  key: `k${id}`,
  op,
  at: 1000 + id,
  ...(local ? { local } : {})
});
const likeOp = (seed: string, liked: boolean): SyncOp => ({ op: "like", seed, liked, ...view });
const keys = (list: Pending[]) => list.map(c => c.key);
const maker: Maker = { name: "ada", display: "Ada", origin: "https://g.test" };

const a1 = change(likeOp(seeds[1]!, true));
const a2 = change(likeOp(seeds[1]!, false));
const b1 = change(likeOp(seeds[0]!, false));
const b2 = change(likeOp(seeds[0]!, true));
const out1 = change(likeOp(seeds[1]!, true));
const out2 = change(likeOp(seeds[1]!, false));
const out3 = change(likeOp(seeds[1]!, true));
const removal = change(
  { op: "collection.remove", slug: "blue", seed: seeds[1]! },
  { item: snapshot.collections.get("blue")!.items[1] }
);
const undo = change(
  { op: "collection.restore", slug: "blue", seed: seeds[1]! },
  { removal: removal.key }
);
const making = change({
  op: "collection.create",
  slug: "@ada/night-swim",
  title: "Night swim",
  visibility: "private",
  items: seeds.slice(3, 5).map(seed => ({ seed, ...view }))
});
const adding = change({
  op: "collection.add",
  slug: "@ada/night-swim",
  items: [{ seed: seeds[6]!, ...view }]
});
const deleting = change({ op: "collection.delete", slug: "@ada/night-swim" });
const pub1 = change({ op: "collection.update", slug: "blue", visibility: "public" });
const pub2 = change({ op: "collection.update", slug: "blue", visibility: "private" });
const step = (pending: Pending[], next: Pending, sending = 0) =>
  keys(fold(pending, next, sending, snapshot));

it("folds presses into one change as grabient4 did", () => {
  const ran: [string, unknown][] = [
    ["like then unlike before sending: nothing goes", step([a1], a2)],
    ["unsave then save of a palette the server holds: nothing goes", step([b1], b2)],
    ["a press after one on its way is its own change", step([out1], out2, out1.id)],
    [
      "a third press folds back into the one on its way",
      keys(fold(fold([out1], out2, out1.id, snapshot), out3, out1.id, snapshot))
    ],
    ["undo of a removal not yet sent takes it back", step([removal], undo)],
    ["undo of a removal on its way is a restore of its own", step([removal], undo, removal.id)],
    [
      "a collection made and deleted before sending sends nothing",
      step([making, adding], deleting)
    ],
    ["its making on its way: the deletion follows it", step([making], deleting, making.id)],
    ["who sees it, pressed twice before sending: nothing goes", step([pub1], pub2)]
  ];
  expect(ran).toEqual(folds.slice(0, ran.length));
});

const shown = (v: View) => ({
  likes: [...v.likes.keys()],
  collections: Object.fromEntries(
    [...v.collections].map(([slug, doc]) => [
      slug,
      {
        id: doc.id,
        title: doc.title,
        visibility: doc.visibility,
        itemCount: doc.itemCount,
        items: doc.items.map(item => [item.kseed.slice(0, 8), item.position]),
        preview: doc.preview.length,
        owner: doc.owner,
        url: doc.url
      }
    ])
  )
});

it("predicts each change over the snapshot as grabient4 did", () => {
  const full = docOf(
    "full",
    corpus.slice(100, 199).map(item => item.kseed)
  );
  const moved: Snapshot = {
    ...snapshot,
    collections: new Map([
      ["@ada/blue", { ...snapshot.collections.get("blue")!, slug: "@ada/blue" }]
    ])
  };
  expect({
    "a like and a removal over the snapshot": shown(
      rebase(snapshot, [change(likeOp(seeds[2]!, true)), removal], maker)
    ),
    "a removal and its undo on its way: back where it stood": shown(
      rebase(
        snapshot,
        [
          removal,
          change(
            { op: "collection.restore", slug: "blue", seed: seeds[1]! },
            { removal: removal.key, item: removal.local?.item }
          )
        ],
        maker
      )
    ),
    "a collection made here, then added to": shown(rebase(snapshot, [making, adding], maker)),
    "an add past 100 is refused whole": rebase(
      { ...snapshot, collections: new Map([["full", full]]) },
      [
        change({
          op: "collection.add",
          slug: "full",
          items: [
            { seed: seeds[6]!, ...view },
            { seed: seeds[7]!, ...view }
          ]
        })
      ],
      maker
    ).collections.get("full")?.items.length,
    "a change named by id shows where the server moved it": shown(
      rebase(
        moved,
        [
          change(
            withCollectionId(
              { op: "collection.add", slug: "blue", items: [{ seed: seeds[6]!, ...view }] },
              rebase(snapshot, [], maker)
            )
          )
        ],
        maker
      )
    ),
    "the same view of a palette twice is held once": shown(
      rebase(
        snapshot,
        [
          change({
            op: "collection.add",
            slug: "blue",
            items: [
              { seed: seeds[0]!, ...view },
              { seed: seeds[0]!, ...view, steps: 9 }
            ]
          })
        ],
        maker
      )
    ),
    "a remove without a view takes every view": shown(
      rebase(
        {
          ...snapshot,
          collections: new Map([["blue", docOf("blue", [seeds[0]!, seeds[0]!, seeds[1]!])]])
        },
        [change({ op: "collection.remove", slug: "blue", seed: seeds[0]! })],
        maker
      )
    ),
    "publishing changes visibility only": shown(rebase(snapshot, [pub1], maker))
  }).toEqual(rebases);
});

it("draws Saved and the account's collections from the copy as grabient4 did", () => {
  const listed = rebase(
    {
      ...snapshot,
      likes: new Map([
        [seeds[0]!, likeOf(seeds[0]!, 5)],
        [seeds[1]!, likeOf(seeds[1]!, 9)],
        [seeds[2]!, likeOf(seeds[2]!, 9)]
      ])
    },
    [],
    maker
  );
  const mine: View = {
    likes: new Map(),
    collections: new Map([
      ["a", docOf("a", [seeds[0]!], { title: "Ocean blues", tags: ["water"], updatedAt: 5 })],
      ["b", docOf("b", [seeds[1]!], { title: "Desert", updatedAt: 9 })],
      [
        "c",
        docOf("c", [seeds[2]!], { title: "日本の春", description: "Spring in Kyoto", updatedAt: 7 })
      ]
    ])
  };
  expect({
    SAVED_PAGED,
    COLLECTION_MAX,
    savedOrder: savedItems(listed).map(item => item.kseed.slice(0, 8)),
    pageOf: (
      [
        [[1, 2, 3, 4, 5], 2, 2],
        [[], 1, 24],
        [[1, 2, 3], 5, 2]
      ] as [number[], number, number][]
    ).map(([all, page, limit]) => [all, page, limit, pageOf(all, page, limit)]),
    minePage: ["", "ocean", "ocaen", "water ocean", "fire", "春", "kyoto", "des", "deser", "a"].map(
      query => [query, minePage(mine, { page: 1, limit: 12, query }).items.map(c => c.slug)]
    ),
    matchesWords: (
      [
        ["Ocean blues", "oecan"],
        ["Ocean blues", "blue"],
        ["Ocean blues", "oce"],
        ["Ocean blues", "x"],
        ["Ocean blues", "blu"],
        ["Café crème", "cafe"],
        ["Café crème", "café"],
        ["Neon nights", "nihgts"]
      ] as const
    ).map(([title, query]) => [
      title,
      query,
      matchesWords({ title, description: "", tags: [] }, query)
    ]),
    previewOfThirteen: previewOf(
      docOf(
        "p",
        corpus.slice(0, 13).map(item => item.kseed)
      ).items
    ).length
  }).toEqual(lists);
});

it("moves the snapshot to a sync's answer as grabient4 did", () => {
  const answer = (extra: Partial<SyncResponse>): SyncResponse => ({
    cursor: 9,
    reset: false,
    admin: false,
    likes: [],
    unliked: [],
    collections: [],
    removed: [],
    lastMutation: 0,
    results: [],
    ...extra
  });
  const s = (snap: Snapshot) => ({
    cursor: snap.cursor,
    admin: snap.admin,
    likes: [...snap.likes.keys()].map(k => k.slice(0, 8)),
    collections: [...snap.collections.keys()]
  });
  expect({
    "likes in and out, a collection removed by id": s(
      settled(
        snapshot,
        answer({
          admin: true,
          likes: [likeOf(seeds[3]!, 5)],
          unliked: [seeds[0]!],
          collections: [docOf("green", [seeds[1]!])],
          removed: ["id-blue"]
        })
      )
    ),
    "a collection is one by its id, whatever its address": s(
      settled(
        snapshot,
        answer({ collections: [docOf("blue-two", [seeds[0]!], { id: "id-blue" })] })
      )
    ),
    "a reset drops what the copy held": s(
      settled(snapshot, answer({ reset: true, likes: [likeOf(seeds[8]!)] }))
    )
  }).toEqual(settles);
});
