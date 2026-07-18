import { WorkerEntrypoint } from "cloudflare:workers";
import { app } from "@/hono/app";

export default class DataCollection extends WorkerEntrypoint<Env> {
  fetch(request: Request) {
    return app.fetch(request, this.env, this.ctx);
  }
}
