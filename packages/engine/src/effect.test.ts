import { expect, test } from "vitest";
import { AURORA_DESIGNED_PATH } from "./aurora-path.ts";
import {
  blobShapeOf,
  blobStillKey,
  CLEAR_GROUND,
  canRoam,
  EFFECT_FPS,
  EFFECT_KINDS,
  EFFECT_LOOK,
  EFFECTS,
  EMBED_PLAYING,
  effectAddressParts,
  effectAutoAngle,
  effectBare,
  effectFileAddress,
  effectFinish,
  effectGround,
  effectLook,
  effectPath,
  effectSteps,
  effectStillParts,
  effectZoom,
  fxLookOf,
  fxStillKey,
  groundHex,
  groundParts,
  hasFigma,
  isEffect,
  loops,
  parseEffect,
  pastesToFigma,
  readBlobStillKey,
  SHAPE_MAX,
  takesShape
} from "./effect.ts";
import { effectStepsShown } from "./effect-code.ts";
import { effectEmbedHtml, effectLayerCss, effectRuleCss } from "./effect-embed.ts";
import { readFxStillKey } from "./fx-still.ts";
import { glassStillKey, readStillKey } from "./glass-colors.ts";

const SEED = "kWTATrcQ7MeMxv1MwbbLKq84";
/* a look with a ground, which an effect that takes none never writes */
const EFFECT_LOOK_BG = {
  shape: null,
  frost: 1,
  bg: "#ffffff",
  steps: null,
  zoom: null,
  path: null
};
const effect = (query: string) => {
  const found = parseEffect(new URLSearchParams(query));
  if (!found) throw new Error(`no effect in ${query}`);
  return found;
};

test("an effect's address names its style, the glass's angle off its default, its pace, its frames a second and its look", () => {
  expect(effectAddressParts(effect("style=glass"), 90)).toEqual(["style=glass"]);
  // 60 frames a second unless it says
  expect(effect("style=glass").fps).toBe(EFFECT_FPS.default);
  expect(effectAddressParts(effect("style=glass&speed=2.45&fps=60"), 135)).toEqual([
    "style=glass",
    "angle=135",
    "speed=2.45"
  ]);
  expect(effectAddressParts(effect("style=glass&fps=120&shape=12"), 90)).toEqual([
    "style=glass",
    "fps=120",
    "shape=12"
  ]);
  expect(effect("style=glass&fps=500").fps).toBe(120);
  expect(effect("style=glass&fps=0").fps).toBe(60);
  // the glass's shape 0 is the glass as designed, as none is
  expect(effect("style=glass&shape=0").look.shape).toBeNull();
  // the blob has no angle, its palette lying from left to right; its old depth and fill are no more
  expect(
    effectAddressParts(effect("style=blob&fill=1&depth=0&bg=%2310101480&shape=12&frost=0.5"), 135)
  ).toEqual(["style=blob", "frost=0.5", "shape=12", "bg=%2310101480"]);
  expect(effectStillParts(effect("style=blob&shape=12"), 135)).toEqual(["style=blob", "shape=12"]);
  expect(effect("style=blob&bg=deep").look.bg).toBeNull();
});

test("a style that is no effect's names none: a gradient's, any other word, and an effect the site plays no more", () => {
  const read = (query: string) => parseEffect(new URLSearchParams(query));
  /* the zen garden (style=zen) was a field effect on staging from 8 to 10 Nov 2026: an address or a saved look that
     still names it is read as one naming no effect, whatever settings it goes on to say */
  for (const style of ["linearGradient", "wobble", "zen", "Glass", "demo", ""]) {
    expect(isEffect(style), style).toBe(false);
    expect(read(`style=${style}`), style).toBeNull();
    expect(read(`style=${style}&angle=30&speed=2&steps=12&shape=7&bg=%23ffffff`), style).toBeNull();
  }
  expect(read("shape=7&speed=2")).toBeNull();
  expect(isEffect(null)).toBe(false);
  for (const kind of EFFECTS) expect(read(`style=${kind}`)?.kind, kind).toBe(kind);
});

test("the blob takes no soft, its frost softening it: its address, its still's name and its files' name its grain alone", () => {
  expect(EFFECT_KINDS.blob.soft).toBe(false);
  const finish = { soft: 30, grain: 20 };
  expect(effectFinish("blob", finish)).toEqual({ grain: 20 });
  expect(effectFinish("blob", { soft: 30 })).toEqual({});
  expect(effectFinish("glass", finish)).toEqual(finish);
  const blob = effect("style=blob&shape=12");
  expect(effectAddressParts(blob, 90, finish)).toEqual(["style=blob", "grain=20", "shape=12"]);
  expect(effectStillParts(blob, 90, finish)).toEqual(["style=blob", "grain=20", "shape=12"]);
  expect(effectFileAddress("https://o", SEED, blob, 90, "css", undefined, finish)).toBe(
    `https://o/${SEED}.css?style=blob&grain=20&shape=12`
  );
  expect(effectAddressParts(effect("style=silk"), 90, finish)).toEqual([
    "style=silk",
    "soft=30",
    "grain=20"
  ]);
});

