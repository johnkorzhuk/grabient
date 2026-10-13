import type { Issue } from "@grabient/email";
import { october } from "./001.ts";
import { november } from "./002.ts";

/* The newsletter's issues, a module each, oldest first. They live under src/server, which the browser's build may not
   import, so an issue reaches a browser only as the page it is given and a draft only an admin's.

   An issue with no `published` day is a draft. To write the next one, copy the last module, give it the next number,
   its month and no day, and add it here: once the build is live it stands on /newsletter for admins, and its day
   publishes it. */
export const ISSUES: readonly Issue[] = [october, november];
