import { expect, type Page, test } from "@playwright/test";
import { live } from "./live.ts";

/* The silk and the rosette: effects drawn by one pass of their loop over a plain vector still (engine/fx-still.ts),
   painted from the head in the first paint (server/fx-still.ts), chosen in the Appearance menu, played on a list's
   cards, and served as files. */

const SEED = "kS7CQ31Do6asvY-";

async function open(page: Page, address: string) {
  await page.goto(address);
  await live(page);
}

test("a rosette's page paints its still from the head, and its menu chooses the silk", async ({
  page,
  request
}) => {
  const html = await (await request.get(`/${SEED}?style=rosette&angle=120`)).text();
  const painted = /<style id="fx-still" data-key="([^"]*)">/.exec(html)?.[1].split(" ") ?? [];
  const named = /data-fx-still="([^"]*)"/.exec(html)?.[1];
  expect(named).toBe(`rosette|${SEED}|120|`);
  expect(painted).toContain(named);

  await open(page, `/${SEED}?style=rosette&angle=120`);
  const button = page.getByRole("button", { name: /Rosette/ }).first();
  await expect(button).toBeVisible();
  await button.click();
  await expect(page.getByRole("button", { name: "Silk", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Rosette", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Silk", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/${SEED}\\?style=silk&angle=120$`));
});

test("a list playing the silk draws its cards' stills, each named for the silk", async ({
  page,
  request
}) => {
  const sent = await request.get("/palettes?style=silk", { maxRedirects: 0 });
  expect(sent.status()).toBe(200);
  const html = await sent.text();
  const painted = /<style id="fx-still" data-key="([^"]*)">/.exec(html)?.[1].split(" ") ?? [];
  const first = /<span[^>]*data-fx-still="([^"]*)"/.exec(html)?.[1];
  expect(first).toMatch(/^silk\|/);
  expect(painted).toContain(first);

  await open(page, "/palettes?style=silk");
  await expect(
    page
      .locator("main article")
      .first()
      .getByRole("img", { name: /, Silk$/ })
  ).toBeVisible();
});

test("the silk's and the rosette's files: moving SVG, stylesheet, PNG, JSON and Markdown; no script or clip yet", async ({
  request
}) => {
  for (const kind of ["silk", "rosette"]) {
    const at = (extension: string) => request.get(`/${SEED}.${extension}?style=${kind}&shape=7`);
    const svg = await at("svg");
    expect(svg.headers()["content-type"]).toMatch(/^image\/svg\+xml/);
    expect(await svg.text()).toMatch(/^<svg[^>]*width="800" height="400"/);
    const css = await at("css");
    expect(await css.text()).toMatch(/html::before[\s\S]*cover no-repeat/);
    const png = await at("png");
    expect(png.headers()["content-type"]).toBe("image/png");
    const json = JSON.parse(await (await at("json")).text());
    expect(json.effect).toMatchObject({ style: kind, shape: 7 });
    expect(await (await at("md")).text()).toContain(kind);
    expect((await at("js")).status()).toBe(404);
    expect((await at("mp4")).status()).toBe(404);
  }
});
