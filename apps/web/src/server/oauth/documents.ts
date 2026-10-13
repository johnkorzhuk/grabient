/* A saved client metadata document (client-documents.data.ts) against the one its maker publishes now. The six-hour
   job (upkeep.ts) and the operator's script (scripts/client-documents.ts) compare the same way, so what the alert
   says changed is what the script shows and rewrites. */

export type ClientDocument = Readonly<Record<string, unknown>>;

const DOCUMENT_MAX = 5 * 1024;

const sorted = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(sorted)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
            .map(([key, held]) => [key, sorted(held)])
        )
      : value;
/** A value as JSON with every object's keys in order: two documents that say the same are the same text. */
export const canonical = (value: unknown): string => JSON.stringify(sorted(value));

/** The document its maker publishes at a client_id URL, or why it could not be read. No redirect is followed, as
    none is when an app connects. */
export async function publishedDocument(
  clientId: string,
  timeoutMs: number
): Promise<Record<string, unknown> | string> {
  try {
    const response = await fetch(clientId, {
      headers: { Accept: "application/json" },
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (response.status !== 200) return `HTTP ${response.status}`;
    const text = await response.text();
    if (text.length > DOCUMENT_MAX) return "larger than 5 KB";
    const value: unknown = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value)
      ? { ...value }
      : "not a JSON object";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

/** The top-level fields in which a published document differs from its saved copy, in order; none when they say the
    same. */
export const differingFields = (saved: ClientDocument, live: ClientDocument): string[] =>
  [...new Set([...Object.keys(saved), ...Object.keys(live)])]
    .filter(field => canonical(saved[field]) !== canonical(live[field]))
    .sort();
