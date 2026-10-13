import { expect, test } from "vitest";
import { otherProject } from "./replay.ts";

const OURS = "phc_YtRERLNG3jXUoOisN6NXQS9sI5Iz0gAUkiY7nX7puTK";
const url = (query = "") => new URL(`https://grabient.com/e/s/${query}`);
const bytes = (text: string) => new TextEncoder().encode(text);

test("only the site's own project goes on", () => {
  expect(otherProject(url(), undefined)).toBe(false);
  expect(otherProject(url(`?api_key=${OURS}`), undefined)).toBe(false);
  expect(otherProject(url("?api_key=phc_other"), undefined)).toBe(true);
  expect(otherProject(url(), bytes(JSON.stringify({ api_key: OURS, data: [] })))).toBe(false);
  expect(otherProject(url(), bytes(JSON.stringify({ token: "phc_other" })))).toBe(true);
  /* the library's fallback form, plain or in base64 */
  expect(
    otherProject(url(), bytes(`data=${encodeURIComponent(JSON.stringify({ token: "phc_other" }))}`))
  ).toBe(true);
  expect(
    otherProject(url(), bytes(`data=${encodeURIComponent(btoa(JSON.stringify({ token: OURS })))}`))
  ).toBe(false);
  expect(otherProject(url(), bytes("data=%%%"))).toBe(true);
  /* a gzipped body passes unread */
  expect(otherProject(url(), new Uint8Array([0x1f, 0x8b, 1, 2, 3]))).toBe(false);
});
