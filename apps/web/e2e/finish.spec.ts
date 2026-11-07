import { expect, type Page, test } from "@playwright/test";
import { live } from "./live.ts";

/* Soft and grain, the finish over any gradient style: a blur along the style's line and film grain over the picture,
   set in the Appearance menu for a list or a palette, carried by the address, drawn in the first paint and in every
   file (engine/soft.ts, grain.ts, lib/picture.ts). */

const SEED = "kS7CQ31Do6asvY-";
const art = (page: Page) =>
  page
    .locator("main article")
    .first()
    .locator("[role=img]")
    .first()
    .evaluate(el => getComputedStyle(el).backgroundImage);

test("a list's Soft and Grain fields soften and grain every card through the address", async ({
  page
}) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(String(error)));
  await page.goto("/palettes?style=linearSwatches");
  await live(page);
  /* bands: two stops a band, at their edges */
  expect(await art(page)).not.toContain("grain-");
  await page.getByRole("button", { name: /^Appearance/ }).click();
  const soft = page.getByRole("spinbutton", { name: /^Soft/ });
  await soft.focus();
  for (let press = 0; press < 30; press++) await page.keyboard.press("ArrowUp");
  await expect(page).toHaveURL(/[?&]soft=30(&|$)/);
  /* the bands blur into one gradient, its stops placed along the line */
  await expect.poll(async () => (await art(page)).match(/rgb\(/g)?.length ?? 0).toBeGreaterThan(20);
  const grain = page.getByRole("spinbutton", { name: /^Grain/ });
  await grain.focus();
  for (let press = 0; press < 12; press++) await page.keyboard.press("ArrowUp");
  await expect(page).toHaveURL(/[?&]soft=30&grain=12(&|$)/);
  /* the grain is a layer of its own over the picture: one tile at full strength at the grain's opacity, so sliding it
     loads no file and nothing flickers */
  const layer = page
    .locator("main article")
    .first()
    .locator("[role=img] > span[aria-hidden]")
    .last();
  await expect
    .poll(() =>
      layer.evaluate(el => {
        const style = getComputedStyle(el);
        return `${style.backgroundImage} ${style.opacity}`;
      })
    )
    .toMatch(/\/grain-[0-9a-f]+\/100\.png"\) 0\.12$/);
  const tiles: string[] = [];
  page.on("request", request => {
    if (/\/grain-/.test(request.url())) tiles.push(request.url());
  });
  for (let press = 0; press < 6; press++) await page.keyboard.press("ArrowUp");
  await expect(page).toHaveURL(/[?&]grain=18(&|$)/);
  expect(tiles).toEqual([]);
  expect(errors).toEqual([]);
});

test("a soft, grained palette draws its finish in its first paint, and its files carry it", async ({
  page,
  request
}) => {
  const address = `/${SEED}?style=radialSwatches&soft=40&grain=20`;
  const html = await (await request.get(address)).text();
  /* the first screen's picture, as the server drew it: the grain's tile over the blurred stops */
  const drawn = (/--art:(.*?);--art-p3:/.exec(html)?.[1] ?? "").replaceAll("&quot;", '"');
  expect(drawn).toMatch(/^radial-gradient\(/);
  /* and its grain, a layer of its own: the tile at full strength at the grain's opacity */
  expect(html).toMatch(
    /background-image:url\(&quot;[^&]*\/grain-[0-9a-f]+\/100\.png&quot;\);opacity:0\.2/
  );
  expect(drawn).toContain("radial-gradient(");
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(String(error)));
  await page.goto(address);
  await live(page);
  await expect(page).toHaveURL(new RegExp(`/${SEED}\\?style=radialSwatches&soft=40&grain=20$`));
  const stage = page.getByRole("img", { name: "The gradient" }).first();
  await expect
    .poll(() => stage.evaluate(el => getComputedStyle(el).backgroundImage))
    .toMatch(/^radial-gradient\(/);
  await expect
    .poll(() =>
      stage
        .locator("> span[aria-hidden]")
        .last()
        .evaluate(el => getComputedStyle(el).opacity)
    )
    .toBe("0.2");

  await page.getByRole("button", { name: /^Appearance/ }).click();
  await expect(page.getByRole("spinbutton", { name: /^Soft/ })).toHaveAttribute(
    "aria-valuenow",
    "40"
  );
  /* the editor writes a grain into its address as a number, bare, which a reload keeps */
  await page.getByRole("spinbutton", { name: /^Grain/ }).focus();
  await page.keyboard.press("ArrowUp");
  await expect(page).toHaveURL(new RegExp(`/${SEED}\\?style=radialSwatches&soft=40&grain=21$`));
  await page.reload();
  await live(page);
  await expect(page).toHaveURL(new RegExp(`/${SEED}\\?style=radialSwatches&soft=40&grain=21$`));
  expect(errors).toEqual([]);

  const file = (extension: string) =>
    request.get(`/${SEED}.${extension}?style=radialSwatches&soft=40&grain=20`);
  const css = await (await file("css")).text();
  expect(css).toContain('url("data:image/png;base64,');
  expect(css).toContain("radial-gradient(");
  const svg = await (await file("svg")).text();
  /* the grain one image over the whole picture, which a design app imports as one layer */
  expect(svg).toContain(
    '<image id="grain" width="800" height="400" xlink:href="data:image/png;base64,'
  );
  expect(svg).not.toContain("<use");
  expect(svg).toMatch(/<radialGradient[^>]*><stop offset="0\.\d{5}"/);
  const png = await file("png");
  expect(png.headers()["content-type"]).toBe("image/png");
  expect(JSON.parse(await (await file("json")).text())).toMatchObject({ soft: 40, grain: 20 });
});

test("an effect plays soft and grained: its address keeps both, its picture blurs over the gradient under the grain", async ({
  page
}) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(String(error)));
  /* a palette's page: the address keeps them through a reload, after the effect's angle */
  await page.goto(`/${SEED}?style=rosette&grain=20&soft=40`);
  await live(page);
  await expect(page).toHaveURL(new RegExp(`/${SEED}\\?style=rosette&soft=40&grain=20$`));
  const stage = page.getByRole("img", { name: "The gradient" }).first();
  await expect
    .poll(() =>
      stage
        .locator("> div")
        .first()
        .evaluate(el => getComputedStyle(el).filter)
    )
    .toMatch(/^blur\(\d+(\.\d+)?px\)$/);
  await expect
    .poll(() =>
      stage
        .locator("> span[aria-hidden]")
        .last()
        .evaluate(el => getComputedStyle(el).opacity)
    )
    .toBe("0.2");
  await page.getByRole("button", { name: /^Appearance/ }).click();
  await expect(page.getByRole("spinbutton", { name: /^Grain/ })).toHaveAttribute(
    "aria-valuenow",
    "20"
  );
  await page.reload();
  await live(page);
  await expect(page).toHaveURL(new RegExp(`/${SEED}\\?style=rosette&soft=40&grain=20$`));
  /* a list: its cards blur the effect over the gradient, clipped to the card, under the grain */
  await page.goto("/palettes?style=silk&soft=45&grain=30");
  await live(page);
  await expect(page).toHaveURL(/\/palettes\?style=silk&soft=45&grain=30$/);
  const art = page.locator("main article").first().locator("[role=img]").first();
  await expect
    .poll(() =>
      art.evaluate(el => ({
        ground: getComputedStyle(el).backgroundImage.startsWith("linear-gradient("),
        clipped: getComputedStyle(el).overflow,
        blur: getComputedStyle(el.firstElementChild!).filter
      }))
    )
    .toMatchObject({ ground: true, clipped: "hidden", blur: expect.stringMatching(/^blur\(/) });
  await expect(page.getByRole("button", { name: /^Appearance/ })).toHaveAccessibleName(
    /Soft 45 · Grain 30/
  );
  expect(errors).toEqual([]);
});

