/** A message's key in a shipped catalog: FNV-1a over its UTF-16 code units, in base 36. The build, the Worker and the
    browser compute the same key, and collections' translations store it as the fingerprint of their English, so it must
    never change. The build refuses two messages with one key. */
export function messageKey(message: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < message.length; i++) {
    hash ^= message.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/** The key of a message whose English needs another translation in some place: the order "Saved" and the button
    "Saved" are `contextKey("Saved", "order")` and `"Saved"`. */
export const contextKey = (message: string, context?: string): string =>
  context ? `${context}\u0004${message}` : message;
