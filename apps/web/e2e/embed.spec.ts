import { createServer, type Server } from "node:http";
import { expect, type Page, test } from "@playwright/test";

/* A palette's effect behind another site's page (src/embed): the stylesheet of its address paints the first frame, the
   script plays the effect from there under a strict policy, a page plays one effect however many scripts it holds, a
   lost context brings the still back, and a reader who asks for less motion, like a blob held still, keeps the still.
   A soft and grained address paints and plays finished, as the site's stage does. The papercut's still steps the
   shadows its canvas draws soft, so its canvas comes held at speed 0 and for a reader who asks for less motion too.
   The tests' browser draws WebGL on the CPU, where the players play nothing; here its renderer is said to be a GPU's,
   so they play. */

const SEED = "kWTATrcQ7MeMxv1MwbbLKq84";

/* Another site, served from this machine as a real one is from its own: the app at localhost, the site at 127.0.0.1,
   so a browser lets its pages reach the app as any site's reach a public one. Each worker serves its tests' pages. */
const pages = new Map<string, { app: string; head: string; strict: boolean }>();
let server: Server;
let origin = "";
test.beforeAll(async () => {
  for (;;) {
    const port = 20000 + Math.floor(Math.random() * 10000);
    server = createServer((request, answer) => {
      const page = pages.get(request.url ?? "");
      if (!page) return answer.writeHead(404).end();
      const { app } = page;
      answer.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        ...(page.strict
          ? {
              "Content-Security-Policy": `default-src 'none'; style-src ${app}; img-src data: ${app}; script-src ${app}; require-trusted-types-for 'script'`
            }
          : {})
      });
      answer.end(
        `<!doctype html><html lang="en"><head><meta charset="utf-8">${page.head.replaceAll("APP", app)}</head><body><p>A page with an effect behind it.</p></body></html>`
      );
    });
    const listening = await new Promise<boolean>(resolve => {
      server.once("error", () => resolve(false));
      server.listen(port, "127.0.0.1", () => resolve(true));
    });
    if (listening) {
      origin = `http://127.0.0.1:${port}`;
      return;
    }
  }
});
test.afterAll(() => new Promise<void>(resolve => server.close(() => resolve())));

/** Another site's page with these tags in its head, under a strict policy where asked, its refusals counted; `name`
    tells a test's second page from its first. */
async function site(page: Page, head: string, strict = false, name = "") {
  const path = `/${test.info().testId}${name}`;
  pages.set(path, { app: new URL(test.info().project.use.baseURL ?? "").origin, head, strict });
  await page.addInitScript(() => {
    const w = window as unknown as {
      refused: string[];
      gl?: WebGL2RenderingContext;
      contexts: Set<WebGL2RenderingContext>;
      painted?: string;
      blurred?: string;
    };
    w.refused = [];
    w.contexts = new Set();
    /* the first still the page paints behind itself and its blur, read before each frame from the first: the canvas
       may take its place before a test looks */
    const look = () => {
      const before = getComputedStyle(document.documentElement, "::before");
      if (before.backgroundImage === "none") requestAnimationFrame(look);
      else {
        w.painted = before.backgroundImage;
        w.blurred = before.filter;
      }
    };
    requestAnimationFrame(look);
    document.addEventListener("securitypolicyviolation", e => w.refused.push(e.effectiveDirective));
    const own = WebGL2RenderingContext.prototype.getParameter;
    WebGL2RenderingContext.prototype.getParameter = function (
      this: WebGL2RenderingContext,
      p: number
    ) {
      return p === 0x9246 ? "A GPU" : own.call(this, p);
    };
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...a: unknown[]) {
      const made = (get as (...a: unknown[]) => RenderingContext | null).apply(this, a);
      if (made instanceof WebGL2RenderingContext) {
        w.gl = made;
        w.contexts.add(made);
      }
      return made;
    } as typeof get;
  });
  await page.goto(`${origin}${path}`);
}
/** How many WebGL contexts the page has made. */
const contexts = (page: Page) =>
  page.evaluate(() => (window as unknown as { contexts: Set<unknown> }).contexts.size);
