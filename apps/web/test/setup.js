import { vi } from "vitest";

export function page(title, content, extra = "") {
  return `<html><head><title>${title}</title></head><body><main>${content}</main>${extra}</body></html>`;
}

export function respond(html, { maxAge = 0, url = "" } = {}) {
  return {
    text: async () => html,
    url,
    headers: new Headers({ "cache-control": `public, max-age=${maxAge}` }),
  };
}

/** Load app.client.js into the happy-dom window. */
export async function loadClient() {
  globalThis.IntersectionObserver = class {
    observe() {}
    disconnect() {}
  };
  window.scrollTo = vi.fn();
  const fetchMock = vi.fn(async (href) => respond(page("default", href)));
  globalThis.fetch = fetchMock;
  await import("../src/app.client.js");
  return fetchMock;
}

export const mouse = (type, target, relatedTarget = null) =>
  target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, relatedTarget }));

export const click = (target) =>
  target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
