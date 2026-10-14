import { renderToString } from "@solidjs/web";
import { expect, test, vi } from "vitest";
import { ErrorPage } from "./ErrorPage.tsx";

test("where the frame itself failed, the error page stands alone with its words and Retry", () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const html = renderToString(() => (
    <ErrorPage error={new Error("the frame")} reset={() => {}} info={{ componentStack: "" }} />
  ));
  expect(html).toContain("Something went wrong. Try again.");
  expect(html).toContain("Retry");
  // no footer of the frame's: its language menu asks the frame for this page's address
  expect(html).not.toContain("<footer");
});
