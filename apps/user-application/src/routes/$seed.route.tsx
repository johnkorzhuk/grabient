import {
    createFileRoute,
    stripSearchParams,
    useNavigate,
    useLocation,
    redirect,
} from "@tanstack/react-router";
import * as v from "valibot";
import {
    styleWithAutoValidator,
    angleWithAutoValidator,
    stepsWithAutoValidator,
    sizeWithAutoValidator,
    seedValidator,
    DEFAULT_STYLE,
    DEFAULT_ANGLE,
    DEFAULT_STEPS,
    DEFAULT_SIZE,
} from "@repo/data-ops/valibot-schema/grabient";
import { AppHeader } from "@/components/header/AppHeader";
import { Footer } from "@/components/layout/Footer";
import {
    setPreviewStyle,
    setPreviewAngle,
    setPreviewSteps,
    resetPreviewState,
    setOpenCopyMenuId,
    setCustomCoeffs,
    setLivePaletteData,
} from "@/stores/ui";
import { useRef, useState, useEffect } from "react";
import { useStore } from "@tanstack/react-store";
import { uiStore } from "@/stores/ui";
import { exportStore } from "@/stores/export";
import { detectDevice } from "@/lib/deviceDetection";
import { useDebouncedCallback, useHotkeys } from "@mantine/hooks";
import { GradientNavigationControls } from "@/components/palettes/gradient-navigation-controls";
import { GradientPreview } from "@/components/palettes/gradient-preview";
import { GradientSidebar } from "@/components/palettes/gradient-sidebar";
import {
    deserializeCoeffs,
    serializeCoeffs,
} from "@repo/data-ops/serialization";
import {
    updateCoeffWithInverseGlobal,
    tareModifier,
} from "@repo/data-ops/gradient-gen/cosine";
import {
    MODIFIERS,
    DEFAULT_MODIFIER,
    modifierValidator,
    DEFAULT_GLOBALS,
} from "@repo/data-ops/valibot-schema/grabient";
import type { AppPalette } from "@/queries/palettes";
import { generateHexColors } from "@/lib/paletteUtils";
import { coeffsSchema } from "@repo/data-ops/valibot-schema/grabient";
import {
    generateCssGradient,
    generateSvgGradient,
} from "@repo/data-ops/gradient-gen";
import {
    paletteLikeInfoQueryOptions,
    userLikedSeedsQueryOptions,
} from "@/queries/palettes";
import { useQuery } from "@tanstack/react-query";

const SEARCH_DEFAULTS = {
    style: "auto" as const,
    angle: "auto" as const,
    steps: "auto" as const,
    size: "auto" as const,
    mod: DEFAULT_MODIFIER,
    clipping: false,
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
    mod: v.optional(
        v.fallback(modifierValidator, SEARCH_DEFAULTS.mod),
        SEARCH_DEFAULTS.mod,
    ),
    clipping: v.optional(v.boolean(), SEARCH_DEFAULTS.clipping),
});

export const Route = createFileRoute("/$seed")({
    validateSearch: searchValidatorSchema,
    search: {
        middlewares: [stripSearchParams(SEARCH_DEFAULTS)],
    },
    headers: () => ({
        // Browser: Cache for 10 minutes, allow stale for 30 minutes (gradient data is static per seed)
        "cache-control": "public, max-age=600, stale-while-revalidate=1800",
        // Cloudflare CDN: Cache for 1 hour, stale-while-revalidate for 2 hours
        "cdn-cache-control": "max-age=3600, stale-while-revalidate=7200",
    }),
    beforeLoad: ({ params }) => {
        try {
            v.parse(seedValidator, params.seed);
        } catch (error) {
            throw redirect({ to: "/" });
        }
    },
    loader: async ({ context, params }) => {
        // Prefetch like info without blocking - will be fetched on client side
        context.queryClient.prefetchQuery(
            paletteLikeInfoQueryOptions(params.seed),
        );
        context.queryClient.prefetchQuery(userLikedSeedsQueryOptions());
    },
    head: ({ params, match }) => {
        const ogUrl = new URL("/api/og", "https://grabient.com");
        ogUrl.searchParams.set("seed", params.seed);

        // Add search params to OG URL if they differ from defaults
        const { style, steps, angle } = match.search;
        if (style && style !== "auto") {
            ogUrl.searchParams.set("style", style);
        }
        if (steps !== undefined && steps !== "auto") {
            ogUrl.searchParams.set("steps", String(steps));
        }
        if (angle !== undefined && angle !== "auto") {
            ogUrl.searchParams.set("angle", String(angle));
        }

        return {
            meta: [
                { title: "Grabient - CSS Gradient Generator" },
                {
                    name: "description",
                    content:
                        "Create beautiful gradients with Grabient's intuitive gradient generator. Export to CSS, SVG, and more.",
                },
                { name: "og:type", content: "website" },
                {
                    name: "og:title",
                    content: "Grabient - CSS Gradient Generator",
                },
                {
                    name: "og:description",
                    content:
                        "Create beautiful gradients with Grabient's intuitive gradient generator. Export to CSS, SVG, and more.",
                },
                { name: "og:image", content: ogUrl.toString() },
                { name: "og:image:width", content: "1200" },
                { name: "og:image:height", content: "630" },
                { name: "twitter:card", content: "summary_large_image" },
                {
                    name: "twitter:title",
                    content: "Grabient - CSS Gradient Generator",
                },
                {
                    name: "twitter:description",
                    content:
                        "Create beautiful gradients with Grabient's intuitive gradient generator. Export to CSS, SVG, and more.",
                },
                { name: "twitter:image", content: ogUrl.toString() },
            ],
        };
    },

    component: RouteComponent,
});

