import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/* Before the tests, the local database `vite dev` serves gets the newsletter turned on (newsletter-on.sql): it starts
   off until an admin turns it on, and the tests read its page, its link and its answers as readers will then. */
export default function setup() {
  execFileSync("node", ["scripts/d1.ts", "file", "e2e/newsletter-on.sql"], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    stdio: "inherit"
  });
}
