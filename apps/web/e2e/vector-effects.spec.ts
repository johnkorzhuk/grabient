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

test("the editor stands while the menu's tiles under the pointer turn its picture to other styles and back, and a kind chosen plays that kind", async ({
  page
}) => {
  const reports: string[] = [];
  await page.route("**/api/client-error", route => {
    reports.push(route.request().postData() ?? "");
    return route.fulfill({ status: 204 });
  });
  await open(page, `/${SEED}?style=silk&angle=45`);
  await page.getByRole("button", { name: /^Appearance/ }).click();
  for (const tile of ["Fluted glass", "Linear", "Blob", "Rosette", "Silk", "Radial bands", "Silk"])
    await page.getByRole("button", { name: tile, exact: true }).hover();
  await page.mouse.move(10, 700);
  await expect(page.getByRole("complementary", { name: "Editor" })).toBeVisible();
  await expect(page.locator('[data-fx-still^="silk|"]').first()).toBeAttached();
  /* another vector kind is another layer, which plays that kind (the menu is still open) */
  await page.getByRole("button", { name: "Rosette", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/${SEED}\\?style=rosette&angle=45$`));
  await expect(page.locator('main [data-fx-still^="rosette|"]').first()).toBeAttached();
  await expect(page.getByRole("complementary", { name: "Editor" })).toBeVisible();
  expect(reports).toEqual([]);
});

test("Copy for Figma puts the silk and the rosette on the clipboard as Figma's own layers", async ({
  page,
  context
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  for (const kind of ["silk", "rosette"]) {
    await open(page, `/${SEED}?style=${kind}&angle=45`);
    const asked: string[] = [];
    page.on("request", r => {
      if (/figma-/.test(r.url())) asked.push(r.url());
    });
    await page.evaluate(() => navigator.clipboard.writeText(""));
    await page.getByRole("button", { name: "Copy for Figma" }).click();
    /* the paste is Figma's clipboard format: its name, and fig-kiwi's bytes */
    await expect
      .poll(async () =>
        page.evaluate(async () => {
          const [item] = await navigator.clipboard.read();
          return item.types.includes("text/html")
            ? await (await item.getType("text/html")).text()
            : "";
        })
      )
      .toMatch(
        /\(figmeta\)[A-Za-z0-9+/=]+\(\/figmeta\)[\s\S]*\(figma\)ZmlnLWtpd2[A-Za-z0-9+/=]+\(\/figma\)/
      );
    /* its own effect's layers load on the press */
    expect(asked.some(url => url.includes(`figma-${kind}`))).toBe(true);
  }
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

test("the silk's and the rosette's files: moving SVG, stylesheet, PNG, JSON, Markdown, the script that plays them and a clip", async ({
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
    const script = await at("js");
    expect([script.status(), script.headers()["content-type"]]).toEqual([
      200,
      "text/javascript; charset=utf-8"
    ]);
    const clip = await request.head(`/${SEED}.mp4?style=${kind}&shape=7`);
    expect([clip.status(), clip.headers()["content-type"]]).toEqual([200, "video/mp4"]);
  }
});
