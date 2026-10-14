import { env } from "cloudflare:workers";
import { locale } from "@grabient/i18n";
import { redirect } from "@tanstack/solid-router";
import { createIsomorphicFn } from "@tanstack/solid-start";
import { getRequest } from "@tanstack/solid-start/server";
import { type ConsentPage, consentPage } from "../../server/oauth/consent.ts";
import { onSiteOrigin } from "../../server/oauth/server.ts";
import { publicOrigin } from "../../server/seo/site.ts";

/* What the connect pages' routes read on the server before a page draws: the consent's facts, from the request itself,
   and the site's origin. */

/** The consent page's facts for this request, or a sign-in on the way when the session ended. In the browser there is
    no request to read: a consent page reached again inside the app has nothing to answer. */
export const readConsent = createIsomorphicFn()
  .server(async (): Promise<ConsentPage> => {
    const facts = await consentPage(onSiteOrigin(env, getRequest()), env, locale());
    if (facts instanceof Response)
      throw redirect({ href: facts.headers.get("Location") ?? "/login", statusCode: 302 });
    return facts;
  })
  .client(async (): Promise<ConsentPage> => ({ state: "nothing" }));

/** The site's public origin, the same on both sides of a page: the deploy's, else the request's. */
export const readOrigin = createIsomorphicFn()
  .server(() => publicOrigin(env, getRequest()))
  .client(() => location.origin);
