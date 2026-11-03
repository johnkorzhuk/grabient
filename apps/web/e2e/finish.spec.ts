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
  await expect.poll(() => art(page)).toMatch(/^url\("[^"]*\/grain-[0-9a-f]+\/12\.png"\)/);
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
  expect(drawn).toMatch(/^url\("[^"]*\/grain-[0-9a-f]+\/20\.png"\) 0 0 \/ 128px 128px, /);
  expect(drawn).toContain("radial-gradient(");
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(String(error)));
  await page.goto(address);
  await live(page);
  await expect(page).toHaveURL(new RegExp(`/${SEED}\\?style=radialSwatches&soft=40&grain=20$`));
  const stage = page.getByRole("img", { name: "The gradient" }).first();
  await expect
    .poll(() => stage.evaluate(el => getComputedStyle(el).backgroundImage))
    .toMatch(/^url\("[^"]*\/grain-[0-9a-f]+\/20\.png"\), radial-gradient\(/);
  await page.getByRole("button", { name: /^Appearance/ }).click();
  await expect(page.getByRole("spinbutton", { name: /^Soft/ })).toHaveAttribute(
    "aria-valuenow",
    "40"
  );
  expect(errors).toEqual([]);

  const file = (extension: string) =>
    request.get(`/${SEED}.${extension}?style=radialSwatches&soft=40&grain=20`);
  const css = await (await file("css")).text();
  expect(css).toContain('url("data:image/png;base64,');
  expect(css).toContain("radial-gradient(");
  const svg = await (await file("svg")).text();
  expect(svg).toContain('<pattern id="grain"');
  expect(svg).toMatch(/<radialGradient[^>]*><stop offset="0\.\d{5}"/);
  const png = await file("png");
  expect(png.headers()["content-type"]).toBe("image/png");
  expect(JSON.parse(await (await file("json")).text())).toMatchObject({ soft: 40, grain: 20 });
});
