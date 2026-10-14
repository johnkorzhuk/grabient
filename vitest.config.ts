import solid from "@solidjs/vite-plugin";
import { defineConfig } from "vitest/config";

/* Three kinds of test. Unit tests run in Node. Components render through Solid's server compiler, so they need its
   plugin. The Worker's integration tests run in workerd with D1, KV, R2 and the Durable Object
   (apps/web/test/vitest.config.ts). */

/* Half a minute for a test or a hook. The default five seconds fail a different handful of tests each run on a busy
   machine, a build's among them. A project with a config file of its own inherits nothing from this one, so each is
   handed the limits where it is named. */
const limits = { testTimeout: 30_000, hookTimeout: 30_000 };

export default defineConfig({
  test: {
    ...limits,
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
          server: { deps: { inline: [/@tanstack\/solid-router/] } },
          css: { include: /\.module\.css$/, modules: { classNameStrategy: "non-scoped" } }
        }
      },
      {
        extends: "packages/ui/vitest.config.ts",
        root: "packages/ui",
        test: { name: "ui", ...limits }
      },
      {
        extends: "apps/web/test/vitest.config.ts",
        root: "apps/web",
        test: { name: "worker", ...limits }
      }
    ]
  }
});
