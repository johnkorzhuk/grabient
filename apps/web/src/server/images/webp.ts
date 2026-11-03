/* WebP files from a picture's pixels, by libwebp: Squoosh's build of its encoder, as @jsquash/webp ships it, with SIMD.
   The caller hands over its module compiled, as the video's is (engine/video.ts): the Worker imports it with the
   still's answer (still.ts), a test reads its file. An isolate makes one encoder, with the first picture it codes, in
   a few milliseconds. */
import factory from "@jsquash/webp/codec/enc/webp_enc_simd.js";

/** libwebp's settings (WebPConfig in its encode.h), every one of which the encoder reads. */
export interface WebpOptions {
  quality: number;
  target_size: number;
  target_PSNR: number;
  method: number;
  sns_strength: number;
  filter_strength: number;
  filter_sharpness: number;
  filter_type: number;
  partitions: number;
  segments: number;
  pass: number;
  show_compressed: number;
  preprocessing: number;
  autofilter: number;
  partition_limit: number;
  alpha_compression: number;
  alpha_filtering: number;
  alpha_quality: number;
  lossless: number;
  exact: number;
  image_hint: number;
  emulate_jpeg_size: number;
  thread_level: number;
  low_memory: number;
  near_lossless: number;
  use_delta_palette: number;
  use_sharp_yuv: number;
}

/** libwebp's own defaults, as Squoosh sets them, but for the quality the caller names. */
const DEFAULTS: Omit<WebpOptions, "quality"> = {
  target_size: 0,
  target_PSNR: 0,
  method: 4,
  sns_strength: 50,
  filter_strength: 60,
  filter_sharpness: 0,
  filter_type: 1,
  partitions: 0,
  segments: 4,
  pass: 1,
  show_compressed: 0,
  preprocessing: 0,
  autofilter: 0,
  partition_limit: 0,
  alpha_compression: 1,
  alpha_filtering: 1,
  alpha_quality: 100,
  lossless: 0,
  exact: 0,
  image_hint: 0,
  emulate_jpeg_size: 0,
  thread_level: 0,
  low_memory: 0,
  near_lossless: 100,
  use_delta_palette: 0,
  use_sharp_yuv: 0
};

interface Encoder {
  encode(
    data: BufferSource,
    width: number,
    height: number,
    options: WebpOptions
  ): Uint8Array | null;
}
/* the module Emscripten writes, as much of it as this calls: its own types name a namespace they never declare */
type Make = (options: {
  noInitialRun: boolean;
  instantiateWasm: (
    imports: WebAssembly.Imports,
    done: (instance: WebAssembly.Instance) => void
  ) => WebAssembly.Exports;
}) => Promise<Encoder>;

/* The encoder made from `wasm`, kept once it is made. Only a made one is kept, never the promise of one, which a
   request would share with another (shared-work.ts): two pictures that both find none make one each, a few
   milliseconds' work. */
let made: { wasm: WebAssembly.Module; encoder: Encoder } | null = null;
async function encoderOf(wasm: WebAssembly.Module): Promise<Encoder> {
  if (made?.wasm === wasm) return made.encoder;
  const encoder = await (factory as unknown as Make)({
    noInitialRun: true,
    instantiateWasm: (imports, done) => {
      const instance = new WebAssembly.Instance(wasm, imports);
      done(instance);
      return instance.exports;
    }
  });
  made = { wasm, encoder };
  return encoder;
}

/** RGBA pixels, `width` by `height`, as a lossy WebP file at `quality` (0 to 100). */
export async function encodeWebp(
  wasm: WebAssembly.Module,
  rgba: Uint8Array<ArrayBuffer> | Uint8ClampedArray<ArrayBuffer>,
  width: number,
  height: number,
  quality: number
): Promise<Uint8Array<ArrayBuffer>> {
  if (rgba.length !== width * height * 4) throw new Error("webp: pixels and size disagree");
  const encoder = await encoderOf(wasm);
  const file = encoder.encode(rgba, width, height, { ...DEFAULTS, quality });
  if (!file) throw new Error("webp: libwebp coded nothing");
  return new Uint8Array(file);
}
