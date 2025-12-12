/// <reference types="vite/client" />
import {
    HeadContent,
    Outlet,
    Scripts,
    createRootRouteWithContext,
    stripSearchParams,
} from "@tanstack/react-router";
import * as v from "valibot";
import {
    sizeWithAutoValidator,
    styleWithAutoValidator,
    angleWithAutoValidator,
    stepsWithAutoValidator,
} from "@repo/data-ops/valibot-schema/grabient";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import * as React from "react";
import type { QueryClient } from "@tanstack/react-query";
import { DefaultCatchBoundary } from "@/components/default-catch-boundary";
import { NotFound } from "@/components/not-found";
import { ThemeProvider } from "@/components/theme";
import appCss from "@/styles.css?url";
import { seo } from "@/utils/seo";
import { useThemeToggle } from "@/hooks/useThemeToggle";
import { useEyeDropperHotkey } from "@/hooks/useEyeDropperHotkey";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useStore } from "@tanstack/react-store";
import { uiStore } from "@/stores/ui";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { shouldDisableScrollLock } from "@/lib/deviceDetection";
import {
    setupLazySentryLoading,
    updateSentryConsent,
    isSentryInitialized,
} from "@/lib/sentry";
import { useInitializePostHog } from "@/integrations/posthog/useInitializePostHog";
import {
    getPostHogInstance,
    isPostHogInitialized,
} from "@/integrations/posthog/posthogConfig";
import { useInitializeGA4 } from "@/integrations/ga4/useInitializeGA4";
import { setGA4UserId } from "@/integrations/ga4/ga4Config";
import { getCookieYesHeadScript } from "@/integrations/cookieyes/CookieYesScript";
import { useCookieYesSync } from "@/integrations/cookieyes/useCookieYesSync";
import { consentStore } from "@/stores/consent-store";
import { hydrateExportStore } from "@/stores/export";
import { authClient } from "@/lib/auth-client";
import { setUserRole } from "@/integrations/tracking/events";
import type { AuthUser } from "@repo/data-ops/auth/client-types";

function BreakpointIndicator() {
    return (
        <div className="fixed bottom-12 right-2 z-[9999] bg-black/80 text-white px-3 py-2 rounded-md text-xs font-mono before:content-['xs'] sm:before:content-['sm'] md:before:content-['md'] lg:before:content-['lg'] xl:before:content-['xl'] 2xl:before:content-['2xl']" />
    );
}

const SEARCH_DEFAULTS = {
    style: "auto" as const,
    angle: "auto" as const,
    steps: "auto" as const,
    size: "auto" as const,
    export: false as const,
};

const searchValidatorSchema = v.object({
    style: v.optional(
        v.fallback(styleWithAutoValidator, SEARCH_DEFAULTS.style),
        SEARCH_DEFAULTS.style,
    ),
    angle: v.optional(
        v.fallback(angleWithAutoValidator, SEARCH_DEFAULTS.angle),
        SEARCH_DEFAULTS.angle,
    ),
    steps: v.optional(
        v.fallback(stepsWithAutoValidator, SEARCH_DEFAULTS.steps),
        SEARCH_DEFAULTS.steps,
    ),
    size: v.optional(
        v.fallback(sizeWithAutoValidator, SEARCH_DEFAULTS.size),
        SEARCH_DEFAULTS.size,
    ),
    export: v.optional(
        v.fallback(v.boolean(), SEARCH_DEFAULTS.export),
        SEARCH_DEFAULTS.export,
    ),
});

export const Route = createRootRouteWithContext<{
    queryClient: QueryClient;
}>()({
    validateSearch: searchValidatorSchema,
    search: {
        middlewares: [stripSearchParams(SEARCH_DEFAULTS)],
    },
    head: () => {
        const cookieYesScript = getCookieYesHeadScript();

        return {
            meta: [
                {
                    charSet: "utf-8",
                },
                {
                    name: "viewport",
                    content: "width=device-width, initial-scale=1",
                },
                {
                    name: "google-adsense-account",
                    content: "ca-pub-2436216252635443",
                },
                ...seo({
                    title: "Grabient - CSS Gradient Generator",
                    description: `Create beautiful gradients with Grabient's intuitive gradient generator. Export to CSS, SVG, and more.`,
                    image: "/grabber.png",
                }),
            ],
            links: [
                { rel: "stylesheet", href: appCss },
                {
                    rel: "preconnect",
                    href: "https://fonts.gstatic.com",
                    crossOrigin: "anonymous",
                },
                {
                    rel: "apple-touch-icon",
                    sizes: "180x180",
                    href: "/apple-touch-icon.png",
                },
                {
                    rel: "icon",
                    type: "image/png",
                    sizes: "32x32",
                    href: "/favicon-32x32.png",
                },
                {
                    rel: "icon",
                    type: "image/png",
                    sizes: "16x16",
                    href: "/favicon-16x16.png",
                },
                { rel: "manifest", href: "/site.webmanifest", color: "#fffff" },
                { rel: "icon", href: "/favicon.ico" },
            ],
            scripts: cookieYesScript ? [cookieYesScript] : [],
        };
    },
    errorComponent: (props) => {
        return (
            <RootDocument>
                <DefaultCatchBoundary {...props} />
            </RootDocument>
        );
    },
    notFoundComponent: () => <NotFound />,
    component: RootComponent,
});

