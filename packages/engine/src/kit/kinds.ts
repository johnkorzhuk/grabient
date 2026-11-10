/* The field effects the site plays (kit/registry.ts holds their definitions): their names alone, which effect.ts joins
   to the bespoke effects' in EFFECTS, so every page's start reads this and nothing of the kit's code. A new one is its
   file in kit/fields/, its kind here, its line in registry.ts and its words in names.ts. */

export const KIT_KINDS = ["strata"] as const;
export type KitKind = (typeof KIT_KINDS)[number];
export const isKitKind = (value: unknown): value is KitKind =>
  typeof value === "string" && (KIT_KINDS as readonly string[]).includes(value);

/** A table's entries for every kit effect, each from its kind: what a Record over every effect spreads for them. */
export const kitRecord = <T>(value: (kind: KitKind) => T): Record<KitKind, T> =>
  Object.fromEntries(KIT_KINDS.map(kind => [kind, value(kind)])) as Record<KitKind, T>;
