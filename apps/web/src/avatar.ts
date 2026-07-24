// Avatar upload helpers (validation + key scheme), factored out of index.ts
// for unit testing. Mirrors the original's lib/r2.ts conventions.

/** RIFF....WEBP magic bytes — same sniffing as the original's validateImageFile. */
export function isWebpBuffer(buf: ArrayBuffer): boolean {
  if (buf.byteLength < 12) return false;
  const b = new Uint8Array(buf, 0, 12);
  return (
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && // RIFF
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 // WEBP
  );
}

/** avatars/{userId}/{timestamp}.webp — the original's generateAvatarKey. */
export function avatarKey(userId: string, timestampMs: number): string {
  return `avatars/${userId}/${timestampMs}.webp`;
}

/** Key for a stored avatar URL, or null when it isn't one of ours (e.g. Google's). */
export function avatarKeyFromUrl(url: string, publicBaseUrl: string): string | null {
  const prefix = `${publicBaseUrl}/`;
  return url.startsWith(prefix) ? url.slice(prefix.length) : null;
}