test("the sandstone takes steps, 8 to 40, its look's, none at its designed 28; every other effect takes none", () => {
  expect(EFFECT_KINDS.strata.steps).toEqual({ least: 8, most: 40, designed: 28 });
  for (const kind of EFFECTS.filter(other => other !== "strata"))
    expect(EFFECT_KINDS[kind].steps, kind).toBeNull();
  /* read from `steps`, clamped to its range; a longer number or a word is none, as a shape's */
  expect(effect("style=strata&steps=12").look.steps).toBe(12);
  expect(effect("style=strata&steps=28").look.steps).toBeNull();
  expect(effect("style=strata&steps=3").look.steps).toBe(8);
  expect(effect("style=strata&steps=400").look.steps).toBe(40);
  expect(effect("style=strata&steps=1234").look.steps).toBeNull();
  expect(effect("style=strata&steps=12.5").look.steps).toBeNull();
  expect(effect("style=strata").look.steps).toBeNull();
  expect(effect("style=papercut&steps=12").look.steps).toBeNull();
  expect(effect("style=blob&steps=12").look.steps).toBeNull();
  /* written among its look's parts, before its shape, in its still's name and its files' */
  expect(effectAddressParts(effect("style=strata&shape=7&steps=12&speed=2"), 45)).toEqual([
    "style=strata",
    "angle=45",
    "speed=2",
    "steps=12",
    "shape=7"
  ]);
  expect(effectStillParts(effect("style=strata&steps=12&speed=2"), 90)).toEqual([
    "style=strata",
    "steps=12"
  ]);
  expect(
    effectFileAddress("https://x.test", SEED, effect("style=strata&steps=40"), 90, "css")
  ).toBe(`https://x.test/${SEED}.css?style=strata&steps=40`);
  /* a look stored or asked, its steps those its kind takes */
  expect(effectLook({ steps: 12 }, "strata").steps).toBe(12);
  expect(effectLook({ steps: 28 }, "strata").steps).toBeNull();
  expect(effectLook({ steps: 12 }, "papercut").steps).toBeNull();
  expect(effectLook({ steps: 12 }).steps).toBeNull();
  expect(effectSteps("strata", "nonsense")).toBeNull();
  expect(effectStepsShown("strata", { steps: null })).toBe(28);
  expect(effectStepsShown("strata", { steps: 9 })).toBe(9);
  expect(effectStepsShown("papercut", { steps: null })).toBeNull();
  /* a still is named by its steps where its look names them, as it was where it names none */
  const look = { angle: 90, shape: null, steps: null, zoom: null, path: null, bg: null };
  expect(fxStillKey("strata", SEED, look)).toBe(`strata|${SEED}|90|`);
  expect(fxStillKey("strata", SEED, { ...look, steps: 12 })).toBe(`strata|${SEED}|90||12`);
  expect(fxLookOf(effect("style=strata&steps=12&shape=3").look, 30)).toEqual({
    angle: 30,
    shape: 3,
    steps: 12,
    zoom: null,
    path: null,
    bg: null
  });
});

