// Builds the harness against a checkout of the site, read only: REPO (default the checkout this kit stands in) gives the
// modules, and node_modules here is a link to that checkout's apps/design/node_modules, where vite, Solid and @grabient/*
// resolve. ../build-harness.sh makes the link and builds.
//   ln -sfn "$REPO/apps/design/node_modules" node_modules && REPO=... node node_modules/vite/bin/vite.js build
import { fileURLToPath } from "node:url";
import solid from "@solidjs/vite-plugin";
import { defineConfig } from "vite";

const REPO = process.env.REPO ?? fileURLToPath(new URL("../../..", import.meta.url));
const here = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: here,
  cacheDir: `${here}.vite`,
  plugins: [solid()],
  resolve: { alias: [{ find: /^@web\/(.*)$/, replacement: `${REPO}/apps/web/src/$1` }] },
  build: { target: "esnext", outDir: `${here}dist`, emptyOutDir: true, minify: false },
  logLevel: "warn"
});
