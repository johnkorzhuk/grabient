/* The document's outline: its pages, and the sections of each under their groups, in page order. The header's pages,
   each page's side list, the cover's tiles and every section's eyebrow and title read it, so a section is named once. */
export type PageId = "cover" | "foundations" | "components";

export interface Entry {
  id: string;
  title: string;
}
export interface Group {
  name: string;
  entries: readonly Entry[];
}
export interface Page {
  id: PageId;
  path: string;
  title: string;
  lede: string;
  groups: readonly Group[];
}

const FOUNDATIONS: readonly Group[] = [
  {
    name: "Variables",
    entries: [
      { id: "color", title: "Color" },
      { id: "type", title: "Type" },
      { id: "spacing", title: "Spacing" },
      { id: "radius", title: "Radius" },
      { id: "elevation", title: "Elevation and surfaces" },
      { id: "layout", title: "Layout" },
      { id: "motion", title: "Motion" }
    ]
  },
  {
    name: "Brand",
    entries: [
      { id: "logo", title: "Logo" },
      { id: "icons", title: "Icons" }
    ]
  },
  {
    name: "Interaction",
    entries: [
      { id: "states", title: "States" },
      { id: "keys", title: "Key map" },
      { id: "mobile", title: "Mobile" },
      { id: "tiers", title: "Tiers" }
    ]
  },
  {
    name: "Guidelines",
    entries: [
      { id: "voice", title: "Voice" },
      { id: "never", title: "Never" }
    ]
  }
];

const COMPONENTS: readonly Group[] = [
  {
    name: "Actions",
    entries: [
      { id: "button", title: "Button" },
      { id: "menu", title: "Menu" },
      { id: "format-strip", title: "Format strip" }
    ]
  },
  {
    name: "Inputs",
    entries: [
      { id: "field", title: "Field" },
      { id: "switch", title: "Switch" },
      { id: "segmented", title: "Segmented" }
    ]
  },
  {
    name: "Feedback",
    entries: [{ id: "tooltip", title: "Tooltip" }]
  },
  {
    name: "Content",
    entries: [
      { id: "tags", title: "Tags" },
      { id: "palette-card", title: "Palette card" },
      { id: "cards", title: "Collection card" },
      { id: "code-block", title: "Code block" }
    ]
  }
];

export const PAGES: readonly Page[] = [
  {
    id: "cover",
    path: "/",
    title: "Cover",
    lede: "The design system behind grabient.com.",
    groups: []
  },
  {
    id: "foundations",
    path: "/foundations",
    title: "Foundations",
    lede: "The variables every page is built from, the brand, how things behave, and what to write and never draw.",
    groups: FOUNDATIONS
  },
  {
    id: "components",
    path: "/components",
    title: "Components",
    lede: "The components that matter most, each drawn by @grabient/ui itself on sample data.",
    groups: COMPONENTS
  }
];

/** The page at an address, a trailing slash aside, or undefined for an address that is no page. */
export const pageAt = (path: string): Page | undefined =>
  PAGES.find(p => p.path === (path.length > 1 ? path.replace(/\/+$/, "") : path));

/** A section's group and title, by its id. */
export function sectionOf(id: string): { group: string; title: string } {
  for (const page of PAGES)
    for (const group of page.groups) {
      const entry = group.entries.find(e => e.id === id);
      if (entry) return { group: group.name, title: entry.title };
    }
  throw new Error(`No section ${id} in the outline`);
}
