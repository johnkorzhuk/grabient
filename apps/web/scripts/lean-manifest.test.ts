import { expect, test } from "vitest";
import { leanRecords } from "./lean-manifest.ts";

test("the manifest the Worker carries keeps what a render reads of each chunk, and its base", () => {
  const manifest = {
    "src/features/list/ListEffects.tsx": {
      file: "assets/ListEffects-Bh1Bx6M5.js",
      name: "ListEffects",
      src: "src/features/list/ListEffects.tsx",
      isDynamicEntry: true,
      imports: ["_vendor--jtluY_Q.js", "src/client.tsx"],
      dynamicImports: ["src/features/editor/GlassArt.tsx"]
    },
    "src/client.tsx": {
      file: "assets/client-x.js",
      name: "client",
      src: "src/client.tsx",
      isEntry: true
    },
    "style.css": { file: "assets/style-y.css", src: "style.css" },
    _base: "/"
  };
  expect(leanRecords(manifest)).toEqual({
    "src/features/list/ListEffects.tsx": {
      file: "assets/ListEffects-Bh1Bx6M5.js",
      imports: ["_vendor--jtluY_Q.js", "src/client.tsx"]
    },
    "src/client.tsx": { file: "assets/client-x.js", isEntry: true },
    "style.css": { file: "assets/style-y.css" },
    _base: "/"
  });
});
