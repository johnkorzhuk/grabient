import { localHref, t } from "@grabient/i18n";
import { useQuery } from "@tanstack/solid-query";
import { useNavigate } from "@tanstack/solid-router";
import { createMemo, createSignal, Errored, Loading, onCleanup, useContext } from "solid-js";
import type * as v from "valibot";
import { marked, offline } from "../../app/connection.ts";
import { paletteId } from "../../lib/words.ts";
import type { SearchPage, SearchSuggestions } from "../search/bodies.ts";
import { countSearch, tagPressed } from "../search/count.ts";
import { suggestionsQuery } from "../search/queries.ts";
import { SearchField } from "../search/SearchField.tsx";
import { SearchTags } from "../search/SearchTags.tsx";
import { arrivedWhole, FIELD_MAX, fitted, readField, typedWords } from "./field.ts";
import styles from "./gallery.module.css";
import { GalleryContext } from "./page.tsx";
import { own } from "./queries.ts";

/* The search over a gallery list: the field, and the tags under it. Enter searches the words on the page the reader
   is on; a palette or a Grabient link pasted or dropped whole searches at once; an emptied field lets go of the words.
   At rest the tags are the popular searches (on the home, searches and collections in turn); while the field holds
   words, the searches that answer them, asked once typing pauses, the last answer standing until the next lands. A tag
   is a link, which the frame follows in place. */

/** How long typing pauses before the tags are asked for what it typed. */
const PAUSE = 150;
const AT_REST = 24;
const TYPED = 12;

/** The tags a page shows for its words: what its loader reads ahead, so they are in the page from its first paint. */
export const tagsQuery = (words: string, home: boolean) =>
  suggestionsQuery(words, words ? { limit: TYPED } : { both: home, limit: AT_REST });

type Tags = v.InferOutput<typeof SearchSuggestions>["suggestions"];
/* the row's read: the last answer stands until the next lands, and the row draws its own copy (queries.ts) */
const tagsView = (words: string, home: boolean) => ({
  ...tagsQuery(words, home),
  select: (tags: Tags) => own(tags)
});

/** What a page's search says to an agent in the browser (WebMCP's form annotations), in English as tools are named. */
export interface FieldTool {
  name: string;
  description: string;
  words: string;
}

export function Find(props: {
  surface: Extract<SearchPage, "home" | "palettes">;
  placeholder: string;
  tool: FieldTool;
  /** the address that searches these words on this page, in the view a pasted link draws in; "" lets go of them */
  to: (words: string, view?: URLSearchParams) => string;
  /** Enter counts the words for the tags (never on Saved, never a palette) */
  counts: boolean;
  /** the search needs the server and there is none: the words stay in view */
  disabled?: boolean;
  onImage?: (file: File) => void;
}) {
  const page = useContext(GalleryContext)!;
  const navigate = useNavigate();
  const home = () => props.surface === "home";
  /* what the field holds: the address's words, until the reader types */
  const [typed, setTyped] = createSignal(() => page.words());
  /* what the tags answer: the address's words, until typing pauses */
  const [asked, setAsked] = createSignal(() => page.words());
  let pause: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(pause));
  const ask = (text: string) => {
    clearTimeout(pause);
    pause = setTimeout(() => setAsked(typedWords(text)), PAUSE);
  };
  /* With no connection the row keeps the tags it has: a read that cannot be made would wait for the connection, and
     the page's next step with it. */
  const answered = createMemo<string>(last => (offline() && last !== undefined ? last : asked()));
  const tags = useQuery(() => tagsView(answered(), home()));
  /* each in its place with no connection, the ones that need the server disabled */
  const shown = () =>
    marked(
      (tags.data ?? []).map(tag => ({
        label: tag.label,
        colors: tag.colors,
        href: localHref(tag.query ? props.to(tag.query) : tag.href)
      }))
    );

  const go = (words: string, view?: URLSearchParams) =>
    void navigate({ href: props.to(words, view) });
  const submit = async (text: string, counted: boolean) => {
    const read = await fitted(readField(text));
    if ("error" in read) return page.refuse(t(read.error));
    page.refuse("");
    if ("open" in read) return void navigate({ href: read.open });
    if (counted && props.counts && !paletteId(read.words)) countSearch(read.words, props.surface);
    go(read.words, read.view);
  };
  const input = (text: string) => {
    const before = typed();
    setTyped(text);
    page.refuse("");
    if (!text.trim() && page.words()) return go("");
    if (arrivedWhole(text, before)) return void submit(text, false);
    ask(text);
  };

  return (
    <div class={styles.find}>
      <SearchField
        value={typed()}
        placeholder={props.placeholder}
        maxlength={FIELD_MAX}
        tool={props.tool}
        disabled={props.disabled}
        onInput={input}
        onSubmit={text => void submit(text, true)}
        onImage={props.onImage}
      />
      {/* a row that cannot be read keeps its room and offers nothing: the field still searches */}
      <Errored fallback={() => <SearchTags tags={[]} />}>
        <Loading fallback={<SearchTags tags={[]} loading={!offline()} />}>
          <SearchTags
            lead={typed().trim() ? undefined : t("Popular")}
            tags={shown()}
            onPick={(tag, index) => tagPressed(tag, index, props.surface)}
          />
        </Loading>
      </Errored>
    </div>
  );
}
