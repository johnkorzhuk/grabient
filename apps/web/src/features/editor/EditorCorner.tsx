import { dynamicComponent } from "@solidjs/web";
import { type Component, createSignal, onSettled } from "solid-js";

/* The header's corner on a palette's page, which the frame draws outside the page: the editor open now hands in its
   own corner while it is mounted, so the corner's code comes with the editor's. Written only in the browser. */
const [corner, setCorner] = createSignal<Component | null>(null);

/** The calling editor's corner is the header's from when it has settled until it unmounts. */
export function holdCorner(own: Component) {
  onSettled(() => {
    setCorner(() => own);
    return () => setCorner(null);
  });
}

/** The corner the route names for the frame: nothing until an editor is open. */
export const EditorCorner = dynamicComponent(() => corner());

/** Whether an editor is open: the page then pins its stops along the foot of the screen. */
export const editing = (): boolean => corner() !== null;
