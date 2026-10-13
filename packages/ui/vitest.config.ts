import solid from "@solidjs/vite-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [solid({ ssr: true })],
  test: {
    environment: "node",
    include: ["test/**/*.test.{ts,tsx}"],
    css: { include: /\.module\.css$/, modules: { classNameStrategy: "non-scoped" } }
  }
});
