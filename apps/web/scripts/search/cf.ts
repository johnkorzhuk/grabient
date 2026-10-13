/* cf, the Cloudflare CLI, run by the Node that runs the step, since cf needs a newer Node than a shell may default to.
   Writing to a pipe, it answers in JSON. A local D1 command can print its answer and never exit while `vite dev` holds
   the database, so the child is ended once its output parses and has been quiet for a moment. */
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { WEB } from "./paths.ts";

const BIN = resolve(WEB, "node_modules/cf/bin/cf");
const QUIET_MS = 500;

/** cf's JSON answer to one command, run from apps/web. */
export function cf(args: readonly string[], timeout = 600_000): Promise<unknown> {
  const named = `cf ${args.slice(0, 2).join(" ")}`;
  return new Promise((done, fail) => {
    const child = spawn(process.execPath, [BIN, ...args], {
      cwd: WEB,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let out = "";
    let err = "";
    let settled = false;
    let quiet: ReturnType<typeof setTimeout> | undefined;
    const parsed = (): { value: unknown } | null => {
      try {
        return { value: JSON.parse(out) };
      } catch {
        return null;
      }
    };
    const finish = (error: Error | null, value?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(quiet);
      clearTimeout(limit);
      child.kill();
      if (error) fail(error);
      else done(value);
    };
    const limit = setTimeout(
      () => finish(new Error(`${named} gave no answer in ${timeout / 1000} s.`)),
      timeout
    );
    child.stdout.setEncoding("utf8").on("data", chunk => {
      out += chunk;
      clearTimeout(quiet);
      quiet = setTimeout(() => {
        const answer = parsed();
        if (answer) finish(null, answer.value);
      }, QUIET_MS);
    });
    child.stderr.setEncoding("utf8").on("data", chunk => {
      err += chunk;
    });
    child.on("error", error => finish(error));
    child.on("close", code => {
      const answer = code === 0 ? parsed() : null;
      if (answer) finish(null, answer.value);
      else finish(new Error(`${named} failed: ${(err || out).trim()}`));
    });
  });
}
