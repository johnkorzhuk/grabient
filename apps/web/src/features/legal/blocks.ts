/* The privacy policy and the terms (privacy.html, terms.html) are plain markup, one block to a line: h1, h2, h3, p, and
   ul with li, with strong, a and code inside. A page sets them in the system's type block by block. */

export type LegalBlock =
  | { kind: "h1" | "h2" | "h3" | "p" | "date"; html: string }
  | { kind: "ul"; items: string[] };

/** The document's blocks in order. The paragraph right after the title is its date. */
export function legalBlocks(html: string): LegalBlock[] {
  const out: LegalBlock[] = [];
  for (const [, tag, body] of html.matchAll(/<(h1|h2|h3|p|ul)>([\s\S]*?)<\/\1>/g)) {
    if (tag === "ul") {
      out.push({ kind: "ul", items: [...body.matchAll(/<li>([\s\S]*?)<\/li>/g)].map(m => m[1]) });
      continue;
    }
    const date = tag === "p" && out.length === 1 && out[0].kind === "h1";
    out.push({ kind: date ? "date" : (tag as "h1" | "h2" | "h3" | "p"), html: body });
  }
  return out;
}

const NAMED: Record<string, string> = { quot: '"', lt: "<", gt: ">", nbsp: " ", amp: "&" };
/** A heading or the date as text: the markup's character references read, since they are set as text. */
export const plainText = (markup: string): string =>
  markup.replace(/&(#x[0-9a-f]+|#\d+|quot|lt|gt|nbsp|amp);/gi, (_, ref: string) =>
    ref[0] === "#"
      ? String.fromCodePoint(
          ref[1].toLowerCase() === "x" ? Number.parseInt(ref.slice(2), 16) : Number(ref.slice(1))
        )
      : NAMED[ref.toLowerCase()]
  );
