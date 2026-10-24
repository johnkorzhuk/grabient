/* /random with a palette file's extension: a new random palette's file, at the view and size the query asks for, as
   /random leads to a new random palette's page. Every ask draws another, so no cache keeps the answer
   (server/paths.ts), and the file it leads to is kept as any palette's file is. */
import { encodePalette } from "@grabient/engine";
import { randomPalette } from "@grabient/engine/random.ts";
import { redirect } from "../../lib/responses.ts";

/** The name that stands for a new random palette in a file's address. */
export const RANDOM = "random";

export function randomFile(request: Request, extension: string): Response {
  const url = new URL(request.url);
  const to = new URL(`/${encodePalette(randomPalette())}.${extension}${url.search}`, url);
  return redirect(to.toString(), 302);
}
