import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { build, type Plugin, type Rollup } from "vite";

/* The blob's embed (blob.ts) as one classic script, which the Worker serves at /{seed}.js (server/files/embed.ts). It
   is built with the site's own toolchain in a build of its own, as the MCP view is: the app's vite.config.ts adds
   `blobEmbed()`, which answers `virtual:blob-embed` with the script. Run alone (`node src/embed/build.ts`), this module
   writes the script to standard output. */

const ENTRY = fileURLToPath(new URL("./blob.ts", import.meta.url));
const ID = "virtual:blob-embed";

/** Builds the embed in this process and answers its script. */
export async function buildBlobEmbed(): Promise<string> {
  const output = await build({
    configFile: false,
    mode: "production",
    logLevel: "warn",
    build: {
      write: false,
      target: "es2022",
      minify: true,
      reportCompressedSize: false,
      lib: { entry: ENTRY, formats: ["iife"], name: "grabientBlob", fileName: () => "blob.js" }
    }
  });
  const files = (Array.isArray(output) ? output : [output]).flatMap(result =>
    "output" in result ? result.output : []
  );
  const chunks = files.filter((file): file is Rollup.OutputChunk => file.type === "chunk");
  if (chunks.length !== 1)
    throw new Error(
      `The blob's embed should build to one script, and built ${files.map(f => f.fileName).join(", ")}.`
    );
  return chunks[0].code;
}

let built: Promise<string> | undefined;
/** The script, built once per process in a process of its own, so it is always the production build. */
export const blobEmbedJs = (): Promise<string> =>
  (built ??= new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [fileURLToPath(import.meta.url)],
      { maxBuffer: 16 * 1024 * 1024, env: { ...process.env, NODE_ENV: "production" } },
      (error, stdout, stderr) =>
        error
          ? reject(new Error(`The blob's embed did not build: ${stderr || error.message}`))
          : resolve(stdout)
    );
  }));

/** The app's plugin: `import script from "virtual:blob-embed"` is the embed as a string. */
export function blobEmbed(): Plugin {
  return {
    name: "grabient:blob-embed",
    resolveId(id) {
      if (id === ID) return `\0${ID}`;
    },
    async load(id) {
      if (id === `\0${ID}`) return `export default ${JSON.stringify(await blobEmbedJs())};`;
    }
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
  process.stdout.write(await buildBlobEmbed());
