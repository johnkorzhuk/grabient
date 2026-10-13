import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { legalBlocks, plainText } from "./blocks.ts";

const read = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8");

test.each(["privacy.html", "terms.html"])("%s reads into blocks that hold every word", name => {
  const html = read(name);
  const blocks = legalBlocks(html);
  expect(blocks[0].kind).toBe("h1");
  expect(blocks[1].kind).toBe("date");
  /* every block of the document is read: nothing between them but line breaks */
  const rebuilt = blocks
    .map(b =>
      b.kind === "ul"
        ? `<ul>\n${b.items.map(i => `<li>${i}</li>`).join("\n")}\n</ul>`
        : `<${b.kind === "date" ? "p" : b.kind}>${b.html}</${b.kind === "date" ? "p" : b.kind}>`
    )
    .join("\n");
  expect(rebuilt.trim()).toBe(html.trim());
});

test("a heading's character references are read as text", () => {
  expect(plainText("Grabient&#x27;s &quot;terms&quot; &amp; &#169; &lt;3&gt;")).toBe(
    'Grabient\'s "terms" & © <3>'
  );
});
