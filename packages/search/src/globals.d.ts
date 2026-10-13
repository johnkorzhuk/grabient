/* Every runtime this package runs in (Workers, Node, browsers) has these; the package compiles without DOM or Node
   types, so it declares the little it uses. */
declare class TextEncoder {
  encode(input?: string): Uint8Array<ArrayBuffer>;
}
declare class TextDecoder {
  decode(input?: ArrayBuffer | ArrayBufferView): string;
}
