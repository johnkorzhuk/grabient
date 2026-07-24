// HTML escaping shared by the SSR pages and the client bundle — html.ts
// imports build artifacts (styles.css, vite manifest) and must stay
// worker-only, so the esc helper lives here on its own.
export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}
