// Island param state: option changes preserve `page` (view transforms don't
// change the result set — current site spreads ...prev), pagination sets it,
// and URLs stay canonical.
import { beforeEach, describe, expect, it } from "vitest";
import { listKey, syncFromLocation, updateKey } from "../src/islands/params";

describe("updateKey", () => {
  beforeEach(() => {
    history.replaceState(null, "", "/?steps=6&page=3");
    syncFromLocation();
  });

  it("preserves page when options change", () => {
    updateKey({ style: "radialGradient" });
    expect(listKey().page).toBe(3);
    expect(location.search).toBe("?style=radialGradient&steps=6&page=3");
  });

  it("clearing an option also preserves page", () => {
    updateKey({ steps: "auto" });
    expect(location.search).toBe("?page=3");
    expect(listKey().page).toBe(3);
  });

  it("pagination updates page explicitly", () => {
    updateKey({ page: 5 }, { push: true });
    expect(location.search).toBe("?steps=6&page=5");
  });

  it("keeps the sort path", () => {
    history.replaceState(null, "", "/newest?page=2");
    syncFromLocation();
    updateKey({ angle: 45 });
    expect(location.pathname).toBe("/newest");
    expect(location.search).toBe("?angle=45&page=2");
  });
});