test("the dimple takes a zoom in its shape's place, 1 to 4, none as designed; every other effect no zoom, and a shape", () => {
  /* John, 10 Nov 2026, of its shapes 0 to 999: "theres barely any difference", then "lets repalce shape with a zoom
     option for this style" */
  expect(EFFECT_KINDS.dimple.zoom).toEqual({ least: 1, most: 4, designed: 1 });
  expect(takesShape("dimple")).toBe(false);
  for (const kind of EFFECTS.filter(other => other !== "dimple")) {
    expect(EFFECT_KINDS[kind].zoom, kind).toBeNull();
    expect(takesShape(kind), kind).toBe(true);
  }
  /* read from `zoom`, two decimals, clamped to its range; a word is none */
  expect(effect("style=dimple&zoom=2.5").look.zoom).toBe(2.5);
  expect(effect("style=dimple&zoom=2.456").look.zoom).toBe(2.46);
  expect(effect("style=dimple&zoom=1").look.zoom).toBeNull();
  expect(effect("style=dimple&zoom=1.00").look.zoom).toBeNull();
  expect(effect("style=dimple&zoom=0.5").look.zoom).toBeNull();
  expect(effect("style=dimple&zoom=9").look.zoom).toBe(4);
  expect(effect("style=dimple&zoom=big").look.zoom).toBeNull();
  expect(effect("style=dimple&zoom=-2").look.zoom).toBeNull();
  expect(effect("style=dimple").look.zoom).toBeNull();
  expect(effect("style=papercut&zoom=2").look.zoom).toBeNull();
  expect(effect("style=blob&zoom=2").look.zoom).toBeNull();
  /* its shape is none, whatever an address or a save says */
  expect(effect("style=dimple&shape=417").look.shape).toBeNull();
  expect(effectLook({ shape: 417, zoom: 3 }, "dimple")).toEqual({ ...EFFECT_LOOK, zoom: 3 });
  /* written among its look's parts in its shape's place, in its still's name and its files' */
  expect(effectAddressParts(effect("style=dimple&shape=7&zoom=2.5&speed=2"), 45)).toEqual([
    "style=dimple",
    "angle=45",
    "speed=2",
    "zoom=2.5"
  ]);
  expect(effectStillParts(effect("style=dimple&zoom=4&speed=2"), 90)).toEqual([
    "style=dimple",
    "zoom=4"
  ]);
  expect(effectFileAddress("https://x.test", SEED, effect("style=dimple&zoom=3"), 90, "svg")).toBe(
    `https://x.test/${SEED}.svg?style=dimple&zoom=3`
  );
  /* a look stored or asked, its zoom one its kind takes */
  expect(effectLook({ zoom: 2.5 }, "dimple").zoom).toBe(2.5);
  expect(effectLook({ zoom: 1 }, "dimple").zoom).toBeNull();
  expect(effectLook({ zoom: 2.5 }, "papercut").zoom).toBeNull();
  expect(effectLook({ zoom: 2.5 }).zoom).toBeNull();
  expect(effectZoom("dimple", "nonsense")).toBeNull();
  /* a still is named by its zoom where its look names one, and read back */
  const look = { angle: 90, shape: null, steps: null, zoom: 2.5, path: null, bg: null };
  expect(fxStillKey("dimple", SEED, look)).toBe(`dimple|${SEED}|90||2.5x`);
  expect(readFxStillKey(`dimple|${SEED}|90||2.5x`)?.look).toEqual(look);
  expect(readFxStillKey(`dimple|${SEED}|90||9x`)).toBeNull();
  expect(readFxStillKey(`papercut|${SEED}|90||2.5x`)).toBeNull();
  expect(fxStillKey("dimple", SEED, { ...look, zoom: null })).toBe(`dimple|${SEED}|90|`);
});

test("the dimple roams where its address says roam=1, the one effect the pointer moves; while it roams it has a loop, and Figma's timeline plays it", () => {
  /* John, 11 Nov 2026: "a toggle for making this style do a subtle animation as if the cursor was roaming around on
     the on canvas isntead of static + follows cursor? Try to get something that can be exported as a figma clipboard
     copy" */
  expect(EFFECTS.filter(canRoam)).toEqual(["dimple"]);
  expect(effect("style=dimple").roam).toBeUndefined();
  expect(effect("style=dimple&roam=1").roam).toBe(true);
  /* only 1 turns it on, and only for an effect the pointer moves */
  for (const said of ["0", "true", "yes", "2", ""])
    expect(effect(`style=dimple&roam=${said}`).roam, said).toBeUndefined();
  for (const kind of EFFECTS.filter(other => !canRoam(other)))
    expect(effect(`style=${kind}&roam=1`).roam, kind).toBeUndefined();
  /* written after how it plays and before its look; no part of its still's name, which the roam's first frame is */
  expect(effectAddressParts(effect("style=dimple&zoom=2&roam=1&speed=2&fps=30"), 45)).toEqual([
    "style=dimple",
    "angle=45",
    "speed=2",
    "fps=30",
    "roam=1",
    "zoom=2"
  ]);
  expect(effectStillParts(effect("style=dimple&roam=1&zoom=2"), 90)).toEqual([
    "style=dimple",
    "zoom=2"
  ]);
  expect(effectAddressParts(effect("style=papercut&roam=1"), 90)).toEqual(["style=papercut"]);
  /* what plays by itself: every effect with a loop, and the dimple only while it roams */
  for (const kind of EFFECTS.filter(other => !canRoam(other)))
    expect(loops(effect(`style=${kind}`)), kind).toBe(true);
  expect(loops(effect("style=dimple"))).toBe(false);
  expect(loops(effect("style=dimple&roam=1"))).toBe(true);
  /* Copy for Figma, where Figma's timeline plays the effect: the dimple's only while it roams */
  expect(hasFigma("dimple")).toBe(true);
  expect(pastesToFigma(effect("style=dimple"))).toBe(false);
  expect(pastesToFigma(effect("style=dimple&roam=1"))).toBe(true);
  expect(pastesToFigma(effect("style=silk"))).toBe(true);
  expect(pastesToFigma(effect("style=papercut"))).toBe(false);
});

