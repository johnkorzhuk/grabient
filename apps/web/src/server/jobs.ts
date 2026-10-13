import type { Env } from "@grabient/server/env.ts";
import { prunePaletteUse } from "./palette-use/use.ts";
import { refreshStars } from "./site/github-stars.ts";

/* The scheduled work, one function per trigger in cloudflare.config.ts. Each job runs its steps in order; a step that
   fails is logged and the rest still run, and the run then fails as a whole so the dashboard shows it. A feature adds
   its step to the job it belongs to, in the order the job needs. */

type Step = (env: Env, ctx: ExecutionContext) => Promise<unknown>;

/** Runs a job's steps in order: what a step returns is logged, and a failure is logged and kept for the end. */
export async function runSteps(
  job: string,
  steps: Record<string, Step>,
  env: Env,
  ctx: ExecutionContext
) {
  const failed: unknown[] = [];
  for (const [name, step] of Object.entries(steps)) {
    try {
      const report = await step(env, ctx);
      if (report !== undefined) console.log(name, JSON.stringify(report));
    } catch (error) {
      console.error(`${name}: the step failed`, error instanceof Error ? error.message : error);
      failed.push(error);
    }
  }
  if (failed.length)
    throw new AggregateError(failed, `${job}: ${failed.length} of its steps failed`);
}

/** Every ten minutes: the GitHub star count, the seeding queue, IndexNow, then the search snapshot. */
export function everyTenMinutes(env: Env, ctx: ExecutionContext): Promise<void> {
  return runSteps("every ten minutes", { "github stars": env => refreshStars(env) }, env, ctx);
}

/** Every six hours: database upkeep and pruning, the Popular tags, then the hot scores. */
export function everySixHours(env: Env, ctx: ExecutionContext): Promise<void> {
  return runSteps(
    "every six hours",
    { "palette use past keeping": env => prunePaletteUse(env) },
    env,
    ctx
  );
}

/** The jobs by their trigger's schedule, which must match cloudflare.config.ts to the character. */
export const JOBS: Readonly<Record<string, (env: Env, ctx: ExecutionContext) => Promise<void>>> = {
  "*/10 * * * *": everyTenMinutes,
  "5 */6 * * *": everySixHours
};
