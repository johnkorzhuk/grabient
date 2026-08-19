import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    /**
     * The colour suites measure whole distributions over the 867-seed fixture
     * (test/prose-corpus.js, test/fit-corpus.js), so a single `it` legitimately
     * runs for seconds: measured 2026-08-18 on this machine, the heaviest chip
     * tests take 2.1-4.7s each ALONE, because one chip row costs 2.2ms
     * (chipColors scans the 920-entry corpus per candidate) and there are 867
     * of them. Vitest's 5s default therefore passed file-by-file and timed out
     * under `vitest run`, where several files share the CPU — a flake that says
     * nothing about the code. The band is what the fixture costs, not a
     * license: if a test needs more than this, it is measuring too much.
     */
    testTimeout: 30000,
    environment: "happy-dom",
    environmentOptions: {
      happyDOM: {
        url: "http://localhost/",
        // Tests insert <script src="/assets/entry-*.js"> tags (cross-deploy
        // guard); never let happy-dom actually fetch them.
        settings: {
          disableJavaScriptFileLoading: true,
          disableCSSFileLoading: true,
          // Without this, a disabled script load "errors" — and dispatching
          // that error crashes on DOMParser documents (defaultView is null).
          handleDisabledFileLoadingAsSuccess: true,
        },
      },
    },
  },
});
