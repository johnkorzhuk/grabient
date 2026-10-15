import { type Issue, type IssueContent, type PaletteView, pick, VIEW } from "@grabient/email";
import { decodePalette } from "@grabient/engine";
import { seedName, titleFaults } from "@grabient/engine/name.ts";
import { all, replica, run } from "@grabient/server/db/d1.ts";
import type { Env } from "@grabient/server/env.ts";

/* An issue as it runs. Its head is its first pick until an admin chooses another lead from the ones it offers: its
   picks, then its own `leads`. A pick chosen trades places with the first, so the issue still shows each once; a
   palette from `leads` takes the first's place. Each pick is named as its page names it: the title written for it
   where its colors bear it out, else what its colors are called in the view it is drawn in. */

/** What the database holds for the issues: each one's chosen lead, by number, and the palettes' names, by seed. */
export interface IssueFacts {
  leads: ReadonlyMap<number, string>;
  names: ReadonlyMap<string, string>;
}
export const NO_FACTS: IssueFacts = { leads: new Map(), names: new Map() };

type View = Required<PaletteView>;
const whole = (of: PaletteView): View => ({
  seed: of.seed,
  style: of.style ?? VIEW.style,
  steps: of.steps ?? VIEW.steps,
  angle: of.angle ?? VIEW.angle
});

/** The palettes an issue may lead with, each once, in the order an admin's arrows go through them. */
export function leadOptions(issue: Issue, content: IssueContent): View[] {
  const seen = new Set<string>();
  return [...(content.picks ?? []), ...(issue.leads ?? [])]
    .filter(of => !seen.has(of.seed) && !!seen.add(of.seed))
    .map(whole);
}

/** The issue's words with `seed` at their head, when it is one the issue offers. */
export function ledBy(issue: Issue, content: IssueContent, seed: string | undefined): IssueContent {
  const picks = content.picks ?? [];
  if (!seed || !picks.length || picks[0].seed === seed) return content;
  const at = picks.findIndex(chosen => chosen.seed === seed);
  if (at > 0) {
    const order = [...picks];
    [order[0], order[at]] = [order[at], order[0]];
    return { ...content, picks: order };
  }
  const lead = issue.leads?.find(option => option.seed === seed);
  return lead
    ? {
        ...content,
        picks: [pick(lead.seed, lead.style, lead.steps, lead.angle), ...picks.slice(1)]
      }
    : content;
}

/** A palette's name as its page says it in English. */
export function nameOf(of: View, written?: string): string {
  const palette = decodePalette(of.seed);
  if (written && palette && !titleFaults(written, palette).length) return written;
  return seedName(of.seed, of.style, of.steps);
}

/** What an issue says as it runs: led by `lead` (the admin's choice unless given), each pick named. */
export function asRun(
  issue: Issue,
  origin: string,
  facts: IssueFacts,
  lead = facts.leads.get(issue.number)
): IssueContent {
  const words = ledBy(issue, issue.write(origin), lead);
  return {
    ...words,
    picks: words.picks?.map(chosen => ({
      ...chosen,
      name: chosen.name ?? facts.names.get(chosen.seed) ?? nameOf(whole(chosen))
    }))
  };
}

/** The chosen leads and the names of every palette the issues may lead or pick with, read from a replica. */
export async function readFacts(
  env: Pick<Env, "DB">,
  issues: readonly Issue[]
): Promise<IssueFacts> {
  // an issue's palettes are the same at any address, so it is written at the site's own
  const views = issues.flatMap(issue => leadOptions(issue, issue.write("https://grabient.com")));
  const seeds = [...new Set(views.map(of => of.seed))];
  const db = replica(env);
  const [chosen, written] = await Promise.all([
    all<{ issue: number; seed: string }>(db, "SELECT issue, seed FROM k_newsletter_leads"),
    seeds.length
      ? all<{ seed: string; title: string }>(
          db,
          `SELECT seed, title FROM k_palette_texts WHERE seed IN (${seeds.map(() => "?").join(", ")})`,
          ...seeds
        )
      : Promise.resolve([])
  ]);
  const titles = new Map(written.map(row => [row.seed, row.title]));
  return {
    leads: new Map(chosen.map(row => [row.issue, row.seed])),
    names: new Map(views.map(of => [of.seed, nameOf(of, titles.get(of.seed))]))
  };
}

/** An admin's choice of lead for an issue, kept until another. */
export async function chooseLead(
  env: Pick<Env, "DB">,
  issue: number,
  seed: string,
  by: string
): Promise<void> {
  await run(
    env.DB,
    `INSERT INTO k_newsletter_leads (issue, seed, chosen_by, chosen_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (issue) DO UPDATE SET seed = excluded.seed, chosen_by = excluded.chosen_by,
       chosen_at = excluded.chosen_at`,
    issue,
    seed,
    by,
    Date.now()
  );
}
