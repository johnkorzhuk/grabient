import { isPagePath } from "@grabient/i18n";
import { isServer } from "@solidjs/web";
import { createFileRoute, notFound, redirect, useMatch, useParams } from "@tanstack/solid-router";
import { Errored, Loading, lazy, Match, Show, Switch, untrack } from "solid-js";
import { isCollectionSlug } from "../../features/collections/address.ts";
import { collectionHead, loadCollection } from "../../features/collections/route.ts";
import { isSeed } from "../../features/editor/address.ts";
import { booting, endBoot } from "../../features/editor/boot.ts";
import { EditorCorner, editing } from "../../features/editor/EditorCorner.tsx";
import {
  askFacts,
  loadEditor,
  loadSelectionScreen,
  paletteData,
  paletteHead,
  searchReader
} from "../../features/editor/page.ts";
import { StaticPalette } from "../../features/editor/StaticPalette.tsx";
import { ListAppearance } from "../../features/list/ListAppearance.tsx";
import { NO_STORE, PAGE, PALETTE_PAGE } from "../../lib/cache.ts";
import { pageHead } from "../../lib/page-meta.ts";
import { answerWith, drawnSearch, searchOf } from "../../lib/route.ts";
import { finishReady } from "../../lib/soft-load.ts";

/* Every one-segment address: a palette's seed, a collection's slug, an old grabient.com link, or words that lead to a
   search. A palette's page is the editor, which the browser draws alone (`ssr: "data-only"`): the server runs the
   loader, for the head and for the static page crawlers and readers without JavaScript read, which the editor takes the
   place of and a reader with JavaScript never sees (features/editor/boot.ts). A collection renders whole, and the
   collections' loader decides its slug: the collection there, the 404 page of a private one, or the palette search for
   its words. An old link the Worker neither maps nor fits (server/seo/legacy-fit.ts) is a 404 to the server; the
   browser fits the ones it can read, and the address becomes the palette's. */
const Editor = lazy(loadEditor);
/* A collection's page is a collection's code alone, which a palette's page never loads: the loader asks for it with the
   collection's data, and the server renders it with the page, whose document then names it for the browser to load
   before it hydrates. Imported by its name, which tells the server the module it rendered. */
const CollectionRoute = lazy(() => import("../../features/collections/CollectionRoute.tsx"), {
  export: "CollectionRoute"
});

/** An old grabient.com seed the browser can read: `_` and 36 characters, or 44 with its globals. */
const OLD_SEED = /^_[A-Za-z0-9_-]{36}(?:[A-Za-z0-9_-]{8})?$/;

