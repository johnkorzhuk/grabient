import { t } from "@grabient/i18n";
import type { CollectionItemInput, Visibility } from "../collections/schema.ts";
import type {
  CollectionDocument,
  CollectionPreview,
  CollectionSummary
} from "../collections/types.ts";

/* Stands in for the accounts area's module of the same path until it merges, under its names: the account's offline
   copy of its own collections is not here, so the copy never holds them, and every page reads and writes through the
   server. A write here throws as the module's own does when the copy cannot take it; the pages ask ownsCollection or
   canMakeOwn first. */

export type OwnedDoc = CollectionDocument & {
  id: string;
  url: string;
  preview: CollectionPreview[];
  owned: true;
  canCurate: false;
  canDelete: true;
};
interface ItemView {
  style: CollectionItemInput["style"];
  steps: number;
  angle: number;
}

const notHere = (): never => {
  throw new Error(t("That collection isn't yours anymore."));
};

/** Whether the copy holds the account's collection at this address now. */
export const ownsCollection = (_slug: string): boolean => false;
/** Where the server moved one of the account's collections from this address, as this browser heard. */
export const ownCollectionMoved = (_slug: string): string | null => null;
/** The account's collection from the copy; undefined when the copy cannot say, and the page asks the server. */
export const ownCollectionDoc = async (_slug: string): Promise<OwnedDoc | undefined> => undefined;
/** A page of the account's collections from the copy; null when the copy cannot say. */
export const ownCollectionsPage = async (
  _params: { page?: number; limit?: number; query?: string },
  _typing = false
): Promise<{
  items: CollectionSummary[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  query: string;
} | null> => null;
/** The account's collections from the copy with the palettes each holds; null when the copy cannot say. */
export const ownCollectionsHolding = ():
  | readonly {
      slug: string;
      title: string;
      count: number;
      seeds: readonly string[];
      keys: ReadonlySet<string>;
    }[]
  | null => null;
/** The copy can take a new collection: open, and heard from the server. */
export const canMakeOwn = (): boolean => false;
/** The server took a write of the account's things straight: the copy asks for it. */
export const serverWrote = (): void => {};

export const makeOwnCollection = (
  _title: string,
  _items: readonly CollectionItemInput[]
): { href: string; title: string; slug: string } => notHere();
export const addOwnPalettes = (
  _slug: string,
  _items: readonly CollectionItemInput[]
): { href: string; title: string; added: CollectionItemInput[] } => notHere();
export const removeOwnPalette = (
  _slug: string,
  _seed: string,
  _view?: ItemView
): { collection: OwnedDoc; restore: string } => notHere();
export const restoreOwnPalette = (
  _slug: string,
  _seed: string,
  _token: string
): { collection: OwnedDoc } => notHere();
export const setOwnVisibility = async (
  _slug: string,
  _visibility: Visibility
): Promise<{ collection: OwnedDoc }> => notHere();
export const deleteOwnCollection = (_slug: string): { deleted: string } => notHere();
