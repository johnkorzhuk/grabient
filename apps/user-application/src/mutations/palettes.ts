import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toggleLikePalette } from "@/server-functions/palettes";
import type { AppPalette } from "@/queries/palettes";
import { addUndoAction } from "@/stores/undo";
import { useLocation, useRouter } from "@tanstack/react-router";
import { authClient } from "@/lib/auth-client";

interface ToggleLikePaletteArgs {
    seed: string;
    steps: number;
    style: string;
    angle: number;
    isUndo?: boolean;
    palette?: AppPalette;
}

export function useLikePaletteMutation() {
    const queryClient = useQueryClient();
    const location = useLocation();
    const router = useRouter();
    const { data: session } = authClient.useSession();

    return useMutation({
        mutationFn: async (args: ToggleLikePaletteArgs) => {
            if (!session) {
                throw new Error("Unauthorized");
            }
            return await toggleLikePalette({
                data: args,
            });
        },
        onMutate: async (args) => {
            if (!session) {
                const searchParams = new URLSearchParams(location.searchStr);
                const fullPath = searchParams.toString()
                    ? `${location.pathname}?${searchParams.toString()}`
                    : location.pathname;

                router.navigate({
                    to: "/login",
                    search: { redirect: fullPath },
                });
                return;
            }

            await queryClient.cancelQueries({ queryKey: ["user-liked-seeds"] });
            await queryClient.cancelQueries({ queryKey: ["palettes"] });
            await queryClient.cancelQueries({ queryKey: ["palette-like-info", args.seed] });

            const previousLikedSeeds = queryClient.getQueryData<Set<string>>(["user-liked-seeds"]);
            const previousLikeInfo = queryClient.getQueryData<{ isLiked: boolean; likesCount: number }>(["palette-like-info", args.seed]);
            const isCurrentlyLiked = previousLikedSeeds?.has(args.seed) ?? false;
            const isOnSavedPage = location.pathname === "/saved";

            if (isCurrentlyLiked && isOnSavedPage && args.palette) {
                addUndoAction({
                    seed: args.seed,
                    steps: args.steps,
                    style: args.style,
                    angle: args.angle,
                    palette: args.palette,
                });
            }

            const previousPaletteQueries = queryClient.getQueriesData<{ palettes: AppPalette[]; totalPages: number; total: number }>({
                queryKey: ["palettes"],
            });

            const likeDelta = isCurrentlyLiked ? -1 : 1;

            queryClient.setQueryData<{ isLiked: boolean; likesCount: number }>(["palette-like-info", args.seed], (old) => {
                const currentCount = old?.likesCount ?? args.palette?.likesCount ?? 0;
                return {
                    isLiked: !isCurrentlyLiked,
                    likesCount: Math.max(0, currentCount + likeDelta),
                };
            });

            queryClient.setQueryData<Set<string>>(["user-liked-seeds"], (old) => {
                const newSet = new Set(old);
                if (newSet.has(args.seed)) {
                    newSet.delete(args.seed);
                } else {
                    newSet.add(args.seed);
                }
                return newSet;
            });

            queryClient.setQueriesData<{ palettes: AppPalette[]; totalPages: number; total: number }>(
                { queryKey: ["palettes"] },
                (old) => {
                    if (!old) return old;

                    const queryKey = queryClient.getQueryCache().findAll({ queryKey: ["palettes"] })
                        .find(query => query.state.data === old)?.queryKey;

                    if (queryKey && queryKey[1] === "liked") {
                        if (isCurrentlyLiked) {
                            const filteredPalettes = old.palettes.filter(p => p.seed !== args.seed);
                            return {
                                palettes: filteredPalettes,
                                total: Math.max(0, old.total - 1),
                                totalPages: Math.ceil(Math.max(0, old.total - 1) / (queryKey[3] as number || 24)),
                            };
                        } else {
                            const paletteExists = old.palettes.some(p => p.seed === args.seed);

                            if (paletteExists) {
                                return {
                                    ...old,
                                    palettes: old.palettes.map(p =>
                                        p.seed === args.seed
                                            ? { ...p, likesCount: (p.likesCount ?? 0) + 1 }
                                            : p
                                    ),
                                };
                            } else if (args.palette) {
                                return {
                                    palettes: [args.palette, ...old.palettes],
                                    total: old.total + 1,
                                    totalPages: Math.ceil((old.total + 1) / ((queryKey[3] as number) || 24)),
                                };
                            } else {
                                return {
                                    ...old,
                                    total: old.total + 1,
                                    totalPages: Math.ceil((old.total + 1) / ((queryKey[3] as number) || 24)),
                                };
                            }
                        }
                    }

                    const paletteWithCurrentSeed = old.palettes.find(p => p.seed === args.seed);

                    if (paletteWithCurrentSeed) {
                        return {
                            ...old,
                            palettes: old.palettes.map((palette) =>
                                palette.seed === args.seed
                                    ? {
                                          ...palette,
                                          likesCount: Math.max(0, (palette.likesCount ?? 0) + likeDelta),
                                      }
                                    : palette
                            ),
                        };
                    } else if (!isCurrentlyLiked && args.palette) {
                        return old;
                    }

                    return old;
                }
            );

            return { previousLikedSeeds, previousPaletteQueries, previousLikeInfo };
        },
        onError: (_err, variables, context) => {
            if (context?.previousLikedSeeds) {
                queryClient.setQueryData(["user-liked-seeds"], context.previousLikedSeeds);
            }
            if (context?.previousPaletteQueries) {
                context.previousPaletteQueries.forEach(([queryKey, data]) => {
                    queryClient.setQueryData(queryKey, data);
                });
            }
            if (context?.previousLikeInfo) {
                queryClient.setQueryData(["palette-like-info", variables.seed], context.previousLikeInfo);
            }
        },
        onSuccess: (data, variables) => {
            if (variables.isUndo) {
                queryClient.refetchQueries({
                    queryKey: ["palettes", "liked"],
                    type: 'active'
                });
                return;
            }

            queryClient.setQueryData<Set<string>>(["user-liked-seeds"], (old) => {
                const newSet = new Set(old);
                if (data.liked) {
                    newSet.add(variables.seed);
                } else {
                    newSet.delete(variables.seed);
                }
                return newSet;
            });

            const currentCachedInfo = queryClient.getQueryData<{ isLiked: boolean; likesCount: number }>(["palette-like-info", variables.seed]);

            queryClient.setQueryData<{ isLiked: boolean; likesCount: number }>(["palette-like-info", variables.seed], {
                isLiked: data.liked,
                likesCount: currentCachedInfo?.likesCount ?? 0,
            });

            queryClient.invalidateQueries({ queryKey: ["user-liked-seeds"] });
        },
        retry: 3,
        retryDelay: 1000,
        networkMode: 'offlineFirst',
    });
}
