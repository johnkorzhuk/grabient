// Param preservation between navigations (ported current-site behavior):
// - user-set list params persist list -> seed -> list
// - palette-derived values (added to seed URLs by card links) never flow back
// - user edits made ON a seed page merge into the remembered list search
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { click, loadClient, respond } from "./setup";

let fetchMock;

const HEADER = `<header><a class="logo" href="/">G</a><nav><a href="/">Popular</a><a href="/newest">Newest</a></nav></header>`;

const listHtml = (title) =>
  `<html><head><title>${title}</title></head><body>${HEADER}<main>LIST</main></body></html>`;

const seedHtml = () =>
  `<html><head><title>Seed</title></head><body>${HEADER}<form id="opts"><select name="style"><option value="">Auto</option><option value="radialGradient" selected>R</option></select><input name="steps" value="6"><input name="angle" value=""></form><main>SEED</main></body></html>`;

beforeAll(async () => {
  fetchMock = await loadClient();
});

afterEach(() => {
  vi.useRealTimers();
  fetchMock.mockClear();
  sessionStorage.clear();
});

describe("list search memory", () => {
  it("preserves user params to seed pages and strips palette-derived ones on the way back", async () => {
    vi.useFakeTimers();

    // 1. Navigate to a list URL with a USER-set param.
    document.body.innerHTML = `<main>x</main><a id="l1" href="/?steps=6">list</a>`;
    fetchMock.mockResolvedValueOnce(respond(listHtml("List"), { maxAge: 300 }));
    click(document.getElementById("l1"));
    await vi.advanceTimersByTimeAsync(10);
    expect(sessionStorage.getItem("gl-list-search")).toBe("?steps=6");

    // 2. Click a card: seed URL carries effective values (steps user-set,
    //    style/angle palette-derived).
    const a = document.createElement("a");
    a.href = "/_seedabc?style=radialGradient&steps=6&angle=180";
    a.textContent = "card";
    document.querySelector("main").append(a);
    fetchMock.mockResolvedValueOnce(respond(seedHtml(), { maxAge: 600 }));
    click(a);
    await vi.advanceTimersByTimeAsync(10);
    expect(location.pathname).toBe("/_seedabc");

    // 3. Header list links were rewritten from memory: user param kept,
    //    palette-derived style/angle absent.
    const links = [...document.querySelectorAll("header nav a")].map((el) =>
      el.getAttribute("href"),
    );
    expect(links).toContain("/?steps=6");
    expect(links).toContain("/newest?steps=6");
    expect(document.querySelector("header a.logo").getAttribute("href")).toBe("/?steps=6");
  });

  it("merges only the user-changed field from a seed page into the memory", async () => {
    vi.useFakeTimers();
    sessionStorage.setItem("gl-list-search", "?steps=6");

    // On a seed page (non-list path) with a form whose values came from the URL.
    history.pushState(null, "", "/_seedabc?style=radialGradient&steps=6&angle=180");
    document.body.innerHTML = seedHtml().match(/<body>([\s\S]*)<\/body>/)[1];

    // User changes angle only.
    const angle = document.querySelector('input[name="angle"]');
    angle.value = "45";
    angle.dispatchEvent(new Event("change", { bubbles: true }));

    expect(sessionStorage.getItem("gl-list-search")).toBe("?steps=6&angle=45");
    // The palette-derived style from the form was NOT merged.
    expect(sessionStorage.getItem("gl-list-search")).not.toContain("style");

    // Clearing a field on the seed page resets it to auto in the memory too.
    const steps = document.querySelector('input[name="steps"]');
    steps.value = "";
    steps.dispatchEvent(new Event("change", { bubbles: true }));
    expect(sessionStorage.getItem("gl-list-search")).toBe("?angle=45");
  });

  it("page param never leaks into seed-page list links", async () => {
    sessionStorage.setItem("gl-list-search", "?steps=6&page=3");
    history.pushState(null, "", "/_seedxyz");
    document.body.innerHTML = `${HEADER}<form id="opts"><input name="steps" value="6"></form><main>SEED</main>`;
    // Any seed-page #opts change re-runs the link fixer.
    const inp = document.querySelector('input[name="steps"]');
    inp.dispatchEvent(new Event("change", { bubbles: true }));
    const links = [...document.querySelectorAll("header nav a")].map((el) =>
      el.getAttribute("href"),
    );
    expect(links).toContain("/?steps=6");
    expect(links.every((h) => !h.includes("page="))).toBe(true);
  });
});
