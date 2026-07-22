import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
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
