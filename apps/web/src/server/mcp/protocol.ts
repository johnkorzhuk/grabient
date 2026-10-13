/* MCP over Streamable HTTP without sessions or streams: one JSON-RPC request in, one JSON answer out. Two eras are
   served. A request that carries its protocol version in `_meta` (2026-07-28) is answered as that revision says; one
   that opens with `initialize` (2025-11-25 and earlier) gets the handshake it expects. Neither keeps anything between
   requests. Pure: the server (server.ts) reads a request's body and headers into these. */

export const MODERN: readonly string[] = ["2026-07-28"];
export const LEGACY: readonly string[] = ["2025-11-25", "2025-06-18", "2025-03-26"];
export const SUPPORTED: readonly string[] = [...MODERN, ...LEGACY];
export const META = "io.modelcontextprotocol/";

export const PARSE = -32700;
export const INVALID = -32600;
export const NO_METHOD = -32601;
export const BAD_PARAMS = -32602;
export const NO_RESOURCE = -32002;
export const HEADER_MISMATCH = -32020;
export const UNSUPPORTED_VERSION = -32022;

export type Id = string | number;
export type Params = Record<string, unknown>;

export interface Message {
  id: Id;
  method: string;
  params: Params;
  /** the params' `_meta` */
  meta: Params;
}

/** A JSON-RPC error, with the HTTP status the transport answers it with. */
export interface Failure {
  id?: Id;
  code: number;
  message: string;
  status: number;
  data?: unknown;
}

export const failure = (
  id: Id | undefined,
  code: number,
  message: string,
  status = 200,
  data?: unknown
): Failure => ({
  ...(id === undefined ? {} : { id }),
  code,
  message,
  status,
  ...(data === undefined ? {} : { data })
});

/** The answer's body for a failure. */
export const failureBody = ({ id, code, message, data }: Failure) => ({
  jsonrpc: "2.0",
  ...(id === undefined ? {} : { id }),
  error: { code, message, ...(data === undefined ? {} : { data }) }
});

const object = (value: unknown): Params | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Params) : null;

/** A request's body as one JSON-RPC message: the message, a failure, or a notification (or an answer to a request
    this server never makes), which is taken with nothing to say. Null bytes are a body missing or past the limit. */
export function readMessage(bytes: Uint8Array | null): Message | Failure | "notification" {
  if (!bytes) return failure(undefined, INVALID, "The request body is missing or too large.", 413);
  let sent: unknown;
  try {
    sent = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return failure(undefined, PARSE, "The body is not JSON.", 400);
  }
  const message = object(sent);
  if (!message) return failure(undefined, INVALID, "Send one JSON-RPC message.", 400);
  if (typeof message.method !== "string" || message.id === undefined || message.id === null)
    return "notification";
  if (typeof message.id !== "string" && typeof message.id !== "number")
    return failure(undefined, INVALID, "The request id is a string or a number.", 400);
  const params = object(message.params) ?? {};
  return { id: message.id, method: message.method, params, meta: object(params._meta) ?? {} };
}

/** A header's value as the body wrote it: the 2026-07-28 transport sends a name that is not plain ASCII in base64. */
export function headerValue(raw: string | null): string | null {
  const sentinel = raw ? /^=\?base64\?(.*)\?=$/.exec(raw) : null;
  if (!sentinel) return raw;
  try {
    return new TextDecoder().decode(
      Uint8Array.from(atob(sentinel[1]!), char => char.charCodeAt(0))
    );
  } catch {
    return null;
  }
}

/** Which era a request speaks, and whether its headers agree with its body: its own version in `_meta`, the discovery
    call, or a modern version in the header say 2026-07-28; anything else is the handshake's. A resource read that names
    no version is answered in the handshake's shape whatever its header says: Claude's iOS app reads the view so. */
export function eraOf(message: Message, headers: Headers): { modern: boolean } | Failure {
  const { id, method, params, meta } = message;
  const sent = headers.get("MCP-Protocol-Version");
  const named = meta[`${META}protocolVersion`];
  const modern =
    named !== undefined ||
    method === "server/discover" ||
    (sent !== null && MODERN.includes(sent) && method !== "resources/read");
  if (!modern) {
    if (sent !== null && !SUPPORTED.includes(sent)) {
      return failure(
        id,
        INVALID,
        `Unsupported MCP-Protocol-Version. Supported: ${SUPPORTED.join(", ")}.`,
        400
      );
    }
    return { modern };
  }
  if (typeof named !== "string") {
    return failure(
      id,
      BAD_PARAMS,
      `Every request names its protocol version in _meta["${META}protocolVersion"].`,
      400
    );
  }
  if (sent !== named) {
    return failure(
      id,
      HEADER_MISMATCH,
      `Header mismatch: MCP-Protocol-Version is ${sent ?? "missing"} and the body says ${named}.`,
      400
    );
  }
  if (!MODERN.includes(named)) {
    return failure(id, UNSUPPORTED_VERSION, "Unsupported protocol version", 400, {
      supported: SUPPORTED,
      requested: named
    });
  }
  if (!object(meta[`${META}clientCapabilities`])) {
    return failure(
      id,
      BAD_PARAMS,
      `Every request carries _meta["${META}clientCapabilities"].`,
      400
    );
  }
  const declared = headers.get("Mcp-Method");
  if (declared !== method) {
    return failure(
      id,
      HEADER_MISMATCH,
      `Header mismatch: Mcp-Method is ${declared ?? "missing"} and the body says ${method}.`,
      400
    );
  }
  const name = headerValue(headers.get("Mcp-Name"));
  if (method === "tools/call" && name !== params.name) {
    return failure(
      id,
      HEADER_MISMATCH,
      "Header mismatch: Mcp-Name does not name the tool the body calls.",
      400
    );
  }
  if (method === "resources/read" && name !== params.uri) {
    return failure(
      id,
      HEADER_MISMATCH,
      "Header mismatch: Mcp-Name does not name the resource the body reads.",
      400
    );
  }
  return { modern };
}
