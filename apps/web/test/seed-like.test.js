import { beforeAll, describe, expect, it, vi } from "vitest";
import { paletteCoeffKey } from "../src/palette";
import { click, loadClient } from "./setup";

const CUSTOM_SEED =
  "HQVg7AnANKAMCMMQGYAcSAsYZgGyxlwCZFgTthldkZ4JsCjhYIMoNh5VpPwp5msAgOQZSsIhCA";
const TARED_SEED = paletteCoeffKey(CUSTOM_SEED);
const json = (data) => ({ ok: true, json: async () => data });

let fetchMock;

beforeAll(async () => {
  history.replaceState(null, "", `/${CUSTOM_SEED}`);
  fetchMock = await loadClient();
  fetchMock.mockImplementation(async (url) => {
    url = String(url);
    if (url.includes("/api/auth/get-session"))
      return json({ user: { id: "u1", email: "jane@example.com" } });
    if (url.includes("/api/likes/toggle"))
      return json({ liked: true, key: TARED_SEED, likesCount: 12 });
    if (url.includes("/api/like-info"))
      return json({ isLiked: true, likesCount: 12 });
    if (url.includes("/api/likes")) return json({ seeds: [TARED_SEED] });
    return json({});
  });
});

describe("$seed like identity", () => {
  it("posts the globals-free seed and survives a visually identical tare", async () => {
    document.body.innerHTML =
      `<button data-like-info data-like-current data-like-seed="${TARED_SEED}" ` +
      `data-like-row="${CUSTOM_SEED}" data-like-style="linearGradient" ` +
      `data-like-steps="7" data-like-angle="90" data-count="11">` +
      `<span class="like-count">11</span><svg class="heart-i"></svg></button>`;

    const button = document.querySelector("[data-like-info]");
    click(button);
    await vi.waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/api/likes/toggle"))).toBe(
        true,
      ),
    );
    const toggleCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("/api/likes/toggle"),
    );
    const body = JSON.parse(toggleCall[1].body);
    expect(body.seed).toBe(TARED_SEED);
    expect(body.exact).toBe(true);
    expect(button.dataset.count).toBe("12");

    document.dispatchEvent(
      new CustomEvent("palette:change", {
        detail: {
          seed: TARED_SEED,
          style: "linearGradient",
          steps: 7,
          angle: 90,
        },
      }),
    );
    expect(button.dataset.likeSeed).toBe(TARED_SEED);
    expect(button.dataset.count).toBe("12");
    expect(button.getAttribute("aria-label")).toBe("Unsave palette");
  });
});
