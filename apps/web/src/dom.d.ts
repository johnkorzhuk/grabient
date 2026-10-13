/* The app is typed for the browser and the Worker at once. The Worker's types declare an `Element` of their own (the
   HTML rewriter's), whose content methods hide the DOM's where the two interfaces merge, so a browser module's
   `parent.append(child)` would not typecheck. The DOM's own forms are named again here, beside the rewriter's. */
interface Element {
  append(...nodes: (Node | string)[]): void;
  prepend(...nodes: (Node | string)[]): void;
  before(...nodes: (Node | string)[]): void;
  after(...nodes: (Node | string)[]): void;
}
