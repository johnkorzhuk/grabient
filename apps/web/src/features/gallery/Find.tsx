import { localHref, t } from "@grabient/i18n";
import { Tags } from "@grabient/ui/Tags.tsx";
import { useQuery } from "@tanstack/solid-query";
import { useNavigate } from "@tanstack/solid-router";
import {
  createMemo,
  createSignal,
  type Element,
  Errored,
  Loading,
  onCleanup,
  Show,
  useContext
} from "solid-js";
import type * as v from "valibot";
import { marked, offline } from "../../app/connection.ts";
import { paletteId } from "../../lib/words.ts";
import { tagsQuery as collectionTagsQuery } from "../collections/queries.ts";
import type { CollectionHit } from "../collections/types.ts";
import { inView } from "../list/appearance.ts";
import type { SearchPage, SearchSuggestions } from "../search/bodies.ts";
import { countSearch, tagPressed } from "../search/count.ts";
import { suggestionsQuery } from "../search/queries.ts";
import { SearchField } from "../search/SearchField.tsx";
import { arrivedWhole, FIELD_MAX, fitted, inTurn, readField, typedWords } from "./field.ts";
import styles from "./gallery.module.css";
import { GalleryContext } from "./page.tsx";
import { own } from "./queries.ts";

/* The search over a gallery list: the field, and the tags under it. Enter searches the words on the page the reader
   is on; a palette or a Grabient link pasted or dropped whole searches at once; an emptied field lets go of the words.
   At rest the tags are the popular searches; while the field holds words, the searches that answer them, asked once
   typing pauses, the last answer standing until the next lands. The home's search covers both kinds, and so do its
   tags: searches and collections in turn, at rest as the server mixes them, with words each kind's own answer. A tag
   is a link, which the frame follows in place. */

/** How long typing pauses before the tags are asked for what it typed. */
const PAUSE = 150;
const AT_REST = 24;
const TYPED = 12;

type Suggested = v.InferOutput<typeof SearchSuggestions>["suggestions"];
/* the row's reads: the last answer stands until the next lands, and the row draws its own copy (queries.ts) */
const tagsView = (words: string, home: boolean) => ({
  ...suggestionsQuery(
    words,
    words ? { limit: home ? TYPED / 2 : TYPED } : { both: home, limit: AT_REST }
  ),
  select: (tags: Suggested | null) => own(tags)
});
const titledView = (words: string) => ({
  ...collectionTagsQuery(words),
  select: (hits: CollectionHit[] | null): Suggested =>
    (hits ?? [])
      .slice(0, TYPED / 2)
      .map(hit => ({ label: hit.title, href: hit.href, colors: hit.colors }))
});
/* The collections that answer the home's words, read only while it holds some: no other page asks for them. */
function Titled(props: { words: string; children: (collections: () => Suggested) => Element }) {
  const titled = useQuery(() => titledView(props.words));
  return props.children(() => titled.data ?? []);
}

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
  /* With no connection the row keeps the tags it has, which a read that cannot be made would take away. */
  const answered = createMemo<string>(last => (offline() && last !== undefined ? last : asked()));
  const tags = useQuery(() => tagsView(answered(), home()));
  /* a search's tag searches this page, a collection's opens it in the list's view; each in its place with no
     connection, the ones that need the server disabled */
  const row = (shown: () => Suggested) => (
    <Tags
      lead={typed().trim() ? undefined : t("Popular")}
      tags={marked(
        shown().map(tag => ({
          label: tag.label,
          colors: tag.colors,
          href: localHref(tag.query ? props.to(tag.query) : inView(tag.href, page.params())),
          english: tag.english
        }))
      )}
      onPick={(tag, index) => tagPressed(tag, index, props.surface)}
    />
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
      <Errored fallback={() => <Tags tags={[]} />}>
        <Loading fallback={<Tags tags={[]} loading={!offline()} />}>
          <Show when={home() && answered()} fallback={row(() => tags.data ?? [])}>
            <Titled words={answered()}>
              {collections => row(() => inTurn(tags.data ?? [], collections()))}
            </Titled>
          </Show>
        </Loading>
      </Errored>
    </div>
  );
}
