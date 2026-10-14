import { expect, test } from "@playwright/test";

/* The MCP server and its authorization server behind the app's router. What each answers is the Worker tests' to say
   (test/mcp.test.ts, test/oauth.test.ts); these pin that their addresses reach them. They need the local sign-in
   secret (.dev.vars): without one no app is told to connect. */

test("an app is challenged at /mcp and reads where to sign in", async ({ request, baseURL }) => {
  const challenged = await request.post("/mcp", {
    data: { jsonrpc: "2.0", id: 1, method: "tools/list" }
  });
  expect(challenged.status()).toBe(401);
  expect(challenged.headers()["www-authenticate"]).toContain(
    `resource_metadata="${baseURL}/.well-known/oauth-protected-resource/mcp"`
  );
  const resource = await request.get("/.well-known/oauth-protected-resource/mcp");
  expect(await resource.json()).toMatchObject({
    resource: `${baseURL}/mcp`,
    authorization_servers: [baseURL]
  });
  const server = await request.get("/.well-known/oauth-authorization-server");
  expect(await server.json()).toMatchObject({
    issuer: baseURL,
    authorization_endpoint: `${baseURL}/oauth/authorize`,
    token_endpoint: `${baseURL}/oauth/token`,
    registration_endpoint: `${baseURL}/oauth/register`
  });
});

test("the authorization server answers at its addresses, and refuses in JSON what it does not know", async ({
  request
}) => {
  const unknown = await request.get(
    "/oauth/authorize?response_type=code&client_id=nobody&redirect_uri=http://127.0.0.1:9/callback&code_challenge=x&code_challenge_method=S256",
    { maxRedirects: 0 }
  );
  expect(unknown.status()).toBe(303);
  const to = new URL(unknown.headers().location ?? "", "http://localhost");
  expect(to.pathname + to.search).toBe("/connect?problem=unknown");
  const token = await request.post("/oauth/token", {
    form: { grant_type: "authorization_code", code: "none", client_id: "nobody" }
  });
  expect([token.status(), (await token.json()).error]).toEqual([401, "invalid_client"]);
  for (const address of ["/oauth/nowhere", "/.well-known/nowhere"]) {
    const answer = await request.get(address);
    expect(answer.status(), address).toBe(404);
    expect(answer.headers()["content-type"], address).toContain("application/json");
  }
});

test("the consent sheet comes drawn in the page the server sends, which nothing keeps", async ({
  request
}) => {
  const page = await request.get("/connect?problem=expired");
  expect(page.headers()["cache-control"]).toBe("private, no-store");
  expect(await page.text()).toContain("This request expired. Connect again from your app.");
});

test("a person who opens /mcp in a browser lands on the page that says how to connect", async ({
  page
}) => {
  await page.goto("/mcp");
  expect(new URL(page.url()).pathname).toBe("/mcp-server");
  await expect(page.locator("main h1")).toBeVisible();
});
