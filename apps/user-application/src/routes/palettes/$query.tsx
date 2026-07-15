import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/palettes/$query")({
    head: ({ params }) => {
        const baseUrl = import.meta.env.VITE_BASE_URL || "https://grabient.com";
        const query = decodeURIComponent(params.query);
        const title = `${query} - Gradient Palettes | Grabient`;
        const description = `Gradient color palettes matching "${query}". Browse, customize, and export as CSS, SVG, or PNG with Grabient's gradient generator.`;
        return {
            meta: [
                { title },
                { name: "description", content: description },
                { property: "og:title", content: title },
                { property: "og:description", content: description },
            ],
            links: [
                {
                    rel: "canonical",
                    href: `${baseUrl}/palettes/${params.query}`,
                },
            ],
        };
    },
    component: () => <Outlet />,
});
