/* The snapshot: everything the free search answers from, in one file. It holds every public palette's vector (int8 rows
   with a scale each), every public collection's, the title each palette was given, and what each collection is called
   and holds. A build copies the rows the previous snapshot holds and measures only new palettes, since a palette's
   vector depends on its seed and the model alone, so the same input gives the same bytes wherever it runs.

   The file is one JSON head line padded with spaces to a 4-byte boundary, then palette scales (float32), palette rows
   (int8), collection scales, collection rows, and the collections' text vectors (float32). */
import { normalizeQuery } from "./text.ts";
import { type Tower, textSide } from "./tower.ts";
import { collectionText, collectionVectorFrom, seedVector } from "./vectors.ts";

export const SNAPSHOT_FORMAT = 1;
/** New palettes measured in one build, about a millisecond each; the rest wait for the next build. */
const MEASURED_PER_BUILD = 4000;
const EMBED_BATCH = 50;

export interface Rows {
  n: number;
  scale: Float32Array;
  q: Int8Array;
}

/** What a collection is called (its title and tags, and its title's subject) and which palette rows it holds. */
export interface CollectionName {
  words: string;
  subject: string;
  members: number[];
}

export interface Snapshot {
  version: string;
  d: number;
  builtAt: number;
  seeds: string[];
  at: Map<string, number>;
  harmonies: string[];
  /** each palette's relationship, as an index of `harmonies` */
  harmony: number[];
  palettes: Rows;
  slugs: string[];
  collections: Rows;
  /** the title each palette was given, or "" */
  titles: string[];
  names: CollectionName[];
  /** each collection's text as a vector, kept so only a changed text is embedded again */
  texts: Float32Array;
  /** the mark of the text each vector was made from (textMark), "" for none */
  textOf: string[];
  /** the state of the site this was built from */
  mark: string;
  /** what the next build still owes: palettes not measured yet and texts whose embedding failed */
  pending: number;
}

interface Head {
  format: number;
  version: string;
  d: number;
  builtAt: number;
  mark: string;
  pending: number;
  seeds: string[];
  harmonies: string[];
  harmony: number[];
  titles: string[];
  collections: { slug: string; words: string; subject: string; members: number[]; text: string }[];
}

export function encodeSnapshot(s: Snapshot): Uint8Array {
  const head: Head = {
    format: SNAPSHOT_FORMAT,
    version: s.version,
    d: s.d,
    builtAt: s.builtAt,
    mark: s.mark,
    pending: s.pending,
    seeds: s.seeds,
    harmonies: s.harmonies,
    harmony: s.harmony,
    titles: s.titles,
    collections: s.slugs.map((slug, i) => ({
      slug,
      words: s.names[i].words,
      subject: s.names[i].subject,
      members: s.names[i].members,
      text: s.textOf[i]
    }))
  };
  const json = new TextEncoder().encode(JSON.stringify(head));
  const start = Math.ceil((json.length + 1) / 4) * 4;
  const parts = [s.palettes.scale, s.palettes.q, s.collections.scale, s.collections.q, s.texts].map(
    a => new Uint8Array(a.buffer, a.byteOffset, a.byteLength)
  );
  const out = new Uint8Array(start + parts.reduce((sum, part) => sum + part.length, 0));
  out.fill(0x20, json.length, start - 1);
  out.set(json);
  out[start - 1] = 0x0a;
  let at = start;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

export function decodeSnapshot(bytes: ArrayBuffer | Uint8Array): Snapshot {
  // a copy of its own: a Node Buffer is a window on shared memory, and the rows below are views of it
  const u8 =
    bytes instanceof Uint8Array
      ? (Uint8Array.prototype.slice.call(bytes) as Uint8Array)
      : new Uint8Array(bytes);
  const nl = u8.indexOf(0x0a);
  if (nl < 0) throw new Error("Not a search snapshot");
  const head = JSON.parse(new TextDecoder().decode(u8.subarray(0, nl))) as Head;
  if (head.format !== SNAPSHOT_FORMAT) {
    throw new Error(`Search snapshot format ${head.format}: this code reads ${SNAPSHOT_FORMAT}`);
  }
  const n = head.seeds.length;
  const m = head.collections.length;
  const d = head.d;
  if (u8.byteLength - nl - 1 !== n * 4 + n * d + m * 4 + m * d + m * d * 4) {
    throw new Error("Search snapshot rows do not match its head");
  }
  const buffer = u8.buffer as ArrayBuffer;
  let at = u8.byteOffset + nl + 1;
  const floats = (count: number) => {
    const a =
      at % 4
        ? new Float32Array(buffer.slice(at, at + count * 4))
        : new Float32Array(buffer, at, count);
    at += count * 4;
    return a;
  };
  const ints = (count: number) => {
    const a = new Int8Array(buffer, at, count);
    at += count;
    return a;
  };
  const palettes: Rows = { n, scale: floats(n), q: ints(n * d) };
  const collections: Rows = { n: m, scale: floats(m), q: ints(m * d) };
  return {
    version: head.version,
    d,
    builtAt: head.builtAt,
    seeds: head.seeds,
    at: new Map(head.seeds.map((seed, i) => [seed, i])),
    harmonies: head.harmonies,
    harmony: head.harmony,
    palettes,
    slugs: head.collections.map(c => c.slug),
    collections,
    titles: head.titles,
    names: head.collections.map(c => ({ words: c.words, subject: c.subject, members: c.members })),
    texts: floats(m * d),
    textOf: head.collections.map(c => c.text),
    mark: head.mark,
    pending: head.pending
  };
}

/** One row as the numbers it stands for. */
export const rowOf = (table: Rows, d: number, i: number): number[] =>
  Array.from({ length: d }, (_, j) => table.q[i * d + j] * table.scale[i]);

/** A text as a short word (bryc's public-domain cyrb53, 53 bits, then the length): enough to tell that a collection's
    text changed. */
export function textMark(text: string): string {
  let a = 0xdeadbeef;
  let b = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    a = Math.imul(a ^ ch, 2654435761);
    b = Math.imul(b ^ ch, 1597334677);
  }
  a = Math.imul(a ^ (a >>> 16), 2246822507) ^ Math.imul(b ^ (b >>> 13), 3266489909);
  b = Math.imul(b ^ (b >>> 16), 2246822507) ^ Math.imul(a ^ (a >>> 13), 3266489909);
  return `${(4294967296 * (2097151 & b) + (a >>> 0)).toString(36)}.${text.length.toString(36)}`;
}

