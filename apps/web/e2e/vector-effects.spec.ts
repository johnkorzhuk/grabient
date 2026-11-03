import { expect, type Page, test } from "@playwright/test";
import { live } from "./live.ts";

/* The silk, the rosette and the papercut: effects drawn by one drawing of their loop over a plain vector still
   (engine/fx-still.ts), painted from the head in the first paint (server/fx-still.ts), chosen in the Appearance menu,
   played on a list's cards, and served as files. */

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
  for (const tile of [
    "Fluted glass",
    "Linear",
    "Blob",
    "Rosette",
    "Papercut",
    "Silk",
    "Radial bands",
    "Papercut",
    "Silk"
  ])
    await page.getByRole("button", { name: tile, exact: true }).hover();
  await page.mouse.move(10, 700);
  await expect(page.getByRole("complementary", { name: "Editor" })).toBeVisible();
  await expect(page.locator('[data-fx-still^="silk|"]').first()).toBeAttached();
  /* another vector kind is another layer, which plays that kind (the menu is still open) */
  await page.getByRole("button", { name: "Rosette", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/${SEED}\\?style=rosette&angle=45$`));
  await expect(page.locator('main [data-fx-still^="rosette|"]').first()).toBeAttached();
  await page.getByRole("button", { name: "Papercut", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/${SEED}\\?style=papercut&angle=45$`));
  await expect(page.locator('main [data-fx-still^="papercut|"]').first()).toBeAttached();
  await expect(page.getByRole("complementary", { name: "Editor" })).toBeVisible();
  expect(reports).toEqual([]);
});

test("a papercut's page paints its stepped still from the head, and offers Copy for Figma", async ({
  page,
  request
}) => {
  const html = await (await request.get(`/${SEED}?style=papercut&angle=30&shape=7`)).text();
  const painted = /<style id="fx-still" data-key="([^"]*)">([^<]*)<\/style>/.exec(html);
  const named = /data-fx-still="([^"]*)"/.exec(html)?.[1];
  expect(named).toBe(`papercut|${SEED}|30|7`);
  expect(painted?.[1].split(" ")).toContain(named);
  /* the still's shadows are stepped strokes, no blur for a list of them to paint */
  expect(painted?.[2]).toContain("stroke-width");
  expect(painted?.[2]).not.toMatch(/filter/);

  await open(page, `/${SEED}?style=papercut&angle=30&shape=7`);
  await expect(page.getByRole("button", { name: /Papercut/ }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy HTML" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy for Figma" })).toBeVisible();
});

test("Copy for Figma puts the silk, the rosette and the papercut on the clipboard as Figma's own layers", async ({
  page,
  context
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  for (const kind of ["silk", "rosette", "papercut"]) {
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

test("a list playing the silk or the papercut draws its cards' stills, each named for its kind", async ({
  page,
  request
}) => {
  for (const [kind, name] of [
    ["silk", "Silk"],
    ["papercut", "Papercut"]
  ]) {
    const sent = await request.get(`/palettes?style=${kind}`, { maxRedirects: 0 });
    expect(sent.status()).toBe(200);
    const html = await sent.text();
    const painted = /<style id="fx-still" data-key="([^"]*)">/.exec(html)?.[1].split(" ") ?? [];
    const first = /<span[^>]*data-fx-still="([^"]*)"/.exec(html)?.[1];
    expect(first).toMatch(new RegExp(`^${kind}\\|`));
    expect(painted).toContain(first);

    await open(page, `/palettes?style=${kind}`);
    await expect(
      page
        .locator("main article")
        .first()
        .getByRole("img", { name: new RegExp(`, ${name}$`) })
    ).toBeVisible();
  }
});

test("the silk's, the rosette's and the papercut's files: SVG, stylesheet, PNG, JSON, Markdown, script and clip", async ({
  request
}) => {
  for (const kind of ["silk", "rosette", "papercut"]) {
    const at = (extension: string) => request.get(`/${SEED}.${extension}?style=${kind}&shape=7`);
    const svg = await at("svg");
    expect(svg.headers()["content-type"]).toMatch(/^image\/svg\+xml/);
    const drawn = await svg.text();
    expect(drawn).toMatch(/^<svg[^>]*width="800" height="400"/);
    /* the papercut's moves by its stills fading one into the next, and held is its still with its shadows blurred, as
       Figma's importer takes them */
    if (kind === "papercut") {
      expect(drawn).toContain("@keyframes pcf{");
      expect(drawn).not.toContain("<feGaussianBlur");
      const held = await request.get(`/${SEED}.svg?style=papercut&shape=7&speed=0`);
      expect(await held.text()).toContain("<feGaussianBlur");
    }
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

test("a list turned to the papercut draws every card's still in turn, a frame's share at a time", async ({
  page
}) => {
  await open(page, "/palettes?style=linearGradient");
  await page.getByRole("button", { name: /^Appearance/ }).click();
  await page.getByRole("button", { name: "Papercut", exact: true }).click();
  await expect(page).toHaveURL(/\/palettes\?style=papercut$/);
  /* no card's still was in the head, which painted the gradients: each is drawn here, and each comes */
  const cards = page.locator('main article [data-fx-still^="papercut|"]');
  await expect(cards.first()).toBeAttached();
  await expect
    .poll(
      () =>
        cards.evaluateAll(
          all =>
            all.filter(e => (e as HTMLElement).style.background.includes("data:image/svg+xml"))
              .length === all.length
        ),
      { timeout: 15_000 }
    )
    .toBe(true);
});

test("the papercut's stage keeps its player at speed 0, its exact first frame over the stepped still, where the silk's stage keeps its still", async ({
  page
}) => {
  await open(page, `/${SEED}?style=papercut&speed=0`);
  await expect(page.locator('main [data-fx-still^="papercut|"] ~ canvas')).toBeAttached();
  await open(page, `/${SEED}?style=silk&speed=0`);
  await expect(page.locator('main [data-fx-still^="silk|"]').first()).toBeAttached();
  await expect(page.locator('main [data-fx-still^="silk|"] ~ canvas')).toHaveCount(0);
});

test("a papercut's Copy PNG is its first frame at the stage's size, grained as the page is", async ({
  page,
  context
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await open(page, `/${SEED}?style=papercut&angle=30&soft=40&grain=30&size=800x400&shape=7`);
  const stage = { width: 800, height: 400 };
  await page.evaluate(() => navigator.clipboard.writeText(""));
  /* the stage's strip's, the first of the page's (the contrast and color space panels have theirs) */
  await page.getByRole("button", { name: "Copy PNG" }).first().click();
  const read = () =>
    page.evaluate(async () => {
      const [item] = await navigator.clipboard.read();
      if (!item?.types.includes("image/png")) return null;
      const image = await createImageBitmap(await item.getType("image/png"));
      /* the grain: a speck on every pixel, so neighbours differ by levels where a sheet is flat */
      const canvas = new OffscreenCanvas(image.width, image.height);
      const context = canvas.getContext("2d")!;
      context.drawImage(image, 0, 0);
      const { data } = context.getImageData(0, 0, image.width, image.height);
      const steps: number[] = [];
      for (let i = 0; i + 4 < data.length; i += 4 * 97)
        steps.push(Math.abs(data[i + 1] - data[i + 5]));
      steps.sort((a, b) => a - b);
      return { width: image.width, height: image.height, step: steps[steps.length >> 1] };
    });
  await expect.poll(read, { timeout: 15_000 }).not.toBeNull();
  const picture = (await read())!;
  expect({ width: picture.width, height: picture.height }).toEqual(stage);
  expect(picture.step).toBeGreaterThan(1);
});
