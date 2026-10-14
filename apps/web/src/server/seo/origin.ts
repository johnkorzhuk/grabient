import { env } from "cloudflare:workers";
import { setOriginSource } from "../../lib/page-meta.ts";
import { currentRequest } from "../request.ts";
import { publicOrigin } from "./site.ts";

/* Page metadata names the deploy's public origin, read from the request being rendered. Imported by server.ts before
   anything renders. */
setOriginSource(() => publicOrigin(env, currentRequest()?.request));
