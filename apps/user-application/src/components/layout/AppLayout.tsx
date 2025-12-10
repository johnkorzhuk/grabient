import { AppHeader, type LogoNavigation } from "@/components/header/AppHeader";
import { NavigationSelect } from "@/components/navigation/NavigationSelect";
import { StyleSelect } from "@/components/navigation/StyleSelect";
import { AngleInput } from "@/components/navigation/AngleInput";
import { StepsInput } from "@/components/navigation/StepsInput";
import { Footer } from "@/components/layout/Footer";
import { ReactNode, useEffect, useState, useRef } from "react";
import { cn } from "@/lib/utils";
import { useLocation, useRouter, useSearch } from "@tanstack/react-router";
import { SlidersHorizontal, X, RotateCcw, Search, RefreshCw } from "lucide-react";
import { useHotkeys } from "@mantine/hooks";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { Kbd } from "@/components/ui/kbd";
import { useStore } from "@tanstack/react-store";
import {
    uiStore,
    setPreviewStyle,
    setPreviewAngle,
    setPreviewSteps,
    resetPreviewState,
    toggleIsAdvancedOpen,
    setIsAdvancedOpen,
} from "@/stores/ui";
import {
    Carousel,
    CarouselContent,
    CarouselItem,
} from "@/components/ui/carousel";
import { SearchInput } from "@/components/search/SearchInput";
import { TagItem } from "@/components/search/TagItem";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { dailyTagsQueryOptions } from "@/queries/daily-tags";

type SortOrder = "popular" | "newest" | "oldest";
type StyleType =
    | "auto"
    | "linearGradient"
    | "angularGradient"
    | "angularSwatches"
    | "linearSwatches"
    | "deepFlow";

function getSortFromPathname(pathname: string): SortOrder | undefined {
    if (pathname === "/newest") return "newest";
    if (pathname === "/oldest") return "oldest";
    return undefined;
}

function buildPreservedSearch(
    currentSearch: {
        style?: StyleType;
        angle?: "auto" | number;
        steps?: "auto" | number;
        size?: "auto" | [number, number];
        sort?: SortOrder;
    },
    pathname: string,
) {
    const sortFromPath = getSortFromPathname(pathname);
    const sort = currentSearch.sort ?? sortFromPath;

    return {
        style:
            currentSearch.style && currentSearch.style !== "auto"
                ? currentSearch.style
                : undefined,
        angle:
            currentSearch.angle && currentSearch.angle !== "auto"
                ? currentSearch.angle
                : undefined,
        steps:
            currentSearch.steps && currentSearch.steps !== "auto"
                ? currentSearch.steps
                : undefined,
        size:
            currentSearch.size && currentSearch.size !== "auto"
                ? currentSearch.size
                : undefined,
        sort: sort && sort !== "popular" ? sort : undefined,
    };
}

interface AppLayoutProps {
    children: ReactNode;
    showNavigation?: boolean;
    style?:
        | "auto"
        | "linearGradient"
        | "angularGradient"
        | "angularSwatches"
        | "linearSwatches"
        | "deepFlow";
    angle?: number | "auto";
    steps?: number | "auto";
    leftAction?: ReactNode;
    logoNavigation?: LogoNavigation;
}

