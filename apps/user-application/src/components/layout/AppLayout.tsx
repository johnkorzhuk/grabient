import { AppHeader, type LogoNavigation } from "@/components/header/AppHeader";
import { NavigationSelect } from "@/components/navigation/NavigationSelect";
import { StyleSelect } from "@/components/navigation/StyleSelect";
import { AngleInput } from "@/components/navigation/AngleInput";
import { StepsInput } from "@/components/navigation/StepsInput";
import { Footer } from "@/components/layout/Footer";
import { type ReactNode, useEffect, useState, useRef } from "react";
import { cn } from "@/lib/utils";
import {
    useLocation,
    useNavigate,
    useSearch,
    Link,
} from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { popularTagsQueryOptions } from "@/server-functions/popular-tags";
import {
    SlidersHorizontal,
    X,
    RotateCcw,
    Search,
    RefreshCw,
    CornerDownLeft,
} from "lucide-react";
import { useHotkeys, useMounted } from "@mantine/hooks";
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
import { SearchInput } from "@/components/search/SearchInput";
import {
    Carousel,
    CarouselContent,
    CarouselItem,
} from "@/components/ui/carousel";
import { styleWithAutoValidator } from "@repo/data-ops/valibot-schema/grabient";
import * as v from "valibot";
import { getTagSearchQuery } from "@/lib/tags";
import { fuzzySearch } from "@/lib/fuzzy-search";

type SortOrder = "popular" | "newest" | "oldest";
type StyleType = v.InferOutput<typeof styleWithAutoValidator>;

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
    style?: StyleType;
    angle?: number | "auto";
    steps?: number | "auto";
    leftAction?: ReactNode;
    rightAction?: ReactNode;
    logoNavigation?: LogoNavigation;
    isExportOpen?: boolean;
    navigateToGenerate?: boolean;
}

