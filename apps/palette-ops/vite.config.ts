import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import viteTsConfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";

const config = defineConfig(({ mode }) => {
  return {
    define: {
      "process.env.NODE_ENV": JSON.stringify(mode),
    },
    plugins: [
      viteTsConfigPaths({
        projects: ["./tsconfig.json"],
      }),
      tailwindcss(),
      tanstackStart({
        srcDirectory: "src",
        start: { entry: "./start.tsx" },
        server: { entry: "./server.ts" },
      }),
      viteReact(),
      cloudflare({
        viteEnvironment: {
          name: "ssr",
        },
      }),
    ],
    ssr: {
      noExternal: true,
    },
  };
});

export default config;