/** What the page paints behind itself now: html::before's image. */
const still = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.documentElement, "::before").backgroundImage);
/** The script's layer, which holds its canvas and shows once the canvas has drawn. */
const layer = (page: Page) => page.locator("canvas").locator("..");
/** The first still the page painted behind itself, "" while none has been. */
const painted = (page: Page) =>
  page.evaluate(() => (window as unknown as { painted?: string }).painted ?? "");
/** The blur of the first still the page painted behind itself. */
const blurred = (page: Page) =>
  page.evaluate(() => (window as unknown as { blurred?: string }).blurred ?? "");
const tags = (query: string, still = true) =>
  `${still ? `<link rel="stylesheet" href="APP/${SEED}.css?${query}">` : ""}<script src="APP/${SEED}.js?${query.replaceAll("&", "&amp;")}" async></script>`;

test("the stylesheet paints the first frame behind another site's page, and the script plays it there under a strict policy", async ({
  page
}) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(String(error)));
  await site(page, tags("style=blob&shape=3"), true);
  expect(await painted(page)).toContain("data:image/svg+xml");
  /* the blob's canvas takes the still's place in one frame */
  await expect(page.locator("html")).toHaveAttribute("data-grabient-playing", "", {
    timeout: 15_000
  });
  await expect(layer(page)).toHaveCSS("opacity", "1");
  expect(await page.evaluate(() => (window as unknown as { refused: string[] }).refused)).toEqual(
    []
  );
  expect(errors).toEqual([]);
});

test("without the stylesheet the script paints the still itself, and three scripts play one effect", async ({
  page
}) => {
  /* whichever arrives first plays: the glass's two or the blob's */
  await site(
    page,
    `${tags("style=glass", false)}${tags("style=glass", false)}${tags("style=blob", false)}`,
    true
  );
  await expect.poll(() => painted(page)).toContain("data:image/svg+xml");
  await expect(layer(page)).toHaveCSS("opacity", "1", { timeout: 15_000 });
  await page.waitForTimeout(500);
  await expect(page.locator("canvas")).toHaveCount(1);
  expect(await contexts(page)).toBe(1);
});

test("a lost context shows the still again, and the effect plays again once the browser restores it", async ({
  page
}) => {
  await site(page, tags("style=blob&shape=3"));
  const html = page.locator("html");
  await expect(html).toHaveAttribute("data-grabient-playing", "", { timeout: 15_000 });
  /* the extension is kept from the loss: a lost context gives none. The canvas is kept too, for its late loss */
  await page.evaluate(() => {
    const w = window as unknown as {
      gl: WebGL2RenderingContext;
      lose: WEBGL_lose_context | null;
      old: HTMLCanvasElement | null;
    };
    w.old = document.querySelector("canvas");
    w.lose = w.gl.getExtension("WEBGL_lose_context");
    w.lose?.loseContext();
  });
  await expect(html).not.toHaveAttribute("data-grabient-playing");
  await expect(layer(page)).toHaveCSS("opacity", "0");
  expect(await still(page)).toContain("data:image/svg+xml");
  await page.evaluate(() =>
    (window as unknown as { lose: WEBGL_lose_context }).lose.restoreContext()
  );
  await expect(html).toHaveAttribute("data-grabient-playing", "", { timeout: 15_000 });
  await expect(page.locator("canvas")).toHaveCount(1);
  /* the old canvas's context, lost again as its player goes, never brings the still back under the new player */
  await page.evaluate(() =>
    (window as unknown as { old: HTMLCanvasElement }).old.dispatchEvent(
      new Event("webglcontextlost")
    )
  );
  await expect(html).toHaveAttribute("data-grabient-playing", "");
});

test("the glass's still goes once its canvas has faded in over it, and comes back when its context is lost", async ({
  page
}) => {
  await site(page, tags("style=glass&angle=45"));
  const html = page.locator("html");
  expect(await painted(page)).toContain("data:image/svg+xml");
  /* the mark comes once the fade has ended, with the canvas opaque over the still */
  await expect(html).toHaveAttribute("data-grabient-playing", "", { timeout: 15_000 });
  await expect(layer(page)).toHaveCSS("opacity", "1");
  expect(await still(page)).toBe("none");
  await page.evaluate(() =>
    (window as unknown as { gl: WebGL2RenderingContext }).gl
      .getExtension("WEBGL_lose_context")
      ?.loseContext()
  );
  await expect(html).not.toHaveAttribute("data-grabient-playing");
  expect(await still(page)).toContain("data:image/svg+xml");
});

