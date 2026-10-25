import { Button } from "@grabient/ui/Button.tsx";
import { BarLight } from "@grabient/ui/contexts.ts";
import { Field } from "@grabient/ui/Field.tsx";
import { t } from "@grabient/ui/i18n.ts";
import { Label } from "@grabient/ui/Label.tsx";
import { Logo } from "@grabient/ui/Logo.tsx";
import { PaletteCard } from "@grabient/ui/PaletteCard.tsx";
import { Segmented } from "@grabient/ui/Segmented.tsx";
import { Switch } from "@grabient/ui/Switch.tsx";
import { Text } from "@grabient/ui/Text.tsx";
import { color, font, motion, radius, size, space } from "@grabient/ui/tokens.ts";
import { type Element, For, useContext } from "solid-js";
import { PAGES, type Page } from "../contents.ts";
import { cardTools, sampleName } from "../doc/cards.tsx";
import { Footer } from "../doc/Footer.tsx";
import { hexes, POPULAR } from "../samples.ts";
import styles from "./Cover.module.css";

/* The cover: the wordmark, its bar the header's own, what the document is, a tile for each page with a specimen of
   what it holds and the way to each of its groups, and the principles the rest follows. */
const PRINCIPLES = [
  "Palettes carry the color. The interface is ink and paper, with one accent.",
  "One primary action per view. Everything else is quiet paper.",
  "Frosted surfaces have no border. Depth comes from a deep, soft shadow.",
  "Poppins 500 and 700 for words, the system stack for values, mono for code.",
  "Space with the scale and gap. No raw values, no margins between siblings.",
  "Keep the screen still: what opens extends its own row and moves nothing above it.",
  "One scrollbar, on the page. No inner scroll regions."
];
const SWATCHES = [
  ["ink", "ink2", "ink3", "ink4"],
  ["paper2", "paper3", "edge2", "accent"]
] as const;
const page = (id: Page["id"]) => PAGES.find(p => p.id === id) ?? PAGES[0];
const count = (p: Page) => p.groups.reduce((n, g) => n + g.entries.length, 0);
/* what the document holds, counted from the tokens and the outline */
const STATS = [
  {
    label: "Tokens",
    value: [space, radius, font, size, motion, color.dark].reduce(
      (n, g) => n + Object.keys(g).length,
      0
    )
  },
  { label: "Foundations", value: count(page("foundations")) },
  { label: "Components", value: count(page("components")) },
  { label: "Themes", value: Object.keys(color).length }
];

/* A page's tile: a specimen of what it holds, which takes no press, then its name leading to it, its line, and a way
   to each of its groups. */
function Tile(props: { page: Page; children: Element }) {
  return (
    <article class={styles.tile}>
      <div class={styles.specimen} inert>
        {props.children}
      </div>
      <div class={styles.words}>
        <a class={styles.title} href={props.page.path}>
          <Text variant="h2" as="h2">
            {props.page.title}
          </Text>
          <Text variant="num">{count(props.page)}</Text>
        </a>
        <Text variant="small">{props.page.lede}</Text>
      </div>
      <ul class={styles.groups} aria-label={`${props.page.title} groups`}>
        <For each={props.page.groups}>
          {group => (
            <li>
              <a class={styles.group} href={`${props.page.path}#${group.entries[0].id}`}>
                {group.name}
                <Text variant="num">{group.entries.length}</Text>
              </a>
            </li>
          )}
        </For>
      </ul>
    </article>
  );
}

/* both themes side by side, each a page of its own: a title, the inks and the papers, and a pair of presses */
function Themes() {
  return (
    <div class={styles.themes}>
      <For each={["dark", "light"] as const}>
        {theme => (
          <div class={styles.theme} data-theme={theme}>
            <Text variant="title" as="span">
              Aa
            </Text>
            <For each={SWATCHES}>
              {row => (
                <span class={styles.inks}>
                  <For each={row}>
                    {paint => (
                      <span
                        class={styles.ink}
                        style={{ "background-color": `var(--color-${paint})` }}
                      />
                    )}
                  </For>
                </span>
              )}
            </For>
            <span class={styles.presses}>
              <Button>{t("Cancel")}</Button>
              <Button variant="primary">{t("Save")}</Button>
            </span>
          </div>
        )}
      </For>
    </div>
  );
}

/* a card as a list draws it under the pointer, and a column of the controls a form is made of */
function Kit() {
  const sample = POPULAR[1];
  return (
    <div class={styles.kit}>
      <PaletteCard
        seed={sample.seed}
        name={sampleName(sample)}
        stops={hexes(sample.seed, sample.steps)}
        style={sample.style}
        angle={sample.angle}
        href={`/${sample.seed}`}
        similar={{ href: `/palettes?q=${sample.seed}` }}
        age="12 days"
        likes={sample.likes}
        state="hover"
        tools={cardTools}
      />
      <div class={styles.controls}>
        <Segmented
          aria-label={t("What to export")}
          value="selection"
          options={[
            { value: "palette", label: t("This palette") },
            { value: "selection", label: t("Selection") }
          ]}
          onChange={() => {}}
        />
        <Field
          label={t("Email")}
          name="cover-email"
          type="email"
          placeholder={t("name@example.com")}
        />
        <span class={styles.setting}>
          <Text variant="ui">{t("Analytics")}</Text>
          <Switch checked aria-label={t("Analytics")} onChange={() => {}} />
        </span>
        <Button variant="primary" size="lg" full>
          {t("Send link")}
        </Button>
      </div>
    </div>
  );
}

export function Cover() {
  const light = useContext(BarLight);
  return (
    <main id="content" class={styles.cover}>
      <section class={styles.hero}>
        <div class={styles.name}>
          <Logo stops={light()} height={88} />
          <div class={styles.lead}>
            <Text variant="title" as="h1">
              Grabient Design
            </Text>
            <Text variant="lede">
              The design system behind grabient.com: the foundations every page is built from, and
              the components that matter most, each drawn by the system itself.
            </Text>
          </div>
        </div>
        <dl class={styles.stats}>
          <For each={STATS}>
            {stat => (
              <div class={styles.stat}>
                <dt>
                  <Label>{stat.label}</Label>
                </dt>
                <dd class={styles.value}>
                  <Text variant="title" as="span">
                    {stat.value}
                  </Text>
                </dd>
              </div>
            )}
          </For>
        </dl>
      </section>
      <section class={styles.tiles} aria-label="Contents">
        <Tile page={page("foundations")}>
          <Themes />
        </Tile>
        <Tile page={page("components")}>
          <Kit />
        </Tile>
      </section>
      <section class={styles.principles} aria-labelledby="principles">
        <Label id="principles">Principles</Label>
        <ol class={styles.list}>
          <For each={PRINCIPLES}>
            {(principle, i) => (
              <li class={styles.principle}>
                <Text variant="mono">{String(i() + 1).padStart(2, "0")}</Text>
                <Text variant="body" strong>
                  {principle}
                </Text>
              </li>
            )}
          </For>
        </ol>
      </section>
      <Footer />
    </main>
  );
}
