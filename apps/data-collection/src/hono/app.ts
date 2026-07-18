import { Hono } from "hono";
import { paletteRoutes } from "./routes/palettes";
import { submitRoutes } from "./routes/submit";
import { captionRoutes } from "./routes/caption";
import { judgeRoutes } from "./routes/judge";
import { metaRoutes } from "./routes/meta";

export const app = new Hono<{ Bindings: Env }>();

app.get("/health", (c) => c.json({ ok: true }));

// Everything else mutates or reads dataset state: bearer auth required.
app.use("/api/*", async (c, next) => {
  const header = c.req.header("Authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "");
  if (!c.env.HARNESS_API_KEY || token !== c.env.HARNESS_API_KEY) {
    return c.json({ error: "unauthorized" }, 401);
  }
  await next();
});

app.route("/api/palettes", paletteRoutes);
app.route("/api/submit", submitRoutes);
app.route("/api/caption", captionRoutes);
app.route("/api/judge", judgeRoutes);
app.route("/api", metaRoutes);

app.onError((err, c) => {
  console.error("unhandled error", err);
  return c.json(
    { error: err instanceof Error ? err.message : "internal error" },
    500,
  );
});
