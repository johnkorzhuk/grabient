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
import appCss from "@/styles.css?url";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme";
import { cn } from "@/lib/utils";

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  head: () => {
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
          title: "Palette Ops - Grabient Admin Dashboard",
        },
        {
          name: "description",
          content: "Internal dashboard for palette tagging and analysis",
        },
      ],
      links: [{ rel: "stylesheet", href: appCss }],
    };
  },
  component: RootComponent,
});

function RootComponent() {
  return (
    <RootDocument>
      <ThemeProvider>
        <TooltipProvider delayDuration={300}>
          <Outlet />
        </TooltipProvider>
      </ThemeProvider>
    </RootDocument>
  );
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className={cn("scrollbar-stable overflow-auto")}>
        {children}
        {import.meta.env.DEV && (
          <>
            <TanStackRouterDevtools position="bottom-right" />
            <ReactQueryDevtools buttonPosition="bottom-left" />
          </>
        )}
        <Scripts />
      </body>
    </html>
  );
}