export function AppLayout({
    children,
    showNavigation = true,
    style = "auto",
    angle = "auto",
    steps = "auto",
    leftAction,
    rightAction,
    logoNavigation,
    isExportOpen = false,
    navigateToGenerate = false,
}: AppLayoutProps) {
    const [isScrolled, setIsScrolled] = useState(false);
    const [contentHeight, setContentHeight] = useState(0);
    const contentRef = useRef<HTMLDivElement>(null);
    const mounted = useMounted();
    const queryClient = useQueryClient();

    // Get search query from store
    const searchQuery = useStore(uiStore, (state) => state.searchQuery);

    // Get fuzzy search suggestions when there's a query
    const suggestions = searchQuery.trim()
        ? fuzzySearch(searchQuery.trim(), 8)
        : [];

    const { data: popularTags } = useSuspenseQuery(popularTagsQueryOptions());

    const location = useLocation();
    const navigate = useNavigate();
    const currentSearch = useSearch({ strict: false }) as {
        style?: StyleType;
        angle?: "auto" | number;
        steps?: "auto" | number;
        size?: "auto" | [number, number];
        sort?: SortOrder;
    };

    const preservedSearch = buildPreservedSearch(
        currentSearch,
        location.pathname,
    );

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
        await navigate({
            to: ".",
            search: {
                style: undefined,
                angle: undefined,
                steps: undefined,
            },
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
                if (isExportOpen) {
                    navigate({
                        to: ".",
                        search: (prev) => ({ ...prev, export: undefined }),
                        replace: true,
                    });
                } else if (isAdvancedOpen) {
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
                            <NavigationSelect
                                className="subpixel-antialiased"
                                disabled={isExportOpen}
                            />
                            {rightAction}
                        </div>
                        <div className="flex items-center gap-2">
                            {hasCustomValues && !isExportOpen && (
                                <Tooltip delayDuration={500}>
                                    <TooltipTrigger asChild>
                                        <button
                                            onClick={handleReset}
                                            style={{
                                                backgroundColor:
                                                    "var(--background)",
                                            }}
                                            className={cn(
                                                "disable-animation-on-theme-change hidden sm:inline-flex items-center justify-center rounded-md",
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
                                    disabled={isExportOpen}
                                />
                                <StepsInput
                                    value={steps}
                                    className="subpixel-antialiased hidden sm:flex"
                                    onPreviewChange={setPreviewSteps}
                                    disabled={isExportOpen}
                                />
                                <StyleSelect
                                    value={style}
                                    className="subpixel-antialiased"
                                    onPreviewChange={setPreviewStyle}
                                    disabled={isExportOpen}
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
                            {hasCustomValues && !isExportOpen && (
                                <button
                                    onClick={handleReset}
                                    style={{
                                        backgroundColor: "var(--background)",
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
                            )}
                            <AngleInput
                                value={angle}
                                className="subpixel-antialiased"
                                onPreviewChange={setPreviewAngle}
                                disabled={isExportOpen}
                            />
                            <StepsInput
                                value={steps}
                                className="subpixel-antialiased"
                                onPreviewChange={setPreviewSteps}
                                disabled={isExportOpen}
                            />
                        </div>
                    </div>
                </div>
            )}
            {showNavigation && (
                <div
                    className={cn(
                        "px-5 lg:px-14 pt-4 md:pt-6",
                        isExportOpen
                            ? "w-full md:w-3/5 lg:w-2/3 xl:w-2/3 2xl:w-3/4 3xl:w-4/5"
                            : "mx-auto w-full",
                    )}
                >
                    <div
                        className={cn(
                            "sticky top-[11px] md:top-[14px] lg:top-[22px] z-30 flex flex-col gap-3 md:gap-5 bg-background pt-2",
                            isExportOpen
                                ? "items-start md:items-start xl:items-center"
                                : "items-center",
                        )}
                    >
                        <div
                            className={cn(
                                "w-full",
                                isExportOpen
                                    ? "md:max-w-none xl:max-w-lg"
                                    : "md:max-w-lg",
                            )}
                        >
                            <SearchInput
                                variant="expanded"
                                navigateToGenerate={navigateToGenerate}
                            />
                        </div>
                        <div
                            className={cn(
                                "w-full flex items-center gap-2",
                                isExportOpen
                                    ? "max-w-none md:max-w-none xl:max-w-3xl xl:mx-auto"
                                    : "max-w-3xl mx-auto",
                            )}
                        >
                            <span className="hidden md:inline text-sm font-medium text-muted-foreground shrink-0">
                                {searchQuery.trim() ? "Suggestions" : "Popular"}
                            </span>
                            <Carousel
                                opts={{
                                    align: "start",
                                    dragFree: true,
                                }}
                                className="w-full overflow-hidden"
                            >
                                <CarouselContent className="-ml-1.5">
                                    {searchQuery.trim() ? (
                                        <>
                                            {/* Fuzzy search suggestions */}
                                            {suggestions.map(
                                                (suggestion, index) => (
                                                    <CarouselItem
                                                        key={`${suggestion.type}-${suggestion.value}-${index}`}
                                                        className="basis-auto pl-1.5"
                                                    >
                                                        <Link
                                                            to={
                                                                navigateToGenerate
                                                                    ? "/palettes/$query/generate"
                                                                    : "/palettes/$query"
                                                            }
                                                            params={{
                                                                query: suggestion.value.replace(
                                                                    /\s+/g,
                                                                    "-",
                                                                ),
                                                            }}
                                                            search={
                                                                preservedSearch
                                                            }
                                                            style={{
                                                                backgroundColor:
                                                                    "var(--background)",
                                                            }}
                                                            className={cn(
                                                                "inline-flex items-center justify-center gap-1.5",
                                                                "h-7 px-3.5 rounded-md border border-solid",
                                                                "transition-[border-color,background-color] duration-200 outline-none",
                                                                "text-[11px] md:text-xs font-medium whitespace-nowrap",
                                                                "border-input hover:border-muted-foreground/30 hover:bg-background/60 text-muted-foreground hover:text-foreground focus-visible:border-muted-foreground/50",
                                                                "[&:hover_mark]:text-foreground",
                                                                mounted &&
                                                                    "disable-animation-on-theme-change",
                                                            )}
                                                        >
                                                            {suggestion.type ===
                                                                "color" &&
                                                                suggestion.hex && (
                                                                    <span
                                                                        className="inline-block w-3 h-3 rounded-sm shrink-0 border border-black/10 dark:border-white/10"
                                                                        style={{
                                                                            backgroundColor:
                                                                                suggestion.hex,
                                                                        }}
                                                                    />
                                                                )}
                                                            {suggestion.type ===
                                                                "emoji" && (
                                                                <span className="translate-y-px md:translate-y-0">
                                                                    {
                                                                        suggestion.value
                                                                    }
                                                                </span>
                                                            )}
                                                            {suggestion.type !==
                                                                "emoji" && (
                                                                <span
                                                                    className="translate-y-px md:translate-y-0 [&_mark]:bg-transparent [&_mark]:text-foreground dark:[&_mark]:text-foreground/75"
                                                                    dangerouslySetInnerHTML={{
                                                                        __html:
                                                                            suggestion.highlighted ??
                                                                            suggestion.display,
                                                                    }}
                                                                />
                                                            )}
                                                        </Link>
                                                    </CarouselItem>
                                                ),
                                            )}
                                            {/* Enter to search link */}
                                            <CarouselItem className="basis-auto pl-1.5">
                                                <Link
                                                    to={
                                                        navigateToGenerate
                                                            ? "/palettes/$query/generate"
                                                            : "/palettes/$query"
                                                    }
                                                    params={{
                                                        query: searchQuery
                                                            .trim()
                                                            .replace(
                                                                /[/?#%\\]/g,
                                                                (char) =>
                                                                    encodeURIComponent(
                                                                        char,
                                                                    ),
                                                            )
                                                            .replace(
                                                                /\s+/g,
                                                                "-",
                                                            ),
                                                    }}
                                                    search={preservedSearch}
                                                    className={cn(
                                                        "inline-flex items-center justify-center gap-1.5",
                                                        "h-7 px-3.5 rounded-md border border-solid",
                                                        "transition-colors duration-200 outline-none",
                                                        "text-[11px] md:text-xs font-medium whitespace-nowrap",
                                                        "border-input hover:border-muted-foreground/30 text-muted-foreground hover:text-foreground focus-visible:border-muted-foreground/50",
                                                        "cursor-pointer",
                                                        "bg-muted/50 dark:bg-muted/30 hover:bg-muted/70 dark:hover:bg-muted/50",
                                                        mounted &&
                                                            "disable-animation-on-theme-change",
                                                    )}
                                                >
                                                    <Kbd className="h-4.5">
                                                        <CornerDownLeft className="h-3 w-3" />
                                                        enter
                                                    </Kbd>
                                                    <span>to search</span>
                                                </Link>
                                            </CarouselItem>
                                        </>
                                    ) : (
                                        <>
                                            {/* Popular tags */}
                                            {popularTags.map((tag, index) => {
                                                const query =
                                                    getTagSearchQuery(tag);
                                                return (
                                                    <CarouselItem
                                                        key={`${tag.type}-${index}`}
                                                        className="basis-auto pl-1.5"
                                                    >
                                                        <Link
                                                            to={
                                                                navigateToGenerate
                                                                    ? "/palettes/$query/generate"
                                                                    : "/palettes/$query"
                                                            }
                                                            params={{
                                                                query: query.replace(
                                                                    /\s+/g,
                                                                    "-",
                                                                ),
                                                            }}
                                                            search={
                                                                preservedSearch
                                                            }
                                                            style={{
                                                                backgroundColor:
                                                                    "var(--background)",
                                                            }}
                                                            className={cn(
                                                                "inline-flex items-center justify-center gap-1.5",
                                                                "h-7 px-3.5 rounded-md border border-solid",
                                                                "transition-colors duration-200 outline-none",
                                                                "text-[11px] md:text-xs font-medium whitespace-nowrap",
                                                                "border-input hover:border-muted-foreground/30 hover:bg-background/60 text-muted-foreground hover:text-foreground focus-visible:border-muted-foreground/50",
                                                                mounted &&
                                                                    "disable-animation-on-theme-change",
                                                            )}
                                                        >
                                                            {tag.type ===
                                                                "color" && (
                                                                <span
                                                                    className="inline-block w-3 h-3 rounded-sm shrink-0 border border-black/10 dark:border-white/10"
                                                                    style={{
                                                                        backgroundColor:
                                                                            tag.hex,
                                                                    }}
                                                                />
                                                            )}
                                                            {tag.type ===
                                                                "pair" && (
                                                                <span className="inline-flex shrink-0">
                                                                    {tag.colors.map(
                                                                        (
                                                                            color,
                                                                            i,
                                                                        ) => (
                                                                            <span
                                                                                key={
                                                                                    i
                                                                                }
                                                                                className="inline-block w-3 h-3 rounded-full border border-black/10 dark:border-white/10"
                                                                                style={{
                                                                                    backgroundColor:
                                                                                        color.hex,
                                                                                    marginLeft:
                                                                                        i >
                                                                                        0
                                                                                            ? "-6px"
                                                                                            : 0,
                                                                                }}
                                                                            />
                                                                        ),
                                                                    )}
                                                                </span>
                                                            )}
                                                            {tag.type ===
                                                                "triad" && (
                                                                <span className="inline-flex shrink-0">
                                                                    {tag.colors.map(
                                                                        (
                                                                            color,
                                                                            i,
                                                                        ) => (
                                                                            <span
                                                                                key={
                                                                                    i
                                                                                }
                                                                                className="inline-block w-3 h-3 rounded-full border border-black/10 dark:border-white/10"
                                                                                style={{
                                                                                    backgroundColor:
                                                                                        color.hex,
                                                                                    marginLeft:
                                                                                        i >
                                                                                        0
                                                                                            ? "-6px"
                                                                                            : 0,
                                                                                }}
                                                                            />
                                                                        ),
                                                                    )}
                                                                </span>
                                                            )}
                                                            <span className="translate-y-px md:translate-y-0">
                                                                {tag.type ===
                                                                    "text" &&
                                                                    tag.value}
                                                                {tag.type ===
                                                                    "emoji" &&
                                                                    tag.value}
                                                                {tag.type ===
                                                                    "color" &&
                                                                    tag.name}
                                                                {tag.type ===
                                                                    "pair" &&
                                                                    tag.colors
                                                                        .map(
                                                                            (
                                                                                c,
                                                                            ) =>
                                                                                c.name,
                                                                        )
                                                                        .join(
                                                                            " & ",
                                                                        )}
                                                                {tag.type ===
                                                                    "triad" &&
                                                                    tag.colors
                                                                        .map(
                                                                            (
                                                                                c,
                                                                            ) =>
                                                                                c.name,
                                                                        )
                                                                        .join(
                                                                            ", ",
                                                                        )}
                                                            </span>
                                                        </Link>
                                                    </CarouselItem>
                                                );
                                            })}
                                            <CarouselItem className="basis-auto pl-1.5">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        queryClient.refetchQueries(
                                                            {
                                                                queryKey: [
                                                                    "popularTags",
                                                                ],
                                                            },
                                                        );
                                                    }}
                                                    className={cn(
                                                        "inline-flex items-center justify-center",
                                                        "h-7 w-7 rounded-md border border-solid",
                                                        "transition-colors duration-200 outline-none",
                                                        "border-input hover:border-muted-foreground/30 hover:bg-background/60 text-muted-foreground hover:text-foreground focus-visible:border-muted-foreground/50",
                                                        "cursor-pointer",
                                                        mounted &&
                                                            "disable-animation-on-theme-change",
                                                    )}
                                                    style={{
                                                        backgroundColor:
                                                            "var(--background)",
                                                    }}
                                                    aria-label="Refresh tags"
                                                >
                                                    <RefreshCw className="h-3 w-3" />
                                                </button>
                                            </CarouselItem>
                                            <CarouselItem className="basis-auto pl-1.5">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        document
                                                            .getElementById(
                                                                "search-input-expanded",
                                                            )
                                                            ?.focus();
                                                    }}
                                                    className={cn(
                                                        "inline-flex items-center justify-center gap-1.5",
                                                        "h-7 px-3.5 rounded-md border border-solid",
                                                        "transition-colors duration-200 outline-none",
                                                        "text-[11px] md:text-xs font-medium whitespace-nowrap",
                                                        "border-input hover:border-muted-foreground/30 text-muted-foreground hover:text-foreground focus-visible:border-muted-foreground/50",
                                                        "cursor-pointer",
                                                        "bg-muted/50 dark:bg-muted/30 hover:bg-muted/70 dark:hover:bg-muted/50",
                                                        mounted &&
                                                            "disable-animation-on-theme-change",
                                                    )}
                                                >
                                                    <Search className="h-3 w-3" />
                                                    or something else
                                                </button>
                                            </CarouselItem>
                                        </>
                                    )}
                                </CarouselContent>
                            </Carousel>
                        </div>
                    </div>
                </div>
            )}
            <main className="pt-12 pb-5 flex-1">{children}</main>
            <Footer />
        </div>
    );
}
