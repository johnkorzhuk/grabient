import { Button } from "@grabient/ui/Button.tsx";
import { Icon } from "@grabient/ui/Icon.tsx";
import { t } from "@grabient/ui/i18n.ts";
import { HeldTip } from "../../doc/HeldTip.tsx";
import { Block, Rules, Section } from "../../doc/Section.tsx";
import { Cell, Cells } from "../../doc/Specimen.tsx";
import styles from "./Tooltips.module.css";

/* The bubble held open under its control, then the controls themselves, whose tips open as they do on the site: after
   the pointer rests, or at once with keyboard focus. */
export function Tooltips() {
  return (
    <Section id="tooltip" summary="One line under a control after the pointer rests on it.">
      <Block title="Variants">
        <Cells min={240}>
          <Cell caption="a name and its key">
            <HeldTip text={t("Theme · {key}", { key: "T" })}>
              <Button icon aria-label={t("Light theme")}>
                <Icon name="sun" />
              </Button>
            </HeldTip>
          </Cell>
          <Cell caption="an icon's name">
            <HeldTip text={t("Copy")}>
              <Button icon aria-label={t("Copy")}>
                <Icon name="copy" />
              </Button>
            </HeldTip>
          </Cell>
          <Cell caption="live · rest the pointer, or Tab to them">
            <span class={styles.row}>
              <Button icon variant="ghost" aria-label={t("Reverse")} tip={`${t("Reverse")} · E`}>
                <Icon name="flip" />
              </Button>
              <Button icon variant="ghost" aria-label={t("Invert")} tip={`${t("Invert")} · I`}>
                <Icon name="contrast" />
              </Button>
              <Button icon variant="ghost" aria-label={t("Random")} tip={`${t("Random")} · B`}>
                <Icon name="dice" />
              </Button>
            </span>
          </Cell>
        </Cells>
      </Block>
      <Block title="Rules">
        <Rules
          rules={[
            "Only for an icon alone, a key or a consequence. A press closes it; a toggle's stays and says its new name.",
            "The name of the press in a word or two, no period; a key follows a middle dot: Theme · T.",
            "A Button takes tip; anything else takes tooltip(), never the title attribute.",
            "It opens on keyboard focus as on hover; Escape closes it."
          ]}
        />
      </Block>
    </Section>
  );
}
