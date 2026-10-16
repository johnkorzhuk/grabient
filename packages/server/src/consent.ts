/* Where a reader's privacy choices start, by the place Cloudflare finds the request in (request.cf). The page's
   defaults and its banner (/api/geo) and a new account's newsletter (auth/library.ts) follow the same rule.
   - ask: consent first. Everything optional starts off, and the banner asks.
   - tell: Analytics starts on, with a notice and a way out in one press. Marketing starts off, and so does the
     newsletter of an account made there.
   - none: Analytics and Marketing start on, as does the newsletter.
   No imports: the browser's code reads the rule's names too. */

export type ConsentRule = "ask" | "tell" | "none";

/** The fields of request.cf the rule reads. */
export interface Place {
  country?: string;
  regionCode?: string;
  isEUCountry?: string;
}

/* The EEA, the EU's outermost regions Cloudflare reports under codes of their own, Åland and Gibraltar: their ePrivacy
   rules ask for consent before a site stores or reads anything on a device that the site does not strictly need. */
const EEA =
  "AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE IS LI NO RE GP MQ GF YT MF AX GI";

/* Places beyond it whose law asks for consent first as well. Andorra, Monaco, San Marino and the Vatican lie within
   the EU and keep its rules on what a site stores on a device. Jersey, Guernsey and the Isle of Man have data laws of
   their own, which the UK's exception for counting visits does not reach. The UK itself is asked until Google holds
   GA4's data as a processor (TELL says why). Turkey's data protection authority counts as necessary only the analytics
   a site runs itself and passes to no one. China's personal information law has no legitimate interest for analytics
   to rest on, and it reaches the analysis of people in China from abroad. Vietnam's personal data law rests on
   consent. Quebec is a province, so consentRule names it. */
const BEYOND = "AD MC SM VA JE GG IM GB TR CN VN";

const ASK = new Set(`${EEA} ${BEYOND}`.split(" "));

/* The UK and Switzerland let a site count its visits without consent when it says so plainly and the reader can object
   in one step: the statistics exception in the UK's PECR, and the Swiss data protection commissioner's cookie
   guidelines. The UK's exception holds only while the counting serves the site alone, with Google as its processor:
   the GA4 property shares no data with Google's products, has Google signals off and no Ads link. Until the property
   is set so, the UK stays in BEYOND; once it is, GB moves here. Linking a visit to its person falls outside the
   exception, so Marketing waits for a yes under this rule. */
const TELL = new Set(["CH"]);

/** The rule for a request from this place. No place, an unknown country (XX) and Tor (T1) are asked, the strictest. */
export function consentRule(place: Place | undefined): ConsentRule {
  if (!place?.country || place.country === "XX" || place.country === "T1") return "ask";
  if (place.isEUCountry === "1" || ASK.has(place.country)) return "ask";
  /* Quebec's Law 25 has whatever can identify, locate or profile a person start off */
  if (place.country === "CA" && place.regionCode === "QC") return "ask";
  return TELL.has(place.country) ? "tell" : "none";
}