test("the aurora stands upright where no angle is set for it, at 90, where every other effect is turned by its palette's own", () => {
  /* John, 11 Nov 2026, of the aurora lying on its side at a palette's own angle: "make auto 90 deg for this one" */
  expect(EFFECTS.filter(kind => EFFECT_KINDS[kind].upright)).toEqual(["aurora"]);
  expect(effectAutoAngle("aurora", 45)).toBe(90);
  expect(effectAutoAngle("aurora", 0)).toBe(90);
  for (const kind of EFFECTS.filter(other => other !== "aurora"))
    expect(effectAutoAngle(kind, 45), kind).toBe(45);
  /* an angle set for it turns it as any other, and its address names it; at 90 it names none */
  expect(effect("style=aurora&angle=45")).not.toBeNull();
  expect(effectAddressParts(effect("style=aurora"), 45)).toEqual(["style=aurora", "angle=45"]);
  expect(effectAddressParts(effect("style=aurora"), 90)).toEqual(["style=aurora"]);
});

test("the aurora takes a path beside its shape, none as designed; every other effect none", () => {
  /* John, 10 Nov 2026: "what if we made the path that cuts off the aura effect url encodable?"; and of its shape, 13
     Nov 2026: "making it a normal 0-999 seed like the others" */
  expect(EFFECT_KINDS.aurora.path).toBe(true);
  expect(takesShape("aurora")).toBe(true);
  for (const kind of EFFECTS.filter(other => other !== "aurora"))
    expect(EFFECT_KINDS[kind].path, kind).toBe(false);
  /* read from `path`, its commas and colons as they are or escaped */
  const walled = "line,0:30,20:30,20:55,35:55,35:38,100:38";
  expect(effect(`style=aurora&path=${walled}`).look.path).toBe(walled);
  expect(effect(`style=aurora&path=${encodeURIComponent(walled)}`).look.path).toBe(walled);
  /* kept in its one spelling: no ".0", a word only where the joining changes, places only where they are not the
     even spacing's */
  expect(effect("style=aurora&path=line,33.0,33").look.path).toBe("line,33,33");
  expect(effect("style=aurora&path=line,25,25,line,40").look.path).toBe("line,25,25,40");
  expect(effect("style=aurora&path=line,0:10,50:20,100:30").look.path).toBe("line,10,20,30");
  expect(effect("style=aurora&path=curve,30,55,35,60,30").look.path).toBe("curve,30,55,35,60,30");
  /* the designed range is none, and so is anything that is no path */
  expect(effect(`style=aurora&path=${AURORA_DESIGNED_PATH}`).look.path).toBeNull();
  expect(effect("style=aurora&path=mountains").look.path).toBeNull();
  expect(effect("style=aurora&path=line,33").look.path).toBeNull();
  expect(effect("style=aurora&path=").look.path).toBeNull();
  expect(effect("style=aurora").look.path).toBeNull();
  expect(effect(`style=papercut&path=${walled}`).look.path).toBeNull();
  expect(effect(`style=blob&path=${walled}`).look.path).toBeNull();
  /* its shape is a number 0 to 999 as every other effect's, 0 as designed, which none is too */
  expect(effect("style=aurora&shape=417").look.shape).toBe(417);
  expect(effect("style=aurora&shape=0").look.shape).toBeNull();
  expect(effect("style=aurora&shape=1000").look.shape).toBeNull();
  expect(effectLook({ shape: 417, path: walled }, "aurora")).toEqual({
    ...EFFECT_LOOK,
    shape: 417,
    path: walled
  });
  /* written among its look's parts after its shape, before its ground, in its still's name and its files' */
  expect(
    effectAddressParts(effect(`style=aurora&bg=%23102030&path=${walled}&shape=7&speed=2`), 45)
  ).toEqual(["style=aurora", "angle=45", "speed=2", "shape=7", `path=${walled}`, "bg=%23102030"]);
  expect(effectStillParts(effect(`style=aurora&path=${walled}&speed=2`), 90)).toEqual([
    "style=aurora",
    `path=${walled}`
  ]);
  expect(effectStillParts(effect(`style=aurora&shape=417&path=${walled}&speed=2`), 90)).toEqual([
    "style=aurora",
    "shape=417",
    `path=${walled}`
  ]);
  expect(
    effectFileAddress("https://x.test", SEED, effect(`style=aurora&path=${walled}`), 90, "svg")
  ).toBe(`https://x.test/${SEED}.svg?style=aurora&path=${walled}`);
  /* a look stored or asked, its path one its kind takes */
  expect(effectLook({ path: walled }, "aurora").path).toBe(walled);
  expect(effectLook({ path: "line,33.0,33" }, "aurora").path).toBe("line,33,33");
  expect(effectLook({ path: AURORA_DESIGNED_PATH }, "aurora").path).toBeNull();
  expect(effectLook({ path: walled }, "papercut").path).toBeNull();
  expect(effectLook({ path: walled }).path).toBeNull();
  expect(effectPath("aurora", 12)).toBeNull();
  /* a still is named by its path where its look names one, before its ground, and read back */
  const look = { angle: 90, shape: null, steps: null, zoom: null, path: walled, bg: "#10203080" };
  expect(fxStillKey("aurora", SEED, look)).toBe(`aurora|${SEED}|90||${walled}|#10203080`);
  expect(readFxStillKey(`aurora|${SEED}|90||${walled}|#10203080`)?.look).toEqual(look);
  expect(readFxStillKey(`aurora|${SEED}|90||${walled}`)?.look).toEqual({ ...look, bg: null });
  expect(readFxStillKey(`aurora|${SEED}|90||#10203080`)?.look).toEqual({ ...look, path: null });
  expect(fxStillKey("aurora", SEED, { ...look, path: null, bg: null })).toBe(`aurora|${SEED}|90|`);
  expect(fxStillKey("aurora", SEED, { ...look, shape: 417 })).toBe(
    `aurora|${SEED}|90|417|${walled}|#10203080`
  );
  expect(readFxStillKey(`aurora|${SEED}|90|417|${walled}|#10203080`)?.look).toEqual({
    ...look,
    shape: 417
  });
  /* no page wrote a name whose path is another spelling, the designed range, no path, or another kind's */
  expect(readFxStillKey(`aurora|${SEED}|90||line,33.0,33`)).toBeNull();
  expect(readFxStillKey(`aurora|${SEED}|90||${AURORA_DESIGNED_PATH}`)).toBeNull();
  expect(readFxStillKey(`aurora|${SEED}|90||line,33`)).toBeNull();
  expect(readFxStillKey(`papercut|${SEED}|90||${walled}`)).toBeNull();
  /* its range's ground is as the blob's: none is clear, the page through it, and so is a wholly clear one */
  expect(EFFECT_KINDS.aurora.ground).toBe("clear");
  expect(effect("style=aurora&bg=%23ffffff80").look.bg).toBe("#ffffff80");
  expect(effect("style=aurora&bg=00000000").look.bg).toBeNull();
  expect(effectBare("aurora", effect("style=aurora").look)).toBe(true);
  expect(effectBare("aurora", effect("style=aurora&bg=%23ffffff80").look)).toBe(true);
  expect(effectBare("aurora", effect("style=aurora&bg=%23ffffff").look)).toBe(false);
});