test("a reader who asks for less motion keeps the still, and no context is made", async ({
  page
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await site(page, tags("style=glass"));
  expect(await still(page)).toContain("data:image/svg+xml");
  await page.waitForTimeout(2000);
  await expect(page.locator("canvas")).toHaveCount(0);
  expect(await page.evaluate(() => "gl" in window)).toBe(false);
});

test("a blob held at speed 0 keeps its still, which is its whole picture, and no context is made", async ({
  page
}) => {
  await site(page, tags("style=blob&shape=3&speed=0"));
  expect(await still(page)).toContain("data:image/svg+xml");
  await page.waitForTimeout(2000);
  await expect(page.locator("canvas")).toHaveCount(0);
  expect(await contexts(page)).toBe(0);
});

test("a soft and grained silk paints its still blurred over its gradient and grained, and its script plays it so under a strict policy", async ({
  page
}) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(String(error)));
  await site(page, tags("style=silk&angle=40&soft=50&grain=30&shape=7"), true);
  const pseudo = (element: "html" | "body", which: "::before" | "::after", property: string) =>
    page.evaluate(
      ([element, which, property]) =>
        getComputedStyle(
          element === "html" ? document.documentElement : document.body,
          which
        ).getPropertyValue(property),
      [element, which, property] as const
    );
  expect(await painted(page)).toContain("data:image/svg+xml");
  /* the still blurred by a share of the page's longer side, the gradient under it, the grain over it */
  expect(await pseudo("html", "::before", "filter")).toMatch(/^blur\([\d.]+px\)$/);
  expect(await pseudo("html", "::after", "background-image")).toMatch(/^linear-gradient\(/);
  expect(await pseudo("html", "::after", "z-index")).toBe("-2");
  expect(await pseudo("body", "::before", "background-image")).toContain("data:image/png;base64,");
  const blur = await pseudo("html", "::before", "filter");
  /* the opaque silk fades in over the still, then the still, its gradient and its grain give way to the layer's own */
  await expect(page.locator("html")).toHaveAttribute("data-grabient-playing", "", {
    timeout: 15_000
  });
  await expect(layer(page)).toHaveCSS("opacity", "1");
  await expect(layer(page)).toHaveCSS("background-image", /^linear-gradient\(/);
  await expect(page.locator("canvas")).toHaveCSS("filter", blur);
  await expect(layer(page).locator("div")).toHaveCSS("background-image", /data:image\/png;base64,/);
  await expect(layer(page).locator("div")).toHaveCSS("image-rendering", "pixelated");
  expect(await pseudo("html", "::before", "background-image")).toBe("none");
  expect(await pseudo("html", "::after", "background-image")).toBe("none");
  expect(await pseudo("body", "::before", "background-image")).toBe("none");
  expect(await page.evaluate(() => (window as unknown as { refused: string[] }).refused)).toEqual(
    []
  );
  expect(errors).toEqual([]);
});

test("without the stylesheet the rosette's script paints its finished still itself, and held at speed 0 takes no context", async ({
  page
}) => {
  await site(page, tags("style=rosette&soft=30&grain=20&speed=0", false), true);
  await expect.poll(() => painted(page)).toContain("data:image/svg+xml");
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.body, "::before").backgroundImage))
    .toContain("data:image/png;base64,");
  expect(
    await page.evaluate(() => getComputedStyle(document.documentElement, "::before").filter)
  ).toMatch(/^blur\(/);
  await page.waitForTimeout(2000);
  await expect(page.locator("canvas")).toHaveCount(0);
  expect(await contexts(page)).toBe(0);
});

