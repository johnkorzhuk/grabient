import { contrast } from "@grabient/engine/contrast.ts";
import type { Size } from "@grabient/engine/view.ts";
import { msg, rich, t } from "@grabient/i18n";
import { Button } from "@grabient/ui/Button.tsx";
import type { CodeTab } from "@grabient/ui/CodeTabs.tsx";
import { Icon } from "@grabient/ui/Icon.tsx";
import { createMemo, createSignal, type Element, For, Show } from "solid-js";
import { Chip, ContrastChip, Example, type ExampleProps, Painted } from "./Example.tsx";
import { type Press, pressPaper, TILE } from "./fit.ts";
import { createLit } from "./lit.ts";
import styles from "./Profile.module.css";
import { drawnColors, THEME_INK } from "./paint.ts";
import { cssRule, drawnWords, pictureAddress, solidBlob } from "./shared.ts";

/* Avatars and banners: the palette as a social profile's header and picture, each the palette's own file at the size a
   profile takes, in the address's style (the gradient's PNG, or the effect's first frame, whose still the card shows and
   plays under the pointer), which always suits it. The card stands on the paper whose theme the palette gives its
   Follow press on (fit.ts's pressPaper: a fill that stands out from the paper as a control must, under a label that
   reads), so the server's page is the browser's; were no color to stand out on either, the press would be an outline.
   A blob with no ground is given the palette's darkest or lightest color, since a picture on a profile can't be clear,
   and the tag says so. */

/** The files a profile takes, within a PNG's bounds (2400 a side, 3 million pixels in all): its banner at the two shapes
    social apps ask for, and its avatar, which the app cuts to a circle. */
const BANNER: Size = { width: 1500, height: 500 };
const BANNER_WIDE: Size = { width: 1584, height: 396 };
const AVATAR: Size = { width: 400, height: 400 };
const FILES = [BANNER, BANNER_WIDE, AVATAR] as const;

/** The profile's owner: a first name, which a translator writes in the language's script. The handle is an address,
    the same in every language. */
const OWNER = msg("Mira");
const HANDLE = "@mira";

const sizeText = (size: Size) => `${size.width}×${size.height}`;

/** The tag a message marks a hex with: `rich("… <c>{color}</c>", MONO)`. */
const MONO = {
  c: (words: (string | Element)[]) => (
    <span class={styles.mono} dir="ltr">
      {words}
    </span>
  )
};

/** Whether the palette suits this example (fit.ts): the banner and the avatar are its own picture, so the profile is
    shown for every palette. */
export const profileFits = (_s: ExampleProps["s"]): boolean => true;

