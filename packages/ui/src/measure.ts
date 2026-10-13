/** Follows an element's box once the page has settled, calling `read` now and on every change of its size, and
    returns the cleanup: `onSettled(() => watchSize(el, () => setWidth(el.clientWidth)))`. Until then a component draws
    at the size it was given, as the server did. */
export function watchSize(el: Element, read: () => void): () => void {
  const observer = new ResizeObserver(read);
  observer.observe(el);
  read();
  return () => observer.disconnect();
}