function RootComponent() {
    const isDragging = useStore(uiStore, (state) => state.isDragging);
    const [scrollbarWidth, setScrollbarWidth] = useState(0);
    const shouldDisableScroll = shouldDisableScrollLock();

    useEffect(() => {
        const getScrollbarWidth = () => {
            const outer = document.createElement("div");
            outer.style.visibility = "hidden";
            outer.style.overflow = "scroll";
            document.body.appendChild(outer);

            const inner = document.createElement("div");
            outer.appendChild(inner);

            const scrollbarWidth = outer.offsetWidth - inner.offsetWidth;

            outer.parentNode?.removeChild(outer);

            return scrollbarWidth;
        };

        setScrollbarWidth(getScrollbarWidth());
    }, []);

    useEffect(() => {
        if (isDragging && scrollbarWidth > 0) {
            document.documentElement.style.setProperty(
                "--scrollbar-offset",
                `${scrollbarWidth}px`,
            );
        } else {
            document.documentElement.style.setProperty(
                "--scrollbar-offset",
                "0px",
            );
        }
    }, [isDragging, scrollbarWidth]);

    return (
        <RootDocument
            isDragging={isDragging}
            scrollbarWidth={scrollbarWidth}
            shouldDisableScrollLock={shouldDisableScroll}
        >
            <ThemeProvider>
                <CookieYesSyncInitializer />
                <ExportStoreInitializer />
                <SentryInitializer />
                <PostHogInitializer />
                <GA4Initializer />
                <AnalyticsUserRoleInitializer />
                <ThemeHotkeys />
                <TooltipProvider delayDuration={500}>
                    <Outlet />
                </TooltipProvider>
            </ThemeProvider>
        </RootDocument>
    );
}

function ThemeHotkeys() {
    useThemeToggle();
    useEyeDropperHotkey();
    return null;
}

function CookieYesSyncInitializer() {
    useCookieYesSync();
    return null;
}

function ExportStoreInitializer() {
    useEffect(() => {
        hydrateExportStore();
    }, []);
    return null;
}

function SentryInitializer() {
    const [isClient, setIsClient] = useState(false);
    const hasSetupLazyLoading = React.useRef(false);

    useEffect(() => {
        setIsClient(true);
    }, []);

    useEffect(() => {
        if (!isClient || hasSetupLazyLoading.current) return;
        setupLazySentryLoading();
        hasSetupLazyLoading.current = true;
    }, [isClient]);

    // Listen for consent changes from consent store
    useEffect(() => {
        if (!isClient) return;

        const unsubscribe = consentStore.subscribe(() => {
            if (isSentryInitialized()) {
                updateSentryConsent();
            }
        });

        return unsubscribe;
    }, [isClient]);

    return null;
}

function PostHogInitializer() {
    useInitializePostHog();
    return null;
}

function GA4Initializer() {
    useInitializeGA4();
    return null;
}

function AnalyticsUserRoleInitializer() {
    const { data: session } = authClient.useSession();
    const user = session?.user as AuthUser | undefined;
    const prevUserIdRef = React.useRef<string | undefined>(undefined);

    useEffect(() => {
        setUserRole(user?.role);

        const userId = user?.id;
        const prevUserId = prevUserIdRef.current;

        if (userId && userId !== prevUserId) {
            if (isPostHogInitialized()) {
                const posthog = getPostHogInstance();
                if (posthog?.__loaded) {
                    posthog.identify(userId, { role: user.role });
                }
            }
            setGA4UserId(userId);
        } else if (!userId && prevUserId) {
            if (isPostHogInitialized()) {
                const posthog = getPostHogInstance();
                if (posthog?.__loaded) {
                    posthog.reset();
                }
            }
            setGA4UserId(null);
        }

        prevUserIdRef.current = userId;
    }, [user?.id, user?.role]);

    return null;
}

function RootDocument({
    children,
    isDragging = false,
    scrollbarWidth = 0,
    shouldDisableScrollLock = false,
}: {
    children: React.ReactNode;
    isDragging?: boolean;
    scrollbarWidth?: number;
    shouldDisableScrollLock?: boolean;
}) {
    return (
        <html lang="en" suppressHydrationWarning>
            <head>
                <HeadContent />
            </head>
            <body
                className={cn(
                    "scrollbar-stable",
                    isDragging && !shouldDisableScrollLock
                        ? "overflow-hidden"
                        : "overflow-auto",
                )}
                style={
                    isDragging && scrollbarWidth > 0 && !shouldDisableScrollLock
                        ? { paddingRight: `${scrollbarWidth}px` }
                        : undefined
                }
            >
                {children}
                {import.meta.env.DEV && (
                    <>
                        <TanStackRouterDevtools position="bottom-right" />
                        <ReactQueryDevtools buttonPosition="bottom-left" />
                        <BreakpointIndicator />
                    </>
                )}
                <Scripts />
            </body>
        </html>
    );
}
