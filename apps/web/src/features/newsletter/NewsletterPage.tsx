import { locale, localHref, t } from "@grabient/i18n";
import { Button } from "@grabient/ui/Button.tsx";
import link from "@grabient/ui/link.module.css";
import { Status } from "@grabient/ui/Status.tsx";
import { Text } from "@grabient/ui/Text.tsx";
import { useInfiniteQuery, useQuery } from "@tanstack/solid-query";
import { createSignal, Errored, For, Loading, onSettled, Show } from "solid-js";
import { IssueSheet } from "./IssueSheet.tsx";
import type { PageIssue } from "./input.ts";
import { monthOf } from "./month.ts";
import styles from "./Newsletter.module.css";
import { Picker } from "./Picker.tsx";
import { issuesQuery, readDrafts } from "./queries.ts";

/* /newsletter: the issues, newest first, each its email's own sheet with the month it is for over it. The newest come
   with the document, or are asked for as a page reached in the browser draws; the ones before them as the reader nears
   the end. An admin also sees the drafts, first, from a route of their own once the account is known: the document and
   the public answers hold none of them. The page's frame (PageFrame `open`) is the caller's. */

/* how far before the end the next issues are asked for */
const AHEAD = "0px 0px 1200px 0px";
const NO_DRAFTS: readonly PageIssue[] = [];

function Sheet(props: { issue: PageIssue; admin: boolean }) {
  const [shown, setShown] = createSignal<string>();
  const [host, setHost] = createSignal<HTMLDivElement>();
  /* the lead and the tip an admin's pickers show, which each other's sheets are drawn with */
  const [lead, setLead] = createSignal<string>();
  const [tip, setTip] = createSignal<string>();
  const ask = () => ({ seed: lead(), tip: tip() });
  return (
    /* an issue's title is its author's words */
    <article class={styles.issue} aria-label={props.issue.title} data-issue={props.issue.number}>
      <div class={styles.words}>
        <Text variant="h3" as="p">
          <time datetime={props.issue.month}>{monthOf(props.issue.month)}</time>
        </Text>
      </div>
      <div class={styles.stage}>
        <IssueSheet issue={props.issue} shown={shown()} ref={setHost} />
        <Show when={props.admin}>
          <Picker
            number={props.issue.number}
            part="lead"
            host={host}
            ask={ask}
            shown={shown}
            onShow={(html, seed) => {
              setLead(seed);
              setShown(html);
            }}
          />
          <Picker
            number={props.issue.number}
            part="tip"
            host={host}
            ask={ask}
            shown={shown}
            onShow={(html, id) => {
              setTip(id);
              setShown(html);
            }}
          />
        </Show>
      </div>
    </article>
  );
}

/** The line after the issues on screen: more on their way, or the ones that did not come and the way to ask again. */
function Tail(props: { failed?: boolean; asking?: boolean; onRetry?: () => void }) {
  return (
    <div class={styles.tail} data-part="status">
      <Status error={props.failed}>
        {props.failed ? t("Couldn't load the newsletter.") : props.asking ? t("Loading more…") : ""}
      </Status>
      <Show when={props.failed}>
        <Button size="sm" onClick={() => props.onRetry?.()}>
          {t("Retry")}
        </Button>
      </Show>
    </div>
  );
}

export function NewsletterPage(props: {
  /** an admin account with the admin tools on in this browser */
  admin: boolean;
  /** the newsletter is not on yet: only admins see it, as readers will once it is */
  hidden?: boolean;
}) {
  const issues = useInfiniteQuery(() => issuesQuery(locale()));
  /* An admin's drafts: asked for once the account is known and on every visit, never kept, and gone with the admin
     tools. A read that fails leaves the published issues alone, and a reader's page asks nothing. */
  const drafts = useQuery(() => ({
    queryKey: ["newsletter", "drafts", locale()],
    queryFn: () => readDrafts(locale()),
    enabled: props.admin,
    gcTime: 0,
    reconcile: "number"
  }));
  const shown = () => (props.admin && drafts.isSuccess ? drafts.data : NO_DRAFTS);
  /* each issue once, though a page may repeat one a newer issue pushed down */
  const published = () => {
    const byNumber = new Map<number, PageIssue>();
    for (const issue of issues.data.pages.flatMap(page => page.issues)) {
      if (!byNumber.has(issue.number)) byNumber.set(issue.number, issue);
    }
    return [...byNumber.values()];
  };
  /* A page that did not come is asked for again only by Retry: the mark, still in view, would ask again and again. */
  const more = () => {
    if (issues.hasNextPage && !issues.isFetchingNextPage && !issues.isFetchNextPageError) {
      void issues.fetchNextPage().then(look);
    }
  };
  let mark: HTMLDivElement | undefined;
  let watcher: IntersectionObserver | undefined;
  /* a mark still in view after a page joined says nothing new by itself: it is looked at again */
  const look = () => {
    if (!watcher || !mark) return;
    watcher.unobserve(mark);
    watcher.observe(mark);
  };
  onSettled(() => {
    watcher = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) more();
      },
      { rootMargin: AHEAD }
    );
    if (mark) watcher.observe(mark);
    return () => watcher?.disconnect();
  });
  const watch = (el: HTMLDivElement) => {
    mark = el;
    look();
  };
  return (
    <div class={styles.page}>
      <header class={[styles.words, styles.top]}>
        <Text variant="title">{t("Newsletter")}</Text>
        <Text variant="lede">{t("Rising palettes and new features, about once a month.")}</Text>
        <Show when={props.hidden}>
          <Text variant="small" as="p">
            {t("Only admins see the newsletter until it's on in Site features.")}{" "}
            <a class={link.inline} href={localHref("/settings#features")}>
              {t("Open Settings")}
            </a>
          </Text>
        </Show>
      </header>
      <Show when={shown().length > 0}>
        <section class={styles.group} aria-labelledby="newsletter-drafts" data-part="drafts">
          <div class={styles.words}>
            <Text variant="h2" id="newsletter-drafts">
              {t("Drafts")}
            </Text>
            <Text variant="lede">{t("Only admins see this section.")}</Text>
          </div>
          <For each={shown()} keyed={issue => issue.number}>
            {issue => <Sheet issue={issue()} admin={props.admin} />}
          </For>
        </section>
      </Show>
      <Errored
        fallback={(_, reset) => (
          <Tail
            failed
            onRetry={() => {
              void issues.refetch();
              reset();
            }}
          />
        )}
      >
        <Loading fallback={<Tail asking />}>
          <section
            class={styles.group}
            aria-labelledby={shown().length > 0 ? "newsletter-published" : undefined}
            data-part="issues"
          >
            <Show when={shown().length > 0}>
              <div class={styles.words}>
                <Text variant="h2" id="newsletter-published">
                  {t("Published")}
                </Text>
              </div>
            </Show>
            <For each={published()} keyed={issue => issue.number}>
              {issue => <Sheet issue={issue()} admin={props.admin} />}
            </For>
          </section>
          <Show when={issues.hasNextPage}>
            <div class={styles.mark} ref={watch} aria-hidden="true" />
            <Tail
              failed={issues.isFetchNextPageError}
              asking={issues.isFetchingNextPage}
              onRetry={() => void issues.fetchNextPage().then(look)}
            />
          </Show>
        </Loading>
      </Errored>
    </div>
  );
}
