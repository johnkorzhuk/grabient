// Predefined colors with their approximate hue values for color harmony calculations
export const PREDEFINED_COLORS: Record<string, number> = {
  red: 0,
  orange: 30,
  gold: 45,
  yellow: 60,
  lime: 90,
  green: 120,
  teal: 165,
  cyan: 180,
  aqua: 180,
  turquoise: 174,
  azure: 195,
  blue: 240,
  navy: 240,
  indigo: 275,
  violet: 300,
  purple: 285,
  magenta: 300,
  pink: 330,
  rose: 345,
  coral: 16,
  salmon: 17,
  peach: 28,
  crimson: 348,
  maroon: 0,
  brown: 30,
  chocolate: 25,
  tan: 34,
  khaki: 54,
  olive: 60,
  mint: 135,
  lavender: 240,
  plum: 300,
  orchid: 302,
  beige: 60,
  ivory: 60,
  silver: 0, // achromatic
  gray: 0, // achromatic
  charcoal: 0, // achromatic
  slate: 210,
  black: 0, // achromatic
  white: 0, // achromatic
  seafoam: 150,
  denim: 220,
  bubblegum: 340,
  linen: 30, // warm neutral
}

// Colors that are achromatic (no meaningful hue for harmony)
const ACHROMATIC_COLORS = new Set(['black', 'white', 'gray', 'silver', 'charcoal'])

// Get hue name from hue degree - returns the closest predefined color name
function getColorNameFromHue(hue: number): string {
  // Normalize hue to 0-360
  hue = ((hue % 360) + 360) % 360
  
  // Find the closest color by hue
  let closestColor = 'red'
  let closestDistance = 360
  
  for (const [name, colorHue] of Object.entries(PREDEFINED_COLORS)) {
    if (ACHROMATIC_COLORS.has(name)) continue
    
    // Calculate circular distance
    const dist = Math.min(
      Math.abs(hue - colorHue),
      360 - Math.abs(hue - colorHue)
    )
    
    if (dist < closestDistance) {
      closestDistance = dist
      closestColor = name
    }
  }
  
  return closestColor
}

// Get multiple color names near a hue (for variety in sets of 3)
function getColorsNearHue(hue: number, count: number, exclude: Set<string>): string[] {
  hue = ((hue % 360) + 360) % 360
  
  const colorDistances: Array<{ name: string; dist: number }> = []
  
  for (const [name, colorHue] of Object.entries(PREDEFINED_COLORS)) {
    if (ACHROMATIC_COLORS.has(name) || exclude.has(name)) continue
    
    const dist = Math.min(
      Math.abs(hue - colorHue),
      360 - Math.abs(hue - colorHue)
    )
    
    colorDistances.push({ name, dist })
  }
  
  colorDistances.sort((a, b) => a.dist - b.dist)
  return colorDistances.slice(0, count).map((c) => c.name)
}

export interface ExpandedTag {
  tag: string
  type: 'original' | 'analogous-2' | 'analogous-3' | 'complementary-2' | 'complementary-3'
  sourceColor?: string
}

/**
 * Check if a tag is a predefined color
 */
export function isPredefinedColor(tag: string): boolean {
  return tag.toLowerCase() in PREDEFINED_COLORS
}

/**
 * Get all predefined color names
 */
export function getPredefinedColorNames(): string[] {
  return Object.keys(PREDEFINED_COLORS)
}

/**
 * Generate color harmony variations for a color tag
 * Returns 4 variations per color:
 * - 1 Analogous Set of 2
 * - 1 Analogous Set of 3
 * - 1 Complementary Set of 2
 * - 1 Complementary Set of 3
 */
export function expandColorTag(colorTag: string): ExpandedTag[] | null {
  const lowerTag = colorTag.toLowerCase()
  
  if (!(lowerTag in PREDEFINED_COLORS)) {
    return null
  }
  
  // Achromatic colors don't have meaningful harmonies
  if (ACHROMATIC_COLORS.has(lowerTag)) {
    return null
  }
  
  const baseHue = PREDEFINED_COLORS[lowerTag]
  const results: ExpandedTag[] = []
  const exclude = new Set([lowerTag])
  
  // === ANALOGOUS (neighboring hues) ===
  
  // Direction 1: +30° (warmer/clockwise)
  const analogousHue = (baseHue + 30) % 360
  const analogousColor = getColorNameFromHue(analogousHue)
  
  // Analogous Set of 2: base + neighbor
  if (analogousColor !== lowerTag) {
    results.push({
      tag: `${lowerTag} ${analogousColor}`,
      type: 'analogous-2',
      sourceColor: lowerTag,
    })
  }
  
  // Analogous Set of 3: base + neighbor + further neighbor
  const analogousFurtherHue = (baseHue + 60) % 360
  const analogousFurtherColor = getColorNameFromHue(analogousFurtherHue)
  if (analogousColor !== lowerTag && analogousFurtherColor !== lowerTag && analogousFurtherColor !== analogousColor) {
    results.push({
      tag: `${lowerTag} ${analogousColor} ${analogousFurtherColor}`,
      type: 'analogous-3',
      sourceColor: lowerTag,
    })
  }
  
  // === COMPLEMENTARY (opposite hues) ===
  
  // Complementary hue: 180° opposite
  const complementaryHue = (baseHue + 180) % 360
  const complementaryColors = getColorsNearHue(complementaryHue, 2, exclude)
  
  // Complementary Set of 2: base + complement
  if (complementaryColors[0]) {
    results.push({
      tag: `${lowerTag} ${complementaryColors[0]}`,
      type: 'complementary-2',
      sourceColor: lowerTag,
    })
  }
  
  // Complementary Set of 3: base + complement + second complement (different middle color than analogous-3)
  if (complementaryColors[0] && complementaryColors[1]) {
    results.push({
      tag: `${lowerTag} ${complementaryColors[0]} ${complementaryColors[1]}`,
      type: 'complementary-3',
      sourceColor: lowerTag,
    })
  }
  
  return results
}

/**
 * Expand selected tags by adding color harmony variations for any color tags
 */
export function expandTagsWithColorHarmonies(tags: string[]): ExpandedTag[] {
  const result: ExpandedTag[] = []
  const addedTags = new Set<string>()
  
  for (const tag of tags) {
    const lowerTag = tag.toLowerCase()
    
    // Add the original tag
    if (!addedTags.has(lowerTag)) {
      result.push({ tag: lowerTag, type: 'original' })
      addedTags.add(lowerTag)
    }
    
    // If it's a color, expand it
    const expansions = expandColorTag(lowerTag)
    if (expansions) {
      for (const expansion of expansions) {
        if (!addedTags.has(expansion.tag)) {
          result.push(expansion)
          addedTags.add(expansion.tag)
        }
      }
    }
  }
  
  return result
}

/**
 * Get just the tag strings from expanded tags
 */
export function getExpandedTagStrings(tags: string[]): string[] {
  return expandTagsWithColorHarmonies(tags).map((t) => t.tag)
}
