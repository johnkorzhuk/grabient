import { onSettled } from "solid-js";
import { announce } from "./announce.ts";
import { Button } from "./Button.tsx";
import styles from "./ConsentBanner.module.css";
import { msg, t } from "./i18n.ts";
import link from "./link.module.css";
import { watchSize } from "./measure.ts";
import { focusMain } from "./SkipLink.tsx";

/* What the site would measure and why, the way to choose each part in Settings, the policy, and two equal answers. The
   banner stands over the page at the screen's foot, so nothing on the page moves when it comes or goes, and it holds
   nothing back: no scrim, no trap, no focus taken as it arrives, and no live region. It comes second in the Tab order,
   after Skip to content. While it stands, the page scrolls a control the keyboard reaches clear of it. */

const WORDS = {
  ask: msg(
    "To improve Grabient, Google Analytics can count your visits and link them to your account, and session replay can record them with all text hidden. Nothing runs until you choose."
  ),
  tell: msg(
    "To improve Grabient, Google Analytics counts visits. Accept all also links them to your account and records them with all text hidden."
  )
};

/** The privacy banner. `ask` says nothing runs until the reader answers; `tell` says analytics counts visits already,
    and what Accept all adds. The page decides when it shows and what an answer does. */
export function ConsentBanner(props: {
  rule: "ask" | "tell";
  /** the privacy choices in Settings and the policy, in the reader's language */
  choose: string;
  privacy: string;
  /** the page pins its stops along the screen's foot (the editor): the banner stands above them */
  strip?: boolean;
  /** in the flow and never measured, for the design document */
  still?: boolean;
  /** Accept all (true) or Reject all (false) */
  onChoose: (all: boolean) => void;
}) {
  let banner!: HTMLElement;
  /* how far up the screen it reaches, which the page's scroll padding keeps clear (ConsentBanner.module.css) */
  onSettled(() => {
    if (props.still) return;
    const root = document.documentElement;
    const stop = watchSize(banner, () =>
      root.style.setProperty(
        "--consent-room",
        `${Math.ceil(innerHeight - banner.getBoundingClientRect().top)}px`
      )
    );
    return () => {
      stop();
      root.style.removeProperty("--consent-room");
    };
  });
  /* the banner goes with the answer: a keyboard that was in it lands on the page's content, and is told where the
     answer can change */
  const answer = (all: boolean) => {
    const inside = !props.still && banner.contains(document.activeElement);
    if (inside) focusMain();
    props.onChoose(all);
    if (inside) announce(t("Saved. Change it in Settings."));
  };
  return (
    <aside
      ref={banner}
      class={styles.banner}
      data-consent=""
      data-strip={props.strip ? "" : undefined}
      data-still={props.still ? "" : undefined}
      aria-label={t("Privacy choices")}
    >
      <p class={styles.words}>
        {t(WORDS[props.rule])}{" "}
        <a class={link.inline} href={props.choose}>
          {t("Choose")}
        </a>
        <span aria-hidden="true"> · </span>
        <a class={link.inline} href={props.privacy}>
          {t("Privacy Policy")}
        </a>
      </p>
      <div class={styles.answers}>
        <Button full onClick={() => answer(false)}>
          {t("Reject all")}
        </Button>
        <Button full onClick={() => answer(true)}>
          {t("Accept all")}
        </Button>
      </div>
    </aside>
  );
}