test("a shape is a number from 0 to 999 for both effects: a longer one is none, a stored one comes into bounds", () => {
  expect(SHAPE_MAX).toBe(999);
  for (const kind of ["glass", "blob"]) {
    expect(effect(`style=${kind}&shape=999`).look.shape).toBe(999);
    // never folded into another shape, which would give one picture two addresses
    expect(effect(`style=${kind}&shape=1000`).look.shape).toBeNull();
    expect(effect(`style=${kind}&shape=0999`).look.shape).toBeNull();
  }
  expect(effectLook({ shape: 3857 }).shape).toBe(999);
  expect(effectLook({ shape: -3 }).shape).toBe(0);
  // a still is named for a shape in bounds, as a page writes it
  expect(readBlobStillKey(`${SEED}|1|999|`)?.look.shape).toBe(999);
  expect(readBlobStillKey(`${SEED}|1|1000|`)).toBeNull();
  expect(readStillKey(glassStillKey(["#000000", "#ffffff"], 90, 999))?.shape).toBe(999);
  expect(readStillKey("90|1000|#000000,#ffffff")).toBeNull();
});

test("a palette suggests its blob a shape from 0 to 999, the same each time", () => {
  for (let i = 0; i < 2000; i++) {
    const shape = blobShapeOf(`k${i.toString(36)}`);
    expect(Number.isInteger(shape) && shape >= 0 && shape <= SHAPE_MAX).toBe(true);
  }
  // the last three digits of 9051, its suggestion while there were 10,000 shapes
  expect(blobShapeOf(SEED)).toBe(51);
});

