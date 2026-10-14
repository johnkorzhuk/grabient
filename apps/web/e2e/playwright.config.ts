import { createServer } from "node:net";
import { defineConfig, devices } from "@playwright/test";

/* Smoke tests in Chromium against `vite dev`, which runs the Worker in workerd. The server takes a free port from 20000
   to 29999; the workers Playwright starts read the same one from the environment. */
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
const origin = `http://localhost:${process.env.E2E_PORT}`;

export default defineConfig({
  testDir: ".",
  fullyParallel: true,
  forbidOnly: true,
  reporter: "list",
  use: { baseURL: origin },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm exec vite dev --port ${process.env.E2E_PORT}`,
    cwd: "..",
    url: `${origin}/api/build`,
    timeout: 90_000,
    /* a clone with no .dev.vars binds the sign-in secret from here, so the session read every page makes answers, and
       the reviewers' address, without which their sign-in page is not found */
    env: {
      BETTER_AUTH_SECRET: "the smoke tests' own secret, not a deploy's",
      REVIEWER_EMAIL: "reviewer@grabient.test"
    }
  }
});
