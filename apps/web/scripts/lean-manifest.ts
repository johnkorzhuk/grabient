import type { Plugin } from "vite";

/* The client's manifest the Worker carries in its start, which Solid reads as a page renders to name the scripts a lazy
   component's chunk and its imports load (@solidjs/web's resolveAssets): it reads a chunk's file, imports, css and
   preloads, and the entry's mark, and nothing else. Solid's plugin writes every chunk's whole record, with its name, its
   source and its dynamic imports, which no page reads: 31 KB of the start, 4.6 KB compressed, on 1 Nov 2026. This
   keeps what is read. A manifest written otherwise than as one JSON line is left as it came, and the plugin says so. */

const MANIFEST = "\0virtual:solid-manifest";
const READ = ["file", "imports", "css", "preloads", "isEntry"] as const;

/** A manifest's records with only the fields a render reads, its other keys (`_base`, `_entry`) as they are. */
export function leanRecords(manifest: Record<string, unknown>): Record<string, unknown> {
  const lean: Record<string, unknown> = {};
  for (const [key, record] of Object.entries(manifest)) {
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      lean[key] = record;
      continue;
    }
    const kept: Record<string, unknown> = {};
    for (const field of READ) {
      const value = (record as Record<string, unknown>)[field];
      if (value !== undefined) kept[field] = value;
    }
    lean[key] = kept;
  }
  return lean;
}

export function leanManifest(): Plugin {
  return {
    name: "grabient:lean-manifest",
    apply: "build",
    transform: {
      filter: { id: /^\0virtual:solid-manifest$/ },
      handler(code, id) {
        if (id !== MANIFEST) return null;
        const line = code.indexOf("\n");
        const first = /^const manifest = (\{.*\});$/.exec(code.slice(0, line));
        if (!first) {
          this.warn("the client's manifest is not written as one JSON line: left whole");
          return null;
        }
        const lean = JSON.stringify(leanRecords(JSON.parse(first[1])));
        return { code: `const manifest = ${lean};${code.slice(line)}`, map: null };
      }
    }
  };
}
