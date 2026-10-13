/* The plugin package OpenAI's directory takes for ChatGPT and Codex, in the Agent Plugins layout: plugin.json and
   mcp.json at the root, the logo under assets/. It carries the listing and the server's address alone: the directory
   refuses credentials, reviewer instructions, hooks and app references in a package, and takes the reviewers' account
   and test cases in its portal. The listing is checked against the directory's limits before anything is written.
   Run it before an upload, with a new VERSION for each one:
   node apps/web/scripts/plugin-package.ts
   It writes apps/web/.data/grabient-plugin-<version>.zip. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { crc32 } from "node:zlib";
import { PRODUCTION_ORIGIN } from "../src/lib/page-meta.ts";
import { serverInfo } from "../src/server/mcp/info.ts";
import { MCP_PATH } from "../src/server/oauth/clients.ts";

/** The package's own version: the directory takes each upload under a version it has not seen. */
const VERSION = "1.0.0";
const SITE = PRODUCTION_ORIGIN;
const LOGO = "./assets/logo.png";

const LONG = `Grabient is a gallery of color palettes and CSS gradients. Search it by color, mood, theme or brand colors, in words, hex codes or another palette, and keep the palettes you like in your Grabient account.

It can:
- Search palettes and public collections, or browse the gallery by popular, rising, hot or newest.
- Make palettes from 2 to 8 hex colors, such as a brand's colors.
- Change a palette: lighter, darker, calmer, more vivid, warmer, cooler, reversed, or with fewer or more colors, with a brand color held as it is.
- Read a palette in full: each color's hex code and name, its contrast on white and on black, and the CSS that draws it.
- Show palettes side by side, each with a strip that copies its address, CSS, SVG or PNG.
- List the palettes you saved, save new ones, and make, edit and delete your collections.

Every palette has its own page on grabient.com, with its CSS, SVG, PNG and JSON files.

When you add Grabient, it asks you to sign in to your Grabient account and allow the app, which can then see and change your saved palettes and collections. It stays connected until you disconnect it or don't use it for a year. Your collections are private. New palettes you save join the public gallery, without your name.`;

const listing = {
  displayName: "Grabient",
  shortDescription: "Color palettes and gradients",
  longDescription: LONG,
  developerName: "Grabient",
  category: "Creativity",
  websiteURL: SITE,
  supportURL: `${SITE}/contact`,
  privacyPolicyURL: `${SITE}/privacy`,
  termsOfServiceURL: `${SITE}/terms`,
  // the MCP page's own examples (features/connect/McpServer.tsx)
  defaultPrompt: [
    "Find five calm palettes for a meditation app.",
    "Make a palette from #14213d and #fca311, and save it.",
    "Put my warm palettes in a collection called Sunsets."
  ],
  composerIcon: LOGO,
  logo: LOGO
};

const plugin = {
  $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  name: "grabient",
  version: VERSION,
  description: serverInfo(SITE).description,
  author: { name: "Grabient", url: SITE },
  homepage: SITE,
  keywords: ["color", "palette", "gradient", "css", "design"],
  extensions: { "com.openai": { interface: listing } }
};

/* OpenAI reads a server's sign-in from its own extension on the server, which the portable format leaves to each
   client. ChatGPT names itself by its client ID metadata document, which the authorization server keeps a copy of
   (src/server/oauth/client-documents.data.ts). */
const mcp = {
  $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
  mcpServers: {
    grabient: {
      type: "streamable-http",
      url: SITE + MCP_PATH,
      extensions: { "com.openai": { auth: { type: "oauth", client: { mode: "cimd" } } } }
    }
  }
};

const logo = await readFile(new URL("../public/icon-512.png", import.meta.url));

/** What the directory would refuse in the listing (developers.openai.com/plugins/deploy/submission-errors). */
function refusals(): string[] {
  const said: string[] = [];
  const fits = (field: string, text: string, max: number, lines = false) => {
    if (!text.trim() || text.length > max || (!lines && /[\r\n]/.test(text)))
      said.push(`${field} is ${lines ? "" : "one line of "}1 to ${max} characters`);
  };
  fits("description", plugin.description, 1024, true);
  fits("displayName", listing.displayName, 30);
  fits("shortDescription", listing.shortDescription, 30);
  fits("longDescription", listing.longDescription, 4000, true);
  fits("developerName", listing.developerName, 80);
  const prompts = listing.defaultPrompt;
  if (prompts.length > 3 || new Set(prompts).size < prompts.length)
    said.push("defaultPrompt is up to three different prompts");
  for (const prompt of prompts) {
    fits("a starter prompt", prompt, 128);
    if (prompt.includes("@")) said.push("a starter prompt mentions no server");
  }
  // a PNG's width and height follow its signature and the IHDR chunk's length and name
  const [width, height] = [logo.readUInt32BE(16), logo.readUInt32BE(20)];
  if (width !== height || width < 48 || width > 4096)
    said.push("the logo is a square of 48 to 4,096 pixels");
  return said;
}

/* A ZIP of stored files with one fixed time, so the same package is the same bytes: a local header and the file for
   each, then the central directory that lists them, then its end record. */
const DOS_DATE = (1 << 5) | 1; // 1980-01-01, the format's first day
const UNIX_FILE = (0o100644 << 16) >>> 0; // a regular file, rw-r--r--

function zip(files: Record<string, Uint8Array>): Buffer {
  const entries = Object.entries(files);
  const parts: Buffer[] = [];
  const listed: Buffer[] = [];
  let offset = 0;
  for (const [name, data] of entries) {
    const path = Buffer.from(name);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // names in UTF-8
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(path.length, 26);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE((3 << 8) | 20, 4); // made on Unix, so the mode below is read
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0x0800, 8);
    entry.writeUInt16LE(DOS_DATE, 14);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(data.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(path.length, 28);
    entry.writeUInt32LE(UNIX_FILE, 38);
    entry.writeUInt32LE(offset, 42);
    parts.push(local, path, Buffer.from(data));
    listed.push(entry, path);
    offset += local.length + path.length + data.length;
  }
  const directory = Buffer.concat(listed);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, directory, end]);
}

const refused = refusals();
if (refused.length)
  throw new Error(`The directory would refuse this listing: ${refused.join("; ")}.`);
const json = (value: unknown) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const files = { "plugin.json": json(plugin), "mcp.json": json(mcp), [LOGO.slice(2)]: logo };
const out = new URL(`../.data/grabient-plugin-${VERSION}.zip`, import.meta.url);
await mkdir(new URL(".", out), { recursive: true });
await writeFile(out, zip(files));
console.log(`${fileURLToPath(out)}: ${Object.keys(files).join(", ")}`);
