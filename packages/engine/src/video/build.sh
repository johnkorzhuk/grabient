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
