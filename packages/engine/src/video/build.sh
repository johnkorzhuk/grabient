#!/bin/sh
# video.wasm from video.c: zig (0.13 or later, e.g. `pip download ziglang`, its wheel unzipped) compiling C to wasm32
# with SIMD and no C library. The build never runs this: video.wasm is kept beside its source, and a change to the C
# keeps its rebuild with it. ZIG names the compiler where it is not on the path.
set -eu
cd "$(dirname "$0")"
"${ZIG:-zig}" cc -target wasm32-freestanding -O3 -msimd128 -mbulk-memory -ffreestanding -nostdlib -Ishim -Isimd \
  -D__SSE__ -D__SSE2__ -Wno-implicit-const-int-float-conversion \
  -Wl,--no-entry -Wl,--strip-all -Wl,-z,stack-size=1048576 -o video.wasm video.c
# zig writes its output executable; the module is data
chmod 644 video.wasm
# ../video.ts names the module by the first 12 hex digits of its sha256 (VIDEO_MODULE), which a clip's drawing is
# kept under and the container's image is held to: written here, so no rebuild leaves it to be pasted by hand
hash=$( (sha256sum video.wasm 2>/dev/null || shasum -a 256 video.wasm) | cut -c1-12)
sed "s/^export const VIDEO_MODULE = \"[0-9a-f]*\";$/export const VIDEO_MODULE = \"$hash\";/" ../video.ts > ../video.ts.next
mv ../video.ts.next ../video.ts
grep -q "^export const VIDEO_MODULE = \"$hash\";$" ../video.ts ||
  { echo "packages/engine/src/video.ts has no VIDEO_MODULE line to write $hash into" >&2; exit 1; }
echo "video.wasm $hash: VIDEO_MODULE in packages/engine/src/video.ts"
