import { describe, expect, it } from "vitest";
import { rankedBarChart } from "../src/charts";
import { dataTable, esc } from "../src/html";

/**
 * Regression tests for a live stored-XSS hole.
 *
 * The ranked-bar tooltip payload is built from category labels, and on the
 * "Top content" card those labels are `clientRequestPath` straight off
 * Cloudflare's edge — i.e. any string a stranger can put in a URL. The hover
 * script writes them with innerHTML, so an unescaped label executed script on
 * admin.grabient.com, same-origin with the MCP write surface. The card also
 * passes decodeURIComponent as the label expander, so percent-encoding was not
 * a barrier.
 */
const HOSTILE = [
  `<img src=x onerror=alert(1)>`,
  `<svg onload=alert(1)>`,
  `</script><script>alert(1)</script>`,
  `" onmouseover="alert(1)`,
  `' onmouseover='alert(1)`,
];

describe("rankedBarChart tooltip payload", () => {
  for (const label of HOSTILE) {
    it(`neutralises ${label.slice(0, 24)}…`, () => {
      const html = rankedBarChart(
        [
          { label, count: 100 },
          { label: "/palettes/blue", count: 50 },
        ],
        "Requests by page path",
        "test",
        (n) => `${n} requests`,
        // The real call site decodes, which is what made percent-encoded
        // payloads dangerous — exercise that path.
        (value) => {
          try {
            return decodeURIComponent(value);
          } catch {
            return value;
          }
        },
      );

      const payload = /data-chart='([^']*)'/.exec(html)?.[1] ?? "";
      expect(payload).not.toContain("<img");
      expect(payload).not.toContain("<svg");
      expect(payload).not.toContain("<script");
      expect(payload).not.toContain("</script");
      // The label still reaches the reader, escaped rather than dropped. It is
      // DOUBLE-escaped in the raw attribute by design: tipText turns `<` into
      // `&lt;`, then the attribute pass turns that `&` into `&amp;`. The
      // browser decodes the attribute once (yielding the JSON string `&lt;`)
      // and innerHTML decodes once more, so the reader sees a literal `<`.
      // Escaped, not dropped: whatever angle brackets the label carried come
      // back as entities.
      if (label.includes("<")) expect(payload).toContain("&amp;lt;");
      if (label.includes(">")) expect(payload).toContain("&amp;gt;");
    });
  }

  it("cannot break out of the single-quoted attribute", () => {
    const html = rankedBarChart(
      [
        { label: `' onload='alert(1)`, count: 10 },
        { label: "/x", count: 5 },
      ],
      "aria",
      "t",
      (n) => `${n}`,
    );
    const attr = /data-chart='([^']*)'/.exec(html)?.[1] ?? "";
    expect(attr).not.toContain("'");
    expect(attr.length).toBeGreaterThan(10);
  });

  it("escapes the aria-label a caller supplies", () => {
    const html = rankedBarChart([{ label: "a", count: 1 }], `x" onfocus="alert(1)`, "t", (n) => `${n}`);
    expect(html).not.toContain('onfocus="alert(1)"');
  });
});

describe("esc", () => {
  it("covers both quote styles, because payloads ride in single-quoted attributes", () => {
    expect(esc(`<a href="x" title='y'>&</a>`)).toBe(
      "&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;",
    );
  });
});

describe("dataTable island payload", () => {
  it("cannot close its own script tag", () => {
    const html = dataTable(
      ["Page", "Views"],
      Array.from({ length: 8 }, (_, i) => [`</script><script>alert(${i})</script>`, String(i)]),
      true,
    );
    const json = /<script type="application\/json">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? "";
    expect(json.length).toBeGreaterThan(10);
    expect(json).not.toContain("</script");
  });

  it("cannot reach the parser's double-escaped script state", () => {
    // `<!--<script` inside a script element flips the tokenizer into
    // script-data-double-escaped, where a later `</script>` stops closing the
    // element — a classic way to smuggle markup past a naive escape.
    const html = dataTable(
      ["Page"],
      Array.from({ length: 8 }, (_, i) => [`<!--<script>alert(${i})`, String(i)]),
      true,
    );
    const json = /<script type="application\/json">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? "";
    expect(json.length).toBeGreaterThan(10);
    expect(json).not.toContain("<!--");
    expect(json).not.toContain("<script");
  });

  it("escapes cells in the static table it enhances", () => {
    const html = dataTable(
      ["Page"],
      Array.from({ length: 8 }, () => ["<img src=x onerror=alert(1)>"]),
      true,
    );
    // The rendered table — the part the HTML parser builds elements from.
    const rendered = html.slice(0, html.indexOf("<script"));
    expect(rendered).not.toContain("<img src=x");
    expect(rendered).toContain("&lt;img");
    // The JSON copy keeps the raw text, which is correct and inert: inside a
    // <script> element the parser reads raw text until `</script`, so `<img>`
    // there creates nothing, and Solid escapes it again when it renders the
    // cell. The only sequences that can break out are escaped below.
  });

  it("leaves short tables alone — sorting six rows is noise", () => {
    const html = dataTable(["A", "B"], [["1", "2"]], true);
    expect(html).not.toContain("data-island");
  });
});
