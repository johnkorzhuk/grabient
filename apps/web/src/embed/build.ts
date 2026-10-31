import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { build, type Plugin, type Rollup } from "vite";

/* The effects' embeds (glass.ts, blob.ts), each as one classic script, which the Worker serves at /{seed}.js
   (server/files/embed.ts). They are built with the site's own toolchain in builds of their own, as the MCP view is,
   and written into the browser's build as files under /assets/ named by their contents, as the precise color names
   are (scripts/color-names.ts): the Worker reads them through its ASSETS binding, so they are no part of its code.
   Their addresses reach the Worker as __EFFECT_EMBEDS__; `vite dev` answers them from memory. Run alone
   (`node src/embed/build.ts`), this module writes both scripts to standard output as JSON. */

const KINDS = ["glass", "blob"] as const;
type Scripts = Record<(typeof KINDS)[number], string>;

async function buildOne(kind: (typeof KINDS)[number]): Promise<string> {
  const output = await build({
    configFile: false,
    mode: "production",
    logLevel: "warn",
    build: {
      write: false,
      target: "es2022",
      minify: true,
      reportCompressedSize: false,
      lib: {
        entry: fileURLToPath(new URL(`./${kind}.ts`, import.meta.url)),
        formats: ["iife"],
        name: `grabient_${kind}`,
        fileName: () => `${kind}.js`
      }
    }
  });
  const files = (Array.isArray(output) ? output : [output]).flatMap(result =>
    "output" in result ? result.output : []
  );
  const chunks = files.filter((file): file is Rollup.OutputChunk => file.type === "chunk");
  if (chunks.length !== 1)
    throw new Error(
      `The ${kind}'s embed should build to one script, and built ${files.map(f => f.fileName).join(", ")}.`
    );
  return chunks[0].code;
}

/** Builds both embeds in this process and answers their scripts. */
export async function buildEffectEmbeds(): Promise<Scripts> {
  return { glass: await buildOne("glass"), blob: await buildOne("blob") };
}

let built: Promise<Scripts> | undefined;
/** The scripts, built once per process in a process of their own, so they are always the production build. */
export const effectEmbedScripts = (): Promise<Scripts> =>
  (built ??= new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [fileURLToPath(import.meta.url)],
      { maxBuffer: 32 * 1024 * 1024, env: { ...process.env, NODE_ENV: "production" } },
      (error, stdout, stderr) =>
        error
          ? reject(new Error(`The effects' embeds did not build: ${stderr || error.message}`))
          : resolve(JSON.parse(stdout) as Scripts)
    );
  }));

/** The app's plugin: both scripts as files of the browser's build, their addresses as __EFFECT_EMBEDS__. */
export function effectEmbed(): Plugin {
  let scripts: Scripts | undefined;
  let paths: Scripts | undefined;
  return {
    name: "grabient:effect-embed",
    async config() {
      const built = await effectEmbedScripts();
      const named = (kind: keyof Scripts) =>
        `/assets/embed-${kind}-${createHash("sha256").update(built[kind]).digest("hex").slice(0, 10)}.js`;
      scripts = built;
      paths = { glass: named("glass"), blob: named("blob") };
      return { define: { __EFFECT_EMBEDS__: JSON.stringify(paths) } };
    },
    configureServer(server) {
      for (const kind of KINDS) {
        server.middlewares.use((request, response, next) => {
          if (!paths || !scripts || request.url !== paths[kind]) return next();
          response.setHeader("Content-Type", "text/javascript; charset=utf-8");
          response.end(scripts[kind]);
        });
      }
    },
    applyToEnvironment: environment => environment.name === "client",
    generateBundle() {
      if (!paths || !scripts) return;
      for (const kind of KINDS)
        this.emitFile({ type: "asset", fileName: paths[kind].slice(1), source: scripts[kind] });
    }
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
  process.stdout.write(JSON.stringify(await buildEffectEmbeds()));
