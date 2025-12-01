/// <reference types="vite/client" />
import {
    HeadContent,
    Outlet,
    Scripts,
    createRootRouteWithContext,
} from "@tanstack/react-router";
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
import { consentStore } from "@/stores/consent-store";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { shouldDisableScrollLock } from "@/lib/deviceDetection";
import {
    setupLazySentryLoading,
    updateSentryConsent,
    isSentryInitialized,
} from "@/lib/sentry";
import { useInitializePostHog } from "@/integrations/posthog/useInitializePostHog";
import { useInitializeGA4 } from "@/integrations/ga4/useInitializeGA4";

function BreakpointIndicator() {
    return (
        <div className="fixed bottom-12 right-2 z-[9999] bg-black/80 text-white px-3 py-2 rounded-md text-xs font-mono before:content-['xs'] sm:before:content-['sm'] md:before:content-['md'] lg:before:content-['lg'] xl:before:content-['xl'] 2xl:before:content-['2xl']" />
    );
}

export const Route = createRootRouteWithContext<{
    queryClient: QueryClient;
}>()({
    head: () => {
        // GTM script is now loaded lazily via setupLazyGTMLoading() in useInitializeGA4
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
                <SentryInitializer />
                <PostHogInitializer />
                <GA4Initializer />
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

function SentryInitializer() {
    const [isClient, setIsClient] = useState(false);
    const hasSetupLazyLoading = React.useRef(false);
    const consent = useStore(consentStore);

    useEffect(() => {
        setIsClient(true);
    }, []);

    useEffect(() => {
        if (!isClient || hasSetupLazyLoading.current) return;
        setupLazySentryLoading();
        hasSetupLazyLoading.current = true;
    }, [isClient]);

    useEffect(() => {
        if (!isClient || !isSentryInitialized()) return;
        updateSentryConsent();
    }, [
        isClient,
        consent.categories.analytics,
        consent.categories.sessionReplay,
    ]);

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
