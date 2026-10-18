import type { Env } from "@grabient/server/env.ts";
import { checkLimits } from "@grabient/server/limits/check.ts";

/* Whether a username may stand where others read it. Two checks, each where it pays:
   - Words no handle needs (slurs, hate codes, the harshest profanity), as whole words once its digits are read as the
     letters they stand for. Settings refuses them as a name is typed and saved, for every account. The list is short
     and exact, so it never stops a real name: Scunthorpe, Dick Van Dyke and Fukuoka pass.
   - Before a name is shown on palettes, Cloudflare's Clef on Workers AI judges it whole: words run together,
     misspelled, abbreviated or in another language, which no list keeps up with. A name it holds offensive stays the
     account's own; it is only never shown. About 265 tokens a name, within the site's free daily allowance. */

/** The digits a name may spell with, read as their letters. */
const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t" };
const lettersOf = (name: string) => name.toLowerCase().replace(/[013457]/g, d => LEET[d] ?? d);

/** Whole words of a name, its letters split at everything else. */
const WORDS = new Set([
  // profanity
  "fuck",
  "fucks",
  "fucker",
  "fuckers",
  "fucking",
  "fucked",
  "motherfucker",
  "motherfuckers",
  "shit",
  "shits",
  "shitty",
  "shithead",
  "shitheads",
  "bullshit",
  "cunt",
  "cunts",
  "asshole",
  "assholes",
  "dickhead",
  "dickheads",
  "cocksucker",
  "cocksuckers",
  "wanker",
  "wankers",
  "twat",
  "twats",
  "whore",
  "whores",
  "slut",
  "sluts",
  // slurs
  "nigger",
  "niggers",
  "nigga",
  "niggas",
  "faggot",
  "faggots",
  "fag",
  "fags",
  "kike",
  "kikes",
  "spic",
  "spics",
  "chink",
  "chinks",
  "gook",
  "gooks",
  "wetback",
  "wetbacks",
  "beaner",
  "beaners",
  "pajeet",
  "pajeets",
  "raghead",
  "ragheads",
  "towelhead",
  "towelheads",
  "tranny",
  "trannies",
  "retard",
  "retards",
  "retarded",
  // hate and harm
  "kkk",
  "hitler",
  "kys",
  "killyourself"
]);
/** Strings no innocent word holds, found anywhere once a name's letters run together. */
const INSIDE = [
  "fuck",
  "nigger",
  "nigga",
  "faggot",
  "killyourself",
  "gasthejews",
  "killalljews",
  "killthejews"
];
/** Hate codes, read in the name as typed: a Nazi salute and the numbers that stand for one. */
const CODES = [
  /(^|[^a-z])sieg[-_]?heil/,
  /heil[-_]?(hitler|88)(?![0-9])/,
  /(^|[^0-9])88[-_]?heil/,
  /(^|[^0-9])14[-_]?88(?![0-9])/
];

/** Whether the name holds a word the list refuses. */
export function refusedName(name: string): boolean {
  const typed = name.toLowerCase();
  if (CODES.some(code => code.test(typed))) return true;
  const letters = lettersOf(name);
  if (letters.split(/[^a-z]+/).some(word => WORDS.has(word))) return true;
  const joined = letters.replace(/[^a-z]+/g, "");
  return INSIDE.some(word => joined.includes(word));
}

const CLEF = "@cf/cloudflare/clef";
/** Clef's yes from here on is a no to the name. Tried with the list on 128 names, they refused 62 of 63 offensive ones
    (not "nonce", a programmer's word too), and of 65 fine ones two meant as innuendo and four innocent ones, such as
    Babe Ruth; the list alone refused 30 offensive ones and no fine one. */
const OFFENSIVE = 0.5;
const QUESTION = {
  type: "noul",
  instructions:
    "A person chose this username on a color palette website, and it will be shown publicly beside palettes they liked. Is it offensive: strong profanity, a vulgar insult, sexual words or innuendo, a slur against any group, a hate group or hate code, a threat, or a call for anyone to be harmed or to harm themselves? Check words run together, misspelled, abbreviated, written with digits or symbols for letters, or in any language.",
  criteria: {
    true: "Offensive to show publicly.",
    false:
      "Fine to show: real names and surnames, places, titles of songs, shows and games, years and numbers, ordinary words that merely contain a rude-looking string, and mild words like damn, hell or crap."
  }
} as const;

/** What Clef reads: the name, and with it the name its digits spell. */
export function clefState(name: string): string {
  const read = name.replace(/[013457]/g, d => LEET[d] ?? d);
  return read === name
    ? `Username: ${name}`
    : `Username: ${name}\nIts digits read as letters: ${read}`;
}

/** A name's fitness to be shown: `unchecked` when Workers AI, or the day's checks, could not answer, which shows
    nothing. */
export type Fitness = "fit" | "unfit" | "unchecked";

/** Whether an account's name may be shown on palettes: the list's words first, then Clef, within the account's hour
    and the site's day of checks. */
export async function fitToShow(
  env: Partial<Pick<Env, "AI" | "RATE_LIMITER" | "DEPLOYMENT" | "USAGE">>,
  name: string,
  accountId: string
): Promise<Fitness> {
  if (refusedName(name)) return "unfit";
  const { AI } = env;
  if (!AI) return "unchecked";
  const allowed = await checkLimits(env, [
    [`username-screen:${accountId}`, "usernameScreen"],
    ["username-screen", "usernameScreenDaily"]
  ]);
  if (!allowed?.success) return "unchecked";
  // Clef is newer than the literal types Workers AI's binding knows
  const run = AI.run.bind(AI) as unknown as (
    model: string,
    input: { model: string; state: string; questions: { offensive: typeof QUESTION } }
  ) => Promise<{ answers?: { offensive?: { noul?: unknown } } }>;
  try {
    const answer = await run(CLEF, {
      model: "clef",
      state: clefState(name),
      questions: { offensive: QUESTION }
    });
    const yes = answer.answers?.offensive?.noul;
    if (typeof yes !== "number" || !Number.isFinite(yes)) return "unchecked";
    return yes >= OFFENSIVE ? "unfit" : "fit";
  } catch (error) {
    console.error("Username unchecked", String(error));
    return "unchecked";
  }
}
