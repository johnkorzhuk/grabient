import "@grabient/ui/tokens.css";
import "@grabient/ui/tokens-host.css";
import "./base.css";
import { paletteCss } from "@grabient/engine/css.ts";
import {
  isSwatchFormat,
  SWATCH_FILES,
  swatchFile,
  swatchName,
  swatchPalette
} from "@grabient/engine/swatches.ts";
import {
  addCatalog,
  DEFAULT_LOCALE,
  dirOf,
  isLocale,
  type Locale,
  locale,
  negotiateLocale,
  setLocaleSource,
  t
} from "@grabient/i18n";
import { syncMotion } from "@grabient/ui/motion.ts";
import { PageRoot } from "@grabient/ui/PageRoot.tsx";
import { render } from "@solidjs/web";
import { createSignal } from "solid-js";
import { createBridge, object, type Params, Refused } from "./bridge.ts";
import { base64Of, pngBase64 } from "./copies.ts";
import { type DownloadFormat, type Mode, PaletteView } from "./PaletteView.tsx";
import { APPS_PROTOCOL, MESSAGES_ID } from "./page.ts";
import {
  chosenWords,
  fileUrl,
  nameOf,
  paletteUrl,
  sheetFromResult,
  stopsOf,
  svgOf,
  type Tile,
  tilesFromArguments
} from "./tiles.ts";

/* The view's page: it speaks the bridge with the app it is drawn in, follows the app's theme, type, language, display
   mode and safe area, and hands PaletteView the palettes, from the call's arguments at once, then from the answer.
   Nothing is fetched: links and files go through the app where it offers them, and the app's model is told which
   palette a person chose in full screen. Where the app sends no palettes, the view says so in the card's place. */

const page = document.documentElement;

/* the words: every language's catalog for what the view says, written into the page by its build */
try {
  const catalogs = object(JSON.parse(document.getElementById(MESSAGES_ID)?.textContent || "{}"));
  for (const [tag, catalog] of Object.entries(catalogs))
    if (isLocale(tag)) addCatalog(tag, object(catalog) as Record<string, string>);
} catch {
  /* a page without its words reads in English */
}
const languageOf = (tag: unknown): Locale =>
  (typeof tag === "string" && negotiateLocale(tag)) || DEFAULT_LOCALE;
/* the app's language once it says it, the browser's until then; a signal, so the words follow a change */
const [language, setLanguageSignal] = createSignal<Locale>(languageOf(navigator.language));
setLocaleSource(language);
const setLanguage = (next: Locale) => {
  setLanguageSignal(next);
  page.lang = next;
  page.dir = dirOf(next);
};
setLanguage(languageOf(navigator.language));

/* the app's theme: html[data-host] points the tokens at its variables, with Grabient's values where it passes none.
   The frame's color scheme follows it, or a browser paints the frame opaque over an app in the other scheme */
