import { decodePalette, sampleStops } from "@grabient/engine";
import { gradientCss } from "@grabient/engine/css.ts";
import { randomPalette } from "@grabient/engine/random.ts";
import type { Style } from "@grabient/engine/view.ts";

/* The document's sample data: palettes and collections from grabient.com's gallery, each drawn as the site draws it,
   and the words a sample card shows. */
export interface Sample {
  seed: string;
  style: Style;
  steps: number;
  angle: number;
  likes: number;
}

/** The first page of Popular. */
export const POPULAR: readonly Sample[] = [
  { seed: "kY4mpDazO-mUuu_fuLqXU49dvVP6", style: "linearGradient", steps: 6, angle: 45, likes: 92 },
  {
    seed: "kc-zpNeqM_WwiupeubyU06-8nTP_DzcBvUdAQ",
    style: "linearGradient",
    steps: 8,
    angle: 135,
    likes: 86
  },
  {
    seed: "kamzkm1gtFdWRyrLHcJuB9B6KaQgOlEGg",
    style: "linearGradient",
    steps: 7,
    angle: 90,
    likes: 79
  },
  { seed: "kWs2um4jE-G62O7xwb3bkk-4", style: "linearGradient", steps: 5, angle: 90, likes: 56 },
  { seed: "kSyQDAzZa8zgZxS", style: "angularSwatches", steps: 15, angle: 210, likes: 49 },
  {
    seed: "kcgI_BPOBA0BgwZI1sK2LpDueoxrwLsS764_g",
    style: "linearGradient",
    steps: 8,
    angle: 45,
    likes: 44
  },
  { seed: "kUzkiw66E-e4YQltnUXg", style: "linearGradient", steps: 5, angle: 45, likes: 43 },
  { seed: "kW0B2lbAbMXISxv1E0NeJVCg", style: "linearGradient", steps: 7, angle: 225, likes: 38 },
  {
    seed: "kcERi8Fyy_zqWO_hlTGb7C9OA3va4rz2CA29A",
    style: "linearGradient",
    steps: 8,
    angle: 90,
    likes: 38
  },
  { seed: "kW0FBC2LM90Q3vExuj4JClAA", style: "linearSwatches", steps: 13, angle: 90, likes: 30 },
  { seed: "kUYS-nyUXCl-3PT1NLqg", style: "angularSwatches", steps: 13, angle: 45, likes: 27 },
  {
    seed: "kaqoHFW7U9uQuPXtKrzc7M63M9vb0xr5A",
    style: "linearGradient",
    steps: 7,
    angle: 90,
    likes: 27
  }
];

interface Collection {
  slug: string;
  title: string;
  count: number;
  seeds: readonly string[];
}

/** Three of the collections on the home page. */
export const COLLECTIONS: readonly Collection[] = [
  {
    slug: "pastel-gradients",
    title: "Pastel gradients",
    count: 24,
    seeds: [
      "kUzkiw66E-e4YQltnUXg",
      "ka7RMUfBJIf2XQN9lb-fI2_nUDLntHT0A",
      "kW1Tq37ZnCvEcxTwIMFbiS_w",
      "kW4ihe8xe522aOLnGjnaI05o",
      "kWxRz74wjQu0NuXyDTvbAlLw",
      "kW9g5WeAa1PEVPXnqb63ka-g",
      "kYuHEoZjHAOylwNzG8EdhPEncaxU",
      "kU7yNy9gjC3OLS7zFMFA"
    ]
  },
  {
    slug: "vaporwave-gradients",
    title: "Vaporwave gradients",
    count: 28,
    seeds: [
      "kW1kx15iJE9unR5ZsUW3ydDo",
      "kWz1Lk48tBN9WvzVS70Ur67g",
      "kato305Do_-ykv3yELzcRO4-iiPzcNECg",
      "kciaDsU8RDGIkQ5rmMqa6bGeIxxpQSkMQOTBI",
      "kWqUqr2SlENe4xNVT0NVFpBw",
      "kaT3bQuT_AU-9QLhs0Aah--GobuZipDtg",
      "kcylWo-CK63oSQN6hk04EhDFPkwVO2MHQ89BQ",
      "kaz2WL6bFAmWqw5dssYWFVDdfuQTZdMBA"
    ]
  },
  {
    slug: "alpine-copper-kitchen",
    title: "Alpine copper kitchen",
    count: 21,
    seeds: [
      "ka1BcuYgnHdaQRDKk0CPw6_DeNNe3prug",
      "kaUyacMAS2LWWOA5GD4uZM8jUOxIuEseA",
      "kYgSiiwJvEMIMsZMKDr2yC9-oavW",
      "kWZC3NuRRLEmfxVYIENXptDo",
      "kUiCIYUaFCWAjQfkGEMA",
      "kYq0eQRphFEEgy5KPERUjZCNckxa",
      "kWQSUdpBZALMbwLGIMCVKRAQ",
      "kY7B098odB-kKx5dkMA0o25EyiuK"
    ]
  }
];

/** A seed's colors at a count of steps; none for a seed that is no palette. */
export function hexes(seed: string, steps = 32): string[] {
  const palette = decodePalette(seed);
  return palette ? sampleStops(palette, steps).map(s => s.hex) : [];
}

/** A soft art ground for a specimen over a picture: the nth popular palette, blended across. */
export const art = (n: number, angle = 120): string =>
  gradientCss(hexes(POPULAR[n % POPULAR.length].seed), "linearGradient", angle);

/** What the header's bar cycles through: random palettes from the engine, new on every load, with a few of the
    gallery's own among them. */
export function supply(): (readonly string[])[] {
  const popular = POPULAR.map(s => s.seed)
    .sort(() => Math.random() - 0.5)
    .slice(0, 3)
    .map(seed => hexes(seed));
  const random = Array.from({ length: 9 }, () => sampleStops(randomPalette(), 32).map(s => s.hex));
  return [...popular, ...random].sort(() => Math.random() - 0.5);
}
