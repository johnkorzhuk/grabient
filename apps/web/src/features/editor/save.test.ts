import { decodePalette } from "@grabient/engine";
import { expect, test } from "vitest";
import { replaced } from "./save.ts";

/* An admin's Save rewrites what the browser holds of the site's lists. */

const OLD = "kS7CQ31Do6asvY-";
const NEW = "kc-zpNeqM_WwiupeubyU06-8nTP_DzcBvUdAQ";
const OTHER = "kY4mpDazO-mUuu_fuLqXU49dvVP6";
const keyframes = decodePalette(NEW)?.anchors.length ?? 0;
const item = (kseed: string, steps = 7) => ({
  kseed,
  style: "linearGradient",
  steps,
  angle: 90,
  likes: 3,
  createdAt: 1
});
const preview = (seed: string, steps = 5) => ({ seed, style: "linearGradient", steps, angle: 90 });

test("a list shows the new palette in the old one's place, its steps never under its keyframes", () => {
  expect(keyframes).toBeGreaterThan(5);
  const page = { items: [item(OTHER), item(OLD, 5), item("kSyQDAzZa8zgZxS")], total: 3 };
  const next = replaced(page, OLD, NEW);
  expect(next.items.map(i => i.kseed)).toEqual([OTHER, NEW, "kSyQDAzZa8zgZxS"]);
  expect(next.items[1]).toEqual({ ...item(NEW), steps: keyframes });
  expect(next.items[0]).toBe(page.items[0]);
  expect(next.total).toBe(3);
});

test("a list that already holds the new palette loses the old one", () => {
  const head = { palettes: [item(NEW), item(OLD), item(OTHER)] };
  expect(replaced(head, OLD, NEW).palettes.map(i => i.kseed)).toEqual([NEW, OTHER]);
});

test("Grabient's collections follow, in a list's cards and on their own pages", () => {
  const agent = { kind: "agent", name: "grabient" };
  const page = {
    items: [
      { slug: "warm", owner: agent, itemCount: 9, preview: [preview(OLD), preview(OTHER)] },
      { slug: "both", owner: agent, itemCount: 4, preview: [preview(NEW), preview(OLD)] }
    ]
  };
  const next = replaced(page, OLD, NEW);
  expect(next.items[0]).toMatchObject({
    itemCount: 9,
    preview: [{ seed: NEW, steps: keyframes }, { seed: OTHER }]
  });
  expect(next.items[1]).toMatchObject({ itemCount: 3, preview: [{ seed: NEW }] });
  const found = {
    doc: { slug: "both", owner: agent, itemCount: 2, items: [item(NEW), item(OLD)] }
  };
  expect(replaced(found, OLD, NEW).doc).toMatchObject({ itemCount: 1, items: [{ kseed: NEW }] });
});

test("an account's collection keeps the palette it saved", () => {
  const page = {
    items: [{ slug: "@ada/mine", owner: { kind: "user", name: "ada" }, preview: [preview(OLD)] }]
  };
  expect(replaced(page, OLD, NEW)).toBe(page);
});

test("what holds no such palette comes back as it was given", () => {
  const page = { items: [item(OTHER)], tags: ["warm"], heldBy: [{ slug: "warm", title: "Warm" }] };
  expect(replaced(page, OLD, NEW)).toBe(page);
  expect(replaced(undefined, OLD, NEW)).toBeUndefined();
  expect(replaced(null, OLD, NEW)).toBeNull();
});