test("a ground is hex, its alpha kept where it lets something through", () => {
  expect(groundHex("FFF")).toBe("#ffffff");
  expect(groundHex("#ff000080")).toBe("#ff000080");
  expect(groundHex("f008")).toBe("#ff000088");
  expect(groundHex("#123456ff")).toBe("#123456");
  expect(groundHex("#12345600")).toBeNull();
  expect(groundHex("red")).toBeNull();
  expect(groundHex(" #ABCDEF ")).toBe("#abcdef");
  expect(groundParts("#ff000080")).toEqual({ hex: "#ff0000", alpha: 128 / 255 });
  expect(groundParts("#ff0000")).toEqual({ hex: "#ff0000", alpha: 1 });
});

test("one fact says which effects take a ground and what none is: the blob's and the aurora's range's clear, the strings' their designed one", () => {
  expect(EFFECT_KINDS.blob.ground).toBe("clear");
  expect(EFFECT_KINDS.strings.ground).toBe("designed");
  expect(EFFECT_KINDS.aurora.ground).toBe("clear");
  expect(EFFECTS.filter(kind => EFFECT_KINDS[kind].ground)).toEqual(["blob", "strings", "aurora"]);
  /* a ground written as hex, kept as an address keeps it; a clear one is the strings' own, and the blob's none */
  expect(effectGround("strings", "F4EFE6")).toBe("#f4efe6");
  expect(effectGround("strings", "#10203080")).toBe("#10203080");
  expect(effectGround("strings", "#102030ff")).toBe("#102030");
  expect(effectGround("strings", "#00000000")).toBe(CLEAR_GROUND);
  expect(effectGround("strings", "#ff000000")).toBe(CLEAR_GROUND);
  expect(effectGround("strings", "f000")).toBe(CLEAR_GROUND);
  expect(effectGround("blob", "#ff000000")).toBeNull();
  expect(effectGround("blob", "#ff000080")).toBe("#ff000080");
  expect(effectGround("aurora", "#ff000000")).toBeNull();
  expect(effectGround("aurora", "#ff000080")).toBe("#ff000080");
  /* words are the Worker's to write as hex first (server/pipeline.ts), and an effect with no ground keeps none */
  expect(effectGround("strings", "navy")).toBeNull();
  expect(effectGround("strings", null)).toBeNull();
  for (const kind of ["glass", "silk", "rosette", "papercut", "strata"] as const)
    expect(effectGround(kind, "#ffffff")).toBeNull();
});

test("the strings' address takes their ground, after their shape, and reads it back; none is their designed one", () => {
  expect(effect("style=strings").look.bg).toBeNull();
  for (const [bg, kept] of [
    ["%23f4efe6", "#f4efe6"],
    ["%2310203080", "#10203080"],
    ["%2300000000", CLEAR_GROUND],
    ["%23ff000000", CLEAR_GROUND],
    ["fff", "#ffffff"]
  ] as const) {
    const fx = effect(`style=strings&shape=12&bg=${bg}`);
    expect(fx.look.bg, bg).toBe(kept);
    const parts = effectAddressParts(fx, 135, { soft: 20 });
    expect(parts).toEqual([
      "style=strings",
      "angle=135",
      "soft=20",
      "shape=12",
      `bg=${kept.replace("#", "%23")}`
    ]);
    expect(effect(parts.join("&")).look).toEqual(fx.look);
    /* the still, the files and the cards are named by it too */
    expect(effectStillParts(fx, 135).at(-1)).toBe(`bg=${kept.replace("#", "%23")}`);
  }
  expect(effectAddressParts(effect("style=strings&bg=%23ffffff&speed=2"), 90)).toEqual([
    "style=strings",
    "speed=2",
    "bg=%23ffffff"
  ]);
  /* an effect that takes no ground leaves one out, read and written */
  for (const kind of ["glass", "silk", "rosette", "papercut", "strata"] as const) {
    expect(effect(`style=${kind}&bg=%23ffffff`).look.bg, kind).toBeNull();
    expect(
      effectAddressParts({ ...effect(`style=${kind}`), look: { ...EFFECT_LOOK_BG } }, 90).join("&"),
      kind
    ).not.toContain("bg=");
  }
  /* a look stored or asked keeps the ground its kind takes */
  expect(effectLook({ bg: "#00000000" }, "strings").bg).toBe(CLEAR_GROUND);
  expect(effectLook({ bg: "#00000000" }, "blob").bg).toBeNull();
  expect(effectLook({ bg: "#123456" }, "silk").bg).toBeNull();
  expect(effectLook({ bg: "#00000000" }).bg).toBeNull();
  expect(effectLook({ bg: "#12345680" }).bg).toBe("#12345680");
});