test("the blob takes no soft: its Soft field steps aside, and a soft set for the others leaves its address and comes back", async ({
  page
}) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(String(error)));
  /* a blob's address that names a soft is answered without it, its grain kept, its picture unblurred */
  await page.goto(`/${SEED}?style=blob&soft=40&grain=20&shape=3`);
  await live(page);
  await expect(page).toHaveURL(new RegExp(`/${SEED}\\?style=blob&grain=20&shape=3$`));
  const stage = page.getByRole("img", { name: "The gradient" }).first();
  await expect
    .poll(() =>
      stage
        .locator("> div")
        .first()
        .evaluate(el => getComputedStyle(el).filter)
    )
    .toBe("none");
  const appearance = page.getByRole("button", { name: /^Appearance/ });
  await appearance.click();
  await expect(page.getByRole("spinbutton", { name: /^Grain/ })).toHaveAttribute(
    "aria-valuenow",
    "20"
  );
  await expect(page.getByRole("spinbutton", { name: /^Soft/ })).toHaveCount(0);
  /* a soft set while the rosette plays leaves the address while the blob plays, and comes back with the rosette */
  await page.getByRole("button", { name: "Rosette", exact: true }).click();
  const soft = page.getByRole("spinbutton", { name: /^Soft/ });
  await soft.focus();
  for (let press = 0; press < 30; press++) await page.keyboard.press("ArrowUp");
  await expect(page).toHaveURL(new RegExp(`/${SEED}\\?style=rosette&soft=30&grain=20`));
  await page.getByRole("button", { name: "Blob", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/${SEED}\\?style=blob&grain=20&shape=3$`));
  await expect(page.getByRole("spinbutton", { name: /^Soft/ })).toHaveCount(0);
  await expect(appearance).toHaveAccessibleName(/Grain 20/);
  await expect(appearance).not.toHaveAccessibleName(/Soft/);
  await page.getByRole("button", { name: "Rosette", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/${SEED}\\?style=rosette&soft=30&grain=20`));
  await expect(page.getByRole("spinbutton", { name: /^Soft/ })).toHaveAttribute(
    "aria-valuenow",
    "30"
  );
  /* a list plays the blob with none: its address leaves the soft out, its cards unblurred */
  await page.goto("/palettes?style=blob&soft=45&grain=30");
  await live(page);
  await expect(page).toHaveURL(/\/palettes\?style=blob&grain=30$/);
  const art = page.locator("main article").first().locator("[role=img]").first();
  await expect
    .poll(() => art.evaluate(el => getComputedStyle(el.firstElementChild!).filter))
    .toBe("none");
  await expect(appearance).toHaveAccessibleName(/Grain 30/);
  await expect(appearance).not.toHaveAccessibleName(/Soft/);
  expect(errors).toEqual([]);
});
