import { EFFECT_KINDS, EFFECTS, hasFigma, isVectorKind } from "@grabient/engine/effect.ts";
import { KIT_KINDS } from "@grabient/engine/kit/kinds.ts";
import { KIT_LABELS } from "@grabient/engine/kit/names.ts";
import { expect, type Page, test } from "@playwright/test";
import { live } from "./live.ts";

/* The vector effects (EFFECT_KINDS: the silk, the rosette, the papercut, the strings and the field effects): effects
   drawn by one drawing of their loop over a plain vector still (engine/fx-still.ts), painted from the head in the first
   paint (server/fx-still.ts), chosen in the Appearance menu, played on a list's cards, and served as files. */

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
  /* named as the rosette it plays, never as the gradient under it */
  const heading = page.getByRole("heading", { level: 1 });
  await expect(page).toHaveTitle(/\S rosette \| Grabient$/);
  await expect(heading).toHaveText(/\S rosette$/);
  const button = page.getByRole("button", { name: /Rosette/ }).first();
  await expect(button).toBeVisible();
  await button.click();
  await expect(page.getByRole("button", { name: "Silk", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Rosette", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Silk", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/${SEED}\\?style=silk&angle=120$`));
  await expect(page).toHaveTitle(/\S silk \| Grabient$/);
  await expect(heading).toHaveText(/\S silk$/);
});

test("a palette turned from bands to an effect is named as the effect's own page names it", async ({
  page
}) => {
  /* the editor keeps the bands under the effect to give back, and its colors read otherwise there */
  const BANDS = "kWip242Lq_i9tQBYszteSW_Y";
  await open(page, `/${BANDS}?style=angularSwatches`);
  const heading = page.getByRole("heading", { level: 1 });
  await expect(heading).toHaveText("Monochrome blue and light blue angular swatches");
  await page.getByRole("button", { name: /^Appearance/ }).click();
  await page.getByRole("button", { name: "Rosette", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/${BANDS}\\?style=rosette$`));
  await expect(heading).toHaveText("Monochrome blue to light blue rosette");
  await expect(page).toHaveTitle("Monochrome blue to light blue rosette | Grabient");
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
    "Strings",
    ...KIT_KINDS.map(kind => KIT_LABELS[kind]),
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
  await page.getByRole("button", { name: "Strings", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/${SEED}\\?style=strings&angle=45$`));
  await expect(page.locator('main [data-fx-still^="strings|"]').first()).toBeAttached();
  /* each field effect a tile of its own, played as its own layer */
  for (const kind of KIT_KINDS) {
    await page.getByRole("button", { name: KIT_LABELS[kind], exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/${SEED}\\?style=${kind}&angle=45$`));
    await expect(page.locator(`main [data-fx-still^="${kind}|"]`).first()).toBeAttached();
  }
  await expect(page.getByRole("complementary", { name: "Editor" })).toBeVisible();
  expect(reports).toEqual([]);
});

test("the Appearance menu stands six cells across, the styles over their bands and the effects beside and beneath them, every name whole in the longest languages", async ({
  page
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const lang of ["de", "ru", "uk"]) {
    await open(page, `/${lang}/${SEED}?style=strata`);
    await page.locator('button[aria-controls="appearance-menu"]').first().click();
    const tiles = page.locator("#appearance-menu [aria-pressed]");
    await expect(tiles).toHaveCount(6 + EFFECTS.length);
    const cells = await tiles.evaluateAll(all =>
      all.map(tile => {
        const box = tile.getBoundingClientRect();
        /* the name, the tile's last part, as wide as its cell */
        const name = tile.lastElementChild as HTMLElement;
        return {
          name: tile.textContent,
          x: Math.round(box.x),
          y: Math.round(box.y),
          width: box.width,
          clipped: name.scrollWidth > name.clientWidth
        };
      })
    );
    expect(
      cells.filter(cell => cell.clipped).map(cell => cell.name),
      lang
    ).toEqual([]);
    /* 88 px a cell, which the longest name (German's Papierschnitt, 83 px) fits */
    for (const cell of cells) expect(cell.width, `${lang}: ${cell.name}`).toBeGreaterThan(87);
    /* the first effect beside the last style, the seventh beneath the first style */
    const [linear, , , , angular, , glass] = cells;
    expect(glass.y).toBe(linear.y);
    expect(glass.x).toBeGreaterThan(angular.x);
    expect(cells[12].x).toBe(linear.x);
    expect(cells[12].y).toBeGreaterThan(cells[1].y);
  }
});

