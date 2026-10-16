import { renderToString } from "@solidjs/web";
import { describe, expect, test } from "vitest";
import type { ConsentPage } from "../../server/oauth/consent.ts";
import { ConnectPage } from "./Connect.tsx";
import { McpServerPage } from "./McpServer.tsx";

/* The pages as a reader sees them first: what the consent sheet says of the app, the account and the way back, and
   what the MCP page offers. */

const ENTITIES: Record<string, string> = {
  "&lt;": "<",
  "&gt;": ">",
  "&amp;": "&",
  "&quot;": '"',
  "&#39;": "'"
};
/** The words of the markup, one space between pieces. */
const words = (markup: string) =>
  markup
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[#\w]+;/g, entity => ENTITIES[entity] ?? entity)
    .replace(/\s+/g, " ")
    .replace(/ ([.,])/g, "$1")
    .trim();

const ready = (
  app: Partial<Extract<ConsentPage, { state: "ready" }>["app"]>,
  admin = false
): ConsentPage => ({
  state: "ready",
  handle: "h1",
  resume: "r1",
  account: { id: "u1", email: "ada@example.com" },
  app: {
    name: "Claude",
    byline: { kind: "published", host: "claude.ai" },
    redirect: "https://claude.ai/api/mcp/auth_callback",
    returnsTo: { kind: "site", name: "claude.ai" },
    loopback: false,
    ...app
  },
  admin: admin ? { offered: true } : null
});

describe("the consent page", () => {
  test("names a saved app by its publisher, the account, and where a yes leads back to", () => {
    const html = renderToString(() => <ConnectPage page={ready({}, true)} />);
    const text = words(html);
    expect(text).toContain("Connect an app Claude Published by claude.ai");
    expect(text).toContain(
      "It can see your name and username, and see and change your saved palettes and collections."
    );
    expect(text).toContain("ada@example.com Not you? Use another account");
    expect(text).toContain("Admin tools Publish and schedule palettes and collections");
    expect(text).toContain("Cancel Allow");
    expect(text).toContain("Returns to claude.ai");
    expect(text).toContain(
      "It stays connected until you disconnect it or don't use it for a year."
    );
    // the admin tools start off every time
    expect(html).toMatch(/role="switch"[^>]*aria-checked="false"/);
    expect(html).not.toContain("connect-caution");
  });

  test("warns before a yes to an app on this computer, which any program could claim to be", () => {
    const html = renderToString(() => (
      <ConnectPage
        page={ready({
          name: null,
          byline: { kind: "unverified" },
          redirect: "http://127.0.0.1:5555/callback",
          returnsTo: { kind: "local", name: "127.0.0.1" },
          loopback: true
        })}
      />
    ));
    const text = words(html);
    expect(text).toContain("Unnamed app Name not verified.");
    expect(text).toContain("Continue only if you started connecting from an app on this computer.");
    expect(text).toContain("Returns to An app on this computer");
    expect(html).toMatch(/aria-describedby="connect-caution"/);
    expect(html).not.toContain('role="switch"');
  });

  test("names an app by its document's host and says the name it claims as its claim", () => {
    const text = words(
      renderToString(() => (
        <ConnectPage
          page={ready({
            name: "app.example",
            byline: { kind: "says", name: "Example" },
            returnsTo: { kind: "app", name: "example" }
          })}
        />
      ))
    );
    expect(text).toContain("app.example It says it is Example.");
    expect(text).toContain("Returns to An installed app that opens example links");
  });

  test("says why there is nothing to answer, and the ways on", () => {
    const expired = words(
      renderToString(() => <ConnectPage page={{ state: "problem", problem: "expired" }} />)
    );
    expect(expired).toBe(
      "Connect an app This request expired. Connect again from your app. How to connect Browse palettes"
    );
    const nothing = words(renderToString(() => <ConnectPage page={{ state: "nothing" }} />));
    expect(nothing).toContain("No app is waiting. Connect again from your app.");
  });
});

test("the MCP page gives the address, each app's link and setup, and nothing of the account", () => {
  const html = renderToString(() => <McpServerPage origin="https://grabient.com" />);
  const text = words(html);
  expect(text).toContain("Add Grabient to your app");
  expect(html).toContain("https://claude.ai/customize/connectors?modal=add-custom-connector");
  expect(html).toContain("cursor://anysphere.cursor-deeplink/mcp/install?name=Grabient");
  expect(text).toContain("Add to Claude");
  // an address is drawn in its parts, so a narrow screen breaks it between them
  expect(text).toContain(
    "claude mcp add --transport http grabient --scope user https:// grabient.com /mcp"
  );
  expect(text).toContain("Make a palette from #14213d and #fca311, and save it.");
  expect(text).not.toContain("Connected apps");
});
