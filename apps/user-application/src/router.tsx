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
            if (paletteListRoutes.includes(location.pathname)) {
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
