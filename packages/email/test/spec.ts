/* What an email is built from: each part, what it is for and how it is called, held to what the package exports.
   sample.ts draws one of each. */
export interface PartSpec {
  id: string;
  name: string;
  use: string;
  call: string;
}

export const PARTS: readonly PartSpec[] = [
  {
    id: "title",
    name: "Title",
    use: "The email's one title. `large` is a newsletter's.",
    call: "title('Introducing collections', { large: true })"
  },
  {
    id: "heading",
    name: "Heading",
    use: "A section's heading; `subheading` stands inside one.",
    call: "heading('New this month')"
  },
  {
    id: "text",
    name: "Text",
    use: "A paragraph: body, the lede under a title, or small. Takes link, strong and mono.",
    call: "text(['Press ', strong('Save'), '.'], { role: 'lede' })"
  },
  {
    id: "eyebrow",
    name: "Eyebrow",
    use: "The quiet uppercase line over a title or a group.",
    call: "eyebrow('From the editor')"
  },
  {
    id: "button",
    name: "Button",
    use: "The action. Ink once per email; any other is `quiet`.",
    call: "button({ href, label: 'Browse collections' })"
  },
  {
    id: "code",
    name: "Code",
    use: "A sign-in code, large in mono on a tile.",
    call: "code('482913')"
  },
  {
    id: "list",
    name: "List",
    use: "A few short lines, each led by a dot.",
    call: "list('Select palettes in any list, then press Save.', 'Search collections by a color or a mood.')"
  },
  {
    id: "note",
    name: "Note",
    use: "A tile for words that stand apart: a tip, what changed.",
    call: "note(text('Add .css to a palette link.'))"
  },
  {
    id: "snippet",
    name: "Snippet",
    use: "Code to take away, in mono, left to right in every language.",
    call: "snippet('.hero { background: … }')"
  },
  {
    id: "image",
    name: "Image",
    use: "A picture as wide as the words, with its caption.",
    call: "image({ src, alt, width: 1200, height: 630, caption })"
  },
  {
    id: "palette",
    name: "Palette",
    use: "One palette in its view, as wide as the words. `chips` adds its keyframes' colors with their hex.",
    call: "palette({ seed, style, steps, angle, name, note, chips: true })"
  },
  {
    id: "palettes",
    name: "Palette row",
    use: "Palettes side by side, each in its own view, two or three to a row, on a phone too.",
    call: "palettes([{ seed, style, steps, angle, name, note }, …])"
  },
  {
    id: "collection",
    name: "Collection",
    use: "A collection: three to six of its palettes as a row of tiles, then its title and a line about it.",
    call: "collection({ title, href, tiles, note, about })"
  },
  {
    id: "collections",
    name: "Collections",
    use: "Two or three collections, one under another.",
    call: "collections([{ title, href, tiles, note, about }, …])"
  },
  {
    id: "promo",
    name: "Partner",
    use: "Someone else's work, on a tile under its label, ending with what was exchanged.",
    call: "promo({ label: 'Partner', name, href, about, picture, action, terms })"
  },
  {
    id: "mentions",
    name: "Partner mentions",
    use: "Several partners in a line or two each, on one tile with what was exchanged.",
    call: "mentions({ label: 'Partners', items: [{ name, href, about }], terms })"
  },
  {
    id: "rule",
    name: "Rule",
    use: "The one separator, the dashed rule. A section draws its own.",
    call: "rule()"
  },
  {
    id: "links",
    name: "Links",
    use: "The ways on from the foot, on one line.",
    call: "links({ label: 'Palettes', href })"
  },
  {
    id: "section",
    name: "Section",
    use: "A newsletter's section: the rule, a heading, then its parts.",
    call: "section('New this month', text('…'), button({ href, label }))"
  },
  {
    id: "stack",
    name: "Stack",
    use: "Parts one under another, a step of the spacing scale apart.",
    call: "stack('s3', title('…'), text('…'))"
  }
];
