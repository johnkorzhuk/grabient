import { Button, type ButtonSize, type ButtonVariant } from "@grabient/ui/Button.tsx";
import { Icon } from "@grabient/ui/Icon.tsx";
import { t } from "@grabient/ui/i18n.ts";
import { Block, Rules, Section } from "../../doc/Section.tsx";
import { Cell, Cells, Matrix, Verdict, Verdicts } from "../../doc/Specimen.tsx";
import { art } from "../../samples.ts";
import styles from "./Buttons.module.css";

/* The button in its five variants at its three heights, square with an icon alone, its options, and the one rule of
   its use the eye can check. */
const VARIANTS: readonly ButtonVariant[] = ["secondary", "primary", "ghost", "art", "input"];
const SIZES: readonly ButtonSize[] = ["sm", "md", "lg"];
const ICONED = ["secondary", "ghost", "art"] as const;
const ART = art(3);

export function Buttons() {
  return (
    <Section id="button" summary="Five variants, three heights, one primary per view.">
      <Block title="Variants">
        <Matrix
          rows={VARIANTS}
          cols={SIZES}
          axes="variant · size"
          art={variant => (variant === "art" ? ART : undefined)}
          cell={(variant, size) => (
            <Button variant={variant} size={size}>
              Save
            </Button>
          )}
        />
      </Block>
      <Block title="Icon">
        <Matrix
          rows={ICONED}
          cols={SIZES}
          axes="variant · size"
          art={variant => (variant === "art" ? ART : undefined)}
          cell={(variant, size) => (
            <Button variant={variant} size={size} icon aria-label={t("Copy")}>
              <Icon name="copy" size={size === "sm" ? 13 : 15} />
            </Button>
          )}
        />
      </Block>
      <Block title="Options">
        <Cells min={240}>
          <Cell caption="danger">
            <Button danger>Delete account</Button>
          </Cell>
          <Cell caption="full">
            <span class={styles.column}>
              <Button variant="primary" size="lg" full>
                Send link
              </Button>
            </span>
          </Cell>
          <Cell caption="external">
            <Button size="sm" href="https://github.com/johnkorzhuk/grabient" external>
              Code on GitHub
            </Button>
          </Cell>
        </Cells>
      </Block>
      <Block title="Usage">
        <Verdicts pair>
          <Verdict ok caption="One primary action per view.">
            <Button>Cancel</Button>
            <Button variant="primary">Save</Button>
          </Verdict>
          <Verdict caption="Two primaries side by side.">
            <Button variant="primary">Save draft</Button>
            <Button variant="primary">Publish</Button>
          </Verdict>
        </Verdicts>
      </Block>
      <Block title="Rules">
        <Rules
          rules={[
            "Primary appears once per view. Ghost is for rows of icons, never a primary action.",
            "Labels are verbs in sentence case. A count after the label is its own num, so the gap stands between them.",
            "An icon alone needs its aria-label and a tip; keep leaves a disabled press in the Tab order."
          ]}
        />
      </Block>
    </Section>
  );
}
