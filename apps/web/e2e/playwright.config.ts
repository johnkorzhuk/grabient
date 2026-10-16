import { createServer } from "node:net";
import { defineConfig, devices } from "@playwright/test";

/* Smoke tests in Chromium against `vite dev`, which runs the Worker in workerd. The tests tagged @served meet what only
   a build has, the service worker above all: the build served as a deploy serves it. Each server takes a free port from
   20000 to 29999; the workers Playwright starts read the same ones from the environment. */
async function freePort(): Promise<number> {
  for (;;) {
    const port = 20000 + Math.floor(Math.random() * 10000);
    const free = await new Promise<boolean>(resolve => {
      const probe = createServer()
        .once("error", () => resolve(false))
        .listen(port, "127.0.0.1", () => probe.close(() => resolve(true)));
    });
    if (free) return port;
  }
}

process.env.E2E_PORT ??= String(await freePort());
process.env.E2E_SERVED_PORT ??= String(await freePort());
const origin = `http://localhost:${process.env.E2E_PORT}`;
const served = `http://localhost:${process.env.E2E_SERVED_PORT}`;
/* a clone with no .dev.vars binds the sign-in secret from here, so the session read every page makes answers, and the
   reviewers' address, without which their sign-in page is not found */
const env = {
  BETTER_AUTH_SECRET: "the smoke tests' own secret, not a deploy's",
  REVIEWER_EMAIL: "reviewer@grabient.test"
};
/* the workers sign a test account's session with it where there is no .dev.vars (journeys.spec.ts) */
process.env.E2E_AUTH_SECRET ??= env.BETTER_AUTH_SECRET;
/* A local server places a request wherever this machine is, so the privacy banner could stand over the foot of every
   page: each test starts as a reader who answered it, everything off, but the banner's own (consent.spec.ts). */
const answered = (base: string) => ({
  cookies: [],
  origins: [
    {
      origin: base,
      localStorage: [
        {
          name: "consent-preferences",
          value: JSON.stringify({
            version: 3,
            timestamp: Date.now(),
            hasInteracted: true,
            isGdprRegion: false,
            categories: {
              necessary: true,
              analytics: false,
              sessionReplay: false,
              marketing: false
            }
          })
        }
      ]
    }
  ]
});

export default defineConfig({
  testDir: ".",
  globalSetup: "./setup.ts",
  fullyParallel: true,
  forbidOnly: true,
  reporter: "list",
  use: { baseURL: origin },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: answered(origin) },
      grepInvert: /@served/
    },
    {
      name: "served",
      use: { ...devices["Desktop Chrome"], baseURL: served, storageState: answered(served) },
      grep: /@served/
    }
  ],
  webServer: [
    {
      command: `pnpm exec vite dev --port ${process.env.E2E_PORT}`,
      cwd: "..",
      url: `${origin}/api/build`,
      timeout: 90_000,
      env
    },
    {
      command: `pnpm exec vite build --mode staging && pnpm exec vite preview --mode staging --port ${process.env.E2E_SERVED_PORT}`,
      cwd: "..",
      url: `${served}/api/build`,
      timeout: 180_000,
      env
    }
  ]
});
