import { encodePalette } from "@grabient/engine/codec.ts";
import { run } from "@grabient/server/db/d1.ts";
import type { Env } from "@grabient/server/env.ts";
import { setFlag } from "@grabient/server/flags/flags.ts";
import { describe, expect, it, vi } from "vitest";
import { replayResponse } from "../src/server/analytics/replay.ts";
import { clientErrorResponse } from "../src/server/client-errors/client-errors.ts";
import { useRecord } from "../src/server/palette-use/record.ts";
import { prunePaletteUse, usedResponse } from "../src/server/palette-use/use.ts";
import { address, count, post, testEnv, unique } from "./helpers.ts";

/* What readers' pages tell the Worker: palette use, client errors and the session recordings' way out. */

const DAY = 86_400_000;
const today = () => Math.floor(Date.now() / DAY);
const palette = () =>
  encodePalette({
    anchors: [
      { l: Math.random(), c: 0.1, h: Math.floor(Math.random() * 360) },
      { l: 0.5, c: 0.12, h: 30 }
    ]
  });

async function galleryPalette(env: Env): Promise<string> {
  const seed = palette();
  await run(
    env.DB,
    "INSERT INTO k_palettes (seed, style, steps, angle, created_at) VALUES (?, 'linearGradient', 7, 90, ?)",
    seed,
    Date.now()
  );
  return seed;
}
async function collection(
  env: Env,
  visibility: "public" | "private",
  seed: string
): Promise<string> {
  const id = crypto.randomUUID();
  const slug = unique("ocean").toLowerCase();
  const now = Date.now();
  await run(
    env.DB,
    `INSERT INTO k_collections (id, slug, owner_kind, owner_id, title, visibility, created_at, updated_at)
     VALUES (?, ?, 'agent', 'grabient', 'Ocean', ?, ?, ?)`,
    id,
    slug,
    visibility,
    now,
    now
  );
  await run(
    env.DB,
    "INSERT INTO k_collection_items (collection_id, position, seed, style, steps, angle) VALUES (?, 0, ?, 'linearGradient', 7, 90)",
    id,
    seed
  );
  return slug;
}
const uses = (env: Env, seed: string) =>
  count(env, "SELECT COALESCE(SUM(count), 0) AS n FROM k_palette_use WHERE seed = ?", seed);

describe("palette use", () => {
  it("counts a public palette's use once a day for each address, in the view it was taken in", async () => {
    const env = testEnv();
    const seed = await galleryPalette(env);
    const ip = address();
    const body = {
      action: "copy",
      format: "css",
      surface: "list",
      items: [{ seed, style: "radialSwatches", steps: 9, angle: 45, position: 2 }]
    };
    for (let i = 0; i < 2; i++) {
      const answer = await usedResponse(post("/api/used", body, { ip }), env);
      expect(answer.status).toBe(204);
    }
    expect(await uses(env, seed)).toBe(1);
    await usedResponse(post("/api/used", body, { ip: address() }), env);
    expect(await uses(env, seed)).toBe(2);
    const row = await env.DB.prepare("SELECT * FROM k_palette_use WHERE seed = ?")
      .bind(seed)
      .first();
    expect(row).toMatchObject({
      day: today(),
      action: "copy",
      format: "css",
      surface: "list",
      position: 2,
      view: "radialSwatches:9:45"
    });
  });

  it("counts nothing of a palette the site does not show, another site's page, or with its flag off", async () => {
    const env = testEnv();
    const unknown = palette();
    const shown = await galleryPalette(env);
    const copy = (seed: string) => ({ action: "open", surface: "list", items: [{ seed }] });
    await usedResponse(post("/api/used", copy(unknown)), env);
    expect(await uses(env, unknown)).toBe(0);
    await usedResponse(
      post("/api/used", copy(shown), { origin: "https://elsewhere.example" }),
      env
    );
    await usedResponse(
      post("/api/used", copy(shown), { headers: { "User-Agent": "Googlebot/2.1" } }),
      env
    );
    expect(await uses(env, shown)).toBe(0);
    const admin = unique("admin");
    await setFlag(env, "palette-use", false, admin);
    await usedResponse(post("/api/used", copy(shown)), env);
    expect(await uses(env, shown)).toBe(0);
    /* this isolate sees the flag back on at once */
    await setFlag(env, "palette-use", true, admin);
  });

  it("counts a public collection's page seen, never a private one's, and keeps the editor's change as numbers", async () => {
    const env = testEnv();
    const seed = await galleryPalette(env);
    const open = await collection(env, "public", seed);
    const own = await collection(env, "private", seed);
    const seen = (slug: string) => ({ action: "view", surface: "collection", collection: slug });
    await usedResponse(post("/api/used", seen(open)), env);
    await usedResponse(post("/api/used", seen(own)), env);
    const views = await count(
      env,
      "SELECT COALESCE(SUM(count), 0) AS n FROM k_palette_use WHERE action = 'view' AND collection IN (?, ?)",
      open,
      own
    );
    expect(views).toBe(1);
    const edited = palette();
    await usedResponse(
      post("/api/used", {
        action: "download",
        format: "png",
        surface: "editor",
        collection: open,
        items: [{ seed }],
        edited
      }),
      env
    );
    const change = await env.DB.prepare("SELECT * FROM k_palette_edits WHERE seed = ?")
      .bind(seed)
      .first();
    expect(change).toMatchObject({ day: today(), collection: open, anchors: 0 });
    const record = await useRecord(env, { days: 7 });
    expect(record.uses.find(row => row.seed === seed)).toMatchObject({
      action: "download",
      collection: open
    });
    expect(record.collectionViews.some(row => row.slug === open)).toBe(true);
  });

  it("goes after 90 days", async () => {
    const env = testEnv();
    const seed = palette();
    await run(
      env.DB,
      "INSERT INTO k_palette_use (day, seed, action, surface, count) VALUES (?, ?, 'open', 'list', 1), (?, ?, 'copy', 'list', 1)",
      today() - 91,
      seed,
      today() - 89,
      seed
    );
    expect(await prunePaletteUse(env)).toBeGreaterThanOrEqual(1);
    expect(await uses(env, seed)).toBe(1);
  });
});

describe("client errors", () => {
  it("are logged without the reader, and always answered 204", async () => {
    const env = testEnv();
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const report = { message: "x is undefined", source: "/assets/a.js", line: 3, page: "palettes" };
    expect((await clientErrorResponse(post("/api/client-error", report), env)).status).toBe(204);
    expect(logged).toHaveBeenCalledWith(
      "client error",
      expect.stringContaining('"at":"/assets/a.js:3:?"')
    );
    logged.mockClear();
    expect(
      (
        await clientErrorResponse(
          post("/api/client-error", report, { origin: "https://evil.example" }),
          env
        )
      ).status
    ).toBe(204);
    expect(logged).not.toHaveBeenCalled();
    logged.mockRestore();
  });
});

describe("the recordings' way out", () => {
  it("answers and sends nothing on, off the production hosts", async () => {
    const env = testEnv();
    const fetched = vi.spyOn(globalThis, "fetch");
    const answer = await replayResponse(post("/e/s/", { token: "phc_any" }), env);
    expect(answer.status).toBe(204);
    expect(fetched).not.toHaveBeenCalled();
    fetched.mockRestore();
  });
});
