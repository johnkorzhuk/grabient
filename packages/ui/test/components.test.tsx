import { renderToString } from "@solidjs/web";
import type { Element } from "solid-js";
import { describe, expect, test } from "vitest";
import { AppPage } from "../src/AppPage.tsx";
import { Avatar } from "../src/Avatar.tsx";
import { Backdrop } from "../src/Backdrop.tsx";
import { BackToTop } from "../src/BackToTop.tsx";
import { BarRim } from "../src/BarRim.tsx";
import { Button } from "../src/Button.tsx";
import { CodeLines } from "../src/CodeBlock.tsx";
import { CodeTabs } from "../src/CodeTabs.tsx";
import { Coins } from "../src/Coins.tsx";
import { ColorCodes } from "../src/ColorCodes.tsx";
import { CopyButton } from "../src/CopyButton.tsx";
import { CopyLine } from "../src/CopyLine.tsx";
import { BarLight } from "../src/contexts.ts";
import { Field } from "../src/Field.tsx";
import { Flag } from "../src/Flag.tsx";
import { Footer } from "../src/Footer.tsx";
import { Header } from "../src/Header.tsx";
import { Icon } from "../src/Icon.tsx";
import { KeyList } from "../src/KeyList.tsx";
import { Label } from "../src/Label.tsx";
import { Logo } from "../src/Logo.tsx";
import { MenuButton, MenuList } from "../src/Menu.tsx";
import { NavLink } from "../src/NavLink.tsx";
import { PageFrame } from "../src/PageFrame.tsx";
import { PageRoot } from "../src/PageRoot.tsx";
import { Pane } from "../src/Pane.tsx";
import { Placeholder } from "../src/Placeholder.tsx";
import { Rule } from "../src/Rule.tsx";
import { Segmented } from "../src/Segmented.tsx";
import { Select } from "../src/Select.tsx";
import { SkipLink, SkipTarget } from "../src/SkipLink.tsx";
import { Stars } from "../src/Stars.tsx";
import { Status } from "../src/Status.tsx";
import { Switch } from "../src/Switch.tsx";
import { Text } from "../src/Text.tsx";
import { Textarea } from "../src/Textarea.tsx";
import { ThemeIcon } from "../src/ThemeIcon.tsx";
import { Tooltip } from "../src/Tooltip.tsx";

