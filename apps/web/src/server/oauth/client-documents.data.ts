/* Saved copies of the client metadata documents of the five apps the MCP page names that publish one: Claude, Claude Code,
   ChatGPT, Codex and VS Code, each as its maker publishes it at its own client_id URL. The authorization server reads a
   copy instead of fetching it (the library's patch), so no sign-in or refresh waits on a host that has refused or cut
   short a Worker's fetch, and still validates it as if fetched. A copy changes only in a reviewed commit: the six-hour
   job (upkeep.ts) reports a published document that differs, and scripts/client-documents.ts rewrites the block below.
   Data, kept out of the formatter, so the script and the copies agree byte for byte. */

// documents: begin
/** The day the copies below were fetched from their client_id URLs. */
export const FETCHED = "2026-10-06";
/** Each document as its maker publishes it at its own client_id URL, keyed by that URL. */
export const CLIENT_DOCUMENTS: Readonly<Record<string, Readonly<Record<string, unknown>>>> = {
  "https://claude.ai/oauth/mcp-oauth-client-metadata": {
    "client_id": "https://claude.ai/oauth/mcp-oauth-client-metadata",
    "client_name": "Claude",
    "client_uri": "https://claude.ai",
    "redirect_uris": [
      "https://claude.ai/api/mcp/auth_callback"
    ],
    "grant_types": [
      "authorization_code",
      "refresh_token",
      "urn:ietf:params:oauth:grant-type:jwt-bearer"
    ],
    "response_types": [
      "code"
    ],
    "token_endpoint_auth_method": "none"
  },
  "https://claude.ai/oauth/claude-code-client-metadata": {
    "client_id": "https://claude.ai/oauth/claude-code-client-metadata",
    "client_name": "Claude Code",
    "client_uri": "https://claude.ai",
    "redirect_uris": [
      "http://localhost/callback",
      "http://127.0.0.1/callback"
    ],
    "grant_types": [
      "authorization_code",
      "refresh_token"
    ],
    "response_types": [
      "code"
    ],
    "token_endpoint_auth_method": "none"
  },
  "https://chatgpt.com/oauth/client.json": {
    "client_id": "https://chatgpt.com/oauth/client.json",
    "client_uri": "https://chatgpt.com/",
    "redirect_uris": [
      "https://chatgpt.com/connector_platform_oauth_redirect"
    ],
    "token_endpoint_auth_method": "private_key_jwt",
    "token_endpoint_auth_methods_supported": [
      "none",
      "private_key_jwt"
    ],
    "grant_types": [
      "authorization_code",
      "refresh_token"
    ],
    "response_types": [
      "code"
    ],
    "client_name": "ChatGPT",
    "logo_uri": "https://persistent.oaistatic.com/sonic/misc/openai-logo.png",
    "token_endpoint_auth_signing_alg": "RS256",
    "jwks_uri": "https://chatgpt.com/oauth/jwks.json"
  },
  "https://chatgpt.com/oauth/codex/client.json": {
    "client_id": "https://chatgpt.com/oauth/codex/client.json",
    "client_uri": "https://chatgpt.com/codex",
    "application_type": "native",
    "redirect_uris": [
      "http://127.0.0.1/callback",
      "http://localhost/callback"
    ],
    "token_endpoint_auth_method": "none",
    "token_endpoint_auth_methods_supported": [
      "none"
    ],
    "grant_types": [
      "authorization_code",
      "refresh_token"
    ],
    "response_types": [
      "code"
    ],
    "client_name": "Codex",
    "logo_uri": "https://persistent.oaistatic.com/sonic/misc/openai-logo.png"
  },
  "https://vscode.dev/oauth/client-metadata.json": {
    "client_name": "Visual Studio Code",
    "logo_uri": "https://code.visualstudio.com/assets/branding/code-stable.png",
    "grant_types": [
      "authorization_code",
      "refresh_token",
      "urn:ietf:params:oauth:grant-type:device_code"
    ],
    "response_types": [
      "code"
    ],
    "token_endpoint_auth_method": "none",
    "application_type": "native",
    "client_id": "https://vscode.dev/oauth/client-metadata.json",
    "client_uri": "https://vscode.dev/product",
    "redirect_uris": [
      "http://127.0.0.1:33418/",
      "https://vscode.dev/redirect"
    ]
  }
};
// documents: end
