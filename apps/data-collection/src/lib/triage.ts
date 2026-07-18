/**
 * Free-tier consensus triage: pure decision logic (the Worker route does the
 * I/O). A panel of free Workers AI models pre-screens pending pairs; only a
 * unanimous-with-no-dissent "bad" verdict auto-rejects, so weak models get
 * authority over obvious junk and never over acceptance.
 */

export const TRIAGE_VOTES = ["bad", "plausible", "good"] as const;
export type TriageVote = (typeof TRIAGE_VOTES)[number];

export interface PanelVote {
  model: string;
  vote: TriageVote | "unparseable";
}

// Two architecturally diverse seats on the existing env.AI binding (zero new
// credentials). qwen3 gets the no_think soft switch so max_tokens isn't
// consumed by reasoning before the answer appears.
export const SEAT_MODELS = [
  "@cf/meta/llama-4-scout-17b-16e-instruct",
  "@cf/qwen/qwen3-30b-a3b-fp8",
] as const;

/** Self-enforced daily budget on panel AI calls (fail-closed: at the cap,
 * triage stops and the judge sees everything, exactly as before triage
 * existed). 1,200 calls at ~300in/16out tokens sits far inside the 10k
 * free neurons/day even at several times Llama-3.2-1B neuron rates. */
export const DAILY_AI_CALL_CAP = 1200;

/** Max pairs per invocation - bounded so a single request stays well under
 * the Workers free-plan subrequest limit (50) even with D1 traffic. */
export const BATCH_LIMIT = 10;

export function triagePrompt(
  queryText: string,
  hexStops: string[],
  tags: string[],
): { system: string; user: string } {
  return {
    system:
      "You judge whether a color palette satisfies a color-search query. " +
      'Reply with exactly one word: "bad" (obviously wrong colors for the ' +
      'query), "plausible" (defensible), or "good" (clearly fits).',
    user:
      `Query: "${queryText}"\n` +
      `Palette colors in order: ${hexStops.join(", ")}\n` +
      (tags.length ? `Palette traits: ${tags.join(", ")}\n` : "") +
      "One word only: bad, plausible, or good.",
  };
}

/** Last recognizable keyword wins (models sometimes narrate first);
 * anything unparseable is treated as non-vote and can never reject. */
export function parseVote(raw: string): PanelVote["vote"] {
  const matches = raw.toLowerCase().match(/\b(bad|plausible|good)\b/g);
  return matches?.length
    ? (matches[matches.length - 1] as TriageVote)
    : "unparseable";
}

/** Reject only on >=2 'bad' votes with zero 'good' and zero unparseable
 * dissent-blockers among parseable votes. With the standard two-seat panel
 * that means unanimity; a future third seat can outvote one 'plausible'. */
export function decideReject(votes: PanelVote[]): boolean {
  const parseable = votes.filter((v) => v.vote !== "unparseable");
  if (parseable.length < 2) return false;
  const bad = parseable.filter((v) => v.vote === "bad").length;
  const good = parseable.filter((v) => v.vote === "good").length;
  return bad >= 2 && good === 0 && bad === parseable.length;
}
