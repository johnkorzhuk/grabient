/**
 * One-off dedup validation for color-theory query vocabulary: embeds a batch
 * of realistic scheme phrasings via POST /api/debug/embed and prints every
 * pair whose cosine similarity clears QUERY_DUPLICATE_SIMILARITY (0.92).
 *
 * Same-concept collisions (same scheme + same hues, different register) are
 * expected and correct. Cross-concept collisions (different scheme or hues)
 * mean the vocabulary needs stronger hue/context anchoring in the skill
 * mandate — NOT a threshold change.
 *
 * Run: DC_API_URL=... DC_API_KEY=... pnpm exec tsx harness/dedup-probe.ts
 * (or source harness/.env first)
 */

const THRESHOLD = 0.92;

const PHRASINGS = [
  // complementary, different hue anchors and registers
  "complementary blue and orange",
  "blue orange complementary scheme",
  "complementary palette red green",
  "complementary purple yellow brand colors",
  // split-complementary
  "split complementary sunset colors",
  "split complementary teal palette",
  // triadic
  "triadic primary colors bold",
  "triadic scheme muted pastels",
  "playful triadic palette for kids brand",
  // analogous
  "analogous ocean blues and greens",
  "analogous warm autumn colors",
  "analogous purples for a lavender field",
  // monochromatic
  "monochromatic teal",
  "monochrome navy shades",
  "single hue green tones light to dark",
  // tetradic
  "tetradic jewel tones",
  "four color tetradic scheme vibrant",
  // temperature / adjacent designer vocabulary
  "warm vs cool contrast palette",
  "cool shadows warm highlights",
  "duotone pink and navy",
  "duotone poster purple orange",
  "60 30 10 palette for an interior",
  "high saturation accent on neutral base",
  // controls: same concept phrased apart, and near-neighbors
  "complementary orange and blue for a sports team",
  "opposite colors on the color wheel blue orange",
];

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

async function main() {
  const base = process.env.DC_API_URL;
  const key = process.env.DC_API_KEY;
  if (!base || !key) {
    console.error("DC_API_URL / DC_API_KEY not set (source harness/.env)");
    process.exit(1);
  }
  const res = await fetch(`${base}/api/debug/embed`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ texts: PHRASINGS }),
  });
  if (!res.ok) {
    console.error(`embed request failed: ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  const { vectors } = (await res.json()) as { vectors: number[][] };

  const collisions: Array<[string, string, number]> = [];
  let maxSim = 0;
  let maxPair: [string, string] = ["", ""];
  for (let i = 0; i < PHRASINGS.length; i++) {
    for (let j = i + 1; j < PHRASINGS.length; j++) {
      const sim = cosine(vectors[i]!, vectors[j]!);
      if (sim > maxSim) {
        maxSim = sim;
        maxPair = [PHRASINGS[i]!, PHRASINGS[j]!];
      }
      if (sim > THRESHOLD) collisions.push([PHRASINGS[i]!, PHRASINGS[j]!, sim]);
    }
  }

  console.log(`${PHRASINGS.length} phrasings, threshold ${THRESHOLD}`);
  console.log(`max pairwise similarity: ${maxSim.toFixed(4)}`);
  console.log(`  "${maxPair[0]}" <-> "${maxPair[1]}"`);
  if (collisions.length === 0) {
    console.log("no pairs above threshold — vocabulary is dedup-safe");
    return;
  }
  console.log(`${collisions.length} pair(s) above threshold:`);
  for (const [a, b, sim] of collisions.sort((x, y) => y[2] - x[2])) {
    console.log(`  ${sim.toFixed(4)}  "${a}" <-> "${b}"`);
  }
}

main();
