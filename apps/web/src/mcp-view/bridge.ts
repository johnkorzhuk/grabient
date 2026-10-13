/* The view's end of the MCP Apps bridge: JSON-RPC 2.0 over postMessage with the app that draws it. No SDK: the
   official one needs zod and the MCP SDK, and the view speaks a dozen messages. Only the frame's parent is listened to
   (a web app's sandbox relays the app), and nothing the view says is secret, so messages go out to any origin, as the
   specification's own client does. */

export type Params = Record<string, unknown>;

/** A request the app answered with an error: its code says whether the app lacks the method (-32601) or said no. */
export class Refused extends Error {
  readonly code: number | null;
  constructor(message: string, code: number | null) {
    super(message);
    this.code = code;
  }
}

export const object = (value: unknown): Params =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Params) : {};

export interface Bridge {
  /** A request to the app, answered with its result or refused with its error. */
  request(method: string, params?: Params): Promise<Params>;
  notify(method: string, params?: Params): void;
  /** What a notification from the app does. */
  on(method: string, handle: (params: Params) => void): void;
  /** What a request from the app answers; any other is answered as unknown. */
  answer(method: string, handle: (params: Params) => Params): void;
}

export function createBridge(host: Window = window.parent): Bridge {
  let next = 1;
  const pending = new Map<
    number,
    { resolve: (result: Params) => void; reject: (error: Error) => void }
  >();
  const listeners = new Map<string, (params: Params) => void>();
  const answers = new Map<string, (params: Params) => Params>();
  const post = (message: Params) => host.postMessage({ jsonrpc: "2.0", ...message }, "*");
  window.addEventListener("message", event => {
    if (event.source !== host) return;
    const message = object(event.data);
    if (message.jsonrpc !== "2.0") return;
    const { id, method } = message;
    if (typeof method === "string") {
      if (id === undefined || id === null) {
        listeners.get(method)?.(object(message.params));
        return;
      }
      const handle = answers.get(method);
      post(
        handle
          ? { id, result: handle(object(message.params)) }
          : { id, error: { code: -32601, message: `Method not found: ${method}` } }
      );
      return;
    }
    const waiting = typeof id === "number" ? pending.get(id) : undefined;
    if (!waiting) return;
    pending.delete(id as number);
    if (message.error === undefined) waiting.resolve(object(message.result));
    else {
      const error = object(message.error);
      const code = typeof error.code === "number" ? error.code : null;
      waiting.reject(new Refused(String(error.message ?? "The app refused the request."), code));
    }
  });
  return {
    request: (method, params = {}) =>
      new Promise((resolve, reject) => {
        const id = next++;
        pending.set(id, { resolve, reject });
        post({ id, method, params });
      }),
    notify: (method, params = {}) => post({ method, params }),
    on: (method, handle) => {
      listeners.set(method, handle);
    },
    answer: (method, handle) => {
      answers.set(method, handle);
    }
  };
}