const setTheme = (theme: "light" | "dark") => {
  page.dataset.theme = theme;
  page.style.colorScheme = theme;
};
setTheme(matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark");
syncMotion();

/* the site the palettes link to: the answer's, else the one the Worker wrote into the page */
const written =
  document.querySelector<HTMLMetaElement>('meta[name="grabient-origin"]')?.content ?? "";
const [origin, setOrigin] = createSignal(/^https?:\/\/[^/\s]+$/.test(written) ? written : "");
const [tiles, setTiles] = createSignal<Tile[] | null>(null);
const [mode, setMode] = createSignal<Mode>("inline");
const [modes, setModes] = createSignal<readonly string[]>([]);
const [capabilities, setCapabilities] = createSignal<Params>({});
const [selected, setSelected] = createSignal(0);
/* the answer's tiles stand once they arrive: arguments seen later never repaint them */
let confirmed = false;

/** Takes what the app says of itself; a change carries only what changed. */
function hostContext(change: Params) {
  if (change.theme === "light" || change.theme === "dark") setTheme(change.theme);
  const variables = object(object(change.styles).variables);
  for (const [name, value] of Object.entries(variables))
    if (name.startsWith("--") && typeof value === "string") page.style.setProperty(name, value);
  if (typeof change.locale === "string") setLanguage(languageOf(change.locale));
  if (change.displayMode === "inline" || change.displayMode === "fullscreen")
    setMode(change.displayMode);
  if (Array.isArray(change.availableDisplayModes))
    setModes(change.availableDisplayModes.filter((m): m is string => typeof m === "string"));
  /* nothing to press may sit under the app's own bars */
  const insets = object(change.safeAreaInsets);
  for (const side of ["top", "right", "bottom", "left"] as const)
    if (side in insets)
      page.style.setProperty(`--inset-${side}`, `${Math.max(0, Number(insets[side]) || 0)}px`);
}

const framed = window.parent !== window;
const bridge = createBridge();
/* A view that hears nothing never stays a blank block: where the app leaves the handshake unanswered, or sends neither
   the call's palettes nor its answer within a few seconds, a sentence and the site take the block's place. The view
   still listens and draws what arrives late. A page outside any app has nothing to wait for. */
const QUIET_MS = 5000;
const [silent, setSilent] = createSignal(!framed);
let quiet: ReturnType<typeof setTimeout> | undefined;
/** Starts the wait over while there is nothing to draw: the app said something, so the palettes may follow. */
function wait() {
  clearTimeout(quiet);
  if (tiles()) return;
  setSilent(false);
  quiet = setTimeout(() => setSilent(true), QUIET_MS);
}
const show = (next: Tile[]) => {
  clearTimeout(quiet);
  setTiles(next);
};
bridge.answer("ping", () => ({}));
bridge.answer("ui/resource-teardown", () => ({}));
/* arguments still being written say the call is on its way */
bridge.on("ui/notifications/tool-input-partial", wait);
bridge.on("ui/notifications/tool-input", params => {
  if (confirmed) return;
  const asked = tilesFromArguments(params.arguments);
  /* arguments the view will not paint leave the answer to wait for */
  if (asked) show(asked);
  else wait();
});
bridge.on("ui/notifications/tool-result", params => {
  const sheet = sheetFromResult(params);
  /* a refusal keeps what the arguments painted; with nothing painted, it says so */
  if (!sheet) {
    if (!tiles()) show([]);
    return;
  }
  confirmed = true;
  show(sheet.tiles);
  if (sheet.origin) setOrigin(sheet.origin);
  setSelected(at => Math.min(at, sheet.tiles.length - 1));
});
bridge.on("ui/notifications/tool-cancelled", () => {
  if (!tiles()) show([]);
});
bridge.on("ui/notifications/host-context-changed", hostContext);

/** Asks the app for a display mode it offers, and shows the one it answers with. */
async function changeMode(next: Mode, index?: number) {
  if (index !== undefined) setSelected(index);
  if (!modes().includes(next)) return;
  try {
    const answer = await bridge.request("ui/request-display-mode", { mode: next });
    if (answer.mode === "inline" || answer.mode === "fullscreen") setMode(answer.mode);
  } catch {
    /* the app keeps the mode it has */
  }
}
/** Opens an address through the app where it opens links; elsewhere the link opens itself. */
const openLink = (url: string): boolean => {
  if (!capabilities().openLinks) return false;
  bridge.request("ui/open-link", { url }).catch(() => undefined);
  return true;
};
/** Hands the app a file to save with its content inside the request, written or drawn here: a link would leave the
    fetching to the app, and Claude's saves nothing from one. Where the PNG cannot be drawn its address opens instead,
    as any file's does in an app that saves none. Any other no (the person declined, or the app would not) is the
    answer, and nothing else opens. */
async function download(tile: Tile, format: DownloadFormat) {
  const openFile = () => {
    openLink(fileUrl(origin(), tile, format));
  };
  if (!capabilities().downloadFile) {
    openFile();
    return;
  }
  const uri = `file:///grabient-${tile.seed}.${format}`;
  const stops = stopsOf(tile);
  let resource: Params;
  if (isSwatchFormat(format)) {
    const words = { t, locale: locale() };
    const palette = swatchPalette(tile.seed, tile, origin(), {
      name: nameOf(tile, words),
      language: words
    });
    if (!palette) {
      openFile();
      return;
    }
    const file = swatchFile(format, [palette]);
    resource = {
      uri: `file:///${encodeURIComponent(swatchName(palette.name, format))}`,
      mimeType: SWATCH_FILES[format].type.split(";")[0],
      ...(typeof file === "string" ? { text: file } : { blob: base64Of(file) })
    };
  } else if (format === "png") {
    const blob = await pngBase64(tile).catch(() => null);
    if (blob === null) {
      openFile();
      return;
    }
    resource = { uri, mimeType: "image/png", blob };
  } else
    resource =
      format === "svg"
        ? { uri, mimeType: "image/svg+xml", text: svgOf(stops, tile, origin()) }
        : { uri, mimeType: "text/css", text: paletteCss(stops, tile, paletteUrl(origin(), tile)) };
  try {
    await bridge.request("ui/download-file", { contents: [{ type: "resource", resource }] });
  } catch (error) {
    if (error instanceof Refused && error.code === -32601) openFile();
  }
}

/* how long a choice rests before it is told: a drag of steps or angle is one choice, the value it stops at */
const REST_MS = 400;
let takesContext = true;
let resting: ReturnType<typeof setTimeout> | undefined;
/** Tells the app's model which palette a person chose in full screen, as it is drawn now: one text block, which the
    next replaces, so "make this one warmer" names a palette. Nothing else is asked of the app, so the view stays read
    only. An app that answers with an error is not told again. */
function tell(tile: Tile) {
  clearTimeout(resting);
  if (!takesContext) return;
  resting = setTimeout(() => {
    bridge
      .request("ui/update-model-context", {
        content: [{ type: "text", text: chosenWords(tile, origin()) }]
      })
      .catch(() => {
        takesContext = false;
      });
  }, REST_MS);
}

/** Tells the app the page's size whenever its height changes, so an inline frame fits it; never zero, since the view
    always draws at least the still block of a card on its way. */
function reportSize() {
  let last = "";
  let frame = 0;
  const measure = () => {
    frame = 0;
    const before = page.style.height;
    page.style.height = "max-content";
    const height = Math.ceil(page.getBoundingClientRect().height);
    const width = Math.ceil(window.innerWidth);
    page.style.height = before;
    if (!height || `${width}x${height}` === last) return;
    last = `${width}x${height}`;
    bridge.notify("ui/notifications/size-changed", { width, height });
  };
  const later = () => {
    if (!frame) frame = requestAnimationFrame(measure);
  };
  const observer = new ResizeObserver(later);
  observer.observe(page);
  observer.observe(document.body);
  later();
}

render(
  () => (
    <PageRoot bare>
      <PaletteView
        tiles={tiles()}
        silent={silent()}
        origin={origin()}
        mode={mode()}
        fullscreen={modes().includes("fullscreen")}
        inline={modes().includes("inline")}
        download={!!capabilities().downloadFile}
        selected={selected()}
        onSelect={index => setSelected(index)}
        onChoose={tell}
        onMode={(next, index) => void changeMode(next, index)}
        onOpen={openLink}
        onDownload={(tile, format) => void download(tile, format)}
      />
    </PageRoot>
  ),
  document.getElementById("view")!
);

if (framed) {
  /* the handshake's own wait, which its answer starts over for the palettes */
  wait();
  bridge
    .request("ui/initialize", {
      appInfo: { name: "Grabient", version: "1.0.0" },
      appCapabilities: { availableDisplayModes: ["inline", "fullscreen"] },
      protocolVersion: APPS_PROTOCOL
    })
    .then(answer => {
      setCapabilities(object(answer.hostCapabilities));
      hostContext(object(answer.hostContext));
      bridge.notify("ui/notifications/initialized", {});
      reportSize();
      wait();
    })
    /* an app that refuses the handshake sends no palettes */
    .catch(() => {
      clearTimeout(quiet);
      setSilent(true);
    });
}
