import { fileURLToPath } from "node:url";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

/* The Worker's integration tests, in workerd with the bindings cloudflare.config.ts gives local development: D1, KV, R2
   and the RateLimiter Durable Object, all simulated. test/worker.ts stands in for the app's entry, so these tests load
   the server modules alone. Each file applies the migrations to its database first. */

const web = fileURLToPath(new URL("..", import.meta.url));

export default defineConfig({
  root: web,
  // the MCP view is built by its own plugin (src/mcp-view/build.ts); the tests serve a page of the same shape
  resolve: { alias: { "virtual:mcp-view": `${web}/test/mcp-view-page.ts` } },
  plugins: [
    cloudflareTest(async () => ({
      experimental: { newConfig: true },
      main: "test/worker.ts",
      remoteBindings: false,
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations(`${web}/../../packages/server/migrations`)
        },
        // The config binds the class through the Worker's own name, which the test runner's Worker does not have.
        durableObjects: { RATE_LIMITER: "RateLimiter" }
      }
    }))
  ],
  test: {
    name: "worker",
    include: ["test/**/*.test.ts"],
    setupFiles: ["test/setup.ts"],
    // workerd cannot read Vitest's module cache from disk.
    fsModuleCache: false,
    deps: {
      optimizer: {
        // Bundled once, the sign-in library loads as one module instead of hundreds, which halves a run.
        ssr: {
          enabled: true,
          include: [
            "better-auth/minimal",
            "better-auth/api",
            "better-auth/plugins",
            "better-auth/adapters/drizzle",
            "drizzle-orm/d1",
            "drizzle-orm/sqlite-core"
          ],
          rolldownOptions: { external: [/^node:/] }
        }
      }
    }
  }
});
