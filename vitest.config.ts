import { defineConfig } from "vitest/config";

// Unit tests run in Node. The Worker's integration tests run in workerd with D1, KV, R2 and the Durable Object,
// configured in apps/web/test/vitest.config.ts.
export default defineConfig({
  test: {
    projects: [
      {
        test: { name: "unit", include: ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.ts"] }
      },
      "apps/web/test/vitest.config.ts"
    ]
  }
});
