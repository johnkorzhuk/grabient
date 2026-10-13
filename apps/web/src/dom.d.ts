/* The Workers types declare HTMLRewriter's own Element globally, and its before, after, prepend, append and remove
   hide the DOM's on every element. The browser's code, and the components it draws, call the DOM's. */
interface Element {
  before(...nodes: (Node | string)[]): void;
  after(...nodes: (Node | string)[]): void;
  prepend(...nodes: (Node | string)[]): void;
  append(...nodes: (Node | string)[]): void;
  remove(): void;
}
