import { locale, t } from "@grabient/i18n";
import { Button } from "@grabient/ui/Button.tsx";
import { Status } from "@grabient/ui/Status.tsx";
import { Text } from "@grabient/ui/Text.tsx";
import { useInfiniteQuery, useQuery } from "@tanstack/solid-query";
import { For, Loading, onSettled, Show } from "solid-js";
import { IssueSheet } from "./IssueSheet.tsx";
import type { PageIssue } from "./input.ts";
import { monthOf } from "./month.ts";
import styles from "./Newsletter.module.css";
import { draftsQuery, issuesQuery } from "./queries.ts";

/* /newsletter: the issues, newest first, each its email's own sheet with the month it is for over it. The newest come
   with the document; the ones before them as the reader nears the end. An admin also sees the drafts, first, from a
   route of their own once the account is known: the document and the public answers hold none of them. The page's
   frame (PageFrame `open`) is the caller's. */

/* how far before the end the next issues are asked for */
const AHEAD = "0px 0px 1200px 0px";

function Sheet(props: { issue: PageIssue }) {
  return (
    /* an issue's title is its author's words */
    <article class={styles.issue} aria-label={props.issue.title} data-issue={props.issue.number}>
      <div class={styles.words}>
        <Text variant="h3" as="p">
          <time datetime={props.issue.month}>{monthOf(props.issue.month)}</time>
        </Text>
      </div>
      <IssueSheet issue={props.issue} />
    </article>
  );
}

export function NewsletterPage(props: {
  /** an admin account with the admin tools on in this browser */
  admin: boolean;
}) {
  const issues = useInfiniteQuery(() => issuesQuery(locale()));
  const drafts = useQuery(() => ({ ...draftsQuery(locale()), enabled: props.admin }));
  /* read only once there are drafts to show: a disabled query's data waits */
  const shown = () => (props.admin && drafts.isSuccess ? drafts.data : []);
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
            {issue => <Sheet issue={issue()} />}
          </For>
        </section>
      </Show>
      <Loading>
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
            {issue => <Sheet issue={issue()} />}
          </For>
        </section>
        <Show when={issues.hasNextPage}>
          <div class={styles.mark} ref={watch} aria-hidden="true" />
          <div class={styles.tail} data-part="status">
            <Status error={issues.isFetchNextPageError}>
              {issues.isFetchNextPageError
                ? t("Couldn't load the newsletter.")
                : issues.isFetchingNextPage
                  ? t("Loading more…")
                  : ""}
            </Status>
            <Show when={issues.isFetchNextPageError}>
              <Button size="sm" onClick={() => void issues.fetchNextPage().then(look)}>
                {t("Retry")}
              </Button>
            </Show>
          </div>
        </Show>
      </Loading>
    </div>
  );
}