test("an effect stands bare where its ground lets the page through: the blob's none, a translucent or clear one", () => {
  expect(effectBare("blob", { bg: null })).toBe(true);
  expect(effectBare("blob", { bg: "#101014" })).toBe(false);
  expect(effectBare("blob", { bg: "#10101480" })).toBe(true);
  expect(effectBare("strings", { bg: null })).toBe(false);
  expect(effectBare("strings", { bg: "#f4efe6" })).toBe(false);
  expect(effectBare("strings", { bg: "#10203080" })).toBe(true);
  expect(effectBare("strings", { bg: CLEAR_GROUND })).toBe(true);
  expect(effectBare("silk", { bg: null })).toBe(false);
});

test("a vector effect's still is named by its ground where its look names one, and read back", () => {
  const look = { angle: 90, shape: 7, steps: null, zoom: null, path: null, bg: null };
  /* none: the name it had */
  expect(fxStillKey("strings", SEED, look)).toBe(`strings|${SEED}|90|7`);
  for (const bg of ["#f4efe6", "#10203080", CLEAR_GROUND]) {
    const key = fxStillKey("strings", SEED, { ...look, bg });
    expect(key).toBe(`strings|${SEED}|90|7|${bg}`);
    expect(readFxStillKey(key)).toEqual({ kind: "strings", seed: SEED, look: { ...look, bg } });
    expect(fxLookOf(effect(`style=strings&shape=7&bg=${bg.replace("#", "%23")}`).look, 90)).toEqual(
      { ...look, bg }
    );
  }
  /* a ground no kind of its takes, or written as no address writes it, names no still */
  expect(readFxStillKey(`silk|${SEED}|90|7|#ffffff`)).toBeNull();
  expect(readFxStillKey(`strings|${SEED}|90|7|ffffff`)).toBeNull();
  expect(readFxStillKey(`strings|${SEED}|90|7|#ff000000`)).toBeNull();
  /* steps then a ground: the sandstone's steps, which takes no ground */
  expect(readFxStillKey(`strata|${SEED}|90||12`)?.look.steps).toBe(12);
  expect(readFxStillKey(`strata|${SEED}|90||12|#ffffff`)).toBeNull();
});

test("a blob's still is named by its palette and its look, and read back", () => {
  const look = effect("style=blob&shape=7&bg=%2310101480&frost=0.5").look;
  const key = blobStillKey(SEED, look);
  expect(key).toBe(`${SEED}|0.5|7|#10101480`);
  expect(readBlobStillKey(key)).toEqual({ seed: SEED, look });
  expect(readBlobStillKey(`${SEED}|1|7|`)).toEqual({
    seed: SEED,
    look: { frost: 1, shape: 7, bg: null, steps: null, zoom: null, path: null }
  });
  // a name that ends in an angle, as names did, names nothing
  expect(readBlobStillKey(`${SEED}|1|7||90`)).toBeNull();
  expect(readBlobStillKey(`${SEED}|1|7`)).toBeNull();
});

test("an effect's file is named by the same address, its pictures at the size asked", () => {
  const glass = effect("style=glass&speed=2.45");
  expect(effectFileAddress("https://grabient.test", SEED, glass, 135, "js")).toBe(
    `https://grabient.test/${SEED}.js?style=glass&angle=135&speed=2.45`
  );
  expect(
    effectFileAddress("https://grabient.test", SEED, glass, 90, "png", {
      width: 1080,
      height: 1080
    })
  ).toBe(`https://grabient.test/${SEED}.png?style=glass&speed=2.45&w=1080&h=1080`);
  // a stylesheet and a script take no size
  expect(
    effectFileAddress("https://grabient.test", SEED, glass, 90, "css", { width: 10, height: 10 })
  ).toBe(`https://grabient.test/${SEED}.css?style=glass&speed=2.45`);
  expect(
    effectFileAddress("https://grabient.test", SEED, effect("style=blob&bg=%23101014"), 90, "svg")
  ).toBe(`https://grabient.test/${SEED}.svg?style=blob&bg=%23101014`);
});

test("the tags that play an effect behind a page are its stylesheet and its script, one address, as HTML", () => {
  expect(effectEmbedHtml("https://grabient.test", SEED, effect("style=glass&speed=2"), 135)).toBe(
    `<link rel="stylesheet" href="https://grabient.test/${SEED}.css?style=glass&amp;angle=135&amp;speed=2">\n` +
      `<script src="https://grabient.test/${SEED}.js?style=glass&amp;angle=135&amp;speed=2" async></script>`
  );
});

