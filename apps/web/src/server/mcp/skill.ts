/// <reference types="vite/client" />
import skillMd from "../../../../../skills/grabient/SKILL.md?raw";

/* The skill: Grabient's guide for a model (skills/grabient/SKILL.md), served by the extension
   io.modelcontextprotocol/skills. An app lists it, reads the file as a resource and checks what it read against the
   digest and size listed. The same for every connection. */

export const SKILLS_EXTENSION = "io.modelcontextprotocol/skills";
/** The file changes with a deploy only: an app may keep it a day. */
const KEPT = { ttlMs: 86_400_000, cacheScope: "public" } as const;

/** The frontmatter as the object a YAML reader makes of it, which an app compares field by field. Reads only what the
    file writes: `key: value`, a value in double quotes, and keys indented under a key with no value. */
function frontmatterOf(markdown: string) {
  const fields: Record<string, unknown> = {};
  let under = fields;
  for (const line of (/^---\n([\s\S]*?)\n---\n/.exec(markdown)?.[1] ?? "").split("\n")) {
    const [, indent, key, raw] = /^( *)([\w-]+):(?: (.*))?$/.exec(line) ?? [];
    if (!key) continue;
    if (!indent) under = fields;
    if (raw === undefined) {
      const nested: Record<string, unknown> = {};
      fields[key] = nested;
      under = nested;
    } else under[key] = raw.startsWith('"') ? JSON.parse(raw) : raw;
  }
  return fields as { name: string; description: string; [key: string]: unknown };
}

export const frontmatter = frontmatterOf(skillMd);
/** The skill's address, its file's: the folder is the frontmatter's name, as the extension asks. */
export const SKILL_URI = `skill://${frontmatter.name}/SKILL.md`;

/** The file at an origin: it writes addresses as {origin}, so its bytes, digest and size are that origin's. */
async function fileAt(origin: string) {
  const text = skillMd.replaceAll("{origin}", origin);
  const bytes = new TextEncoder().encode(text);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  const hex = Array.from(hash, byte => byte.toString(16).padStart(2, "0")).join("");
  return { text, digest: `sha256:${hex}`, size: bytes.length };
}

const entry = async (origin: string) => {
  const { digest, size } = await fileAt(origin);
  return { uri: SKILL_URI, frontmatter, resources: [{ uri: SKILL_URI, digest, size }] };
};

/** The skill as resources/list names it. */
export const SKILL_RESOURCE = {
  uri: SKILL_URI,
  name: frontmatter.name,
  description: frontmatter.description,
  mimeType: "text/markdown"
};

/** skills/list in the request's era: the handshake's revisions have no lifetime for a list. */
export const skillsList = async (origin: string, modern: boolean) => ({
  skills: [await entry(origin)],
  ...(modern ? KEPT : {})
});

/** skills/get by the skill's address; null for any other. */
export const skillsGet = async (uri: unknown, origin: string, modern: boolean) =>
  uri === SKILL_URI ? { skill: await entry(origin), ...(modern ? KEPT : {}) } : null;

/** resources/read of the file: the bytes its entry measured; null for any other address. */
export const readSkill = async (uri: unknown, origin: string, modern: boolean) =>
  uri === SKILL_URI
    ? {
        contents: [
          { uri: SKILL_URI, mimeType: "text/markdown", text: (await fileAt(origin)).text }
        ],
        ...(modern ? KEPT : {})
      }
    : null;