export function ProfileExample(props: ExampleProps) {
  const s = createMemo(() => solidBlob(props.s));
  /* the blob is shown on a ground its address doesn't name */
  const added = () => s() !== props.s;
  /* the card is lit while the pointer rests on it or the keyboard's focus is in it: its effect plays */
  const lit = createLit();
  const [following, setFollowing] = createSignal(false);
  const owner = () => t(OWNER);
  const paper = createMemo(() => pressPaper(drawnColors(props.s)));
  const press = () => paper().press;
  const png = (size: Size) => pictureAddress(s(), props.origin, "png", size);
  const fileName = (size: Size) =>
    `grabient-${props.s.seed}${props.s.effect ? `-${props.s.effect.kind}` : ""}-${size.width}x${size.height}.png`;

  const amp = (address: string) => address.replaceAll("&", "&amp;");
  const html = () =>
    [
      '<article class="profile">',
      `  <img class="banner" src="${amp(png(BANNER))}" width="${BANNER.width}" height="${BANNER.height}" alt="">`,
      `  <img class="avatar" src="${amp(png(AVATAR))}" width="${AVATAR.width}" height="${AVATAR.height}" alt="${owner()}">`,
      `  <button type="button" class="follow">${t("Follow")}</button>`,
      `  <h3>${owner()}</h3>`,
      "</article>"
    ].join("\n");
  /* the press as the card shows it: its fill and label, and the next color under the pointer where there is one; an
     outline where no color stands out */
  const followCss = (p: Press | null) =>
    p
      ? [
          cssRule(".follow", [`background: ${p.fill};`, `color: ${p.label};`]),
          ...(p.hover === p.fill ? [] : [cssRule(".follow:hover", [`background: ${p.hover};`])])
        ]
      : [cssRule(".follow", ["border: 1px solid;", "background: none;", "color: inherit;"])];
  const css = () =>
    [
      cssRule(".profile", [
        `background: ${TILE[paper().theme]};`,
        `color: ${THEME_INK[paper().theme]};`
      ]),
      cssRule(".banner", ["width: 100%;", "height: auto;"]),
      cssRule(".avatar", ["width: 112px;", "height: 112px;", "border-radius: 50%;"]),
      ...followCss(press())
    ].join("\n");
  /* the address answers with a redirect to a new palette's file: a HEAD follows it and keeps where it lands, the picture
     left on the server */
  const random = () =>
    [
      `const res = await fetch("${pictureAddress({ ...props.s, seed: "random" }, props.origin, "png", AVATAR)}", { method: "HEAD" });`,
      "account.avatar = res.url;"
    ].join("\n");
  const code = (): CodeTab[] => [
    { label: "HTML", code: html() },
    { label: "CSS", code: css() },
    {
      label: t("Random", { $context: "file" }),
      code: random(),
      where: { text: t("A new palette each time") }
    }
  ];

  return (
    <Example
      id="profile"
      n={props.n}
      title={t("Avatars and banners")}
      about={t("For profiles and default avatars.")}
      drawn={drawnWords(props.s)}
      differs={added()}
      notes={
        <>
          {/* the press's label on its fill */}
          <Show when={press()}>
            {p => <ContrastChip ink={p().label} ratio={contrast(p().label, p().fill)} />}
          </Show>
          <Show when={added() && s().effect?.look.bg}>
            {bg => (
              <Chip color={bg()}>
                <span>{rich("Background <c>{color}</c>", MONO, { color: bg() })}</span>
              </Chip>
            )}
          </Show>
        </>
      }
      code={code()}
      codeLabel={t("The profile's code")}
    >
      <div class={styles.stage}>
        <article
          class={styles.card}
          data-theme={paper().theme}
          onPointerEnter={lit.enter}
          onPointerLeave={lit.leave}
          onFocusIn={lit.focus}
          onFocusOut={lit.blur}
        >
          <div class={styles.banner} aria-hidden="true">
            <Painted s={s()} lit={lit.on()} />
          </div>
          <div class={styles.body}>
            <div class={styles.top}>
              <span class={styles.avatar} role="img" aria-label={owner()}>
                <Painted s={s()} lit={lit.on()} />
              </span>
              {/* a press that works: it follows, and the card says so. Both its words stand in it, the other one
                  hidden, so it keeps one width pressed or not */}
              <button
                type="button"
                class={styles.follow}
                data-on={following() ? "" : undefined}
                data-outline={press() ? undefined : ""}
                style={
                  press()
                    ? {
                        "--fill": press()?.fill,
                        "--label": press()?.label,
                        "--hover": press()?.hover
                      }
                    : undefined
                }
                onClick={() => setFollowing(!following())}
              >
                <span data-off={following() ? "" : undefined}>{t("Follow")}</span>
                <span data-off={following() ? undefined : ""}>{t("Following")}</span>
              </button>
            </div>
            <h3 class={styles.name}>{owner()}</h3>
            {/* an address reads left to right in every language, in a line that starts where the page's do */}
            <p class={styles.handle}>
              <span dir="ltr">{HANDLE}</span>
            </p>
            <p class={styles.bio}>{t("Illustrator and type designer")}</p>
          </div>
        </article>
        <div class={styles.files}>
          <For each={FILES} keyed={false}>
            {size => (
              <Button
                size="sm"
                href={png(size())}
                download={fileName(size())}
                aria-label={t("Download PNG, {size}", { size: sizeText(size()) })}
              >
                <Icon name="download" size={14} />
                <span class={styles.size} dir="ltr">
                  {sizeText(size())}
                </span>
              </Button>
            )}
          </For>
        </div>
      </div>
    </Example>
  );
}