test("a soft and grained papercut held at speed 0 paints its stepped still, then fades its own first frame in over it under a strict policy", async ({
  page
}) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(String(error)));
  await site(page, tags("style=papercut&angle=30&soft=40&grain=30&shape=7&speed=0"), true);
  expect(await painted(page)).toContain("data:image/svg+xml");
  expect(
    await page.evaluate(() => getComputedStyle(document.documentElement, "::before").filter)
  ).toMatch(/^blur\([\d.]+px\)$/);
  /* its first frame's shadows are soft where the still steps them, so held still it takes a context, as the site's
     stage does, and its canvas covers the still, blurred over the gradient and grained as the still was */
  await expect(page.locator("html")).toHaveAttribute("data-grabient-playing", "", {
    timeout: 15_000
  });
  await expect(layer(page)).toHaveCSS("opacity", "1");
  await expect(layer(page)).toHaveCSS("background-image", /^linear-gradient\(/);
  await expect(page.locator("canvas")).toHaveCSS("filter", /^blur\(/);
  await expect(layer(page).locator("div")).toHaveCSS("background-image", /data:image\/png;base64,/);
  expect(await contexts(page)).toBe(1);
  expect(await still(page)).toBe("none");
  expect(await page.evaluate(() => (window as unknown as { refused: string[] }).refused)).toEqual(
    []
  );
  expect(errors).toEqual([]);
});

test("without the stylesheet the papercut's script draws the stylesheet's stepped still itself, then its canvas covers it under a strict policy", async ({
  page,
  context
}) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(String(error)));
  const query = "style=papercut&angle=30&soft=40&grain=30&shape=7";
  /* what the stylesheet of the same address paints, on a page of its own */
  const linked = await context.newPage();
  await site(linked, `<link rel="stylesheet" href="APP/${SEED}.css?${query}">`, true, "-linked");
  const sheet = await still(linked);
  const blur = await linked.evaluate(
    () => getComputedStyle(document.documentElement, "::before").filter
  );
  expect(sheet).toContain("data:image/svg+xml");
  await linked.close();
  /* the script alone draws the same still, a share at a time, and adopts it with the same blur */
  await site(page, tags(query, false), true);
  await expect.poll(() => painted(page), { timeout: 15_000 }).toContain("data:image/svg+xml");
  expect((await painted(page)) === sheet, "the script's still is the stylesheet's").toBe(true);
  expect(await blurred(page)).toBe(blur);
  /* an adopted still may be on its way to the screen: the canvas takes its place at once */
  await expect(page.locator("html")).toHaveAttribute("data-grabient-playing", "", {
    timeout: 15_000
  });
  await expect(layer(page)).toHaveCSS("opacity", "1");
  await expect(page.locator("canvas")).toHaveCSS("filter", blur);
  expect(await contexts(page)).toBe(1);
  expect(await still(page)).toBe("none");
  expect(await page.evaluate(() => (window as unknown as { refused: string[] }).refused)).toEqual(
    []
  );
  expect(errors).toEqual([]);
});

test("for a reader who asks for less motion the papercut's script holds its own first frame over its stepped still, where the silk's still stays with no context", async ({
  page,
  context
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await site(page, tags("style=papercut&angle=30&shape=7"), true);
  expect(await painted(page)).toContain("data:image/svg+xml");
  /* its first frame's shadows are soft where the still steps them, as the site's stage shows them to that reader */
  await expect(page.locator("html")).toHaveAttribute("data-grabient-playing", "", {
    timeout: 15_000
  });
  await expect(layer(page)).toHaveCSS("opacity", "1");
  expect(await contexts(page)).toBe(1);
  expect(await still(page)).toBe("none");
  /* and holds it */
  const held = await page.screenshot();
  await page.waitForTimeout(1500);
  expect((await page.screenshot()).equals(held)).toBe(true);
  /* the silk's still is its first frame */
  const silk = await context.newPage();
  await silk.emulateMedia({ reducedMotion: "reduce" });
  await site(silk, tags("style=silk&angle=40"), true, "-silk");
  expect(await still(silk)).toContain("data:image/svg+xml");
  await silk.waitForTimeout(2000);
  await expect(silk.locator("canvas")).toHaveCount(0);
  expect(await contexts(silk)).toBe(0);
});
