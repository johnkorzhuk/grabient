import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import * as TanstackQuery from "./integrations/tanstack-query/root-provider";

import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
    const rqContext = TanstackQuery.getContext();

    const router = createRouter({
        routeTree,
        context: { ...rqContext },
        defaultPreload: "intent",
        defaultPreloadDelay: 100,
        defaultStructuralSharing: true,
        scrollRestoration: true,
        getScrollRestorationKey: (location) => {
            const paletteListRoutes = ['/', '/newest', '/oldest', '/saved'];
            // Preserve scroll for palette list routes and generate routes
            const isGenerateRoute = location.pathname.startsWith('/palettes/') && location.pathname.endsWith('/generate');
            if (paletteListRoutes.includes(location.pathname) || isGenerateRoute) {
                return location.state.__TSR_key ?? location.pathname;
            }
            return location.pathname;
        },
        Wrap: (props: { children: React.ReactNode }) => {
            return (
                <TanstackQuery.Provider {...rqContext}>
                    {props.children}
                </TanstackQuery.Provider>
            );
        },
    });

    setupRouterSsrQueryIntegration({
        router,
        queryClient: rqContext.queryClient,
    });

    return router;
};
