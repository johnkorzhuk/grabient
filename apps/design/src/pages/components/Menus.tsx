import { STYLE_LABELS, STYLES, type Style } from "@grabient/engine/view.ts";
import { Button } from "@grabient/ui/Button.tsx";
import { Icon } from "@grabient/ui/Icon.tsx";
import { t } from "@grabient/ui/i18n.ts";
import { MenuButton, type MenuItem, MenuList } from "@grabient/ui/Menu.tsx";
import { createSignal, onSettled } from "solid-js";
import { Block, Rules, Section } from "../../doc/Section.tsx";
import { Cell, Cells } from "../../doc/Specimen.tsx";
import styles from "./Menus.module.css";

/* The menu button with a value and with words of its own, both live, and a menu held open under its button. */
const STYLE_ROWS: readonly MenuItem[] = STYLES.map(style => ({
  value: style,
  label: t(STYLE_LABELS[style])
}));
const ACCOUNT_ROWS: readonly MenuItem[] = [
  { value: "saved", label: t("Saved palettes") },
  { value: "mine", label: t("Your collections") },
  { value: "settings", label: t("Settings"), group: true },
  { value: "language", label: t("Language"), detail: "English", more: true },
  { value: "signout", label: t("Sign out"), group: true }
];

/* A menu's list open and still. It places itself against the window and takes the keyboard as it opens; here it is
   inert, and once placed it hangs where the specimen puts it. */
function StillMenu(props: { items: readonly MenuItem[]; label: string }) {
  let host!: HTMLDivElement;
  onSettled(() => {
    const frame = requestAnimationFrame(() => {
      const list = host.querySelector<HTMLElement>('[role="menu"]');
      list?.removeAttribute("data-up");
      list?.style.removeProperty("max-height");
    });
    return () => cancelAnimationFrame(frame);
  });
  return (
    <div class={styles.anchored}>
      <Button icon aria-label={t("Signed out")}>
        <Icon name="user" />
      </Button>
      <div ref={host} class={styles.hang} inert>
        <MenuList
          items={props.items}
          label={props.label}
          align="end"
          onPick={() => {}}
          onClose={() => {}}
        />
      </div>
    </div>
  );
}

export function Menus() {
  const [style, setStyle] = createSignal<Style>("linearGradient");
  return (
    <Section id="menu" summary="A short list on glass, opened by a button.">
      <Block title="Variants">
        <Cells min={300}>
          <Cell caption="a value · press to open">
            <MenuButton
              items={STYLE_ROWS}
              value={style()}
              icon={<Icon name="monitor" size={15} />}
              aria-label={t("Style")}
              onPick={item => setStyle(item.value as Style)}
            />
          </Cell>
          <Cell caption="open · its rows, a group and a row that opens more">
            <StillMenu items={ACCOUNT_ROWS} label="Account" />
          </Cell>
        </Cells>
      </Block>
      <Block title="Rules">
        <Rules
          rules={[
            "A menu picks one thing and closes. It holds no fields.",
            "It opens toward the room and never runs off the screen; the current row is on paper.",
            "Choices a row opens always have Back as a row, not only a key.",
            "Arrows move, Enter picks, Escape closes and hands focus back to the button."
          ]}
        />
      </Block>
    </Section>
  );
}
