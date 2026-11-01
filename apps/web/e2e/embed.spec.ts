import { createServer, type Server } from "node:http";
import { expect, type Page, test } from "@playwright/test";

/* A palette's effect behind another site's page (src/embed): the stylesheet of its address paints the first frame, the
   script plays the effect from there under a strict policy, a page plays one effect however many scripts it holds, a
   lost context brings the still back, and a reader who asks for less motion, like a blob held still, keeps the still.
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

/** Another site's page with these tags in its head, under a strict policy where asked, its refusals counted. */
async function site(page: Page, head: string, strict = false) {
  const path = `/${test.info().testId}`;
  pages.set(path, { app: new URL(test.info().project.use.baseURL ?? "").origin, head, strict });
  await page.addInitScript(() => {
    const w = window as unknown as {
      refused: string[];
      gl?: WebGL2RenderingContext;
      contexts: Set<WebGL2RenderingContext>;
    };
    w.refused = [];
    w.contexts = new Set();
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
/** What the page paints behind itself: html::before's image. */
const still = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.documentElement, "::before").backgroundImage);
const tags = (query: string, still = true) =>
  `${still ? `<link rel="stylesheet" href="APP/${SEED}.css?${query}">` : ""}<script src="APP/${SEED}.js?${query.replaceAll("&", "&amp;")}" async></script>`;

test("the stylesheet paints the first frame behind another site's page, and the script plays it there under a strict policy", async ({
  page
}) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(String(error)));
  await site(page, tags("style=blob&shape=3"), true);
  expect(await still(page)).toContain("data:image/svg+xml");
  /* the blob's canvas takes the still's place in one frame */
  await expect(page.locator("html")).toHaveAttribute("data-grabient-playing", "", {
    timeout: 15_000
  });
  await expect(page.locator("canvas")).toHaveCSS("opacity", "1");
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
  await expect.poll(() => still(page)).toContain("data:image/svg+xml");
  await expect(page.locator("canvas")).toHaveCSS("opacity", "1", { timeout: 15_000 });
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
  await expect(page.locator("canvas")).toHaveCSS("opacity", "0");
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
  expect(await still(page)).toContain("data:image/svg+xml");
  /* the mark comes once the fade has ended, with the canvas opaque over the still */
  await expect(html).toHaveAttribute("data-grabient-playing", "", { timeout: 15_000 });
  await expect(page.locator("canvas")).toHaveCSS("opacity", "1");
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
