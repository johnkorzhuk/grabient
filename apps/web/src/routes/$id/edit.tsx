import { createFileRoute, notFound, redirect } from "@tanstack/solid-router";

/** A seed's or an old id's grabient.com editor address leads to its page, with its query. */
const EDITABLE = /^(k[A-Za-z0-9_-]{8,49}|[_~][A-Za-z0-9_-]{6,})$/;

export const Route = createFileRoute("/$id/edit")({
  beforeLoad: ({ params, search }) => {
    if (!EDITABLE.test(params.id)) throw notFound();
    throw redirect({ to: "/$id", params, search, statusCode: 301 });
  }
});
