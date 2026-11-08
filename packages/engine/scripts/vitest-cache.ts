/* Vitest's module cache (fsModuleCache, on unless a project turns it off) keeps each module's transform on disk under a
   key of the module's own text, its id and the config. A dynamic import of a template, `import(`./gen/${kind}.ts`)`,
   is expanded as it is transformed into the files its pattern matches then (Vite's dynamic-import-vars), and a module
   whose text stays the same keeps that list: a file added beside them since is not in it, and its import fails,
   "Unknown variable dynamic import: ./gen/strata.ts", until someone clears the cache (8 Nov 2026: kit/kernels.ts, which
   apps/web code.test.ts reaches, after kit:gen wrote gen/strata.ts for a new field effect; embed.test.ts imports each
   effect's embed entry, kit:add's, the same way). Clearing the cache where kit:gen or kit:add writes a new file would
   miss the same file brought by a pull, a land or another worktree's branch, so every checkout would still meet it
   once; Vitest already leaves a module with import.meta.glob out of the cache for this reason, and this leaves out one
   with a template's dynamic import too, wherever its pattern's files came from (vitest-cache.test.ts holds every such
   module, and every project whose cache is on, to it). Each run transforms those few modules anew, a few milliseconds
   each. */
import type { CacheKeyIdGenerator, VitestPluginContext } from "vitest/node";

/** A dynamic import whose specifier is a template with a placeholder: one Vite expands to the files it matches. */
export const VARIABLE_IMPORT = /\bimport\(\s*`[^`]*\$\{/;

/** The cache's key for a module: none, so it is never cached, where its text has a template's dynamic import (false),
    else the key Vitest makes (undefined). */
export const variableImportKey: CacheKeyIdGenerator = ({ sourceCode }) =>
  VARIABLE_IMPORT.test(sourceCode) ? false : undefined;

/** The plugin each project whose module cache is on names among its plugins. */
export const variableImports = () => ({
  name: "grabient:variable-imports",
  configureVitest({
    defineCacheKeyGenerator
  }: Pick<VitestPluginContext, "defineCacheKeyGenerator">) {
    defineCacheKeyGenerator(variableImportKey);
  }
});
