/* Writes the sample emails as files to open in a browser or send through a mail tester:
     node packages/email/scripts/preview.ts <folder> [origin]
   `origin` is the site the pictures and fonts are read from; each picture is drawn the first time it is asked for. */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  sampleAccount,
  sampleBlurbs,
  sampleIssue,
  sampleMcpIssue,
  samplePartnerIssue
} from "../test/sample.ts";

const [folder, origin = "https://staging.grabient.com"] = process.argv.slice(2);
if (!folder) {
  console.error("usage: node packages/email/scripts/preview.ts <folder> [origin]");
  process.exit(1);
}
mkdirSync(folder, { recursive: true });
const letters = {
  "sign-in-link": sampleAccount.link({ origin }),
  "sign-in-code": sampleAccount.code({ origin }),
  "account-deletion": sampleAccount.deletion({ origin }),
  newsletter: sampleIssue({ origin }),
  "newsletter-mcp": sampleMcpIssue({ origin }),
  "newsletter-partners": samplePartnerIssue({ origin })
};
for (const [name, letter] of Object.entries(letters)) {
  writeFileSync(join(folder, `${name}.html`), letter.html);
  writeFileSync(join(folder, `${name}.txt`), letter.text);
  console.log(`${name}: "${letter.subject}", ${Buffer.byteLength(letter.html)} bytes of HTML`);
}
for (const [size, piece] of Object.entries(sampleBlurbs(origin))) {
  writeFileSync(join(folder, `blurb-${size}.html`), piece.html);
  writeFileSync(join(folder, `blurb-${size}.txt`), piece.text);
}
