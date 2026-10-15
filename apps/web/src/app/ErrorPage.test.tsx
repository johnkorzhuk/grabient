import { renderToString } from "@solidjs/web";
import { expect, test, vi } from "vitest";
import { ErrorPage } from "./ErrorPage.tsx";

test("where the frame itself failed, the error page stands alone with its words and Retry", () => {
  const logged = vi.spyOn(console, "error").mockImplementation(() => {});
  const failed = new Error("the frame");
  const html = renderToString(() => (
    <ErrorPage error={failed} reset={() => {}} info={{ componentStack: "" }} />
  ));
  expect(html).toContain("Something went wrong. Try again.");
  expect(html).toContain("Retry");
  // no footer of the frame's: its language menu asks the frame for this page's address
  expect(html).not.toContain("<footer");
  // the error as it was thrown, which Workers Issues groups by its name and words and whose stack it reads
  expect(logged).toHaveBeenCalledExactlyOnceWith(failed);
});
