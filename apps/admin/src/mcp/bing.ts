// Bing-sourced tools: bing.
//
// The second index, and the only one that answers "how many of our pages are
// actually stored" as a single daily number — Google exposes that only as
// 2,000 per-URL inspections a day. The AI Performance report has NO API
// (verified 2026-08-17): a human must read it in the Bing UI.
//
// The credential is the sharp edge. Bing's key is per-user and grants WRITES
// with no scoping, so the read-only contract is the method allow-list in
// bing.ts — not anything the caller passes. This tool exposes the method name
// directly so an agent can reach the whole read surface, and the allow-list is
// what makes that safe.

import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { READ_METHODS, bingFetch, dotNetDay } from "../bing";
import { json, notConfigured, refused } from "./helpers";

export function registerBing(server: McpServer, env: Env) {
  server.registerTool(
    "bing",
    {
      description:
        "Call Bing Webmaster Tools for grabient.com. `method` is a Bing API " +
        "method name; `methods:true` lists every one this server will call. " +
        "GetCrawlStats is the valuable one — its `InIndex` field is a daily " +
        "AGGREGATE indexed-page count, the number Google refuses to expose at " +
        "any price, and the persisted bing.indexed series accumulates from it. " +
        "Traffic and crawl bucket DAILY; query and page stats bucket WEEKLY, so " +
        "never compare a weekly row to a daily one. Clicks BUNDLE Copilot and " +
        "chat surfaces with web results, so a rise is not evidence of AI " +
        "citation — the AI Performance report has no API at all and must be " +
        "read by a human in the Bing UI; do not report its silence as zero. " +
        "Only read methods are callable: the API key grants writes with no " +
        "scoping, and the allow-list is the boundary that makes this safe.",
      inputSchema: z.object({
        method: z.string().max(60).optional(),
        methods: z.boolean().optional(),
        params: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
      }),
      annotations: { readOnlyHint: true },
    },
    async (args: {
      method?: string;
      methods?: boolean;
      params?: Record<string, string | number>;
    }) => {
      if (args.methods || !args.method)
        return json({
          callable: [...READ_METHODS].sort(),
          note:
            "Read methods only. Anything absent is either a write (deliberately unreachable) or not yet allow-listed. Pass extra arguments — page, link, url — through `params`.",
          noApi: [
            "AI Performance report — dashboard only, verified 2026-08-17. A human must read it.",
          ],
        });

      const res = await bingFetch(env, args.method, args.params ?? {});
      if (!res.ok) {
        if (!res.configured)
          return notConfigured("Bing Webmaster", "needs BING_API_KEY");
        return refused("Bing Webmaster", res.status ?? "refused", res.message);
      }

      // .NET dates are unreadable as-is and appear in most of these payloads.
      const normalize = (row: any): any => {
        if (!row || typeof row !== "object") return row;
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(row)) {
          if (k === "__type") continue;
          const day = typeof v === "string" ? dotNetDay(v) : null;
          out[k === "Date" ? "day" : k] = day ?? v;
        }
        return out;
      };
      const rows = Array.isArray(res.d) ? res.d.map(normalize) : normalize(res.d);
      return json({
        method: args.method,
        rowCount: Array.isArray(rows) ? rows.length : 1,
        rows,
      });
    },
  );
}
