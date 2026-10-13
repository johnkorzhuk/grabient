import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { messageKey } from "@grabient/i18n";
import { buildCatalogs } from "@grabient/i18n/vite.ts";
import solid from "@solidjs/vite-plugin";
import { build, type Plugin, type Rollup } from "vite";
import { MESSAGES_ID, ORIGIN_META } from "./page.ts";

/* The MCP view as one HTML page, which the Worker serves as ui://grabient/v1/palettes.html (server/mcp/view-page.ts).
   An MCP App is a sandboxed frame that loads nothing from outside, so the script, the styles and the words are written
   into the page. It is built with the site's own toolchain in a build of its own: the app's vite.config.ts adds
   `mcpView()`, which answers `virtual:mcp-view` with the page. Run alone (`node src/mcp-view/build.ts`), this module
   writes the page to standard output. */

const VIEW = fileURLToPath(new URL("./", import.meta.url));
const ENGLISH = fileURLToPath(
  new URL("../../../../packages/i18n/messages/en.json", import.meta.url)
);
const ID = "virtual:mcp-view";

/* A message is its English, which the bundle carries as a string wherever the view can say it (a call of t(), a msg()
   constant, a component's own words, a color's name), so each catalog keeps the translations of those alone. A message
   in a context is kept where its context is in the bundle too. */
function catalogsFor(code: string): Record<string, Record<string, string>> {
  const said = (words: string) =>
    code.includes(words) || code.includes(JSON.stringify(words).slice(1, -1));
  const english = JSON.parse(readFileSync(ENGLISH, "utf8")) as Record<string, unknown>;
  const keys = new Set(
    Object.keys(english)
      .filter(message => message.split("\u0004").every(said))
      .map(messageKey)
  );
  const out: Record<string, Record<string, string>> = {};
  for (const [locale, file] of buildCatalogs()) {
    const catalog = JSON.parse(file.source) as Record<string, string>;
    out[locale] = Object.fromEntries(Object.entries(catalog).filter(([key]) => keys.has(key)));
  }
  return out;
}

const escaped = (name: string) => name.replace(/[.$]/g, "\\$&");

/* The bundle as one page: the script and the stylesheet written in, and the words beside them as JSON. A module script
   runs once the page is parsed, as a frame's default policy allows (inline scripts and styles, nothing fetched). */
function singleFile(): Plugin {
  return {
    name: "grabient:mcp-view-single-file",
    enforce: "post",
    generateBundle(_options, bundle) {
      const page = Object.values(bundle).find(
        (file): file is Rollup.OutputAsset =>
          file.type === "asset" && file.fileName.endsWith(".html")
      );
      if (!page) this.error("The MCP view built no page.");
      let html = String(page.source);
      const css: string[] = [];
      const code: string[] = [];
      for (const [name, file] of Object.entries(bundle)) {
        const base = escaped(file.fileName.split("/").pop() ?? "");
        if (file.type === "chunk") {
          const tag = new RegExp(`<script[^>]*\\ssrc="[^"]*${base}"[^>]*></script>`);
          if (!tag.test(html))
            this.error(`The MCP view's script ${file.fileName} is not in its page.`);
          const inline = file.code.replace(/<\/script/gi, "<\\/script");
          html = html.replace(tag, () => `<script type="module">${inline}</script>`);
          code.push(file.code);
          delete bundle[name];
        } else if (file.fileName.endsWith(".css")) {
          css.push(String(file.source));
          html = html.replace(new RegExp(`<link[^>]*\\shref="[^"]*${base}"[^>]*>`), "");
          delete bundle[name];
        }
      }
      const words = JSON.stringify(catalogsFor(code.join("\n"))).replace(/</g, "\\u003c");
      const sheet = css.join("\n").replace(/<\/style/gi, "<\\/style");
      html = html.replace(
        "</head>",
        () =>
          `<style>${sheet}</style><script type="application/json" id="${MESSAGES_ID}">${words}</script></head>`
      );
      page.source = html;
    }
  };
}

/** Builds the view in this process and answers its page. */
export async function buildMcpView(): Promise<string> {
  const output = await build({
    configFile: false,
    root: VIEW,
    base: "./",
    mode: "production",
    logLevel: "warn",
    plugins: [solid(), singleFile()],
    build: {
      write: false,
      target: "es2022",
      modulePreload: false,
      cssCodeSplit: false,
      reportCompressedSize: false,
      assetsInlineLimit: Number.MAX_SAFE_INTEGER,
      rolldownOptions: { input: `${VIEW}index.html`, output: { codeSplitting: false } }
    }
  });
  const files = (Array.isArray(output) ? output : [output]).flatMap(result =>
    "output" in result ? result.output : []
  );
  const page = files.find(
    (file): file is Rollup.OutputAsset => file.type === "asset" && file.fileName.endsWith(".html")
  );
  if (!page || files.length !== 1)
    throw new Error(
      `The MCP view should build to one page, and built ${files.map(f => f.fileName).join(", ")}.`
    );
  const html = String(page.source);
  /* the Worker writes its origin into this tag, so it must reach the page as written */
  if (!html.includes(ORIGIN_META)) throw new Error("The MCP view's page lost its origin tag.");
  return html;
}

let built: Promise<string> | undefined;
/** The page, built once per process in a process of its own, so it is always the production build whatever runs it
    (the dev server sets NODE_ENV for its whole process): the page a check draws is the page that ships. */
export const mcpViewHtml = (): Promise<string> =>
  (built ??= new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [fileURLToPath(import.meta.url)],
      { maxBuffer: 64 * 1024 * 1024, env: { ...process.env, NODE_ENV: "production" } },
      (error, stdout, stderr) =>
        error
          ? reject(new Error(`The MCP view did not build: ${stderr || error.message}`))
          : resolve(stdout)
    );
  }));

/** The app's plugin: `import page from "virtual:mcp-view"` is the view's page as a string. */
export function mcpView(): Plugin {
  return {
    name: "grabient:mcp-view",
    resolveId(id) {
      if (id === ID) return `\0${ID}`;
    },
    async load(id) {
      if (id === `\0${ID}`) return `export default ${JSON.stringify(await mcpViewHtml())};`;
    }
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
  process.stdout.write(await buildMcpView());
