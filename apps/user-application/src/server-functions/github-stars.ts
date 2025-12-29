import { createServerFn } from "@tanstack/react-start";
import { queryOptions } from "@tanstack/react-query";

const GITHUB_REPO = "johnkorzhuk/grabient";
const CACHE_TTL_SECONDS = 4 * 60 * 60; // 4 hours
const CACHE_URL = "https://grabient.com/__internal/github-stars";

interface GitHubRepoResponse {
    stargazers_count: number;
}

export const getGithubStars = createServerFn({ method: "GET" }).handler(
    async (): Promise<number> => {
        const cache = caches.default;
        const cacheKey = new Request(CACHE_URL);

        const cachedResponse = await cache.match(cacheKey);
        if (cachedResponse) {
            const data = (await cachedResponse.json()) as { stars: number };
            return data.stars;
        }

        const response = await fetch(
            `https://api.github.com/repos/${GITHUB_REPO}`,
            {
                headers: {
                    Accept: "application/vnd.github.v3+json",
                    "User-Agent": "Grabient-App",
                },
            },
        );

        if (!response.ok) {
            console.error("Failed to fetch GitHub stars:", response.statusText);
            return 0;
        }

        const data = (await response.json()) as GitHubRepoResponse;
        const stars = data.stargazers_count;

        const cacheResponse = new Response(JSON.stringify({ stars }), {
            headers: {
                "Content-Type": "application/json",
                "Cache-Control": `public, max-age=${CACHE_TTL_SECONDS}`,
            },
        });

        await cache.put(cacheKey, cacheResponse);

        return stars;
    },
);

export const githubStarsQueryOptions = () =>
    queryOptions({
        queryKey: ["githubStars"],
        queryFn: () => getGithubStars(),
        staleTime: CACHE_TTL_SECONDS * 1000,
        gcTime: CACHE_TTL_SECONDS * 1000,
    });
