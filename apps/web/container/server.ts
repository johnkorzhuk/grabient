/* The video container's HTTP server, on port 8080, which only the Worker's VideoDrawer Durable Object reaches
   (src/server/images/video-drawer.ts): it draws one clip at a time, whole (pipeline.ts).
     GET  /ping      the Durable Object's look for a started container
     POST /draw      {name, job}: the clip's MP4. The same name asked again while it is drawn, or after, is answered
                     from that drawing, so a Durable Object that asks again after a reset pays for nothing twice.
     GET  /progress  {name, coded, frames} of the clip being drawn
   Node runs as PID 1 here, and the kernel ignores a signal PID 1 has no handler for: without the handlers below, a
   stop() leaves the container running, and billing, until it is destroyed. */
import { readFileSync } from "node:fs";
import http from "node:http";
import type { VideoWholeJob } from "./clip.ts";
import { drawWhole } from "./pipeline.ts";

for (const signal of ["SIGTERM", "SIGINT"] as const) process.on(signal, () => process.exit(0));

const module = new WebAssembly.Module(readFileSync(new URL("./video.wasm", import.meta.url)));
let current: {
  name: string;
  frames: number;
  coded: number;
  drawing: Promise<Uint8Array<ArrayBuffer>>;
} | null = null;

const json = (res: http.ServerResponse, body: unknown, status = 200) => {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(text)
  });
  res.end(text);
};

async function bodyOf(req: http.IncomingMessage): Promise<string> {
  const parts: Buffer[] = [];
  for await (const part of req) parts.push(part as Buffer);
  return Buffer.concat(parts).toString("utf8");
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://container");
  try {
    if (url.pathname === "/ping") return void res.end("ok");
    if (url.pathname === "/progress") {
      return json(
        res,
        current ? { name: current.name, coded: current.coded, frames: current.frames } : {}
      );
    }
    if (url.pathname !== "/draw" || req.method !== "POST")
      return json(res, { error: "not found" }, 404);
    const { name, job } = JSON.parse(await bodyOf(req)) as { name: string; job: VideoWholeJob };
    if (current?.name !== name) {
      const clip = { name, frames: job.plan.frames, coded: 0 } as NonNullable<typeof current>;
      clip.drawing = drawWhole(job, module, { onCoded: coded => (clip.coded = coded) });
      // a drawing that failed is drawn again at the next asking
      clip.drawing.catch(() => {
        if (current === clip) current = null;
      });
      current = clip;
    }
    const bytes = await current.drawing;
    res.writeHead(200, { "content-type": "video/mp4", "content-length": bytes.length });
    res.end(bytes);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) json(res, { error: String((error as Error)?.message ?? error) }, 500);
    else res.destroy(error as Error);
  }
});
server.keepAliveTimeout = 120_000;
server.requestTimeout = 0;
server.listen(Number(process.env.PORT ?? 8080));
