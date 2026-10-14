import { defineConfig } from "cf/config";
import app from "../cloudflare.config.ts";

/* The Worker the tests run in: local development's bindings without the secrets it asks the machine for. Each test
   brings its own (helpers.ts), so a machine with no .dev.vars, as CI is, is asked for none and warns of none, and a
   machine that has one runs the same tests. */
export default defineConfig(ctx => {
  const { worker } = app(ctx);
  if (!worker || typeof worker === "function" || worker instanceof Promise)
    throw new Error("Local development declares its Worker as an object");
  const env = Object.fromEntries(
    Object.entries(worker.env ?? {}).filter(([, binding]) => binding.type !== "secret")
  );
  return { worker: { ...worker, env } };
});
