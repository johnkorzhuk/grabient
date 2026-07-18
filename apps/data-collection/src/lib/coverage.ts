import { drizzle } from "drizzle-orm/d1";
import { sql } from "drizzle-orm";
import { TAG_CATEGORIES } from "@repo/data-ops/gradient-gen";
import { palettes, queries, QUERY_CATEGORIES } from "@/db/schema";

export interface CoverageGap {
  kind: "tag" | "query-category" | "brightness-band" | "contrast-band" | "themes";
  value: string;
  count: number;
}

export interface CoverageReport {
  totals: { palettes: number; queries: number };
  tagHistogram: Record<string, number>;
  queryCategoryCounts: Record<string, number>;
  brightnessBands: Record<string, number>;
  contrastBands: Record<string, number>;
  /** Top LLM-authored themes + how many palettes still lack themes. */
  themes: { top: Record<string, number>; palettesWithoutThemes: number };
  gaps: CoverageGap[];
}

const BAND_LABELS = ["0.0-0.2", "0.2-0.4", "0.4-0.6", "0.6-0.8", "0.8-1.0"];

function bandOf(value: number): string {
  const i = Math.min(4, Math.max(0, Math.floor(value * 5)));
  return BAND_LABELS[i]!;
}

// calculateContrast is heavily compressed for cosine palettes: a max-amplitude
// rainbow measures ~0.31 and a full light-dark swing ~0.14, so uniform 0.2-wide
// bands leave the top three permanently empty and poison gap-steering with an
// unreachable target. These edges spread real palettes across all five bands.
const CONTRAST_EDGES = [0.05, 0.1, 0.15, 0.25];
const CONTRAST_LABELS = [
  "0.00-0.05",
  "0.05-0.10",
  "0.10-0.15",
  "0.15-0.25",
  "0.25+",
];

function contrastBandOf(value: number): string {
  for (let i = 0; i < CONTRAST_EDGES.length; i++) {
    if (value < CONTRAST_EDGES[i]!) return CONTRAST_LABELS[i]!;
  }
  return CONTRAST_LABELS[CONTRAST_LABELS.length - 1]!;
}

function allKnownTags(): string[] {
  return Object.values(
    TAG_CATEGORIES as Record<string, { values?: readonly string[] } | readonly string[]>,
  ).flatMap((cat) => {
    if (Array.isArray(cat)) return cat as string[];
    const values = (cat as { values?: readonly string[] }).values;
    return values ? [...values] : [];
  });
}

export async function buildCoverageReport(env: Env): Promise<CoverageReport> {
  const db = drizzle(env.DB);

  const paletteRows = await db
    .select({
      tags: palettes.tags,
      brightness: palettes.brightness,
      contrast: palettes.contrast,
      themes: palettes.themes,
    })
    .from(palettes)
    .where(sql`${palettes.status} != 'rejected'`);

  const tagHistogram: Record<string, number> = {};
  for (const tag of allKnownTags()) tagHistogram[tag] = 0;
  const brightnessBands: Record<string, number> = Object.fromEntries(
    BAND_LABELS.map((b) => [b, 0]),
  );
  const contrastBands: Record<string, number> = Object.fromEntries(
    CONTRAST_LABELS.map((b) => [b, 0]),
  );

  const themeCounts: Record<string, number> = {};
  let palettesWithoutThemes = 0;
  for (const row of paletteRows) {
    for (const tag of row.tags) {
      tagHistogram[tag] = (tagHistogram[tag] ?? 0) + 1;
    }
    brightnessBands[bandOf(row.brightness)]! += 1;
    contrastBands[contrastBandOf(row.contrast)]! += 1;
    if (row.themes && row.themes.length > 0) {
      for (const theme of row.themes) {
        themeCounts[theme] = (themeCounts[theme] ?? 0) + 1;
      }
    } else {
      palettesWithoutThemes++;
    }
  }
  const topThemes = Object.fromEntries(
    Object.entries(themeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30),
  );

  const categoryRows = await db
    .select({
      category: queries.category,
      count: sql<number>`count(*)`,
    })
    .from(queries)
    .where(sql`${queries.status} = 'active'`)
    .groupBy(queries.category);

  const queryCategoryCounts: Record<string, number> = Object.fromEntries(
    QUERY_CATEGORIES.map((c) => [c, 0]),
  );
  for (const row of categoryRows) {
    queryCategoryCounts[row.category] = row.count;
  }

  const gaps: CoverageGap[] = [
    ...Object.entries(tagHistogram).map(
      ([value, count]): CoverageGap => ({ kind: "tag", value, count }),
    ),
    ...Object.entries(queryCategoryCounts).map(
      ([value, count]): CoverageGap => ({ kind: "query-category", value, count }),
    ),
    ...Object.entries(brightnessBands).map(
      ([value, count]): CoverageGap => ({ kind: "brightness-band", value, count }),
    ),
    ...Object.entries(contrastBands).map(
      ([value, count]): CoverageGap => ({ kind: "contrast-band", value, count }),
    ),
  ]
    .sort((a, b) => a.count - b.count)
    .slice(0, 12);

  // Theme sparsity is appended after the sort so it stays visible regardless
  // of magnitude — a large uncaptioned pool is a generation-steering signal.
  if (palettesWithoutThemes > 0) {
    gaps.push({
      kind: "themes",
      value: "palettes-without-themes",
      count: palettesWithoutThemes,
    });
  }

  return {
    totals: {
      palettes: paletteRows.length,
      queries: Object.values(queryCategoryCounts).reduce((a, b) => a + b, 0),
    },
    tagHistogram,
    queryCategoryCounts,
    brightnessBands,
    contrastBands,
    themes: { top: topThemes, palettesWithoutThemes },
    gaps,
  };
}