/* A title names its subject, sometimes with the form it comes in: the subject is what people search for. */
const FORM =
  /\s+(?:color palettes?|colour palettes?|color schemes?|gradients?|swatch(?:es)?|palettes?|colors|colours)$/i;
export function subjectOf(title: string): string {
  const whole = title.trim();
  const subject = whole.replace(FORM, "").replace(FORM, "").trim();
  return subject || whole;
}

/** A public collection as a build reads it: its palettes in order, without the ones voted out. */
export interface SiteCollection {
  slug: string;
  title: string;
  description: string;
  tags: string[];
  seeds: string[];
}

/** What is public, as a build reads it. */
export interface Site {
  /** the gallery, oldest first */
  seeds: string[];
  collections: SiteCollection[];
  /** seed to the title a palette was given */
  titles: Map<string, string>;
  mark: string;
}

export interface BuildOptions {
  /** Raw embeddings of the model's embedder for these texts, in order; null for one that failed. Without it no text is
      embedded. */
  embed?: (texts: string[]) => Promise<(ArrayLike<number> | null)[]>;
  /** new palettes measured at most */
  limit?: number;
  now?: number;
}

export interface BuildStats {
  palettes: number;
  measured: number;
  reused: number;
  /** palettes left for the next build */
  pending: number;
  notPalettes: number;
  titled: number;
  collections: number;
  embedded: number;
  /** texts whose embedding failed, tried again by the next build */
  textsOwed: number;
  withoutText: number;
}

function quantizeInto(table: Rows, d: number, i: number, values: ArrayLike<number>): void {
  let max = 1e-9;
  for (let j = 0; j < d; j++) max = Math.max(max, Math.abs(values[j]));
  const scale = max / 127;
  table.scale[i] = scale;
  for (let j = 0; j < d; j++) table.q[i * d + j] = Math.round(values[j] / scale);
}

function copyRow(to: Rows, i: number, from: Rows, j: number, d: number): void {
  to.scale[i] = from.scale[j];
  to.q.set(from.q.subarray(j * d, (j + 1) * d), i * d);
}

const sameList = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((x, i) => x === b[i]);

/** The site as a snapshot, from the previous one of the same model: its rows are copied, only new palettes are measured
    and only new or changed collection texts embedded, so a build costs what changed. A collection's vector is made from
    its palettes' int8 rows, measured a moment or a month ago, so the bytes never depend on when. */
