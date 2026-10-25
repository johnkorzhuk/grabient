/* The Worker's own cache in front of Start: the Cache API of the data center that runs it. It keeps only a public
   200 to a GET or 301 to a GET or a HEAD, with a positive lifetime in `CDN-Cache-Control` (else `Cache-Control`), no
   `private` or `no-store`, no `Set-Cookie` and no `Vary`. The Cache API reads a lifetime from `Cache-Control`, so the
   kept copy carries the edge's and holds the browser's aside for a hit to put back. A HEAD reads what a GET kept, and
   of its own answers keeps only a 301, which has no body a GET could miss. A cache that cannot be read or written is
   passed by. */

const BROWSER_POLICY = "X-Grabient-Browser-Cache";
const STATUS = "X-Grabient-Cache";

const edgeCache = () => (globalThis as { caches?: { default?: Cache } }).caches?.default;

/** The edge lifetime a response asks for, in seconds, when it may be kept at all. */
export function keepFor(response: Response): number | null {
  const { status, headers } = response;
  if ((status !== 200 && status !== 301) || headers.has("Set-Cookie") || headers.has("Vary"))
    return null;
  const browser = headers.get("Cache-Control") ?? "";
  const edge = headers.get("CDN-Cache-Control") ?? browser;
  if (/private|no-store/i.test(`${edge},${browser}`)) return null;
  const seconds = Number(/(?:^|[,\s])max-age=(\d+)/.exec(edge)?.[1] ?? 0);
  return seconds > 0 ? seconds : null;
}

function fromCache(request: Request, kept: Response): Response {
  const etag = kept.headers.get("ETag");
  const unchanged = etag !== null && request.headers.get("If-None-Match") === etag;
  const body = request.method === "HEAD" || unchanged ? null : kept.body;
  const response = new Response(body, {
    status: unchanged ? 304 : kept.status,
    headers: kept.headers
  });
  response.headers.set("Cache-Control", kept.headers.get(BROWSER_POLICY) ?? "no-cache");
  response.headers.delete(BROWSER_POLICY);
  response.headers.set(STATUS, "HIT");
  return response;
}

/** The answer kept under `key`, or `render`'s, kept when it may be and `keep` takes it. */
export async function edgeCached(
  request: Request,
  key: string,
  ctx: ExecutionContext,
  render: () => Promise<Response>,
  keep: (response: Response) => boolean = () => true
): Promise<Response> {
  const cache = edgeCache();
  if (!cache || (request.method !== "GET" && request.method !== "HEAD")) return render();
  const keyRequest = new Request(key);
  const kept = await cache.match(keyRequest).catch(() => undefined);
  if (kept) return fromCache(request, kept);
  const rendered = await render();
  const response = new Response(rendered.body, rendered);
  const seconds =
    (request.method === "GET" || response.status === 301) && keep(response)
      ? keepFor(response)
      : null;
  if (seconds !== null) {
    const copy = response.clone();
    copy.headers.set("Cache-Control", `public, max-age=${seconds}`);
    copy.headers.set(BROWSER_POLICY, response.headers.get("Cache-Control") ?? "no-cache");
    ctx.waitUntil(cache.put(keyRequest, copy).catch(() => {}));
  }
  // an answer an inner cache gave keeps its word
  if (!response.headers.has(STATUS)) response.headers.set(STATUS, "MISS");
  return response;
}

/** Lets go of what this data center keeps under each key; the others keep theirs until it expires. */
export async function forget(keys: readonly string[]): Promise<void> {
  const cache = edgeCache();
  if (!cache) return;
  await Promise.all(keys.map(key => cache.delete(new Request(key)).catch(() => false)));
}
