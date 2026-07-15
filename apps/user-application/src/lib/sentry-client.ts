// Named re-exports so rollup can tree-shake the rest of @sentry/react out of
// the lazy chunk. A direct dynamic import("@sentry/react") would force the
// full namespace (including replay) into the bundle - do NOT import the SDK
// package anywhere else.
export {
    init,
    browserTracingIntegration,
    lazyLoadIntegration,
    addIntegration,
    captureException,
} from "@sentry/react";
