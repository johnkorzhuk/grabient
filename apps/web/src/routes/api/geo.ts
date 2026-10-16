import { consentRule, type Place } from "@grabient/server/consent.ts";
import { createFileRoute } from "@tanstack/solid-router";
import { json } from "../../lib/responses.ts";

/* How this reader's privacy choices start (@grabient/server/consent.ts), answered fresh for each reader and kept by no
   cache. isGdprRegion is what an older page, still kept in a cache, reads. */
export const Route = createFileRoute("/api/geo")({
  server: {
    handlers: {
      GET: ({ request }) => {
        const rule = consentRule((request as { cf?: Place }).cf);
        return json({ rule, isGdprRegion: rule === "ask" });
      }
    }
  }
});
