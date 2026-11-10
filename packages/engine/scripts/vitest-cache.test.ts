import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import root from "../../../vitest.config.ts";
import ui from "../../ui/vitest.config.ts";
import { VARIABLE_IMPORT, variableImportKey, variableImports } from "./vitest-cache.ts";

const REPO = fileURLToPath(new URL("../../../", import.meta.url));

/* every module of the apps and packages, tests and scripts among them: no installed package, and no folder a tool
   keeps of its own (a name starting with a dot) */
function sources(dir = REPO, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    if (dir === REPO && entry.name !== "apps" && entry.name !== "packages") continue;
    if (entry.isDirectory()) sources(path, out);
    else if (entry.isFile() && /\.tsx?$/.test(entry.name)) out.push(path);
  }
  return out;
}
/* what a project's module cache keys a module by, where the plugin is among its plugins */
const keyOf = (sourceCode: string) =>
  variableImportKey({ sourceCode, id: "/m.ts", environment: {} as never });

test("a module with a template's dynamic import is never cached, so a file its pattern gains since is found", () => {
  const variable = sources().filter(path => VARIABLE_IMPORT.test(readFileSync(path, "utf8")));
  const named = variable.map(path => path.slice(REPO.length));
  /* the field effects' kernels (kit:gen's gen/<kind>.ts) and the embed's entries (kit:add's <kind>.ts) */
  expect(named).toContain("packages/engine/src/kit/kernels.ts");
  expect(named).toContain("apps/web/src/embed/embed.test.ts");
  for (const path of variable) expect(keyOf(readFileSync(path, "utf8")), path).toBe(false);
  /* any other module keeps the key Vitest gives it */
  expect(keyOf(readFileSync(join(REPO, "packages/engine/src/effect.ts"), "utf8"))).toBeUndefined();
  expect(keyOf("const m = await import(`./gen/strata.ts`);")).toBeUndefined();
  expect(keyOf(`const m = await import(\`./gen/\${kind}.ts\`);`)).toBe(false);
  expect(keyOf(`const m = await import(\n  \`./\${kind}.ts\`\n);`)).toBe(false);
});

test("every project whose module cache is on names the plugin, which hands Vitest that key", () => {
  type Project = {
    extends?: string;
    plugins?: unknown[];
    test?: { name?: string; fsModuleCache?: boolean };
  };
  const named = (plugins: unknown[] | undefined) =>
    (plugins ?? [])
      .flat()
      .some(p => (p as { name?: string } | null)?.name === variableImports().name);
  const own: Record<string, Project> = { "packages/ui/vitest.config.ts": ui as Project };
  const projects = (root.test?.projects ?? []) as Project[];
  expect(projects.length).toBeGreaterThanOrEqual(4);
  let held = 0;
  for (const p of projects) {
    if (p.test?.fsModuleCache === false) continue;
    if (p.extends) {
      const config = own[p.extends];
      /* a config file of its own that keeps no cache: the Worker's, which runs in workerd, which cannot read the
         cache from disk */
      if (!config) {
        expect(readFileSync(join(REPO, p.extends), "utf8"), p.extends).toMatch(
          /\bfsModuleCache: false\b/
        );
        continue;
      }
      expect(named(config.plugins), p.extends).toBe(true);
    } else expect(named(p.plugins), p.test?.name).toBe(true);
    held++;
  }
  expect(held).toBeGreaterThanOrEqual(3);
  const said: unknown[] = [];
  variableImports().configureVitest({ defineCacheKeyGenerator: g => said.push(g) });
  expect(said).toEqual([variableImportKey]);
});
