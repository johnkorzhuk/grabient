import { env } from "cloudflare:workers";
import { PageFrame } from "@grabient/ui/PageFrame.tsx";
import { createFileRoute } from "@tanstack/solid-router";
import { untrack } from "solid-js";
import { offline } from "../app/connection.ts";
import { Languages } from "../app/Frames.tsx";
import { UNSUBSCRIBE_TOKEN } from "../features/newsletter/input.ts";
import { UnsubscribePage } from "../features/newsletter/UnsubscribePage.tsx";
import { NO_STORE } from "../lib/cache.ts";
import { pageHead } from "../lib/page-meta.ts";

/* The newsletter's way out: /unsubscribe, or /unsubscribe/{token} from an issue. The address names an account, so the
   page is never framed, kept or named in a Referer (server/paths.ts), and its head names the page without the token.
   The server draws the sheet and reads nothing: opening the address changes nothing. A POST to it is the press, the
   page's own or a mail app's one-click button. */
export const Route = createFileRoute("/unsubscribe/{-$token}")({
  staticData: { frame: "sheet", still: true },
  headers: () => NO_STORE,
  head: () => pageHead({ kind: "unsubscribe" }),
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const { unsubscribeResponse } = await import("../server/newsletter/routes.ts");
        return unsubscribeResponse(request, env, params.token);
      }
    }
  },
  component: Unsubscribe
});

function Unsubscribe() {
  const params = Route.useParams();
  // read once, as the page starts: the press is for the address the reader opened
  const token = untrack(() => params().token);
  return (
    <PageFrame login footer={[]} languages={<Languages />}>
      <UnsubscribePage
        token={token && UNSUBSCRIBE_TOKEN.test(token) ? token : null}
        offline={offline()}
      />
    </PageFrame>
  );
}