test("a papercut's page paints its stepped still from the head, and offers its SVG in Copy for Figma's place", async ({
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
  await expect(page.getByRole("button", { name: "Copy SVG" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy for Figma" })).toHaveCount(0);
});

/* each vector effect a test of its own, so a new effect adds a test rather than seconds to one test's limit (all ten in
   one test took 21.0 s of its 30, 8 Nov 2026): Copy for Figma where Figma's timeline plays its layers (engine/effect.ts
   hasFigma), its SVG alone where a paste could only stand still */
for (const kind of EFFECTS.filter(isVectorKind).filter(k => !hasFigma(k)))
  test(`the ${kind}'s strip offers its SVG for Figma, and no Copy for Figma`, async ({ page }) => {
    await open(page, `/${SEED}?style=${kind}&angle=45`);
    await expect(page.getByRole("button", { name: "Copy SVG" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Copy HTML" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Copy for Figma" })).toHaveCount(0);
  });
for (const kind of EFFECTS.filter(isVectorKind).filter(hasFigma))
  test(`Copy for Figma puts the ${kind} on the clipboard as Figma's own layers`, async ({
    page,
    context
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await open(page, `/${SEED}?style=${kind}&angle=45`);
    const asked: string[] = [];
    page.on("request", r => {
      if (/figma/.test(r.url())) asked.push(r.url());
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
  });

/* the silk, the papercut, the strings and every field effect, each a test of its own, so a new effect adds a test
   rather than seconds to one test's limit (all seven in one test took 27.2 s of its 30, 8 Nov 2026) */
for (const [kind, name] of [
  ["silk", "Silk"],
  ["papercut", "Papercut"],
  ["strings", "Strings"],
  ...KIT_KINDS.map(kind => [kind, KIT_LABELS[kind]])
])
  test(`a list playing the ${kind} draws its cards' stills, each named for its kind`, async ({
    page,
    request
  }) => {
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
  });

test("the sandstone takes the view's steps, 8 to 40, where the zen garden takes none: its menu's Steps field redraws the stage and keeps its steps in the address", async ({
  page,
  request
}) => {
  const still = (html: string) => /data-fx-still="([^"]*)"/.exec(html)?.[1];
  /* its page at its designed steps names none, at others names them, its still and its address alike */
  expect(still(await (await request.get(`/${SEED}?style=strata`)).text())).toBe(
    `strata|${SEED}|90|`
  );
  const at12 = await (await request.get(`/${SEED}?style=strata&steps=12`)).text();
  expect(still(at12)).toBe(`strata|${SEED}|90||12`);
  expect(/<style id="fx-still" data-key="([^"]*)">/.exec(at12)?.[1].split(" ")).toContain(
    `strata|${SEED}|90||12`
  );
  /* the designed number leaves the address, one past the range comes within it, and every other effect leaves steps
     out: the Worker's 301 */
  const moved = async (address: string) =>
    (await request.get(address, { maxRedirects: 0 }))
      .headers()
      .location?.replace(/^https?:\/\/[^/]+/, "");
  expect(await moved(`/${SEED}?style=strata&steps=28`)).toBe(`/${SEED}?style=strata`);
  expect(await moved(`/${SEED}?style=strata&steps=99`)).toBe(`/${SEED}?style=strata&steps=40`);
  expect(await moved(`/${SEED}?style=strata&steps=3`)).toBe(`/${SEED}?style=strata&steps=8`);
  expect(await moved(`/${SEED}?style=zen&steps=12`)).toBe(`/${SEED}?style=zen`);
  /* a list's cards draw at its steps, and a list of another effect leaves them out */
  const list = await request.get("/palettes?style=strata&steps=12", { maxRedirects: 0 });
  expect(list.status()).toBe(200);
  expect(/<span[^>]*data-fx-still="([^"]*)"/.exec(await list.text())?.[1]).toMatch(
    /^strata\|.*\|12$/
  );
  expect(await moved("/palettes?style=zen&steps=12")).toBe("/palettes?style=zen");

  /* held still, a change of steps draws the stage's still anew */
  await open(page, `/${SEED}?style=strata&speed=0`);
  const stage = page.locator('[elementtiming="effect-still"]');
  await expect(stage).toHaveAttribute("data-fx-still", `strata|${SEED}|90|`);
  const before = await stage.evaluate(el => getComputedStyle(el).backgroundImage);
  expect(before).toContain("data:image/svg+xml");
  await page.getByRole("button", { name: /^Appearance/ }).click();
  const steps = page.getByRole("spinbutton", { name: "Steps", exact: true });
  await expect(steps).toHaveAttribute("aria-valuemin", "8");
  await expect(steps).toHaveAttribute("aria-valuemax", "40");
  await expect(steps).toHaveAttribute("aria-valuenow", "28");
  await steps.focus();
  await page.keyboard.type("12");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/${SEED}\\?style=strata&speed=0&steps=12$`));
  await expect(stage).toHaveAttribute("data-fx-still", `strata|${SEED}|90||12`);
  await expect
    .poll(() => stage.evaluate(el => getComputedStyle(el).backgroundImage))
    .not.toBe(before);
  await expect(
    page.getByRole("button", { name: /^Appearance: Sandstone, Off · 12 steps/ })
  ).toBeVisible();
  /* the zen garden's menu has no Steps, and the sandstone gives its own back */
  await page.getByRole("button", { name: KIT_LABELS.zen, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/${SEED}\\?style=zen$`));
  await expect(steps).toHaveCount(0);
  await page.getByRole("button", { name: KIT_LABELS.strata, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/${SEED}\\?style=strata&speed=0&steps=12$`));
  await expect(steps).toHaveAttribute("aria-valuenow", "12");
});

test("the strings take a ground: their menu's Background field lays the stage on it and keeps it in the address, a clear one shows the page's own, and its press gives their designed one back", async ({
  page,
  request
}) => {
  const still = (html: string) => /data-fx-still="([^"]*)"/.exec(html)?.[1];
  /* a page on a ground names it in its still, which the head paints */
  const light = await (await request.get(`/${SEED}?style=strings&bg=%23f4efe6`)).text();
  expect(still(light)).toBe(`strings|${SEED}|90||#f4efe6`);
  expect(/<style id="fx-still" data-key="([^"]*)">/.exec(light)?.[1].split(" ")).toContain(
    `strings|${SEED}|90||#f4efe6`
  );
  /* a clear one stands the first screen on the page's own ground */
  const clear = await (await request.get(`/${SEED}?style=strings&bg=%2300000000`)).text();
  expect(clear).toMatch(
    /<div[^>]*data-bare=""[^>]*>\s*<div[^>]*data-fx-still="strings\|[^"]*\|#00000000"/
  );
  /* the Worker's 301: words at their hex, a clear one kept as the one clear ground, and an effect that takes none
     leaves it out */
  const moved = async (address: string) =>
    (await request.get(address, { maxRedirects: 0 }))
      .headers()
      .location?.replace(/^https?:\/\/[^/]+/, "");
  expect(await moved(`/${SEED}?style=strings&bg=navy`)).toBe(`/${SEED}?style=strings&bg=%23000080`);
  expect(await moved(`/${SEED}?style=strings&bg=transparent`)).toBe(
    `/${SEED}?style=strings&bg=%2300000000`
  );
  expect(await moved(`/${SEED}?style=silk&bg=%23f4efe6`)).toBe(`/${SEED}?style=silk`);
  /* a list's cards stand on its ground */
  const list = await request.get("/palettes?style=strings&bg=%23f4efe6", { maxRedirects: 0 });
  expect(list.status()).toBe(200);
  expect(/<span[^>]*data-fx-still="([^"]*)"/.exec(await list.text())?.[1]).toMatch(
    /^strings\|.*\|#f4efe6$/
  );
  /* its files: the SVG lays it, the JSON names it */
  expect(await (await request.get(`/${SEED}.svg?style=strings&bg=%2310203080`)).text()).toContain(
    'fill="#102030" fill-opacity=".502"'
  );
  expect(
    JSON.parse(await (await request.get(`/${SEED}.json?style=strings&bg=%23f4efe6`)).text()).effect
  ).toMatchObject({ style: "strings", bg: "#f4efe6" });

  /* held still: the field reads Auto, a ground set redraws the stage's still and keeps it in the address */
  await open(page, `/${SEED}?style=strings&speed=0`);
  const stage = page.locator('[elementtiming="effect-still"]');
  await expect(stage).toHaveAttribute("data-fx-still", `strings|${SEED}|90|`);
  const before = await stage.evaluate(el => getComputedStyle(el).backgroundImage);
  await page.getByRole("button", { name: /^Appearance/ }).click();
  const field = page.getByRole("textbox", { name: "Background color" });
  await expect(field).toHaveAttribute("placeholder", "Auto");
  await field.click();
  await page.keyboard.type("#f4efe6");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/${SEED}\\?style=strings&speed=0&bg=%23f4efe6$`));
  await expect(stage).toHaveAttribute("data-fx-still", `strings|${SEED}|90||#f4efe6`);
  await expect
    .poll(() => stage.evaluate(el => getComputedStyle(el).backgroundImage))
    .not.toBe(before);
  await expect(stage.locator("..")).not.toHaveAttribute("data-bare", "");
  /* a clear one: the stage stands on the page's own ground */
  await field.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("transparent");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/${SEED}\\?style=strings&speed=0&bg=%2300000000$`));
  await expect(stage.locator("..")).toHaveAttribute("data-bare", "");
  /* the press at the field's end gives the designed ground back */
  await page.getByRole("button", { name: "Reset background" }).click();
  await expect(page).toHaveURL(new RegExp(`/${SEED}\\?style=strings&speed=0$`));
  await expect(stage).toHaveAttribute("data-fx-still", `strings|${SEED}|90|`);
  await expect(field).toHaveValue("");
  /* the silk's menu has no Background field */
  await page.getByRole("button", { name: "Silk", exact: true }).click();
  await expect(field).toHaveCount(0);
});

/* each vector effect a test of its own, as the list's and the Figma copy's are */
for (const kind of EFFECTS.filter(isVectorKind))
  test(`the ${kind} as files: SVG, stylesheet, PNG, JSON, Markdown, script and clip`, async ({
    request
  }) => {
    const at = (extension: string) => request.get(`/${SEED}.${extension}?style=${kind}&shape=7`);
    const svg = await at("svg");
    expect(svg.headers()["content-type"]).toMatch(/^image\/svg\+xml/);
    const drawn = await svg.text();
    expect(drawn).toMatch(/^<svg[^>]*width="800" height="400"/);
    /* one that moves no SVG (effect.ts's EFFECT_KINDS) is its still at any speed */
    if (EFFECT_KINDS[kind].svgMotion === null) expect(drawn).not.toMatch(/<animate|@keyframes/);
    /* the papercut's is its still at any speed, its shadows blurred, which Figma's importer takes as layers */
    if (kind === "papercut") {
      expect(drawn).toContain("<feGaussianBlur");
      expect(drawn).not.toContain("<animate");
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
