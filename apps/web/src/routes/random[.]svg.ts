import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { fileAnswer } from "../server/files/palette-files.ts";
import { randomFile } from "../server/files/random.ts";

// A random palette as SVG: the one a name always draws, or a new one each time.
export const Route = createFileRoute("/random.svg")({
  server: {
    handlers: {
      GET: ({ request }) => randomFile(request, "svg", named => fileAnswer(named, env, "svg"))
    }
  }
});
