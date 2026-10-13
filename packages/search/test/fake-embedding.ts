/* The stand-in for Workers AI's embedders that the golden fixtures were made with: each text's vector is a fixed
   function of its characters (FNV-1a over its UTF-16 code units, then sin), as long as the model expects. */
function fnv(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

export function fakeEmbedding(text: string, dims: number): number[] {
  const h = fnv(text);
  return Array.from({ length: dims }, (_, i) => Math.sin((i + 1) * (1 + (h % 997)) + (h >>> 22)));
}
