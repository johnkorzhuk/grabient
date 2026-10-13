import { defineConfig } from "cf/config";

/* The design document on design.grabient.com: static files and no code of its own, so a request never runs the Worker.
   An address the files do not hold is answered with the document, which draws the page the address names. */
export default defineConfig({
  worker: {
    name: "grabient-design",
    compatibilityDate: "2026-10-01",
    domains: ["design.grabient.com"],
    // With a domain the workers.dev address defaults to off; it stays on, so the document keeps both addresses.
    workersDev: true,
    assets: { notFoundHandling: "single-page-application" }
  }
});
