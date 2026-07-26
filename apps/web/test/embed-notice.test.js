// Embed notice: framed visitors get a dismissible pill pointing at the full
// site, and it must survive SPA body swaps until dismissed.
import { describe, expect, it } from "vitest";
import { bootEmbedNotice } from "../src/embed-notice";

describe("embed notice", () => {
  it("renders nothing when not framed", () => {
    document.body.replaceChildren();
    bootEmbedNotice(false);
    expect(document.body.children).toHaveLength(0);
  });

  it("shows a pill linking to the full site in a new tab when framed", () => {
    document.body.replaceChildren();
    bootEmbedNotice(true);
    const pill = document.body.firstElementChild;
    expect(pill.textContent).toContain("Some features are limited in this embed.");
    const link = pill.querySelector("a");
    expect(link.target).toBe("_blank");
    expect(link.rel).toBe("noopener");
    expect(link.textContent).toContain("grabient.com");
  });

  it("re-appends after an SPA body swap until dismissed", () => {
    document.body.replaceChildren();
    bootEmbedNotice(true);
    const pill = document.body.firstElementChild;

    document.body.replaceChildren(); // what swap() does
    document.dispatchEvent(new CustomEvent("app:swap"));
    expect(document.body.firstElementChild).toBe(pill);

    pill.querySelector("button").click();
    document.dispatchEvent(new CustomEvent("app:swap"));
    expect(document.body.children).toHaveLength(0);
  });
});
