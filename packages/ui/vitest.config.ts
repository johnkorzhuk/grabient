import solid from "@solidjs/vite-plugin";
import { defineConfig } from "vitest/config";
import { variableImports } from "../engine/scripts/vitest-cache.ts";

export default defineConfig({
  /* a module with a template's dynamic import transformed anew each run (engine/scripts/vitest-cache.ts) */
  plugins: [solid({ ssr: true }), variableImports()],
  test: {
    environment: "node",
    include: ["test/**/*.test.{ts,tsx}"],
    css: { include: /\.module\.css$/, modules: { classNameStrategy: "non-scoped" } }
  }
});
