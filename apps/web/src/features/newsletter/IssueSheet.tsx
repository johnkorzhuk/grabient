import { type Locale, locale } from "@grabient/i18n";
import { isServer } from "@solidjs/web";
import { createIsomorphicFn } from "@tanstack/solid-start";
import { createEffect, onSettled, untrack } from "solid-js";
import { sheetForDocument } from "../../server/newsletter/document.ts";
import type { PageIssue } from "./input.ts";
import styles from "./Newsletter.module.css";

/* One issue on a page: its email's own sheet, in a shadow tree, so the page's styles never reach it and its own never
   leave. The server writes the tree into the document as a declarative shadow root, so the issue is in the first paint
   and a crawler reads it, and the browser keeps that tree. An issue drawn in the browser gets its tree here. */

const documentSheet = createIsomorphicFn()
  .server((language: Locale, number: number) => sheetForDocument(language, number))
  .client((): string | undefined => undefined);

/* The browser's copy of each sheet the document brought, for when the page is drawn again after a navigation. */
const brought = new Map<string, string>();

export function IssueSheet(props: {
  issue: PageIssue;
  /** a sheet shown in place of the issue's own: the issue under another lead, as an admin goes through them */
  shown?: string;
  ref?: (host: HTMLDivElement) => void;
}) {
  let host!: HTMLDivElement;
  const key = untrack(() => `${locale()} ${props.issue.number}`);
  onSettled(() => {
    const kept = host.shadowRoot;
    if (kept?.childNodes.length) {
      brought.set(key, kept.innerHTML);
      return;
    }
    /* a browser without declarative shadow roots leaves the server's template in place */
    const template = host.querySelector(":scope > template");
    template?.remove();
    (kept ?? host.attachShadow({ mode: "open" })).innerHTML =
      props.issue.html ?? brought.get(key) ?? template?.innerHTML ?? "";
  });
  createEffect(
    () => props.shown,
    shown => {
      if (shown !== undefined && host.shadowRoot) host.shadowRoot.innerHTML = shown;
    }
  );
  const markup = () =>
    isServer
      ? `<template shadowrootmode="open">${props.issue.html ?? documentSheet(locale(), props.issue.number) ?? ""}</template>`
      : "";
  return (
    <div
      ref={el => {
        host = el;
        props.ref?.(el);
      }}
      class={styles.sheet}
      innerHTML={markup()}
    />
  );
}