export async function buildSnapshot(
  model: Tower,
  site: Site,
  previous: Snapshot | null,
  options: BuildOptions = {}
): Promise<{ snapshot: Snapshot; stats: BuildStats }> {
  const d = model.d;
  const before =
    previous && previous.version === model.version && previous.d === d ? previous : null;
  const limit = options.limit ?? MEASURED_PER_BUILD;
  const stats: BuildStats = {
    palettes: 0,
    measured: 0,
    reused: 0,
    pending: 0,
    notPalettes: 0,
    titled: 0,
    collections: 0,
    embedded: 0,
    textsOwed: 0,
    withoutText: 0
  };

  // palettes: the gallery, then members of public collections it lacks, each row copied or measured
  const seeds: string[] = [];
  const sources: (number | number[])[] = [];
  const harmonyNames: string[] = [];
  for (const seed of new Set([...site.seeds, ...site.collections.flatMap(c => c.seeds)])) {
    const i = before?.at.get(seed);
    if (before && i !== undefined) {
      seeds.push(seed);
      sources.push(i);
      harmonyNames.push(before.harmonies[before.harmony[i]]);
      stats.reused++;
      continue;
    }
    if (stats.measured >= limit) {
      stats.pending++;
      continue;
    }
    const own = seedVector(model, seed);
    if (!own) {
      stats.notPalettes++;
      continue;
    }
    seeds.push(seed);
    sources.push(own.values);
    harmonyNames.push(own.harmony);
    stats.measured++;
  }
  const n = seeds.length;
  const palettes: Rows = { n, scale: new Float32Array(n), q: new Int8Array(n * d) };
  sources.forEach((from, i) => {
    if (typeof from === "number") copyRow(palettes, i, before!.palettes, from, d);
    else quantizeInto(palettes, d, i, from);
  });
  const at = new Map(seeds.map((seed, i) => [seed, i]));
  const harmonies = [...new Set(harmonyNames)].sort();
  stats.palettes = n;

  // collections: a text vector stands for as long as its text does
  const held = site.collections
    .map(c => {
      const text = collectionText(c.title, c.description, c.tags);
      return {
        ...c,
        text,
        mark: text && textMark(text),
        members: c.seeds.flatMap(seed => at.get(seed) ?? [])
      };
    })
    .filter(c => c.members.length);
  const m = held.length;
  const texts = new Float32Array(m * d);
  const textOf = new Array<string>(m).fill("");
  const was = new Map((before?.slugs ?? []).map((slug, i) => [slug, i]));
  const keepText = (i: number, j: number) => {
    texts.set(before!.texts.subarray(j * d, (j + 1) * d), i * d);
    textOf[i] = before!.textOf[j];
  };
  const toEmbed: number[] = [];
  held.forEach((c, i) => {
    const j = was.get(c.slug);
    if (j !== undefined && c.mark && before!.textOf[j] === c.mark) keepText(i, j);
    else if (c.text) toEmbed.push(i);
  });
  if (options.embed) {
    for (let k = 0; k < toEmbed.length; k += EMBED_BATCH) {
      const batch = toEmbed.slice(k, k + EMBED_BATCH);
      const made = await options
        .embed(batch.map(i => held[i].text))
        .catch(() => batch.map(() => null));
      batch.forEach((i, b) => {
        const embedding = made[b];
        if (
          !embedding ||
          embedding.length !== model.demb ||
          !Array.prototype.every.call(embedding, Number.isFinite)
        ) {
          return;
        }
        texts.set(textSide(model, embedding), i * d);
        textOf[i] = held[i].mark;
        stats.embedded++;
      });
    }
  }
  // a text not embedded now keeps its old vector under its old mark, so the next build tries again
  for (const i of toEmbed) {
    if (textOf[i]) continue;
    const j = was.get(held[i].slug);
    if (j !== undefined && before!.textOf[j]) keepText(i, j);
    if (options.embed) stats.textsOwed++;
  }
  const collections: Rows = { n: m, scale: new Float32Array(m), q: new Int8Array(m * d) };
  held.forEach((c, i) => {
    const j = was.get(c.slug);
    const memberSeeds = c.members.map(row => seeds[row]);
    if (
      j !== undefined &&
      before!.textOf[j] === textOf[i] &&
      sameList(
        before!.names[j].members.map(row => before!.seeds[row]),
        memberSeeds
      )
    ) {
      copyRow(collections, i, before!.collections, j, d);
      return;
    }
    const words = textOf[i] ? texts.subarray(i * d, (i + 1) * d) : null;
    quantizeInto(
      collections,
      d,
      i,
      collectionVectorFrom(
        words,
        c.members.map(row => rowOf(palettes, d, row))
      )
    );
  });
  stats.collections = m;
  stats.withoutText = textOf.filter(text => !text).length;

  const titles = seeds.map(seed => site.titles.get(seed) ?? "");
  stats.titled = titles.filter(Boolean).length;
  const snapshot: Snapshot = {
    version: model.version,
    d,
    builtAt: options.now ?? Date.now(),
    seeds,
    at,
    harmonies,
    harmony: harmonyNames.map(name => harmonies.indexOf(name)),
    palettes,
    slugs: held.map(c => c.slug),
    collections,
    titles,
    names: held.map(c => ({
      words: [c.title, ...c.tags].join(" "),
      subject: normalizeQuery(subjectOf(c.title)),
      members: c.members
    })),
    texts,
    textOf,
    mark: site.mark,
    pending: stats.pending + stats.textsOwed
  };
  return { snapshot, stats };
}
