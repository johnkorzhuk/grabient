import { dir, LOCALE_INFO, locale, localHref, t } from "@grabient/i18n";
import link from "@grabient/ui/link.module.css";
import { Text } from "@grabient/ui/Text.tsx";
import { For, Show, untrack } from "solid-js";
import { type LegalBlock, legalBlocks, plainText } from "./blocks.ts";
import styles from "./Legal.module.css";
import privacy from "./privacy.html?raw";
import terms from "./terms.html?raw";

/* Privacy and Terms, set in the system's type, in English on every language's page: one text applies everywhere. */
const DOCUMENTS = { privacy: legalBlocks(privacy), terms: legalBlocks(terms) };

/** Inline markup keeps its meaning and takes the system's ink; a link to one of the site's pages stays in the reader's
    language. */
const inline = (html: string) =>
  html
    .replace(/<a href="(\/(?!\/)[^"]*)"/g, (_, path: string) => `<a href="${localHref(path)}"`)
    .replace(/<a /g, `<a class="${link.inline}" `)
    .replace(/<code>/g, `<code class="${styles.code}">`);

/* a block never changes in place: the list is keyed by block, so a row is built for one block and kept with it */
function Block(props: { block: LegalBlock }) {
  const block = untrack(() => props.block);
  switch (block.kind) {
    case "ul":
      return (
        <ul class={styles.list}>
          <For each={block.items} keyed={false}>
            {item => <li class={styles.p} innerHTML={inline(item())} />}
          </For>
        </ul>
      );
    case "p":
      return <p class={styles.p} innerHTML={inline(block.html)} />;
    case "date":
      return (
        <Text variant="small" as="p">
          {plainText(block.html)}
        </Text>
      );
    case "h1":
      return (
        <div class={styles.heading}>
          <Text variant="title" as="h1">
            {plainText(block.html)}
          </Text>
        </div>
      );
    default:
      return (
        <div class={block.kind === "h2" ? styles.h2 : styles.h3}>
          <Text variant={block.kind}>{plainText(block.html)}</Text>
        </div>
      );
  }
}

/** The privacy policy or the terms, marked as English and set left to right in a right-to-left page. */
export function LegalPage(props: { document: keyof typeof DOCUMENTS }) {
  return (
    <article class={styles.article} lang="en" dir="ltr">
      <Show when={locale() !== "en"}>
        <div lang={LOCALE_INFO[locale()].tag} dir={dir()}>
          <Text variant="small" as="p">
            {t("This page is in English only.")}
          </Text>
        </div>
      </Show>
      <For each={DOCUMENTS[props.document]}>{block => <Block block={block} />}</For>
    </article>
  );
}
