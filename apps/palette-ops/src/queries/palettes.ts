import { queryOptions } from "@tanstack/react-query";
import { getPaletteTagsForSeed, getAdminLikedSeeds, getAdminLikedPalettes } from "@/server-functions/palettes";

export type PaletteTagResult = {
  id: string;
  seed: string;
  provider: string;
  model: string;
  runNumber: number;
  promptVersion: string | null;
  tags: {
    mood: string[];
    style: string[];
    dominant_colors: string[];
    /** @deprecated Use dominant_colors instead */
    color_family?: string[];
    temperature: "warm" | "cool" | "neutral" | "cool-warm";
    contrast: "high" | "medium" | "low";
    brightness: "dark" | "light" | "medium" | "varied";
    saturation: "vibrant" | "muted" | "mixed";
    seasonal: string[];
    associations: string[];
  } | null;
  error: string | null;
  createdAt: Date;
};

export type PaletteTagsResponse = {
  tags: PaletteTagResult[];
  availableVersions: string[];
};

export type AdminLikedPalette = {
  seed: string;
  style: string;
  steps: number;
  angle: number;
  createdAt: Date;
};

export type AdminLikedPalettesResponse = {
  palettes: AdminLikedPalette[];
  total: number;
  totalPages: number;
};

export const paletteTagsQueryOptions = (seed: string, promptVersion?: string) =>
  queryOptions({
    queryKey: ["palette-tags", seed, promptVersion],
    queryFn: async () => {
      const result = await getPaletteTagsForSeed({ data: { seed, promptVersion } });
      return result as PaletteTagsResponse;
    },
    staleTime: 1000 * 60 * 10,
    retry: false,
  });

export const adminLikedPalettesQueryOptions = (page: number, limit: number) =>
  queryOptions({
    queryKey: ["admin-liked-palettes", page, limit],
    queryFn: async () => {
      const result = await getAdminLikedPalettes({ data: { page, limit } });
      return result as AdminLikedPalettesResponse;
    },
    staleTime: 1000 * 60 * 5,
  });

export const adminLikedSeedsQueryOptions = () =>
  queryOptions({
    queryKey: ["admin-liked-seeds"],
    queryFn: async () => {
      const result = await getAdminLikedSeeds();
      return result.seeds;
    },
    staleTime: 1000 * 60 * 5,
  });