export const Route = createFileRoute("/$id/")({
  // a name with an extension is a file, and no file is here
  beforeLoad: ({ params }) => {
    if (!isPagePath(`/${params.id}`)) throw notFound();
  },
  ssr: ({ params }) => {
    if (params.status !== "success") return true;
    return isSeed(params.value.id) ? "data-only" : !OLD_SEED.test(params.value.id);
  },
  /* The view rides the address: a page is read again as it changes, from the address alone, never as the selection
     opens or a lock turns. */
  loaderDeps: ({ search }) => ({ search: drawnSearch(search as Record<string, unknown>) }),
  loader: async ({ context, params, deps, location, preload }) => {
    /* A navigation in the browser keeps the page it leaves until the editor can draw, so nothing is drawn between the
       two: its code is asked for at once. Code that does not come is the page's own to say, where it renders. */
    const code =
      isServer || !isSeed(params.id)
        ? null
        : Promise.all([
            Editor.preload(),
            /* a navigation's editor draws the glass's still itself, its code asked for with the editor's
               (features/editor/glass-draw.ts), where the page it goes to opens on the glass: asked of its address
               and the reader's choice, since the mark on <html> is still the page's it leaves */
            /* and the blob's, where the address names it (features/editor/blob-draw.ts, BlobLayer.tsx) */
            new URLSearchParams(location.searchStr).get("style") === "blob"
              ? Promise.all([
                  import("../../features/editor/blob-draw.ts").then(m => m.loadBlob()),
                  import("../../features/editor/BlobLayer.tsx"),
                  import("../../features/editor/BlobArt.tsx")
                ])
              : null,
            /* and the silk's or the rosette's, where the address names one (features/editor/fx-draw.ts, FxLayer.tsx) */
            /^(silk|rosette)$/.test(new URLSearchParams(location.searchStr).get("style") ?? "")
              ? Promise.all([
                  import("../../features/editor/fx-draw.ts").then(m => m.loadFx()),
                  import("../../features/editor/FxLayer.tsx"),
                  import("../../features/editor/FxArt.tsx")
                ])
              : null,
            import("../../features/editor/glass-draw.ts").then(m =>
              m.stillWanted(location.searchStr) ? m.loadStill() : null
            ),
            /* and the selection's screen's, where the address opens it over the editor */
            loadSelectionScreen(location.searchStr)
          ]).catch(() => {});
    const palette = await paletteData(params.id, deps.search);
    if (palette) {
      /* a palette nothing asked about before the press is asked about now, after the read that waits only for an
         answer asked for before it, and is named by its colors until the answer lands */
      if (code) askFacts(params.id, location.state);
      /* and a soft picture's blur, on the server too, which draws the first screen with it (lib/picture.ts) */
      await Promise.all([code, finishReady(palette.page.view)]);
      const { seed, view } = palette.page;
      /* the frame's bar and water carry the palette from the server's render on, before an editor is open */
      const paint = [{ seed, style: view.style, steps: view.steps, angle: view.angle }];
      return { palette, collection: null, paint };
    }
    if (isCollectionSlug(params.id)) {
      /* the page's code comes with its data, so it draws the moment both are in, as a palette's does; code that does
         not come is the page's own to say, where it renders */
      const [collection] = await Promise.all([
        loadCollection(context.queryClient, {
          slug: params.id,
          order: "popular",
          // words that are no collection lead to their search with the selection still open
          searchStr: searchOf(location.search as Record<string, unknown>),
          publicHref: location.publicHref,
          preload
        }),
        CollectionRoute.preload().catch(() => {})
      ]);
      /* what the collections' loader hands the frame stands where the frame reads it */
      return { ...collection, palette: null, collection };
    }
    if (!isServer && OLD_SEED.test(params.id)) {
      const { importedPath } = await import("@grabient/engine/legacy-import.ts");
      const fitted = importedPath(params.id, searchReader(deps.search));
      if (fitted) throw redirect({ href: fitted, replace: true });
    }
    throw notFound();
  },
  headers: ({ loaderData }) => {
    // the server reads a palette's facts with its page, and has none only where the read failed: no cache keeps that
    if (loaderData?.palette) return loaderData.palette.facts ? PALETTE_PAGE : NO_STORE;
    return loaderData?.collection && !loaderData.collection.status ? PAGE : NO_STORE;
  },
  head: ({ match, params, loaderData }) => {
    if (loaderData?.palette) return paletteHead(loaderData.palette);
    if (loaderData?.collection)
      return collectionHead(
        { slug: params.id, order: "popular", search: match.search },
        loaderData.collection
      );
    return pageHead({ kind: "legacy", path: `/${params.id}` });
  },
  staticData: {
    frame: "app",
    corner: Corner,
    /* a palette's page pins its stops along the foot of the screen, from the boot's first screen on, and a
       collection's nothing: read as the frame draws */
    get strip() {
      return editing() || booting();
    },
    /* and its picture is the light: no water flows from the wordmark behind it */
    get water() {
      return !(editing() || booting());
    }
  },
  /* Only the server's answer for a page the browser draws alone shows this: a navigation in the browser keeps the page
     it leaves until the next has loaded, as the lists do. What it draws stands still while the editor's code comes
     (boot.ts), so the editor takes its place the moment it can. */
  pendingComponent: Static,
  pendingMs: Number.POSITIVE_INFINITY,
  pendingMinMs: 0,
  component: Address
});

/** The header's corner: the editor's own on a palette's page, the lists' appearance on a collection's. */
function Corner() {
  const params = useParams({ strict: false });
  const page = useMatch({
    from: Route.id,
    shouldThrow: false,
    select: match => match.loaderData?.palette?.page
  });
  return (
    <Show when={isCollectionSlug(params().id ?? "")} fallback={<EditorCorner page={page()} />}>
      <ListAppearance />
    </Show>
  );
}

/* What the server sends for a page the browser draws alone. A palette's is its static page, in the document while the
   editor's code arrives, which is asked for as the browser starts the page rather than once the page has started. An
   old link has nothing to show until the browser has fitted it, and is a 404 to whoever cannot. */
function Static() {
  const data = Route.useLoaderData();
  const palette = untrack(() => data()?.palette);
  if (!palette) answerWith(404);
  else if (!isServer) void Editor.preload().catch(() => {});
  return <Show when={data()?.palette}>{shown => <StaticPalette data={shown()} />}</Show>;
}

function Address() {
  const params = Route.useParams();
  const search = Route.useSearch();
  const data = Route.useLoaderData();
  return (
    <Switch>
      <Match when={data().palette}>
        {palette => (
          /* an editor whose code does not come, or that throws as it mounts, leaves the static page, whole (the
             document's onError reports what a boundary takes, client.tsx) */
          <Errored
            fallback={() => {
              endBoot();
              return <StaticPalette data={palette()} />;
            }}
          >
            <Loading fallback={<StaticPalette data={palette()} />}>
              <Editor data={palette()} />
            </Loading>
          </Errored>
        )}
      </Match>
      <Match when={data().collection}>
        {loaded => (
          <CollectionRoute
            slug={params().id}
            order="popular"
            search={searchOf(search())}
            loaded={loaded()}
          />
        )}
      </Match>
    </Switch>
  );
}