export function AppLayout({
    children,
    showNavigation = true,
    style = "auto",
    angle = "auto",
    steps = "auto",
    leftAction,
    logoNavigation,
}: AppLayoutProps) {
    const [isScrolled, setIsScrolled] = useState(false);
    const [contentHeight, setContentHeight] = useState(0);
    const contentRef = useRef<HTMLDivElement>(null);

    const location = useLocation();
    const router = useRouter();
    const currentSearch = useSearch({ strict: false }) as {
        style?: StyleType;
        angle?: "auto" | number;
        steps?: "auto" | number;
        size?: "auto" | [number, number];
        sort?: SortOrder;
    };

    const preservedSearch = buildPreservedSearch(currentSearch, location.pathname);

    const queryClient = useQueryClient();
    const { data: dailyTagsData } = useSuspenseQuery(dailyTagsQueryOptions());
    const dailyTags = dailyTagsData.tags;

    const refreshTags = () => {
        const newSeed = Date.now();
        queryClient.setQueryData(["daily-tags", undefined], () => undefined);
        queryClient.fetchQuery(dailyTagsQueryOptions(newSeed)).then((data) => {
            queryClient.setQueryData(["daily-tags", undefined], data);
        });
    };

    const isAdvancedOpen = useStore(uiStore, (state) => state.isAdvancedOpen);

    // Track if we should animate - skip animation on initial mount if already open
    const shouldAnimateRef = useRef(!isAdvancedOpen);
    const rafIdRef = useRef<number | null>(null);

    // Enable animations after initial render, and re-enable after pathname changes
    useEffect(() => {
        // Cancel any pending RAF from previous pathname
        if (rafIdRef.current !== null) {
            cancelAnimationFrame(rafIdRef.current);
        }

        // Reset animation state based on current open state
        shouldAnimateRef.current = !isAdvancedOpen;

        // Use requestAnimationFrame to enable animations after paint
        rafIdRef.current = requestAnimationFrame(() => {
            shouldAnimateRef.current = true;
            rafIdRef.current = null;
        });

        return () => {
            if (rafIdRef.current !== null) {
                cancelAnimationFrame(rafIdRef.current);
                rafIdRef.current = null;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location.pathname]); // Only on pathname change, not on isAdvancedOpen change

    // Check if any value is not auto
    const hasCustomValues =
        style !== "auto" || angle !== "auto" || steps !== "auto";

    const handleReset = async () => {
        await router.navigate({
            to: location.pathname,
            search: (prev) => ({
                ...prev,
                style: "auto" as const,
                angle: "auto" as const,
                steps: "auto" as const,
            }),
            replace: true,
        });
        resetPreviewState();
    };

    useEffect(() => {
        const handleScroll = () => {
            setIsScrolled(window.scrollY > 0);
        };

        // Check initial scroll position
        handleScroll();

        window.addEventListener("scroll", handleScroll, { passive: true });
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    useEffect(() => {
        if (contentRef.current) {
            setContentHeight(contentRef.current.scrollHeight);
        }
    }, [isAdvancedOpen]);

    useHotkeys([
        [
            "Escape",
            () => {
                if (isAdvancedOpen) {
                    setIsAdvancedOpen(false);
                }
            },
        ],
    ]);

    return (
        <div className="min-h-screen bg-background flex flex-col">
            <AppHeader logoNavigation={logoNavigation} />
            <div className="relative pt-4 md:pt-6" />
            {showNavigation && (
                <div
                    className={cn(
                        "disable-animation-on-theme-change sticky top-[66px] md:top-[73px] lg:top-[89px] z-40 w-full",
                        isScrolled && "bg-background/80 backdrop-blur-sm",
                    )}
                    suppressHydrationWarning
                >
                    <div className="mx-auto w-full px-5 lg:px-14 py-3 subpixel-antialiased flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            {leftAction}
                            <NavigationSelect className="subpixel-antialiased" />
                        </div>
                        <div className="flex items-center gap-2">
                            {hasCustomValues && (
                                <Tooltip delayDuration={500}>
                                    <TooltipTrigger asChild>
                                        <button
                                            onClick={handleReset}
                                            style={{
                                                backgroundColor:
                                                    "var(--background)",
                                            }}
                                            className={cn(
                                                "disable-animation-on-theme-change inline-flex items-center justify-center rounded-md",
                                                "h-8.5 w-8.5 p-0 border border-solid",
                                                "border-input hover:border-muted-foreground/30 hover:bg-background/60",
                                                "text-muted-foreground hover:text-foreground",
                                                "transition-colors duration-200 cursor-pointer",
                                                "outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
                                            )}
                                            aria-label="Reset all options to auto"
                                            suppressHydrationWarning
                                        >
                                            <RotateCcw
                                                size={16}
                                                style={{
                                                    color: "currentColor",
                                                }}
                                            />
                                        </button>
                                    </TooltipTrigger>
                                    <TooltipContent
                                        side="top"
                                        align="end"
                                        sideOffset={6}
                                    >
                                        <p>Reset</p>
                                    </TooltipContent>
                                </Tooltip>
                            )}
                            <div className="flex items-center gap-1.5">
                                <AngleInput
                                    value={angle}
                                    className="subpixel-antialiased hidden sm:flex"
                                    onPreviewChange={setPreviewAngle}
                                />
                                <StepsInput
                                    value={steps}
                                    className="subpixel-antialiased hidden sm:flex"
                                    onPreviewChange={setPreviewSteps}
                                />
                                <StyleSelect
                                    value={style}
                                    className="subpixel-antialiased"
                                    onPreviewChange={setPreviewStyle}
                                />
                            </div>
                            <Tooltip delayDuration={500}>
                                <TooltipTrigger asChild>
                                    <button
                                        onClick={toggleIsAdvancedOpen}
                                        style={{
                                            backgroundColor:
                                                "var(--background)",
                                        }}
                                        className={cn(
                                            "disable-animation-on-theme-change inline-flex items-center justify-center rounded-md",
                                            "h-8.5 w-8.5 p-0 border border-solid",
                                            "border-input hover:border-muted-foreground/30 hover:bg-background/60",
                                            "text-muted-foreground hover:text-foreground",
                                            "transition-colors duration-200 cursor-pointer",
                                            "outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
                                            "sm:hidden",
                                        )}
                                        aria-label={
                                            isAdvancedOpen
                                                ? "Close advanced options"
                                                : "Open advanced options"
                                        }
                                        aria-expanded={isAdvancedOpen}
                                        suppressHydrationWarning
                                    >
                                        {isAdvancedOpen ? (
                                            <X
                                                size={18}
                                                style={{
                                                    color: "currentColor",
                                                }}
                                            />
                                        ) : (
                                            <SlidersHorizontal
                                                size={16}
                                                style={{
                                                    color: "currentColor",
                                                }}
                                            />
                                        )}
                                    </button>
                                </TooltipTrigger>
                                <TooltipContent
                                    side="top"
                                    align="end"
                                    sideOffset={6}
                                >
                                    {isAdvancedOpen ? (
                                        <div className="flex items-center gap-2">
                                            <p>Close options</p>
                                            <Kbd>Esc</Kbd>
                                        </div>
                                    ) : (
                                        <p>More options</p>
                                    )}
                                </TooltipContent>
                            </Tooltip>
                        </div>
                    </div>
                    <div
                        className="overflow-hidden sm:hidden"
                        style={{
                            height: isAdvancedOpen
                                ? `${contentHeight}px`
                                : "0px",
                            opacity: isAdvancedOpen ? 1 : 0,
                            transition: shouldAnimateRef.current
                                ? "height 200ms cubic-bezier(0.4, 0, 0.2, 1), opacity 200ms cubic-bezier(0.4, 0, 0.2, 1)"
                                : "none",
                        }}
                    >
                        <div
                            ref={contentRef}
                            className="mx-auto w-full px-5 lg:px-14 flex justify-end gap-1.5 md:gap-2"
                            style={{
                                paddingBottom: isAdvancedOpen ? "12px" : "0px",
                            }}
                        >
                            <AngleInput
                                value={angle}
                                className="subpixel-antialiased"
                                onPreviewChange={setPreviewAngle}
                            />
                            <StepsInput
                                value={steps}
                                className="subpixel-antialiased"
                                onPreviewChange={setPreviewSteps}
                            />
                        </div>
                    </div>
                </div>
            )}
            {showNavigation && (
                <div className="mx-auto w-full px-5 lg:px-14 pt-4 md:pt-4 pb-2">
                    <div className="sticky top-[11px] md:top-[14px] lg:top-[22px] z-30 flex flex-col items-center gap-3 md:gap-5 bg-background py-2">
                        <div className="w-full max-w-lg">
                            <SearchInput variant="expanded" />
                        </div>
                        <div className="w-full flex items-center justify-center gap-2 overflow-hidden">
                            <span className="text-xs md:text-sm font-medium text-muted-foreground shrink-0 mr-1">
                                Popular
                            </span>
                            <Carousel
                                opts={{
                                    align: "start",
                                    dragFree: true,
                                    containScroll: "trimSnaps",
                                }}
                                className="flex-1 max-w-2xl min-w-0"
                            >
                                <CarouselContent className="-ml-1.5">
                                    {dailyTags.map((tag, index) => (
                                        <CarouselItem
                                            key={index}
                                            className="pl-1.5 basis-auto"
                                        >
                                            <TagItem
                                                tag={tag}
                                                preservedSearch={preservedSearch}
                                                currentPathname={location.pathname}
                                            />
                                        </CarouselItem>
                                    ))}
                                    <CarouselItem className="pl-1.5 basis-auto">
                                        <button
                                            type="button"
                                            onClick={refreshTags}
                                            style={{ backgroundColor: "var(--background)" }}
                                            className={cn(
                                                "disable-animation-on-theme-change inline-flex items-center justify-center",
                                                "h-7 w-7 rounded-md border border-solid",
                                                "transition-colors duration-200 outline-none",
                                                "border-input hover:border-muted-foreground/30 hover:bg-background/60 text-muted-foreground hover:text-foreground focus-visible:border-muted-foreground/50",
                                                "cursor-pointer",
                                            )}
                                            aria-label="Refresh suggestions"
                                        >
                                            <RefreshCw className="h-3 w-3" />
                                        </button>
                                    </CarouselItem>
                                    <CarouselItem className="pl-1.5 basis-auto">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                document.getElementById("search-input-expanded")?.focus();
                                            }}
                                            className={cn(
                                                "disable-animation-on-theme-change inline-flex items-center justify-center gap-1.5",
                                                "h-7 px-3.5 rounded-md border border-solid",
                                                "transition-colors duration-200 outline-none",
                                                "text-[11px] md:text-xs font-medium whitespace-nowrap",
                                                "border-input hover:border-muted-foreground/30 text-muted-foreground hover:text-foreground focus-visible:border-muted-foreground/50",
                                                "cursor-pointer",
                                                "bg-muted/50 dark:bg-muted/30 hover:bg-muted/70 dark:hover:bg-muted/50",
                                            )}
                                        >
                                            <Search className="h-3 w-3" />
                                            or something else
                                        </button>
                                    </CarouselItem>
                                </CarouselContent>
                            </Carousel>
                        </div>
                    </div>
                </div>
            )}
            <main className="pt-12 md:pt-16 pb-5 flex-1">{children}</main>
            <Footer />
        </div>
    );
}
