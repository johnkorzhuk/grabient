// The signed-in account the capture shows, mocked in the browser as the e2e tests do (apps/web/e2e/collections.spec.ts,
// signIn()): the session answers with the account, /api/me/sync with its collections, every other private read is
// refused. On top of the tests' mock: the sync keeps the account's collections as a server would, so a pick the page
// sends comes back settled; every other write is answered here; and nothing leaves for any host but the local preview.

export const ORIGIN = "http://127.0.0.1:25340";

const T0 = Date.UTC(2026, 8, 20, 18, 0, 0);

export const ACCOUNT = {
  id: "promo-mara",
  name: "Mara Lind",
  email: "mara@grabient.test",
  emailVerified: true,
  image: null,
  username: "mara",
  createdAt: Date.UTC(2026, 5, 2)
};

/** A collection of the account's own, as the sync answers one: the document, its id, its address and its preview. */
export function ownCollection({ id, title, items, updatedAt }) {
  const slug = `@${ACCOUNT.username}/${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
  const docItems = items.map((it, i) => ({
    kseed: it.seed,
    style: it.style,
    steps: it.steps,
    angle: it.angle,
    likes: it.likes ?? 1,
    createdAt: T0 - (i + 1) * 86_400_000,
    position: i
  }));
  return {
    id,
    slug,
    title,
    description: "",
    tags: [],
    visibility: "private",
    owner: { kind: "user", name: ACCOUNT.username, display: ACCOUNT.name },
    itemCount: docItems.length,
    createdAt: updatedAt - 20 * 86_400_000,
    updatedAt,
    saves: 0,
    url: `/${slug}`,
    preview: docItems.slice(0, 8).map(({ kseed, ...p }) => ({ seed: kseed, ...p })),
    items: docItems
  };
}

/** The server's side of the account: its collections and its likes, changed by the writes the page sends. A like is
    answered as the server answers one: listed back with the palette's count, which `counts` starts from. */
export function accountServer(collections) {
  const held = new Map(collections.map(c => [c.slug, structuredClone(c)]));
  const likes = new Map();
  const counts = new Map();
  let cursor = 1;
  let lastMutation = 0;
  const log = [];
  const preview = doc => doc.items.slice(0, 8).map(({ kseed, ...p }) => ({ seed: kseed, ...p }));
  function apply(op) {
    const doc = held.get(op.slug);
    if (op.op === "collection.add" && doc) {
      for (const it of op.items) {
        if (doc.items.some(x => x.kseed === it.seed && x.style === it.style && x.steps === it.steps && x.angle === it.angle)) continue;
        doc.items.push({ kseed: it.seed, style: it.style, steps: it.steps, angle: it.angle, likes: 1, createdAt: T0, position: doc.items.length });
      }
    } else if (op.op === "collection.remove" && doc) {
      doc.items = doc.items.filter(x => x.kseed !== op.seed || (op.view && (x.style !== op.view.style || x.steps !== op.view.steps || x.angle !== op.view.angle)));
      doc.items.forEach((x, i) => (x.position = i));
    } else if (op.op === "collection.restore" && doc && op.item) {
      doc.items.push({ kseed: op.item.seed, style: op.item.style, steps: op.item.steps, angle: op.item.angle, likes: 1, createdAt: T0, position: doc.items.length });
    } else if (op.op === "collection.create") {
      held.set(op.slug, ownCollection({ id: `promo-${held.size + 1}`, title: op.title, items: op.items, updatedAt: Date.now() }));
      return held.get(op.slug);
    } else if (op.op === "collection.delete" && doc) {
      held.delete(op.slug);
      return { gone: doc.id };
    } else {
      return null;
    }
    if (!doc) return null;
    doc.itemCount = doc.items.length;
    doc.updatedAt = Math.max(doc.updatedAt, Date.now());
    doc.preview = preview(doc);
    return doc;
  }
  return {
    log,
    held,
    counts,
    answer(body) {
      const first = body?.cursor == null;
      const changed = new Map();
      const removed = [];
      const results = [];
      const liked = [];
      const unliked = [];
      for (const m of body?.mutations ?? []) {
        if (m.op.op === "like") {
          const count = Math.max(0, (counts.get(m.op.seed) ?? 0) + (m.op.liked ? 1 : -1));
          counts.set(m.op.seed, count);
          if (m.op.liked) {
            const like = { seed: m.op.seed, style: m.op.style, steps: m.op.steps, angle: m.op.angle, at: Date.now(), likes: count };
            likes.set(m.op.seed, like);
            liked.push(like);
          } else {
            likes.delete(m.op.seed);
            unliked.push(m.op.seed);
          }
          results.push({ id: m.id, ok: true, likesCount: count });
          lastMutation = Math.max(lastMutation, m.id);
          log.push(m.op);
          continue;
        }
        const doc = apply(m.op);
        if (doc?.gone) removed.push(doc.gone);
        else if (doc) changed.set(doc.slug, doc);
        results.push({ id: m.id, ok: true, ...(m.op.op === "collection.remove" ? { restore: `r-${m.id}` } : {}) });
        lastMutation = Math.max(lastMutation, m.id);
        log.push(m.op);
      }
      if (body?.mutations?.length) cursor += 1;
      return {
        cursor,
        reset: first,
        likes: first ? [...likes.values()] : liked,
        unliked,
        collections: first ? [...held.values()] : [...changed.values()],
        removed,
        lastMutation,
        results,
        admin: false,
        language: true,
        account: ACCOUNT
      };
    }
  };
}

/** Routes for a context: the session, the account's sync, refusals for other private reads, writes answered here,
    and every other host cut off. `seen` collects what was asked, for the capture's log. */
export async function mockAccount(context, server, seen = []) {
  const local = new URL(ORIGIN).host;
  // routes run newest first: this catch-all is registered first, so the account's routes below take precedence
  await context.route("**/*", route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.protocol === "data:" || url.protocol === "blob:") return route.continue();
    if (url.host !== local) {
      seen.push(`blocked ${request.method()} ${url.host}${url.pathname}`);
      return route.abort("blockedbyclient");
    }
    if (request.method() !== "GET" && request.method() !== "HEAD") {
      seen.push(`answered here ${request.method()} ${url.pathname}`);
      return route.fulfill({ status: 200, json: { ok: true } });
    }
    return route.continue();
  });
  await context.route("**/api/me/**", route => {
    seen.push(`refused ${route.request().method()} ${new URL(route.request().url()).pathname}`);
    return route.fulfill({ status: 404, json: {} });
  });
  await context.route("**/api/auth/get-session*", route =>
    route.fulfill({ json: { session: { id: "promo", userId: ACCOUNT.id }, user: ACCOUNT } })
  );
  await context.route("**/api/me/sync*", route => {
    let body = null;
    try {
      body = route.request().postDataJSON();
    } catch {}
    const answer = server.answer(body);
    seen.push(`sync ${body?.mutations?.length ?? 0} change(s) -> cursor ${answer.cursor}`);
    return route.fulfill({ json: answer });
  });
}
