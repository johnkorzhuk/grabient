import solid from "@solidjs/vite-plugin";
import { defineConfig } from "vitest/config";

/* Three kinds of test. Unit tests run in Node. Components render through Solid's server compiler, so they need its
   plugin. The Worker's integration tests run in workerd with D1, KV, R2 and the Durable Object
   (apps/web/test/vitest.config.ts). */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: [
            "packages/*/src/**/*.test.ts",
            "apps/*/src/**/*.test.ts",
            "apps/*/scripts/**/*.test.ts"
          ]
        }
      },
      {
        plugins: [solid({ ssr: true })],
        test: {
          name: "components",
          // the server's renderer: Solid's plugin resolves its browser build for any other environment
          environment: "node",
          include: ["apps/*/src/**/*.test.tsx"],
          css: { include: /\.module\.css$/, modules: { classNameStrategy: "non-scoped" } }
        }
      },
      "packages/ui/vitest.config.ts",
      "apps/web/test/vitest.config.ts"
    ]
  }
});
