/* Builds the video container's image without Docker and pushes it to Cloudflare's registry, then writes its tag into
   container/image.json, which cloudflare.config.ts names for staging (container/, src/server/images/video-drawer.ts).
   Run it from apps/web after a change to what the image carries (container/carried.ts: the bundles of container/ and
   the engine code they import, and video.wasm) or to the clips' drawing (VIDEO_DRAWING), which a test
   (container/image.test.ts) holds image.json to:

     CRANE=/path/to/crane pnpm video:image

   crane (github.com/google/go-containerregistry, one static binary) lays a layer of the bundled server, its two
   thread files and video.wasm over Node's image and pushes it; `cf` hands out the registry's credentials, with
   CLOUDFLARE_ACCOUNT_ID set where the login sees more than one account. The tag is the layer's own hash, so the same
   sources make the same tag and a push of them changes nothing. */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { carriedHash, containerBundles, VIDEO_WASM } from "../container/carried.ts";

const ACCOUNT_ID = "f846204052f664d57da7acde8f6803cd";
const REPOSITORY = `registry.cloudflare.com/${ACCOUNT_ID}/grabient-video`;
/** Node 24's slim image for linux/amd64, pinned so a tag always names the same bytes. */
const BASE =
  "docker.io/library/node:24-slim@sha256:a43f7fc3e52e87d12a905f46eea0275def84ca8f2981a5b53fed44d7fb398ee0";
const web = new URL("..", import.meta.url).pathname;
const crane = process.env.CRANE ?? "crane";

const work = mkdtempSync(join(tmpdir(), "grabient-video-image-"));
try {
  const app = join(work, "layer/app");
  mkdirSync(app, { recursive: true });
  /* the bytes the test holds the image to, written as they were hashed */
  const bundles = await containerBundles();
  const wasm = readFileSync(VIDEO_WASM);
  for (const [name, bytes] of bundles) writeFileSync(join(app, name), bytes);
  writeFileSync(join(app, "video.wasm"), wasm);
  // the same files make the same bytes: no times, no owners
  const layer = join(work, "layer.tar");
  execFileSync("tar", [
    "--owner=0",
    "--group=0",
    "--numeric-owner",
    "--mtime=2026-01-01 00:00:00",
    "--sort=name",
    "-C",
    join(work, "layer"),
    "-cf",
    layer,
    "app"
  ]);
  const tag = createHash("sha256").update(readFileSync(layer)).digest("hex").slice(0, 16);
  const image = `${REPOSITORY}:${tag}`;

  const credentials = JSON.parse(
    execFileSync(
      "cf",
      [
        "containers",
        "registries",
        "credentials",
        "generate",
        "registry.cloudflare.com",
        "--expiration-minutes",
        "30",
        "--permissions",
        "push",
        "pull"
      ],
      { encoding: "utf8" }
    )
  ) as { password: string; username?: string };
  // crane keeps its login in this folder alone, never ~/.docker
  const env = { ...process.env, DOCKER_CONFIG: join(work, "docker") };
  execFileSync(
    crane,
    [
      "auth",
      "login",
      "registry.cloudflare.com",
      "-u",
      credentials.username ?? "v1",
      "--password-stdin"
    ],
    { env, input: credentials.password }
  );
  execFileSync(
    crane,
    [
      "mutate",
      BASE,
      "--platform",
      "linux/amd64",
      "--append",
      layer,
      "--entrypoint",
      "node,/app/server.mjs",
      "--cmd",
      "",
      "--workdir",
      "/app",
      "--exposed-ports",
      "8080",
      "-t",
      image
    ],
    { env, stdio: "inherit" }
  );

  const drawing = /VIDEO_DRAWING = "([^"]+)"/.exec(
    readFileSync(join(web, "src/server/images/video.ts"), "utf8")
  )?.[1];
  const module = createHash("sha256").update(wasm).digest("hex").slice(0, 12);
  writeFileSync(
    join(web, "container/image.json"),
    `${JSON.stringify({ tag, drawing, module, carries: carriedHash(bundles, wasm) }, null, 2)}\n`
  );
  console.log(`pushed ${image}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