test("with its still, the tags hold the first frame in the page itself, and the blob's gives it up as it plays", () => {
  const glass = effectEmbedHtml(
    "https://grabient.test",
    SEED,
    effect("style=glass"),
    90,
    'url("data:image/webp;base64,AAAA") 50% 50%/cover no-repeat'
  );
  expect(glass.startsWith("<style>\nhtml::before {\n")).toBe(true);
  expect(glass).toContain(
    'background: url("data:image/webp;base64,AAAA") 50% 50%/cover no-repeat;'
  );
  expect(glass).not.toContain("<link");
  // the glass's canvas, opaque once faded in, takes the still's place too
  expect(glass).toContain(`html[${EMBED_PLAYING}]::before {\n  background: none;\n}\n</style>`);
  expect(
    glass.endsWith(
      `</style>\n<script src="https://grabient.test/${SEED}.js?style=glass" async></script>`
    )
  ).toBe(true);
  const blob = effectEmbedHtml("https://grabient.test", SEED, effect("style=blob"), 90, "url(x)");
  expect(blob).toContain(`html[${EMBED_PLAYING}]::before {\n  background: none;\n}\n</style>`);
  expect(effectLayerCss("red")).toBe(
    `html::before {\n  content: "";\n  position: fixed;\n  inset: 0;\n  z-index: -1;\n  pointer-events: none;\n  background: red;\n}\nhtml[${EMBED_PLAYING}]::before {\n  background: none;\n}\n`
  );
});

test("a soft and grained view's tags finish the still inside the page and name both in the script's address", () => {
  const html = effectEmbedHtml(
    "https://grabient.test",
    SEED,
    effect("style=rosette"),
    90,
    "url(x)",
    { soft: 40, grain: 20 },
    { blur: "blur(1vmax)", under: "linear-gradient(red, blue)", grain: "url(y) 0 0 / 128px 128px" }
  );
  // the still blurred over its gradient, the grain on a layer of its own over both
  expect(html).toContain("  background: url(x);\n  filter: blur(1vmax);\n}");
  expect(html).toMatch(
    /html::after \{[^}]*z-index: -2;[^}]*background: linear-gradient\(red, blue\);/
  );
  expect(html).toMatch(
    /body::before \{[^}]*background: url\(y\) 0 0 \/ 128px 128px;\n {2}image-rendering: pixelated;/
  );
  expect(html).toContain(
    `<script src="https://grabient.test/${SEED}.js?style=rosette&amp;soft=40&amp;grain=20" async></script>`
  );
  // a grain alone lays no gradient and no blur
  const grained = effectLayerCss("url(x)", { grain: "url(y) 0 0 / 128px 128px" });
  expect(grained).not.toMatch(/filter|html::after/);
  expect(grained).toContain(`html[${EMBED_PLAYING}] body::before {\n  background: none;\n}`);
});

test("an effect's rule paints its still on the element it names, its soft and grain on layers of the element's own", () => {
  // unsoftened, the still is the element's background, the grain's tile a layer over it
  expect(effectRuleCss(".palette-1", "url(x) 50% 50%/cover no-repeat")).toBe(
    ".palette-1 {\n  background: url(x) 50% 50%/cover no-repeat;\n}\n"
  );
  expect(effectRuleCss(".palette-1", "url(x)", { grain: "url(y) 0 0 / 128px 128px" })).toBe(
    ".palette-1 {\n  background: url(y) 0 0 / 128px 128px, url(x);\n}\n"
  );
  // soft, the still is blurred under the content over the gradient its edges thin to, the grain over it, all inside
  const soft = effectRuleCss(".palette-2", "url(x)", {
    blur: "blur(12.5px)",
    under: "linear-gradient(red, blue)",
    grain: "url(y) 0 0 / 128px 128px"
  });
  expect(soft).toMatch(
    /^\.palette-2 \{\n {2}position: relative;\n {2}isolation: isolate;\n {2}overflow: hidden;\n {2}background: linear-gradient\(red, blue\);\n\}/
  );
  expect(soft).toMatch(
    /\.palette-2::before \{[^}]*z-index: -1;[^}]*background: url\(x\);\n {2}filter: blur\(12\.5px\);/
  );
  expect(soft).toMatch(
    /\.palette-2::after \{[^}]*z-index: -1;[^}]*background: url\(y\) 0 0 \/ 128px 128px;/
  );
  expect(soft).not.toContain("vmax");
  // a blob the page shows through has no gradient under it
  expect(effectRuleCss(".palette-3", "url(x)", { blur: "blur(2px)" })).toContain(
    "  background: none;\n}"
  );
});
