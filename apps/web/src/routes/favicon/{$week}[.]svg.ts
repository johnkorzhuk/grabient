import { createFileRoute } from "@tanstack/solid-router";
import { weekIconAnswer } from "../../server/images/answers.ts";

// The week's tab icon.
export const Route = createFileRoute("/favicon/{$week}.svg")({
  server: { handlers: { GET: ({ request }) => weekIconAnswer(request) } }
});
