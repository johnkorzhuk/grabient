/* A clip's bytes as a player asks for them: the whole file, or the one span of it a Range names (Safari asks for
   nothing else), from the bytes just drawn or from R2. It imports nothing, so the drawing (video-make.ts), which loads
   apart from the Worker's start, shares it with the answer (video.ts) and with no module the start loads. */

/** The one span of bytes a Range asks for, first and last within `size`; null for the whole (no Range, or more than one
    span), "past" for a span that starts past the end. */
export function spanOf(header: string | null, size: number): [number, number] | null | "past" {
  const asked = /^bytes=(\d*)-(\d*)$/.exec(header?.trim() ?? "");
  if (!asked || (asked[1] === "" && asked[2] === "")) return null;
  if (asked[1] === "") {
    const last = Number(asked[2]);
    return last === 0 ? "past" : [Math.max(0, size - last), size - 1];
  }
  const first = Number(asked[1]);
  const end = asked[2] === "" ? size - 1 : Math.min(Number(asked[2]), size - 1);
  return first >= size || end < first ? "past" : [first, end];
}

const past = (headers: Record<string, string>, size: number) =>
  new Response(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${size}` } });

/** A clip's bytes, or the span a Range asks for. */
export function bytesAnswer(
  request: Request,
  bytes: Uint8Array<ArrayBuffer>,
  headers: Record<string, string>
) {
  const span = spanOf(request.headers.get("Range"), bytes.length);
  if (span === "past") return past(headers, bytes.length);
  if (!span) return new Response(bytes, { headers });
  const [first, last] = span;
  return new Response(bytes.slice(first, last + 1), {
    status: 206,
    headers: { ...headers, "Content-Range": `bytes ${first}-${last}/${bytes.length}` }
  });
}

/** A kept clip from R2, or the span a Range asks for, judged against the clip's size; null where none is kept. */
export async function keptAnswer(
  request: Request,
  store: R2Bucket,
  name: string,
  headers: Record<string, string>
): Promise<Response | null> {
  const range = request.headers.get("Range");
  const spanned = range !== null && spanOf(range, Number.MAX_SAFE_INTEGER) !== null;
  const object = await store
    .get(name, spanned ? { range: request.headers } : undefined)
    .catch(() => undefined);
  if (object === undefined) {
    // R2 refuses a span that starts past the end: the clip's size says how large it is
    const head = spanned ? await store.head(name).catch(() => null) : null;
    return head ? past(headers, head.size) : null;
  }
  if (!object || !("body" in object)) return null;
  const kept = { ...headers, "X-Cache": "HIT" };
  const span = spanned ? spanOf(range, object.size) : null;
  if (span === null) return new Response(object.body, { headers: kept });
  if (span === "past") {
    await object.body.cancel();
    return past(headers, object.size);
  }
  const [first, last] = span;
  const given = object.range as { offset?: number; length?: number; suffix?: number } | undefined;
  const givenFirst =
    given?.suffix !== undefined ? object.size - given.suffix : (given?.offset ?? 0);
  const givenLength = given?.suffix ?? given?.length ?? object.size - givenFirst;
  /* R2 read the span as this reads it, or the span is read again as this reads it */
  let body = object.body;
  if (givenFirst !== first || givenLength !== last - first + 1) {
    await object.body.cancel();
    const again = await store.get(name, { range: { offset: first, length: last - first + 1 } });
    if (!again || !("body" in again)) return null;
    body = again.body;
  }
  return new Response(body, {
    status: 206,
    headers: { ...kept, "Content-Range": `bytes ${first}-${last}/${object.size}` }
  });
}
