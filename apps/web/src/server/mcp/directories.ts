import { json, NO_STORE } from "../auth/http.ts";
import type { Env } from "../env.ts";

/* The proofs two directories of MCP servers ask a site to serve before they list it: OpenAI's apps directory reads a
   challenge at /.well-known/openai-apps-challenge, and the MCP Registry reads the public key of the com.grabient
   namespace at /.well-known/mcp-registry-auth. Each is a secret set on the day, so no code changes to answer one. */

const DIRECTORY_TOKENS = {
  "/.well-known/openai-apps-challenge": "OPENAI_APPS_CHALLENGE",
  "/.well-known/mcp-registry-auth": "MCP_REGISTRY_AUTH"
} as const satisfies Record<string, keyof Env>;

/** Whether the Worker should hand a path (without its language) to directoryProof. */
export const directoryPath = (path: string): path is keyof typeof DIRECTORY_TOKENS =>
  Object.hasOwn(DIRECTORY_TOKENS, path);

/** The token a directory asks for, exactly as set, as plain text; 404 while it is unset. */
export function directoryProof(request: Request, env: Env): Response {
  const path = new URL(request.url).pathname;
  const token = directoryPath(path) ? env[DIRECTORY_TOKENS[path]] : undefined;
  if (!token) return json({ error: "Not found" }, 404);
  return new Response(request.method === "HEAD" ? null : token, {
    headers: { ...NO_STORE, "Content-Type": "text/plain; charset=utf-8" }
  });
}
