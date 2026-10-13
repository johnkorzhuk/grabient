import { expect, test } from "vitest";
import { t } from "../src/i18n.ts";

test("a message is its English, with its values and plurals in", () => {
  expect(t("Skip to content")).toBe("Skip to content");
  expect(t("Grabient, {label}", { label: "home" })).toBe("Grabient, home");
  expect(t("{count, plural, one {# star} other {# stars}}", { count: 1 })).toBe("1 star");
  expect(t("{count, plural, one {# star} other {# stars}}", { count: 2049 })).toBe("2,049 stars");
  expect(t("Ctrl", { $context: "key" })).toBe("Ctrl");
});
