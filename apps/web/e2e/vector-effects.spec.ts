import {
  canRoam,
  EFFECT_KINDS,
  EFFECTS,
  hasEmbedScript,
  hasFigma,
  isVectorKind
} from "@grabient/engine/effect.ts";
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
/* one the pointer moves (the dimple) is among those whose strip offers none until it roams (canRoam, pastesToFigma) */
for (const kind of EFFECTS.filter(isVectorKind).filter(k => !hasFigma(k) || canRoam(k)))
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
    /* an effect the pointer moves pastes its roam, which its address asks for */
    await open(page, `/${SEED}?style=${kind}&angle=45${canRoam(kind) ? "&roam=1" : ""}`);
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
  ["dimple", "Dimple"],
  ["aurora", "Aurora"],
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

test("the sandstone takes the view's steps, 8 to 40, where the papercut takes none: its menu's Steps field redraws the stage and keeps its steps in the address", async ({
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
  expect(await moved(`/${SEED}?style=papercut&steps=12`)).toBe(`/${SEED}?style=papercut`);
  /* a list's cards draw at its steps, and a list of another effect leaves them out */
  const list = await request.get("/palettes?style=strata&steps=12", { maxRedirects: 0 });
  expect(list.status()).toBe(200);
  expect(/<span[^>]*data-fx-still="([^"]*)"/.exec(await list.text())?.[1]).toMatch(
    /^strata\|.*\|12$/
  );
  expect(await moved("/palettes?style=papercut&steps=12")).toBe("/palettes?style=papercut");

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
  /* the papercut's menu has no Steps, and the sandstone gives its own back */
  await page.getByRole("button", { name: "Papercut", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/${SEED}\\?style=papercut$`));
  await expect(steps).toHaveCount(0);
  await page.getByRole("button", { name: KIT_LABELS.strata, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/${SEED}\\?style=strata&speed=0&steps=12$`));
  await expect(steps).toHaveAttribute("aria-valuenow", "12");
});

