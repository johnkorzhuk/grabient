// Smart pagination ported from the current site (palettes-pagination.tsx):
// always show first and last, plus 3 middle pages with ellipses — no
// prev/next arrows. ≤5 pages renders them all. Shared by the SSR pages and
// the grid island so both layers paint the identical control.
export function pageNumbers(page: number, totalPages: number): (number | "...")[] {
  if (totalPages <= 0) return [];
  if (totalPages === 1) return [1];
  if (totalPages <= 5) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const safe = Math.max(1, Math.min(page, totalPages));
  let middleStart: number;
  let middleEnd: number;
  if (safe <= 3) {
    middleStart = 2;
    middleEnd = 4;
  } else if (safe >= totalPages - 2) {
    middleStart = totalPages - 3;
    middleEnd = totalPages - 1;
  } else {
    middleStart = safe - 1;
    middleEnd = safe + 1;
  }
  const pages: (number | "...")[] = [1];
  if (middleStart > 2) pages.push("...");
  for (let i = middleStart; i <= middleEnd; i++) if (i > 1 && i < totalPages) pages.push(i);
  if (middleEnd < totalPages - 1) pages.push("...");
  pages.push(totalPages);
  return pages;
}
