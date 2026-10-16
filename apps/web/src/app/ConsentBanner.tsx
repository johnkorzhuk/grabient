import { localHref } from "@grabient/i18n";
import { ConsentBanner as Banner } from "@grabient/ui/ConsentBanner.tsx";
import { regionRule, setAllConsent } from "../features/analytics/consent.ts";

/** The privacy banner for a reader whose region asks or tells (consent.ts). An answer is this browser's choice for every
    category at once, and Choose leads to each one in Settings. The frame loads this module only for a reader who sees
    the banner. */
export function ConsentBanner(props: {
  /** the page pins its stops along the screen's foot */
  strip: boolean;
}) {
  return (
    <Banner
      rule={regionRule() === "tell" ? "tell" : "ask"}
      choose={`${localHref("/settings")}#privacy`}
      privacy={localHref("/privacy")}
      strip={props.strip}
      onChoose={setAllConsent}
    />
  );
}
