const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function relativeAge(ms: number, nowMs: number): string {
  const s = Math.max(1, Math.round((nowMs - ms) / 1000));
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86_400 * 30) return `${Math.floor(s / 86_400)}d ago`;
  if (s < 86_400 * 365) return `${Math.floor(s / (86_400 * 30))}mo ago`;
  // Past a year "Ny ago" stops conveying recency, so switch to the absolute
  // month like the current site ("Apr 2025"). UTC keeps SSR and client output
  // identical regardless of the viewer's timezone.
  const d = new Date(ms);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
