/* Where a new account's newsletter starts, by the place Cloudflare finds its sign-up in (request.cf), which
   auth/library.ts reads:
   - ask: the newsletter waits for the account's own yes in Settings, where the law there wants one before a newsletter
     is sent, and where the place is unknown.
   - none: the newsletter starts on, and every issue carries its way out.
   No imports. */

export type ConsentRule = "ask" | "none";

/** The fields of request.cf the rule reads. */
export interface Place {
  country?: string;
  regionCode?: string;
  isEUCountry?: string;
}

/* The EEA, the EU's outermost regions Cloudflare reports under codes of their own, Åland and Gibraltar. */
const EEA =
  "AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE IS LI NO RE GP MQ GF YT MF AX GI";

/* The places beyond it the site asks too: Andorra, Monaco, San Marino and the Vatican, the UK, Jersey, Guernsey and the
   Isle of Man, Switzerland, Turkey, China and Vietnam. Quebec is a province, so consentRule names it. */
const BEYOND = "AD MC SM VA GB JE GG IM CH TR CN VN";

const ASK = new Set(`${EEA} ${BEYOND}`.split(" "));

/** The rule for a sign-up from this place. No place, an unknown country (XX) and Tor (T1) are asked, the strictest. */
export function consentRule(place: Place | undefined): ConsentRule {
  if (!place?.country || place.country === "XX" || place.country === "T1") return "ask";
  if (place.isEUCountry === "1" || ASK.has(place.country)) return "ask";
  if (place.country === "CA" && place.regionCode === "QC") return "ask";
  return "none";
}
