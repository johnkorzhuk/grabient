/* A new account's first visit, as the site's own `gb_attr` cookie kept it ({s, m, c, r, l, t}): where the visitor came
   from, by what, which campaign, the referring site, the first page, and when. The cookie is written only with the
   visitor's consent to analytics, and read once, when the account is made. */

const FIELDS = {
  s: "attributionSource",
  m: "attributionMedium",
  c: "attributionCampaign",
  r: "attributionReferrer",
  l: "attributionLanding"
} as const;
const FIELD_MAX = 200;

type Attribution = Partial<Record<(typeof FIELDS)[keyof typeof FIELDS], string>> & {
  attributionAt?: Date;
};

export function attribution(headers: Headers | undefined): Attribution {
  const cookie = headers?.get("cookie")?.match(/(?:^|;\s*)gb_attr=([^;]+)/)?.[1];
  if (!cookie) return {};
  let kept: unknown;
  try {
    kept = JSON.parse(decodeURIComponent(cookie));
  } catch {
    return {};
  }
  if (!kept || typeof kept !== "object" || Array.isArray(kept)) return {};
  const read = kept as Record<string, unknown>;
  const out: Attribution = {};
  for (const [short, field] of Object.entries(FIELDS)) {
    const value = read[short];
    const trimmed = typeof value === "string" ? value.trim().slice(0, FIELD_MAX) : "";
    if (trimmed) out[field] = trimmed;
  }
  const at = read.t;
  if (typeof at === "number" && !Number.isNaN(new Date(at).getTime()))
    out.attributionAt = new Date(at);
  return out;
}
