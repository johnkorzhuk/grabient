import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSyncExternalStore, useState, useEffect } from "react";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { useLikePaletteMutation } from "@/mutations/palettes";
import { useQueryClient } from "@tanstack/react-query";
import {
    type paletteStyleValidator,
} from "@repo/data-ops/valibot-schema/grabient";
import type { AppPalette } from "@/queries/palettes";
import type * as v from "valibot";
import { analytics } from "@/integrations/tracking/events";

type PaletteStyle = v.InferOutput<typeof paletteStyleValidator>;

interface SaveButtonProps {
    palette: AppPalette;
    seed: string;
    style: PaletteStyle;
    angle: number;
    steps: number;
    className?: string;
    likeInfo?: {
        isLiked: boolean;
        likesCount: number;
    };
    isLoading?: boolean;
}

export function SaveButton({
    palette,
    seed,
    style,
    angle,
    steps,
    className,
    likeInfo,
    isLoading = false,
}: SaveButtonProps) {
    const queryClient = useQueryClient();
    const likeMutation = useLikePaletteMutation();
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    const isLikedFromQuery = useSyncExternalStore(
        (callback) => {
            return queryClient.getQueryCache().subscribe((event) => {
                if (event?.query.queryKey[0] === "user-liked-seeds" || event?.query.queryKey[0] === "palette-like-info") {
                    callback();
                }
            });
        },
        () => {
            const cachedSeeds = queryClient.getQueryData<Set<string>>(["user-liked-seeds"]);
            return cachedSeeds?.has(seed) ?? false;
        },
        () => {
            const likedSeeds = queryClient.getQueryData<Set<string>>(["user-liked-seeds"]);
            return likedSeeds?.has(seed) ?? false;
        },
    );

    const likesCountFromQuery = useSyncExternalStore(
        (callback) => {
            return queryClient.getQueryCache().subscribe((event) => {
                if (event?.query.queryKey[0] === "palette-like-info" || event?.query.queryKey[0] === "palettes") {
                    callback();
                }
            });
        },
        () => {
            const likeInfoCache = queryClient.getQueryData<{ isLiked: boolean; likesCount: number }>(["palette-like-info", seed]);

            if (likeInfoCache !== undefined) {
                return likeInfoCache.likesCount;
            }

            const allPaletteQueries = queryClient
                .getQueryCache()
                .findAll({ queryKey: ["palettes"] })
                .map((query) => query.state.data as { palettes: AppPalette[] } | undefined);

            const foundPalette = allPaletteQueries
                .flatMap((data) => data?.palettes ?? [])
                .find((p) => p.seed === seed);

            if (foundPalette) {
                return foundPalette.likesCount;
            }

            return palette.likesCount;
        },
        () => {
            return palette.likesCount;
        },
    );

    const likeInfoFromCache = useSyncExternalStore(
        (callback) => {
            return queryClient.getQueryCache().subscribe((event) => {
                if (event?.query.queryKey[0] === "palette-like-info" && event?.query.queryKey[1] === seed) {
                    callback();
                }
            });
        },
        () => {
            return queryClient.getQueryData<{ isLiked: boolean; likesCount: number }>(["palette-like-info", seed]);
        },
        () => {
            return undefined;
        },
    );

    const isLikedFromServer = !isMounted || isLoading ? false : (likeInfoFromCache?.isLiked ?? (likeInfo?.isLiked ?? isLikedFromQuery));
    const currentLikesCount = !isMounted || isLoading ? undefined : (likeInfoFromCache?.likesCount ?? likesCountFromQuery);

    const handleLike = (e: React.MouseEvent) => {
        e.stopPropagation();

        const isCurrentlyLiked = isLikedFromServer;

        likeMutation.mutate({
            seed,
            steps,
            style,
            angle,
            palette: {
                ...palette,
                seed,
                steps,
                style,
                angle,
            },
        });

        if (isCurrentlyLiked) {
            analytics.gradient.unsave({
                seed,
                style,
                angle,
                steps,
            });
        } else {
            analytics.gradient.save({
                seed,
                style,
                angle,
                steps,
            });
        }
    };

    return (
        <Tooltip delayDuration={1000}>
            <TooltipTrigger asChild>
                <button
                    className={cn(
                        "group/like flex items-center text-muted-foreground transition-colors duration-200 pointer-events-auto cursor-pointer hover:text-foreground rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background -mt-[3px]",
                        className,
                    )}
                    onClick={handleLike}
                    type="button"
                    aria-label={
                        isLikedFromServer ? "Unsave palette" : "Save palette"
                    }
                    disabled={likeMutation.isPending}
                    suppressHydrationWarning
                >
                    <span className={cn(
                        "font-medium pr-4 select-none text-muted-foreground group-hover/like:text-foreground transition-colors duration-200",
                        ((currentLikesCount !== undefined && currentLikesCount > 0) || (currentLikesCount === undefined && isLikedFromServer)) ? "opacity-100" : "opacity-0"
                    )} suppressHydrationWarning>
                        {currentLikesCount ?? 1}
                    </span>
                    <Heart
                        className={cn(
                            "w-[22px] h-[22px] transition-all duration-200",
                            isLikedFromServer &&
                                "fill-red-700 text-red-700 animate-in zoom-in-75",
                        )}
                        fill={isLikedFromServer ? "currentColor" : "none"}
                    />
                </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="end" sideOffset={6}>
                <p>{isLikedFromServer ? "Unsave palette" : "Save palette"}</p>
            </TooltipContent>
        </Tooltip>
    );
}