test("the dimple takes a zoom, 1 to 4, in its shape's place: its menu's Zoom field redraws the stage and keeps its zoom in the address, and it has no Shape", async ({
  page,
  request
}) => {
  const still = (html: string) => /data-fx-still="([^"]*)"/.exec(html)?.[1];
  /* its page as designed names no zoom, at another names it, its still and its address alike */
  expect(still(await (await request.get(`/${SEED}?style=dimple`)).text())).toBe(
    `dimple|${SEED}|90|`
  );
  const at25 = await (await request.get(`/${SEED}?style=dimple&zoom=2.5`)).text();
  expect(still(at25)).toBe(`dimple|${SEED}|90||2.5x`);
  /* the designed zoom leaves the address, one past the range comes within it, two decimals are kept, a shape leaves
     the dimple's address and a zoom every other effect's: the Worker's 301 */
  const moved = async (address: string) =>
    (await request.get(address, { maxRedirects: 0 }))
      .headers()
      .location?.replace(/^https?:\/\/[^/]+/, "");
  expect(await moved(`/${SEED}?style=dimple&zoom=1`)).toBe(`/${SEED}?style=dimple`);
  expect(await moved(`/${SEED}?style=dimple&zoom=9`)).toBe(`/${SEED}?style=dimple&zoom=4`);
  expect(await moved(`/${SEED}?style=dimple&zoom=2.456`)).toBe(`/${SEED}?style=dimple&zoom=2.46`);
  expect(await moved(`/${SEED}?style=dimple&shape=417`)).toBe(`/${SEED}?style=dimple`);
  expect(await moved(`/${SEED}?style=papercut&zoom=2`)).toBe(`/${SEED}?style=papercut`);
  /* a list's cards draw at its zoom */
  const list = await request.get("/palettes?style=dimple&zoom=3", { maxRedirects: 0 });
  expect(list.status()).toBe(200);
  expect(/<span[^>]*data-fx-still="([^"]*)"/.exec(await list.text())?.[1]).toMatch(
    /^dimple\|.*\|3x$/
  );

  /* held still, a change of zoom draws the stage's still anew */
  await open(page, `/${SEED}?style=dimple&speed=0`);
  const stage = page.locator('[elementtiming="effect-still"]');
  await expect(stage).toHaveAttribute("data-fx-still", `dimple|${SEED}|90|`);
  const before = await stage.evaluate(el => getComputedStyle(el).backgroundImage);
  expect(before).toContain("data:image/svg+xml");
  await page.getByRole("button", { name: /^Appearance/ }).click();
  const zoom = page.getByRole("spinbutton", { name: "Zoom", exact: true });
  await expect(zoom).toHaveAttribute("aria-valuemin", "1");
  await expect(zoom).toHaveAttribute("aria-valuemax", "4");
  await expect(zoom).toHaveAttribute("aria-valuenow", "1");
  await expect(page.getByRole("spinbutton", { name: "Shape", exact: true })).toHaveCount(0);
  await zoom.focus();
  await page.keyboard.type("2.5");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/${SEED}\\?style=dimple&speed=0&zoom=2\\.5$`));
  await expect(stage).toHaveAttribute("data-fx-still", `dimple|${SEED}|90||2.5x`);
  await expect
    .poll(() => stage.evaluate(el => getComputedStyle(el).backgroundImage))
    .not.toBe(before);
  await expect(
    page.getByRole("button", { name: /^Appearance: Dimple, Off · Zoom 2\.5×/ })
  ).toBeVisible();
  /* the papercut's menu has a Shape and no Zoom, and the dimple gives its own back */
  await page.getByRole("button", { name: "Papercut", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/${SEED}\\?style=papercut$`));
  await expect(zoom).toHaveCount(0);
  await expect(page.getByRole("spinbutton", { name: "Shape", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Dimple", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/${SEED}\\?style=dimple&speed=0&zoom=2\\.5$`));
  await expect(zoom).toHaveAttribute("aria-valuenow", "2.5");
});

test("the aurora takes a path in its shape's place: its menu's Shape field names the kind of its range and makes another, its Path field takes one written by hand, and its address keeps it", async ({
  page,
  request
}) => {
  const still = (html: string) => /data-fx-still="([^"]*)"/.exec(html)?.[1];
  const walled = "line,0:30,20:30,20:55,35:55,35:38,100:38";
  /* its page as designed names no path, at another names it, its still and its address alike */
  expect(still(await (await request.get(`/${SEED}?style=aurora`)).text())).toBe(
    `aurora|${SEED}|90|`
  );
  expect(still(await (await request.get(`/${SEED}?style=aurora&path=${walled}`)).text())).toBe(
    `aurora|${SEED}|90||${walled}`
  );
  /* a path in another spelling comes to its one spelling, written with its commas as they are; words that are no
     path leave the address, a shape leaves the aurora's and a path every other effect's: the Worker's 301 */
  const moved = async (address: string) =>
    (await request.get(address, { maxRedirects: 0 }))
      .headers()
      .location?.replace(/^https?:\/\/[^/]+/, "");
  expect(await moved(`/${SEED}?style=aurora&path=line,33.0,33`)).toBe(
    `/${SEED}?style=aurora&path=line,33,33`
  );
  expect(await moved(`/${SEED}?style=aurora&path=line,25,25,line,40`)).toBe(
    `/${SEED}?style=aurora&path=line,25,25,40`
  );
  expect(await moved(`/${SEED}?style=aurora&path=mountains`)).toBe(`/${SEED}?style=aurora`);
  expect(await moved(`/${SEED}?style=aurora&shape=417`)).toBe(`/${SEED}?style=aurora`);
  expect(await moved(`/${SEED}?style=papercut&path=line,33,33`)).toBe(`/${SEED}?style=papercut`);
  /* a list's cards stand behind its path, which a list's address writes as the router does */
  const list = await request.get("/palettes?style=aurora&path=line%2C33%2C33", {
    maxRedirects: 0
  });
  expect(list.status()).toBe(200);
  expect(/<span[^>]*data-fx-still="([^"]*)"/.exec(await list.text())?.[1]).toMatch(
    /^aurora\|.*\|line,33,33$/
  );

  /* held still, a change of path draws the stage's still anew */
  await open(page, `/${SEED}?style=aurora&speed=0`);
  const said = () => decodeURIComponent(new URL(page.url()).search);
  const stage = page.locator('[elementtiming="effect-still"]');
  await expect(stage).toHaveAttribute("data-fx-still", `aurora|${SEED}|90|`);
  const before = await stage.evaluate(el => getComputedStyle(el).backgroundImage);
  expect(before).toContain("data:image/svg+xml");
  await page.getByRole("button", { name: /^Appearance/ }).click();
  /* its Shape is the kind of its range, a word, where the papercut's is a number; its Path is none as designed */
  const shape = page.getByRole("spinbutton", { name: "Shape", exact: true });
  await expect(shape).toHaveAttribute("aria-valuetext", "Range");
  await expect(shape).toHaveAttribute("aria-valuemin", "0");
  await expect(shape).toHaveAttribute("aria-valuemax", "4");
  const path = page.getByRole("textbox", { name: "Path", exact: true });
  await expect(path).toHaveValue("");
  /* a path written by hand, in capitals and with a decimal it need not have, is kept in its one spelling */
  await path.click();
  await path.fill("CURVE,30,55.0,35,60,30");
  await page.keyboard.press("Enter");
  await expect.poll(said).toBe("?style=aurora&speed=0&path=curve,30,55,35,60,30");
  await expect(path).toHaveValue("curve,30,55,35,60,30");
  await expect(shape).toHaveAttribute("aria-valuetext", "Curve");
  await expect(stage).toHaveAttribute("data-fx-still", `aurora|${SEED}|90||curve,30,55,35,60,30`);
  await expect
    .poll(() => stage.evaluate(el => getComputedStyle(el).backgroundImage))
    .not.toBe(before);
  /* words that are no path leave it as it was; a whole link's path is taken from it */
  await path.evaluate(field => (field as HTMLInputElement).blur());
  await path.click();
  await path.fill("mountains, please");
  await page.keyboard.press("Enter");
  await expect(path).toHaveValue("curve,30,55,35,60,30");
  await path.evaluate(field => (field as HTMLInputElement).blur());
  await path.click();
  await path.fill(`https://grabient.com/${SEED}?style=aurora&path=${walled}&bg=%23102030`);
  await page.keyboard.press("Enter");
  await expect(path).toHaveValue(walled);
  await expect(shape).toHaveAttribute("aria-valuetext", "Skyline");
  await expect.poll(said).toBe(`?style=aurora&speed=0&path=${walled}`);
  /* the press in the Shape field makes another range of the kind shown */
  await page.getByRole("button", { name: "New shape", exact: true }).click();
  await expect(path).not.toHaveValue(walled);
  await expect(shape).toHaveAttribute("aria-valuetext", "Skyline");
  await expect.poll(said).toMatch(/^\?style=aurora&speed=0&path=line,0:/);
  /* the field's own press gives the designed range back */
  await page
    .locator("#appearance-menu")
    .getByRole("button", { name: "Clear", exact: true })
    .click();
  await expect.poll(said).toBe("?style=aurora&speed=0");
  await expect(shape).toHaveAttribute("aria-valuetext", "Range");
  await expect(stage).toHaveAttribute("data-fx-still", `aurora|${SEED}|90|`);
  /* its range's color is its ground, none clear: a color named any way CSS names one is kept at its hex */
  const ground = page.getByRole("textbox", { name: "Background color", exact: true });
  await ground.click();
  await ground.fill("navy");
  await page.keyboard.press("Enter");
  await expect.poll(said).toBe("?style=aurora&speed=0&bg=#000080");
  await expect(stage).toHaveAttribute("data-fx-still", `aurora|${SEED}|90||#000080`);
  /* the papercut's menu has a number for its Shape and no Path, each effect at its own pace, and the aurora gives
     its own back */
  await page.getByRole("button", { name: "Papercut", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/${SEED}\\?style=papercut$`));
  await expect(path).toHaveCount(0);
  await expect(shape).toHaveAttribute("aria-valuemax", "999");
  await page.getByRole("button", { name: "Aurora", exact: true }).click();
  await expect.poll(said).toBe("?style=aurora&speed=0&bg=#000080");
  await expect(shape).toHaveAttribute("aria-valuetext", "Range");
});

test("the aurora stands upright where no angle is set for it: on a list's cards whatever each palette's own, and in the editor at Auto, where an angle set turns it", async ({
  page,
  request
}) => {
  /* John, 11 Nov 2026, of the aurora lying on its side at a palette's own angle: "make auto 90 deg for this one" */
  const stills = async (path: string) =>
    [
      ...(await (await request.get(path)).text()).matchAll(/<span[^>]*data-fx-still="([^"]*)"/g)
    ].map(found => found[1]);
  /* a list that sets no angle plays the aurora at 90 on every card, where the silk's turn with their palettes */
  const auroras = await stills("/palettes?style=aurora");
  expect(auroras.length).toBeGreaterThan(8);
  for (const key of auroras) expect(key).toMatch(/^aurora\|[^|]+\|90\|$/);
  const silks = await stills("/palettes?style=silk");
  expect(new Set(silks.map(key => key.split("|")[2])).size).toBeGreaterThan(1);
  /* an angle the list sets turns every card's */
  const turned = await stills("/palettes?style=aurora&angle=30");
  expect(turned.length).toBeGreaterThan(8);
  for (const key of turned) expect(key).toMatch(/^aurora\|[^|]+\|30\|$/);

  /* a palette's page whose gradient lies at 45: the aurora chosen there stands at 90, its address naming no angle
     and its menu's Angle at Auto, and the gradient chosen again has the page's angle */
  await open(page, `/${SEED}?angle=45`);
  const said = () => decodeURIComponent(new URL(page.url()).search);
  await page.getByRole("button", { name: /^Appearance/ }).click();
  await page.getByRole("button", { name: "Aurora", exact: true }).click();
  await expect.poll(said).toBe("?style=aurora");
  const stage = page.locator('main [data-fx-still^="aurora|"]').first();
  await expect(stage).toHaveAttribute("data-fx-still", `aurora|${SEED}|90|`);
  const angle = page.getByRole("spinbutton", { name: "Angle", exact: true });
  await expect(angle).toHaveAttribute("aria-valuetext", "Auto");
  await page.getByRole("button", { name: "Linear", exact: true }).click();
  await expect.poll(said).toBe("?angle=45");
  /* an angle the reader sets turns it as any other effect, and its address names it */
  await page.getByRole("button", { name: "Aurora", exact: true }).click();
  await expect.poll(said).toBe("?style=aurora");
  await angle.focus();
  await page.keyboard.type("30");
  await page.keyboard.press("Enter");
  await expect.poll(said).toBe("?style=aurora&angle=30");
  await expect(stage).toHaveAttribute("data-fx-still", `aurora|${SEED}|30|`);
  await expect(angle).toHaveAttribute("aria-valuetext", "30°");
});

test("the dimple roams where its menu's Roam is on: its address says roam=1, its stage plays by itself, its strip gains Copy for Figma, and turned off it follows the pointer again", async ({
  page,
  request
}) => {
  /* John, 11 Nov 2026: "a toggle for making this style do a subtle animation as if the cursor was roaming around on
     the on canvas isntead of static + follows cursor? Try to get something that can be exported as a figma clipboard
     copy" */
  const moved = async (address: string) =>
    (await request.get(address, { maxRedirects: 0 }))
      .headers()
      .location?.replace(/^https?:\/\/[^/]+/, "");
  /* only roam=1 is the roam, only the dimple takes it, and it stands after how the effect plays: the Worker's 301 */
  expect((await request.get(`/${SEED}?style=dimple&roam=1`, { maxRedirects: 0 })).status()).toBe(
    200
  );
  expect(await moved(`/${SEED}?style=dimple&roam=0`)).toBe(`/${SEED}?style=dimple`);
  expect(await moved(`/${SEED}?style=dimple&roam=1&speed=2`)).toBe(
    `/${SEED}?style=dimple&speed=2&roam=1`
  );
  expect(await moved(`/${SEED}?style=papercut&roam=1`)).toBe(`/${SEED}?style=papercut`);
  /* its still is the roam's first frame, named as the dimple's that follows the pointer */
  const still = (html: string) => /data-fx-still="([^"]*)"/.exec(html)?.[1];
  expect(still(await (await request.get(`/${SEED}?style=dimple&roam=1`)).text())).toBe(
    `dimple|${SEED}|90|`
  );
  /* a list roams every card's alike */
  expect((await request.get("/palettes?style=dimple&roam=1", { maxRedirects: 0 })).status()).toBe(
    200
  );
  /* its files say so: its JSON's roam, its Markdown's words */
  const json = JSON.parse(await (await request.get(`/${SEED}.json?style=dimple&roam=1`)).text());
  expect(json.effect).toMatchObject({ style: "dimple", roam: true });
  expect(await (await request.get(`/${SEED}.md?style=dimple&roam=1`)).text()).toContain(
    "its hollow roaming its loop"
  );

  await open(page, `/${SEED}?style=dimple`);
  await expect(page.getByRole("button", { name: "Copy for Figma" })).toHaveCount(0);
  await page.getByRole("button", { name: /^Appearance/ }).click();
  const roam = page.getByRole("switch", { name: "Roam" });
  await expect(roam).toHaveAttribute("aria-checked", "false");
  await expect(page.getByText("The hollow follows the pointer.")).toBeVisible();
  await roam.click();
  await expect(roam).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText("The hollow wanders by itself.")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/${SEED}\\?style=dimple&roam=1$`));
  await expect(page.getByRole("button", { name: /^Appearance: Dimple, 1× · Roam/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy for Figma" })).toBeVisible();
  /* no other effect's menu has the switch, and the dimple keeps its own */
  await page.getByRole("button", { name: "Papercut", exact: true }).click();
  await expect(roam).toHaveCount(0);
  await page.getByRole("button", { name: "Dimple", exact: true }).click();
  await expect(roam).toHaveAttribute("aria-checked", "true");
  await roam.click();
  await expect(page).toHaveURL(new RegExp(`/${SEED}\\?style=dimple$`));
  await expect(page.getByRole("button", { name: "Copy for Figma" })).toHaveCount(0);
});

test("an address that still names an effect the site plays no more is the palette's or the list's own, and its files the palette's", async ({
  request
}) => {
  /* a page and four files under vite dev, beside the other tests' */
  test.slow();
  /* the zen garden (style=zen) was a field effect on staging from 8 to 10 Nov 2026: its address is read as any style
     that names neither a gradient nor an effect (features/editor/address.test.ts, server/pipeline.test.ts) */
  const moved = async (address: string) => {
    const answer = await request.get(address, { maxRedirects: 0 });
    return [answer.status(), answer.headers().location?.replace(/^https?:\/\/[^/]+/, "")];
  };
  expect(await moved(`/${SEED}?style=zen&shape=7&speed=2`)).toEqual([301, `/${SEED}`]);
  expect(await moved("/palettes?style=zen&steps=12")).toEqual([301, "/palettes?steps=12"]);
  const page = await request.get(`/${SEED}?style=zen`);
  expect([page.status(), new URL(page.url()).pathname + new URL(page.url()).search]).toEqual([
    200,
    `/${SEED}`
  ]);
  for (const [file, type] of [
    ["png", "image/png"],
    ["svg", "image/svg+xml; charset=utf-8"],
    ["css", "text/css; charset=utf-8"],
    ["json", "application/json"]
  ]) {
    const answer = await request.get(`/${SEED}.${file}?style=zen&shape=7`);
    expect([file, answer.status(), answer.headers()["content-type"]]).toEqual([file, 200, type]);
  }
  /* a script and a clip are an effect's alone */
  for (const file of ["js", "mp4"])
    expect([file, (await request.get(`/${SEED}.${file}?style=zen`)).status()]).toEqual([file, 404]);
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
  test(`the ${kind} as files: SVG, stylesheet, PNG, JSON, Markdown, ${hasEmbedScript(kind) ? "script" : "no script"} and ${EFFECT_KINDS[kind].video ? "clip" : "no clip"}`, async ({
    request
  }) => {
    /* its look: a shape, or a zoom (the dimple's) or a path (the aurora's) in its place */
    const zoomed = EFFECT_KINDS[kind].zoom !== null;
    const pathed = EFFECT_KINDS[kind].path;
    const look = zoomed ? "zoom=2.5" : pathed ? "path=line,33,33" : "shape=7";
    const at = (extension: string) => request.get(`/${SEED}.${extension}?style=${kind}&${look}`);
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
    expect(json.effect).toMatchObject({
      style: kind,
      ...(zoomed ? { zoom: 2.5 } : pathed ? { path: "line,33,33" } : { shape: 7 })
    });
    if (zoomed || pathed) expect(json.effect).not.toHaveProperty("shape");
    expect(await (await at("md")).text()).toContain(kind);
    /* its script where one plays it behind a page (engine/effect.ts hasEmbedScript); one with none yet (the aurora)
       answers that its style names no script */
    const script = await at("js");
    expect([script.status(), script.headers()["content-type"]]).toEqual(
      hasEmbedScript(kind) ? [200, "text/javascript; charset=utf-8"] : [404, "application/json"]
    );
    /* a clip where it has a loop of its own; one the pointer alone moves (the dimple) has none */
    const clip = await request.head(`/${SEED}.mp4?style=${kind}&shape=7`);
    expect([clip.status(), clip.headers()["content-type"]]).toEqual(
      EFFECT_KINDS[kind].video ? [200, "video/mp4"] : [404, "text/plain; charset=utf-8"]
    );
    expect(EFFECT_KINDS[kind].video).toBe(EFFECT_KINDS[kind].motion === "loop");
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