const html = (view: () => Element) => renderToString(view);
type Attrs = Record<string, string>;
/** Every element of a tag in the markup, as its attributes. */
function tags(markup: string, name: string): Attrs[] {
  return [...markup.matchAll(new RegExp(`<${name}(\\s[^>]*?)?/?>`, "g"))].map(m =>
    Object.fromEntries(
      [...(m[1] ?? "").matchAll(/([\w:-]+)(?:="([^"]*)")?/g)].map(a => [a[1], a[2] ?? ""])
    )
  );
}
const tag = (markup: string, name: string, i = 0): Attrs => tags(markup, name)[i] ?? {};
const ENTITIES: Record<string, string> = {
  "&lt;": "<",
  "&gt;": ">",
  "&amp;": "&",
  "&quot;": '"',
  "&#39;": "'"
};
const text = (markup: string) =>
  markup
    .replace(/<!--.*?-->/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;|&gt;|&amp;|&quot;|&#39;/g, e => ENTITIES[e]);
const noop = () => {};

describe("Button", () => {
  test("a quiet secondary press by default, typed as a button", () => {
    const b = tag(
      html(() => <Button>Save</Button>),
      "button"
    );
    expect(b).toMatchObject({ type: "button", "data-variant": "secondary", "data-size": "md" });
    expect(b.disabled).toBeUndefined();
  });

  test("variants, sizes and an icon alone, named by its label", () => {
    const b = tag(
      html(() => (
        <Button variant="primary" size="lg" icon full aria-label="Light theme" aria-pressed={false}>
          <Icon name="sun" />
        </Button>
      )),
      "button"
    );
    expect(b).toMatchObject({
      "data-variant": "primary",
      "data-size": "lg",
      "data-icon": "",
      "data-full": "",
      "aria-label": "Light theme",
      "aria-pressed": "false"
    });
  });

  test("disabled leaves the Tab order; kept, it stays in it as aria-disabled", () => {
    expect(
      tag(
        html(() => <Button disabled>Undo</Button>),
        "button"
      ).disabled
    ).toBe("");
    const kept = tag(
      html(() => (
        <Button disabled keep>
          Undo
        </Button>
      )),
      "button"
    );
    expect(kept.disabled).toBeUndefined();
    expect(kept["aria-disabled"]).toBe("true");
  });

  test("a link looks like the press; disabled it has nowhere to go", () => {
    expect(
      tag(
        html(() => <Button href="/settings">Settings</Button>),
        "a"
      ).href
    ).toBe("/settings");
    const off = tag(
      html(() => (
        <Button href="/settings" disabled>
          Settings
        </Button>
      )),
      "a"
    );
    expect(off.href).toBeUndefined();
    expect(off["aria-disabled"]).toBe("true");
  });

  test("another site opens in a new tab and says so to a screen reader", () => {
    const markup = html(() => (
      <Button href="https://github.com/johnkorzhuk/grabient" external>
        Code
      </Button>
    ));
    expect(tag(markup, "a")).toMatchObject({ target: "_blank", rel: "noopener noreferrer" });
    expect(text(markup)).toContain("(opens in a new tab)");
  });

  test("the input recipe wears a field's rim", () => {
    const markup = html(() => <Button variant="input">Linear</Button>);
    expect(tag(markup, "span")["aria-hidden"]).toBeUndefined();
    expect(tags(markup, "span").some(s => s["aria-hidden"] === "true")).toBe(true);
    expect(tag(markup, "button")["data-variant"]).toBe("input");
  });
});

describe("type", () => {
  test("a variant chooses its element, which `as` overrides", () => {
    expect(html(() => <Text variant="title">Settings</Text>)).toMatch(
      /^<h1[^>]*data-variant="title"[^>]*>Settings<\/h1>$/
    );
    expect(html(() => <Text variant="h2">Privacy</Text>)).toMatch(/^<h2/);
    expect(html(() => <Text variant="body">Words</Text>)).toMatch(/^<p/);
    expect(html(() => <Text variant="ui">Words</Text>)).toMatch(/^<span/);
    expect(
      html(() => (
        <Text variant="h3" as="dt">
          Term
        </Text>
      ))
    ).toMatch(/^<dt/);
  });

  test("strong, danger, truncate and a direction of its own", () => {
    const t = tag(
      html(() => (
        <Text variant="caption" strong danger truncate dir="auto">
          Taken
        </Text>
      )),
      "span"
    );
    expect(t).toMatchObject({
      "data-strong": "",
      "data-danger": "",
      "data-truncate": "",
      dir: "auto"
    });
  });

  test("a label above a field", () => {
    expect(
      tag(
        html(() => <Label field>Email</Label>),
        "span"
      )["data-field"]
    ).toBe("");
  });
});

describe("Icon", () => {
  test("a line glyph, hidden from screen readers, at its size", () => {
    const markup = html(() => <Icon name="mail" size={14} />);
    expect(tag(markup, "svg")).toMatchObject({
      width: "14",
      height: "14",
      "aria-hidden": "true",
      fill: "none"
    });
    expect(tag(markup, "path").d).toMatch(/^M4 4h16/);
  });

  test("an arrow along the line of reading turns in a right-to-left page, unless it points along a palette", () => {
    expect(
      tag(
        html(() => <Icon name="back" />),
        "svg"
      )["data-turns"]
    ).toBe("");
    expect(
      tag(
        html(() => <Icon name="back" mirror={false} />),
        "svg"
      )["data-turns"]
    ).toBeUndefined();
    expect(
      tag(
        html(() => <Icon name="sun" />),
        "svg"
      )["data-turns"]
    ).toBeUndefined();
    expect(
      tag(
        html(() => <Icon name="heart" fill />),
        "svg"
      ).fill
    ).toBe("currentColor");
  });
});

describe("fields", () => {
  test("a field is named by its label and described by its help line", () => {
    const markup = html(() => (
      <Field
        label="Email"
        name="email"
        type="email"
        value="a@b.co"
        help="Check your email."
        invalid
        required
      />
    ));
    const input = tag(markup, "input");
    expect(tag(markup, "label").for).toBe(input.id);
    expect(input).toMatchObject({
      type: "email",
      name: "email",
      dir: "ltr",
      "aria-invalid": "true",
      required: ""
    });
    expect(input["aria-describedby"]).toBe(`${input.id}-help`);
    expect(tag(markup, "p")).toMatchObject({
      id: `${input.id}-help`,
      "aria-live": "polite",
      "data-error": ""
    });
  });

  test("a field without help has no help line, and an empty one keeps the page's direction", () => {
    const markup = html(() => <Field label="Title" name="title" />);
    expect(tags(markup, "p")).toHaveLength(0);
    expect(tag(markup, "input").dir).toBeUndefined();
    expect(tag(markup, "input")["aria-describedby"]).toBeUndefined();
  });

  test("a textarea is a field of five lines, spellchecked", () => {
    const area = tag(
      html(() => <Textarea label="Message" name="message" />),
      "textarea"
    );
    expect(area).toMatchObject({ rows: "5", spellcheck: "true", name: "message" });
  });

  test("a switch reads On or Off, and armed it says what the next press does", () => {
    const on = html(() => <Switch checked aria-label="Analytics" onChange={noop} />);
    expect(tag(on, "button")).toMatchObject({
      role: "switch",
      "aria-checked": "true",
      "data-on": ""
    });
    expect(text(on)).toBe("On");
    expect(text(html(() => <Switch checked={false} onChange={noop} />))).toBe("Off");
    const armed = html(() => <Switch checked armed="Turn off for everyone" onChange={noop} />);
    expect(tag(armed, "button")["data-danger"]).toBe("");
    expect(text(armed)).toBe("Turn off for everyone");
  });
});

describe("Segmented", () => {
  const options = [
    { value: "palettes", label: "Palettes" },
    { value: "collections", label: "Collections" },
    { value: "saved", label: "Saved", disabled: true }
  ];

  test("a radio group that is one Tab stop, on the chosen choice", () => {
    const markup = html(() => (
      <Segmented aria-label="Show" value="collections" options={options} onChange={noop} />
    ));
    expect(tag(markup, "div")).toMatchObject({ role: "radiogroup", "aria-label": "Show" });
    const radios = tags(markup, "button");
    expect(radios.map(r => r["aria-checked"])).toEqual(["false", "true", "false"]);
    expect(radios.map(r => r.tabindex)).toEqual(["-1", "0", "-1"]);
    expect(radios[2].disabled).toBe("");
  });

  test("with no choice made the first takes the keyboard", () => {
    const radios = tags(
      html(() => <Segmented aria-label="Show" value="" options={options} onChange={noop} />),
      "button"
    );
    expect(radios[0].tabindex).toBe("0");
  });

  test("choices that are pages are links, the chosen one the current page; a bare word stays bare", () => {
    const pages = [
      { value: "palettes", label: "Palettes", href: "/palettes" },
      { value: "collections", label: "Collections", href: "/collections" },
      { value: "rising", label: "Rising", href: "/rising", disabled: true }
    ];
    const markup = html(() => (
      <Segmented aria-label="Lists" value="palettes" options={pages} onChange={noop} />
    ));
    expect(tag(markup, "nav")["aria-label"]).toBe("Lists");
    const links = tags(markup, "a");
    expect(links[0]).toMatchObject({ href: "/palettes", "aria-current": "page" });
    expect(links[2].href).toBeUndefined();
    expect(links[2]["aria-disabled"]).toBe("true");
    expect(markup).toMatch(/>Palettes<\/a>/);
  });

  test("a choice that says what it is set to keeps room for every form it takes", () => {
    const rising = [
      { value: "popular", label: "Popular" },
      {
        value: "rising",
        label: "Rising",
        detail: "1w",
        forms: ["1w", "3m", "1y"],
        name: "Rising, past week"
      }
    ];
    const markup = html(() => (
      <Segmented aria-label="Order" value="rising" options={rising} onChange={noop} />
    ));
    expect(
      tags(markup, "span")
        .filter(s => "data-form" in s)
        .map(s => s["data-form"])
    ).toEqual(["1w", "3m", "1y"]);
    expect(tag(markup, "button", 1)["aria-label"]).toBe("Rising, past week");
  });
});

describe("menus", () => {
  const items = [
    { value: "linear", label: "Linear" },
    { value: "radial", label: "Radial", detail: "6" },
    { value: "docs", label: "Docs", href: "https://example.com", group: true },
    { value: "off", label: "Unavailable", disabled: true }
  ];

  test("a closed menu button names its field and shows its choice", () => {
    const markup = html(() => (
      <MenuButton items={items} value="radial" aria-label="Style" onPick={noop} />
    ));
    expect(tag(markup, "button")).toMatchObject({
      "aria-haspopup": "menu",
      "aria-expanded": "false"
    });
    expect(text(markup)).toContain("Style Radial");
    expect(tags(markup, "div").some(d => d.role === "menu")).toBe(false);
  });

  test("an open list: radio rows for a value, a hairline between groups, a link row to another site", () => {
    const markup = html(() => (
      <MenuList items={items} value="radial" label="Style" onPick={noop} onClose={noop} />
    ));
    expect(tag(markup, "div")).toMatchObject({ role: "menu", "aria-label": "Style" });
    const rows = tags(markup, "button");
    expect(rows.map(r => r.role)).toEqual(["menuitemradio", "menuitemradio", "menuitemradio"]);
    expect(rows.map(r => r["aria-checked"])).toEqual(["false", "true", "false"]);
    expect(rows[1]["data-current"]).toBe("");
    expect(rows[2].disabled).toBe("");
    expect(tags(markup, "hr")).toHaveLength(1);
    expect(tag(markup, "a")).toMatchObject({
      role: "menuitem",
      href: "https://example.com",
      target: "_blank"
    });
  });

  test("a list without a value is plain menu items, and a row's choices have Back first", () => {
    const markup = html(() => (
      <MenuList
        items={[{ value: "a", label: "Settings" }]}
        label="Account"
        back={{ label: "Back", onBack: noop }}
        onPick={noop}
        onClose={noop}
      />
    ));
    expect(tags(markup, "button").map(r => r.role)).toEqual(["menuitem", "menuitem"]);
    expect(text(markup)).toMatch(/^Back/);
  });

  test("a select is named by its label and its value, and posts a hidden value", () => {
    const options = [
      { value: "a", label: "Sunset" },
      { value: "b", label: "Sea" }
    ];
    const markup = html(() => (
      <Select label="Collection" name="collection" value="b" options={options} />
    ));
    const trigger = tag(markup, "button");
    expect(trigger).toMatchObject({ "aria-haspopup": "menu", "aria-expanded": "false" });
    const [label, value] = trigger["aria-labelledby"].split(" ");
    expect(tag(markup, "label").id).toBe(label);
    expect(markup).toContain(`id="${value}"`);
    expect(tag(markup, "input")).toMatchObject({ type: "hidden", name: "collection", value: "b" });
    expect(text(markup)).toContain("Sea");
  });

  test("a select with nothing chosen shows its prompt", () => {
    const markup = html(() => (
      <Select aria-label="Collection" value="" options={[]} placeholder="Choose one" />
    ));
    expect(text(markup)).toContain("Choose one");
  });
});

describe("surfaces and feedback", () => {
  test("a pane is frost by default, and may be the page's main landmark with the bar along its top", () => {
    expect(
      tag(
        html(() => <Pane>Words</Pane>),
        "div"
      )["data-variant"]
    ).toBe("frost");
    const markup = html(() => (
      <BarLight value={() => ["#ff0000", "#0000ff"]}>
        <Pane as="main" variant="paper" padding="lg" bar>
          Words
        </Pane>
      </BarLight>
    ));
    expect(tag(markup, "main")).toMatchObject({
      "data-variant": "paper",
      "data-padding": "lg",
      "data-bar": ""
    });
    expect(tag(markup, "span").style).toContain("linear-gradient(90deg, #ff0000, #0000ff)");
  });

  test("a status line is always there; an error is an alert", () => {
    expect(
      tag(
        html(() => <Status />),
        "p"
      )
    ).toMatchObject({ role: "status", "aria-live": "polite" });
    expect(
      tag(
        html(() => <Status error>Couldn't save.</Status>),
        "p"
      ).role
    ).toBe("alert");
  });

  test("a rule, a placeholder and the backdrop are drawn and never read", () => {
    expect(
      tag(
        html(() => <Rule inset />),
        "hr"
      )["data-inset"]
    ).toBe("");
    expect(
      tag(
        html(() => <Placeholder width="52px" round="tight" />),
        "span"
      )
    ).toMatchObject({
      "aria-hidden": "true",
      "data-round": "tight"
    });
    const backdrop = html(() => <Backdrop stops={["#111111", "#222222", "#333333"]} strong />);
    expect(tag(backdrop, "div")["aria-hidden"]).toBe("true");
    expect(backdrop).toContain("#333333");
    expect(tag(backdrop, "div", 1)["data-strong"]).toBe("");
  });

  test("a field's rim wears the bar's colors, eight of them at most", () => {
    const stops = Array.from({ length: 32 }, (_, i) => `#${i.toString(16).padStart(2, "0")}0000`);
    const markup = html(() => (
      <BarLight value={() => stops}>
        <BarRim />
      </BarLight>
    ));
    const gradient = tag(markup, "span").style;
    expect(gradient.match(/#/g)).toHaveLength(8);
    expect(gradient).toContain("#000000 0.0%");
    expect(gradient).toContain("#1f0000 100.0%");
    expect(
      tag(
        html(() => <BarRim />),
        "span"
      ).style
    ).toBeUndefined();
  });

  test("a tooltip's wrapper has no box of its own", () => {
    const markup = html(() => (
      <Tooltip text="Copy">
        <button type="button">#ff0000</button>
      </Tooltip>
    ));
    expect(markup).toMatch(/^<span[^>]*><button/);
  });

  test("the key list groups by where keys work, chips read left to right", () => {
    const rows = [
      { keys: ["T"], label: "Theme", scope: "Every route" },
      { keys: ["E"], label: "Reverse", scope: "Editor" },
      { keys: ["?"], label: "Show shortcuts", scope: "Every route" }
    ];
    const markup = html(() => <KeyList rows={rows} onClose={noop} bindingsHref="/bindings" />);
    expect(tag(markup, "div")).toMatchObject({
      role: "dialog",
      "aria-label": "Shortcuts",
      tabindex: "-1"
    });
    expect(markup.match(/<h2[^>]*>([^<]*)<\/h2>/g)?.map(text)).toEqual(["Everywhere", "Editor"]);
    expect(tags(markup, "kbd").every(k => k.dir === "ltr")).toBe(true);
    expect(text(markup)).toContain("Change shortcuts");
    expect(tag(markup, "a").href).toBe("/bindings");
  });

  test("one group of keys has no heading", () => {
    const markup = html(() => <KeyList rows={[{ keys: ["T"], label: "Theme" }]} onClose={noop} />);
    expect(tags(markup, "h2")).toHaveLength(0);
  });
});

describe("content", () => {
  test("stars as GitHub writes them, and in words for a screen reader", () => {
    const cases: [number, string][] = [
      [0, "0"],
      [999, "999"],
      [1000, "1k"],
      [1049, "1k"],
      [1050, "1.1k"],
      [2049, "2k"],
      [2600, "2.6k"],
      [12345, "12.3k"],
      [999999, "1M"],
      [1200000, "1.2M"]
    ];
    for (const [count, shown] of cases)
      expect(text(html(() => <Stars count={count} />))).toMatch(new RegExp(`^${shown}`));
    expect(text(html(() => <Stars count={1} />))).toBe("11 star");
    expect(text(html(() => <Stars count={2049} />))).toBe("2k2,049 stars");
  });

  test("an avatar is the picture, the initial, or the outline that says Signed out", () => {
    const out = html(() => <Avatar />);
    expect(tag(out, "span")).toMatchObject({ role: "img", "aria-label": "Signed out" });
    expect(tags(out, "svg")).toHaveLength(1);
    expect(text(html(() => <Avatar name="Ïrma" />))).toBe("Ï");
    const pictured = html(() => <Avatar name="Peter" src="/peter.png" size="lg" />);
    expect(tag(pictured, "img")).toMatchObject({ src: "/peter.png", alt: "" });
    expect(tag(pictured, "span")).toMatchObject({ "aria-label": "Peter", "data-size": "lg" });
  });

  test("a flag is drawn at 3:2 and never read", () => {
    const flag = tag(
      html(() => <Flag region="jp" size={18} />),
      "svg"
    );
    expect(flag).toMatchObject({
      width: "18",
      height: "12",
      "data-flag": "jp",
      "aria-hidden": "true"
    });
  });

  test("the theme glyph shows the sun on a dark page and turns only while moving", () => {
    expect(
      tag(
        html(() => <ThemeIcon dark />),
        "svg"
      )
    ).toMatchObject({ "data-dark": "" });
    expect(
      tag(
        html(() => <ThemeIcon dark={false} moving />),
        "svg"
      )["data-moving"]
    ).toBe("");
  });

  test("coins show a tag's or a collection's first five colors in order, and are never read", () => {
    const colors = ["#101010", "#303030", "#505050", "#707070", "#909090", "#b0b0b0"];
    const markup = html(() => <Coins variant="tag" colors={colors} />);
    const [box, ...coins] = tags(markup, "span");
    expect(box).toMatchObject({ "data-coins": "tag", "aria-hidden": "true" });
    expect(coins.map(c => /background:\s*([^;]+)/.exec(c.style ?? "")?.[1])).toEqual(
      colors.slice(0, 5)
    );
    expect(
      tag(
        html(() => <Coins colors={["#ff0000"]} />),
        "span"
      )["data-coins"]
    ).toBe("link");
    expect(
      tags(
        html(() => <Coins variant="row" />),
        "span"
      )
    ).toHaveLength(1);
  });

  test("the wordmark is one image named Grabient, its bar the stops in order", () => {
    const markup = html(() => <Logo stops={["#ff0000", "#00ff00", "#0000ff"]} mode="window" />);
    expect(tag(markup, "svg")).toMatchObject({
      role: "img",
      "aria-label": "Grabient",
      "data-window": ""
    });
    expect(tags(markup, "stop").map(s => [s.offset, s["stop-color"]])).toEqual([
      ["0%", "#ff0000"],
      ["50%", "#00ff00"],
      ["100%", "#0000ff"]
    ]);
    expect(tags(markup, "rect")).toHaveLength(3);
  });
});

describe("copying", () => {
  test("Copy is named for what it copies, and Copied while it says so", () => {
    const rest = html(() => <CopyButton text="kAbc" aria-label="Copy address" />);
    expect(tag(rest, "button")["aria-label"]).toBe("Copy address");
    expect(html(() => <CopyButton text="kAbc" />)).toContain('aria-label="Copy"');
    const copied = html(() => <CopyButton text="kAbc" state="copied" />);
    expect(tag(copied, "button")["aria-label"]).toBe("Copied");
    expect(tag(copied, "path").d).toBe("M20 6 9 17l-5-5");
  });

  test("a color's codes follow a swatch named for it, each a press named for the code it copies", () => {
    const markup = html(() => <ColorCodes hex="#900020" name="burgundy" />);
    expect(tags(markup, "span").find(s => s.role === "img")?.["aria-label"]).toBe("burgundy");
    expect(tags(markup, "button").map(b => b["aria-label"])).toEqual([
      "Copy #900020",
      "Copy rgb(144 0 32)",
      "Copy hsl(347 100% 28%)",
      "Copy oklch(41.3% 0.166 20.8)"
    ]);
    /* a hex alone is named by what people call its color, in the reader's language */
    const alone = html(() => <ColorCodes hex="#000080" />);
    expect(tags(alone, "span").find(s => s.role === "img")?.["aria-label"]).toBe("blue");
  });

  test("a line to copy holds an address in its parts", () => {
    const markup = html(() => (
      <CopyLine text="https://grabient.com/mcp" aria-label="Copy address" />
    ));
    const parts = markup.match(/<span[^>]*>([^<]+)<\/span>/g)?.map(text);
    expect(parts?.slice(0, 3)).toEqual(["https://", "grabient.com", "/mcp"]);
  });

  test("code is numbered by line, its comments marked, an address in its parts", () => {
    const code =
      '// Claude\n{\n  "url": "https://grabient.com/mcp" /* the server\n  */\n}\n<!-- end -->';
    const markup = html(() => <CodeLines code={code} />);
    expect(tag(markup, "pre")).toMatchObject({ dir: "ltr", tabindex: "0", "data-keys": "own" });
    const lines = tags(markup, "span").filter(s => s.style?.startsWith("--indent"));
    expect(lines.map(l => l.style)).toEqual([
      "--indent:0",
      "--indent:0",
      "--indent:2",
      "--indent:2",
      "--indent:0",
      "--indent:0"
    ]);
    const comments = markup.match(/<span[^>]*data-comment[^>]*>.*?<\/span><\/span>/g)?.map(text);
    expect(comments).toEqual(["//", "Claude", "/*", "the", "server", "*/", "<!--", "end", "-->"]);
    expect(markup).toContain('>"https://</span><span class="part">grabient.com<');
  });

  test("code in tabs: the first chosen, its panel labeled by it, and its guide without an address leads nowhere", () => {
    const tabs = [
      {
        label: "Claude",
        code: "claude mcp add",
        where: { text: "Terminal" },
        guide: { label: "Guide" }
      },
      { label: "Cursor", code: "{}", where: { text: ".cursor/mcp.json", path: true } }
    ];
    const markup = html(() => <CodeTabs tabs={tabs} aria-label="Apps" />);
    const tablist = tags(markup, "div").find(d => d.role === "tablist");
    expect(tablist?.["aria-label"]).toBe("Apps");
    const [first, second] = tags(markup, "button").filter(b => b.role === "tab");
    expect([first["aria-selected"], second["aria-selected"]]).toEqual(["true", "false"]);
    expect([first.tabindex, second.tabindex]).toEqual(["0", "-1"]);
    expect(tags(markup, "div").find(d => d.role === "tabpanel")?.["aria-labelledby"]).toBe(
      first.id
    );
    expect(tag(markup, "a")).toMatchObject({ "aria-disabled": "true", target: "_blank" });
    expect(tag(markup, "a").href).toBeUndefined();
    expect(text(markup)).toContain("Terminal");
  });
});

describe("navigation and frames", () => {
  test("skip to content leads to the content's mark", () => {
    expect(
      tag(
        html(() => <SkipLink />),
        "a"
      ).href
    ).toBe("#content");
    expect(text(html(() => <SkipLink />))).toBe("Skip to content");
    expect(
      tag(
        html(() => <SkipTarget />),
        "div"
      )
    ).toMatchObject({ id: "content", tabindex: "-1" });
  });

  test("a link in a list of pages is current, external or off", () => {
    expect(
      tag(
        html(() => (
          <NavLink href="/settings" current>
            Settings
          </NavLink>
        )),
        "a"
      )["aria-current"]
    ).toBe("page");
    const out = html(() => (
      <NavLink href="https://github.com" external current>
        Code
      </NavLink>
    ));
    expect(tag(out, "a")).toMatchObject({ target: "_blank", rel: "noopener noreferrer" });
    expect(tag(out, "a")["aria-current"]).toBeUndefined();
    expect(text(out)).toContain("(opens in a new tab)");
    const off = tag(
      html(() => (
        <NavLink href="/mcp-server" disabled>
          MCP
        </NavLink>
      )),
      "a"
    );
    expect(off.href).toBeUndefined();
    expect(off["aria-disabled"]).toBe("true");
  });

  test("the header's wordmark says where it leads, and the connection's word is read as it changes", () => {
    const markup = html(() => <Header stops={["#000000"]} rule status="Offline" />);
    expect(tag(markup, "a")).toMatchObject({
      href: "/",
      "data-home": "",
      "aria-label": "Grabient, all palettes"
    });
    expect(tags(markup, "span").some(s => s.role === "status")).toBe(true);
    expect(text(markup)).toContain("Offline");
    expect(tags(markup, "div").find(d => "data-off" in d)).toBeUndefined();
    const home = html(() => (
      <Header stops={[]} brand home={{ href: "/palettes?order=saved", label: "Saved palettes" }} />
    ));
    expect(tag(home, "a")["aria-label"]).toBe("Grabient, Saved palettes");
    expect(tags(home, "div").find(d => "data-brand" in d)).toBeDefined();
    expect(tags(home, "div").find(d => "data-off" in d)).toBeDefined();
  });

  test("the footer's links: the current page, another site with its stars, the language menu and a note", () => {
    const markup = html(() => (
      <Footer
        links={[
          { href: "/privacy", label: "Privacy", current: true },
          {
            href: "https://github.com/johnkorzhuk/grabient",
            label: "Code",
            external: true,
            stars: 2049
          }
        ]}
        languages={<button type="button">English</button>}
        note={<span>Terms</span>}
      />
    ));
    expect(tag(markup, "a")["aria-current"]).toBe("page");
    expect(tag(markup, "a", 1).target).toBe("_blank");
    expect(text(markup)).toContain("2k2,049 stars");
    expect(text(markup)).toContain("English");
    expect(tag(markup, "footer")["data-noted"]).toBe("");
  });

  test("a brand page's frame: its navigation, then the frosted pane as the main landmark", () => {
    const markup = html(() => (
      <PageFrame
        nav={[
          { href: "/settings", label: "Settings", current: true },
          { href: "/bindings", label: "Shortcuts", keyboard: true }
        ]}
        all={{ href: "/", label: "Home" }}
        footer={[{ href: "/privacy", label: "Privacy" }]}
      >
        <p>Words</p>
      </PageFrame>
    ));
    expect(tag(markup, "nav")["aria-label"]).toBe("About and account");
    expect(tag(markup, "main")["data-variant"]).toBe("frost");
    expect(tags(markup, "span").find(s => "data-keyboard" in s)).toBeDefined();
    expect(tags(markup, "footer")).toHaveLength(1);
  });

  test("sign-in's frame has no navigation and its sheet is the main landmark", () => {
    const markup = html(() => (
      <PageFrame login footer={[]} note={<span>Terms</span>}>
        <p>Sign in</p>
      </PageFrame>
    ));
    expect(tags(markup, "nav")).toHaveLength(0);
    expect(tag(markup, "main")["data-variant"]).toBeUndefined();
    expect(tag(markup, "div")).toMatchObject({ "data-login": "", "data-noted": "" });
  });

  test("a page root, and the app page around a page that wears the bar", () => {
    expect(html(() => <PageRoot>x</PageRoot>)).toMatch(/^<div[^>]*>x<\/div>$/);
    const app = html(() => (
      <AppPage stops={["#123456"]} corner={<span>corner</span>}>
        <p>list</p>
      </AppPage>
    ));
    expect(app).toContain("<span>corner</span>");
    expect(tags(app, "div").find(d => "data-brand" in d)).toBeUndefined();
    expect(tags(app, "div").find(d => "data-off" in d)).toBeUndefined();
  });

  test("back to top is named for where it leads", () => {
    expect(
      tag(
        html(() => <BackToTop />),
        "button"
      )["aria-label"]
    ).toBe("Back to top");
    const down = html(() => <BackToTop down still />);
    expect(tag(down, "button")["aria-label"]).toBe("Scroll down");
    expect(tag(down, "div")["data-still"]).toBe("");
  });
});
