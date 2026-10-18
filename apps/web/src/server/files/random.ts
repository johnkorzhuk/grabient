/* A random palette's picture, /random.svg and /random.png. With `name`, the palette that name always draws, answered
   as its own address answers, so the edge keeps one copy of both. Without, a new palette each time, sent to its own
   address, which an app may keep. */
import { encodePalette } from "@grabient/engine/codec.ts";
import { randomPalette } from "@grabient/engine/random.ts";
import { redirect } from "../../lib/responses.ts";
import { addressParams } from "./address.ts";
import { namedPalette } from "./resolve.ts";

export async function randomFile(
  request: Request,
  extension: "svg" | "png",
  answer: (request: Request) => Response | Promise<Response>
): Promise<Response> {
  const url = new URL(request.url);
  const name = addressParams(url.searchParams).get("name");
  if (name === null) {
    const seed = encodePalette(randomPalette());
    return redirect(new URL(`/${seed}.${extension}${url.search}`, url).toString(), 302);
  }
  url.pathname = `/${namedPalette(name).seed}.${extension}`;
  return answer(new Request(url, request));
}
