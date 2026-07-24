// /saved like flow (client): unsaving removes the card with an undo toast;
// undo re-likes and reinserts the card at its original position. Counts are
// authoritative from the server response.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { click, loadClient } from "./setup";

const KEY_A = "_gKeyA";
const KEY_B = "_gKeyB";
const ROW_A = "HQRowA";
const ROW_B = "HQRowB";

const card = (key, row, count) =>
  `<li><div><button type="button" data-like-seed="${key}" data-like-row="${row}" ` +
  `data-like-style="linearGradient" data-like-steps="7" data-like-angle="90" data-count="${count}" ` +
  `aria-label="Unsave palette"><span class="like-count">${count}</span>` +
  `<svg class="heart-i"><path/></svg></button></div></li>`;

function savedDom() {
  document.body.innerHTML =
    `<div id="auth-slot"></div><div id="grid-ssr"><ol>${card(KEY_A, ROW_A, 41)}${card(KEY_B, ROW_B, 7)}</ol></div>`;
}

const json = (data) => ({ ok: true, json: async () => data });
const flush = () => new Promise((r) => setTimeout(r, 10));

let fetchMock;
let likedResponse = { liked: false, key: KEY_A, likesCount: 40 };

beforeAll(async () => {
  window.history.pushState({}, "", "/saved");
  fetchMock = await loadClient();
  fetchMock.mockImplementation(async (url, opts) => {
    url = String(url);
    if (url.includes("/api/auth/get-session"))
      return json({ user: { id: "u1", email: "jane@example.com", username: "jane" } });
    if (url.includes("/api/likes/toggle")) return json(likedResponse);
    if (url.includes("/api/likes")) return json({ seeds: [KEY_A, KEY_B] });
    return json({});
  });
  document.dispatchEvent(new Event("app:swap"));
});

describe("/saved unlike flow", () => {
  it("unsaving removes the card, sets the server count, and shows the undo toast", async () => {
    savedDom();
    document.dispatchEvent(new Event("app:swap"));
    await flush();
    const btn = document.querySelector(`[data-like-seed="${KEY_A}"]`);
    expect(btn).toBeTruthy();
    click(btn);
    await flush();
    // Card A is gone from the grid; card B stays.
    expect(document.querySelector(`[data-like-seed="${KEY_A}"]`)).toBeNull();
    expect(document.querySelector(`[data-like-seed="${KEY_B}"]`)).toBeTruthy();
    expect(document.querySelectorAll("#grid-ssr ol li")).toHaveLength(1);
    // Undo toast is up.
    expect(document.getElementById("undo-unsave")).toBeTruthy();
    // The toggle POST sent the ROW id (storage seed), not the coeff key.
    const toggleCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("/api/likes/toggle"),
    );
    expect(JSON.parse(toggleCall[1].body).seed).toBe(ROW_A);
  });

  it("undo re-likes and reinserts the card at its original position", async () => {
    likedResponse = { liked: true, key: KEY_A, likesCount: 41 };
    click(document.getElementById("undo-unsave-btn"));
    await flush();
    const lis = document.querySelectorAll("#grid-ssr ol li");
    expect(lis).toHaveLength(2);
    // Back in front of card B (its spot when removed).
    expect(lis[0].querySelector("[data-like-seed]").dataset.likeSeed).toBe(KEY_A);
    // Count corrected from the server response, heart state back to saved.
    const btn = document.querySelector(`[data-like-seed="${KEY_A}"]`);
    expect(btn.dataset.count).toBe("41");
    expect(btn.querySelector(".like-count").textContent).toBe("41");
    expect(btn.getAttribute("aria-label")).toBe("Unsave palette");
    expect(document.getElementById("undo-unsave")).toBeNull();
  });

  it("removing the last card swaps in the empty state; undo restores the grid", async () => {
    // Both cards are back (test 2 reinserted A) — unlike both to empty the grid.
    likedResponse = { liked: false, key: KEY_A, likesCount: 40 };
    click(document.querySelector(`[data-like-seed="${KEY_A}"]`));
    await flush();
    expect(document.querySelectorAll("#grid-ssr ol li")).toHaveLength(1);
    likedResponse = { liked: false, key: KEY_B, likesCount: 6 };
    click(document.querySelector(`[data-like-seed="${KEY_B}"]`));
    await flush();
    expect(document.querySelectorAll("#grid-ssr ol li")).toHaveLength(0);
    expect(document.querySelector("#grid-ssr p").textContent).toContain(
      "You haven't saved any palettes yet.",
    );
    // The toast holds the latest removal (B); undo restores it and the grid.
    likedResponse = { liked: true, key: KEY_B, likesCount: 7 };
    click(document.getElementById("undo-unsave-btn"));
    await flush();
    expect(document.querySelectorAll("#grid-ssr ol li")).toHaveLength(1);
    expect(document.querySelector("#grid-ssr p")).toBeNull();
    expect(document.querySelector(`[data-like-seed="${KEY_B}"]`)).toBeTruthy();
  });
});
