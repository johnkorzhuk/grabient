import { afterEach, expect, test, vi } from "vitest";
import app from "../../cloudflare.config.ts";

/* The secrets a deploy declares: cf deploys each as the copy the Worker holds, and refuses a Worker without it. */
function secrets(mode: string): string[] {
  const { worker } = app({ mode, isPreview: false });
  if (!worker || typeof worker === "function" || worker instanceof Promise)
    throw new Error(`The ${mode} config declares its Worker as an object`);
  return Object.entries(worker.env ?? {})
    .filter(([, binding]) => binding && binding.type === "secret")
    .map(([name]) => name);
}

afterEach(() => vi.unstubAllEnvs());

test("production asks for every secret staging asks for, so a deploy without one is refused", () => {
  vi.stubEnv("GRABIENT_RELEASE", "production");
  expect(secrets("production")).toEqual(expect.arrayContaining(secrets("staging")));
});