function RouteComponent() {
    const navigate = useNavigate();
    const location = useLocation();
    const { seed } = Route.useParams();
    const { style, angle, steps, size, mod, clipping } = Route.useSearch();
    const [showMoreOptions, setShowMoreOptions] = useState(false);
    const [isTouchToggled, setIsTouchToggled] = useState(false);
    const [isHovered, setIsHovered] = useState(false);

    const [localCoeffs, setLocalCoeffs] = useState<
        ReturnType<typeof deserializeCoeffs>["coeffs"] | null
    >(null);
    const [localGlobals, setLocalGlobals] = useState<
        ReturnType<typeof deserializeCoeffs>["globals"] | null
    >(null);
    const openCopyMenuId = useStore(uiStore, (state) => state.openCopyMenuId);
    const previewStyle = useStore(uiStore, (state) => state.previewStyle);
    const previewAngle = useStore(uiStore, (state) => state.previewAngle);
    const previewSteps = useStore(uiStore, (state) => state.previewSteps);
    const showGraph = useStore(uiStore, (state) => state.showGraph);
    const containerDimensions = useStore(
        exportStore,
        (state) => state.containerDimensions,
    );
    const isCopyMenuOpen =
        openCopyMenuId === seed || openCopyMenuId === `${seed}-more-options`;
    const device = detectDevice();
    const isTouchDevice = device.isTouchDevice;
    const isActive = isTouchDevice ? isTouchToggled : isHovered;

    const [w, h] = size === "auto" ? DEFAULT_SIZE : size;
    const initialSearchDataRef = useRef({
        style: style === "auto" ? DEFAULT_STYLE : style,
        angle: angle === "auto" ? DEFAULT_ANGLE : angle,
        steps: steps === "auto" ? DEFAULT_STEPS : steps,
        w,
        h,
    });

    const currentStyle =
        previewStyle || (style === "auto" ? DEFAULT_STYLE : style);
    const currentAngle =
        previewAngle ?? (angle === "auto" ? DEFAULT_ANGLE : angle);
    const currentSteps =
        previewSteps ?? (steps === "auto" ? DEFAULT_STEPS : steps);

    const actualStyle = style === "auto" ? DEFAULT_STYLE : style;
    const actualAngle = angle === "auto" ? DEFAULT_ANGLE : angle;
    const actualSteps = steps === "auto" ? DEFAULT_STEPS : steps;

    const hasCustomValues =
        actualStyle !== initialSearchDataRef.current.style ||
        actualAngle !== initialSearchDataRef.current.angle ||
        actualSteps !== initialSearchDataRef.current.steps;

    useHotkeys(
        actualStyle === "deepFlow"
            ? [
                  [
                      "c",
                      () => {
                          navigate({
                              from: Route.fullPath,
                              search: (prev) => ({
                                  ...prev,
                                  clipping: !clipping,
                              }),
                              replace: true,
                          });
                      },
                  ],
              ]
            : [],
    );

    useEffect(() => {
        if (showMoreOptions && isCopyMenuOpen) {
            setOpenCopyMenuId(null);
        }
    }, [showMoreOptions, isCopyMenuOpen]);

    const {
        data: likeInfo,
        isPending: isLikeInfoPending,
        fetchStatus: likeInfoFetchStatus,
    } = useQuery({
        ...paletteLikeInfoQueryOptions(seed),
        retry: false,
    });

    // Query is loading if it's pending (no cached data) and actively fetching
    const isLikesLoading =
        isLikeInfoPending && likeInfoFetchStatus === "fetching";

    const { coeffs: urlCoeffs, globals: urlGlobals } = deserializeCoeffs(seed);

    const coeffs = localCoeffs ?? urlCoeffs;
    const globals = localGlobals ?? urlGlobals;

    useEffect(() => {
        setLocalCoeffs(null);
        setLocalGlobals(null);
        setLivePaletteData(null);
    }, [seed]);

    // Calculate the current seed based on the current coeffs and globals
    // This ensures we're always working with the most up-to-date seed,
    // even if the URL hasn't updated yet due to debouncing
    const currentSeed = serializeCoeffs(coeffs, globals);

    const palette: AppPalette = {
        seed: currentSeed,
        coeffs,
        globals,
        style: currentStyle,
        angle: currentAngle,
        steps: currentSteps,
        hexColors: [],
        createdAt: new Date(),
        likesCount: likeInfo?.likesCount ?? 0,
    };

    const hexColors = generateHexColors(coeffs, globals, currentSteps);

    const debouncedNavigate = useDebouncedCallback((newSeed: string) => {
        navigate({
            to: "/$seed",
            params: { seed: newSeed },
            search: (search) => search,
        });
    }, 300);

    const handleChannelOrderChange = (
        newCoeffs: v.InferOutput<typeof coeffsSchema>,
        palette: AppPalette,
    ) => {
        const newSeed = serializeCoeffs(newCoeffs, palette.globals);
        navigate({
            to: "/$seed",
            params: { seed: newSeed },
            search: (search) => search,
        });
    };

    const toggleActiveModifier = (modifier: (typeof MODIFIERS)[number]) => {
        if (modifier === mod) {
            navigate({
                from: Route.fullPath,
                search: (prev) => ({ ...prev, mod: DEFAULT_MODIFIER }),
                replace: true,
            });
        } else {
            navigate({
                from: Route.fullPath,
                search: (prev) => ({ ...prev, mod: modifier }),
                replace: true,
            });
        }
    };

    const handleGlobalChange = (modifierIndex: number, value: number) => {
        const newGlobals = [...globals] as [number, number, number, number];
        newGlobals[modifierIndex] = value;
        setLocalGlobals(newGlobals);
        setLivePaletteData({ coeffs, globals: newGlobals });
        const newSeed = serializeCoeffs(coeffs, newGlobals);
        setCustomCoeffs(newSeed, coeffs);
        debouncedNavigate(newSeed);
    };

    const handleRGBChannelChange = (
        modifierIndex: number,
        channelIndex: number,
        value: number,
    ) => {
        const newCoeffs = updateCoeffWithInverseGlobal(
            coeffs,
            modifierIndex,
            channelIndex,
            value,
            globals,
        );
        setLocalCoeffs(newCoeffs);
        setLivePaletteData({ coeffs: newCoeffs, globals });
        const newSeed = serializeCoeffs(newCoeffs, globals);
        setCustomCoeffs(newSeed, newCoeffs);
        debouncedNavigate(newSeed);
    };

    const handleTareModifier = (modifierIndex: number) => {
        const defaultGlobal = DEFAULT_GLOBALS[modifierIndex];
        if (defaultGlobal === undefined) return;

        const { coeffs: newCoeffs, globals: newGlobals } = tareModifier(
            coeffs,
            globals,
            modifierIndex,
            defaultGlobal,
        );

        setLocalCoeffs(newCoeffs);
        setLocalGlobals(newGlobals);
        setLivePaletteData({ coeffs: newCoeffs, globals: newGlobals });
        const newSeed = serializeCoeffs(newCoeffs, newGlobals);
        setCustomCoeffs(newSeed, newCoeffs);
        // Use replace since taring doesn't change the visual palette, just redistributes values
        navigate({
            to: "/$seed",
            params: { seed: newSeed },
            search: (search) => search,
            replace: true,
        });
    };

    const buildQueryString = () => {
        const params = new URLSearchParams();
        if (currentStyle !== "linearGradient")
            params.set("style", currentStyle);
        if (currentAngle !== 90) params.set("angle", currentAngle.toString());
        if (currentSteps !== DEFAULT_STEPS)
            params.set("steps", currentSteps.toString());
        const queryString = params.toString();
        return queryString ? `?${queryString}` : "";
    };

    const creditSearchString = buildQueryString();

    // Calculate actual dimensions for SVG export
    const svgWidth = size === "auto" ? containerDimensions.width : size[0];
    const svgHeight = size === "auto" ? containerDimensions.height : size[1];

    const { cssString, gradientString } = generateCssGradient(
        hexColors,
        currentStyle,
        currentAngle,
        { seed: currentSeed, searchString: creditSearchString },
    );

    const svgString = generateSvgGradient(
        hexColors,
        currentStyle,
        currentAngle,
        { seed: currentSeed, searchString: creditSearchString },
        null,
        { width: svgWidth, height: svgHeight },
    );

    const handleReset = async () => {
        await navigate({
            to: location.pathname,
            search: (prev) => ({
                ...prev,
                style: "auto",
                angle: "auto",
                steps: "auto",
            }),
            replace: true,
            resetScroll: false,
        });
        resetPreviewState();
    };

    return (
        <div className="min-h-screen-dynamic flex flex-col">
            <AppHeader />
            <div className="relative pt-4 hidden lg:block" />

            <main className="w-full h-viewport-content overflow-x-hidden">
                <div className="h-full w-full relative">
                    <div className={showGraph ? "hidden sm:block" : ""}>
                        <GradientNavigationControls
                            seed={seed}
                            style={style}
                            angle={angle}
                            steps={steps}
                            hasCustomValues={hasCustomValues}
                            showMoreOptions={showMoreOptions}
                            isTouchDevice={isTouchDevice}
                            isActive={isActive}
                            isCopyMenuOpen={isCopyMenuOpen}
                            onReset={handleReset}
                            onToggleMoreOptions={() =>
                                setShowMoreOptions(!showMoreOptions)
                            }
                            onPreviewStyleChange={setPreviewStyle}
                            onPreviewAngleChange={setPreviewAngle}
                            onPreviewStepsChange={setPreviewSteps}
                            onMouseEnter={() => setIsHovered(true)}
                        />
                    </div>

                    <div className="h-full w-full lg:px-14 lg:pb-10 flex flex-col lg:flex-row lg:pt-[62px] min-h-0">
                        <GradientPreview
                            seed={seed}
                            gradientString={gradientString}
                            currentStyle={currentStyle}
                            currentAngle={currentAngle}
                            currentSteps={currentSteps}
                            size={size}
                            cssString={cssString}
                            svgString={svgString}
                            coeffs={coeffs}
                            globals={globals}
                            hexColors={hexColors}
                            isTouchDevice={isTouchDevice}
                            isActive={isActive}
                            isCopyMenuOpen={isCopyMenuOpen}
                            showMoreOptions={showMoreOptions}
                            clipping={clipping}
                            onMouseEnter={() => setIsHovered(true)}
                            onMouseLeave={() => setIsHovered(false)}
                            onTouchToggle={() =>
                                setIsTouchToggled(!isTouchToggled)
                            }
                            onEnterClipMode={() => {
                                navigate({
                                    from: Route.fullPath,
                                    search: (prev) => ({
                                        ...prev,
                                        clipping: true,
                                    }),
                                    replace: true,
                                });
                            }}
                            onExitClipMode={() => {
                                navigate({
                                    from: Route.fullPath,
                                    search: (prev) => ({
                                        ...prev,
                                        clipping: false,
                                    }),
                                    replace: true,
                                });
                            }}
                        />

                        <GradientSidebar
                            palette={palette}
                            mod={mod}
                            coeffs={coeffs}
                            globals={globals}
                            currentSteps={currentSteps}
                            currentStyle={currentStyle}
                            currentAngle={currentAngle}
                            seed={currentSeed}
                            likeInfo={likeInfo}
                            isLikesLoading={isLikesLoading}
                            isTouchDevice={isTouchDevice}
                            onChannelOrderChange={handleChannelOrderChange}
                            onGlobalChange={handleGlobalChange}
                            onRGBChannelChange={handleRGBChannelChange}
                            onToggleModifier={toggleActiveModifier}
                            onTareModifier={handleTareModifier}
                        />
                    </div>
                </div>
            </main>

            <Footer />
        </div>
    );
}
