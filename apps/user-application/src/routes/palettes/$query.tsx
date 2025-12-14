import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/palettes/$query")({
    component: () => <Outlet />,
});
