import { createFileRoute } from "@tanstack/solid-router";
import { json } from "../../lib/responses.ts";

/* Where consent starts strict: the EEA and the UK, the EU's outermost regions Cloudflare reports under their own codes,
   Gibraltar, and every address whose country is unknown (XX) or hidden behind Tor (T1). */
const STRICT = new Set(
  "AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE IS LI NO GB RE GP MQ GF YT MF AX GI XX T1".split(
    " "
  )
);

export const Route = createFileRoute("/api/geo")({
  server: {
    handlers: {
      GET: ({ request }) => {
        const cf = (request as { cf?: { country?: string; isEUCountry?: string } }).cf;
        return json({
          isGdprRegion: !cf?.country || cf.isEUCountry === "1" || STRICT.has(cf.country)
        });
      }
    }
  }
});
