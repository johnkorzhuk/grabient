/* The words of a query that say nothing about its colors, and the ones that say how its palettes are drawn. A word is
   set aside only after the query as typed found no phrase, so a phrase that holds one (gold and cream, old rose) still
   matches whole. */
import type { Style } from "@grabient/engine/view.ts";

const words = (line: string): ReadonlySet<string> => new Set(line.split(" "));

/** English form, padding and grammar: the form a palette is drawn in, what pads a pasted search, the words between the
    ones that matter. Always set aside. */
export const FORM_WORDS = words(
  "gradient gradients palette palettes swatch swatches color colors colour colours scheme schemes linear radial angular " +
    "conic background backgrounds wallpaper wallpapers the a an of for and with in on to best free generator maker css " +
    "ideas inspiration examples hex code codes top creator create online picker tool tools app page grabient png jpg svg " +
    "download image images random builder finder at by from into over under like or not no is are it its as that this " +
    "these those my your our me i you we some very really good nice please want need find show give make looking " +
    "something anything"
);

/* The same for the other languages the site is read in: articles, prepositions, conjunctions, the particles Japanese
   and Chinese put between words, and each language's words for color, palette and gradient. */
const BY_LANGUAGE = [
  "der die das den dem des ein eine einer eines einem einen und oder mit von für zu zum zur im am an in auf aus bei nach über unter vor ohne ist sind ich mir mein meine wie als sehr farbe farben farbverlauf verlauf farbpalette",
  "el la los las un una unos unas y o u de del con para por en sobre entre a al es son mi mis muy como sin que lo color colores paleta degradado gradiente",
  "le la les l un une des du de d et ou avec pour par en sur dans à au aux est sont mon ma mes très comme sans que qui ce cette ces couleur couleurs dégradé",
  "o a os as um uma uns umas e ou de do da dos das com para por em no na nos nas ao à é são meu minha muito como sem que cor cores paleta gradiente degradê",
  "il lo la i gli le l un uno una e o di del della dei delle con per da in su tra fra a al alla è sono mio mia molto come senza che colore colori tavolozza sfumatura gradiente",
  "de het een en of van met voor door in op aan uit bij naar over onder is zijn mijn zeer heel als zonder dat kleur kleuren palet verloop kleurverloop",
  "i oraz lub albo w we na z ze do od o dla przy bez nad pod to jest bardzo jak mój moja kolor kolory paleta",
  "и или в во на с со к ко по для из от о об у за над под при без это как очень мой моя мои не цвет цвета палитра градиент",
  "і й та або в у на з із зі до по для від о про за над під при без це як дуже мій моя не колір кольори палітра градієнт",
  "و في من على إلى عن مع هذا هذه ذلك التي الذي أو ثم جدا لون ألوان لوحة تدرج",
  "و در از به با برای بر تا که این آن یا خیلی است های رنگ رنگی پالت گرادیان",
  "और या का की के में से को पर एक यह वह बहुत है रंग रंगों पैलेट",
  "の と な に は が を で も や から まで へ など です ます よう 系 色 カラー パレット グラデーション",
  "的 和 与 或 在 从 到 及 之 了 是 很 非常 一个 一种 这 那 色系 颜色 渐变 调色板 配色",
  "의 와 과 및 에 에서 로 으로 도 은 는 이 가 을 를 그리고 또는 매우 아주 색 색상 색깔 그라데이션 팔레트 배색",
  "และ หรือ ของ ใน กับ ที่ ถึง จาก มาก แบบ สี ไล่สี จานสี ชุดสี โทนสี",
  "và hoặc của trong với trên dưới từ đến cho về là rất những các một màu bảng phối tông dải",
  "dan atau dari di ke untuk dengan yang pada ini itu sangat warna palet gradasi",
  "ve veya ile için de da bir bu şu çok gibi renk renkleri palet gradyan"
];
/** Set aside only when the vocabulary does not know the word itself: French or is gold, and stays. */
export const FUNCTION_WORDS = words(BY_LANGUAGE.join(" "));

/* How a query asks for its palettes to be drawn, read word by word. Only "two tone" holds a number that says no count. */
const SWATCH_WORDS = words(
  "palette palettes swatch swatches scheme schemes combo combination combinations"
);
const STYLE_WORDS: Readonly<Record<string, Style>> = {
  linear: "linearGradient",
  radial: "radialGradient",
  angular: "angularGradient",
  conic: "angularGradient"
};
const NUMBER_WORDS = [
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve"
];
const COUNT_MAX = 16;

/* the words of a query as its drawing intent and padding are read: letters, digits, emoji and # codes */
const plainWords = (query: string) =>
  query
    .toLowerCase()
    .replace(/️/g, "")
    .replace(/[^\p{L}\p{N}\p{Extended_Pictographic}#]+/gu, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

export interface Intent {
  /** a gradient style named (conic is angular), else null */
  style: Style | null;
  /** palette, swatches, scheme or combination: every card is drawn as its style's swatches */
  swatches: boolean;
  /** a number 1 to 16, or one to twelve: the least steps a card is drawn with */
  count: number | null;
}

/** What a query asks of how its palettes are drawn. Gradient words never turn swatches into gradients. */
export function queryIntent(query: string): Intent {
  const intent: Intent = { style: null, swatches: false, count: null };
  const list = plainWords(query);
  for (let i = 0; i < list.length; i++) {
    const word = list[i];
    if (word === "two" && list[i + 1] === "tone") i++;
    else if (SWATCH_WORDS.has(word)) intent.swatches = true;
    else if (Object.hasOwn(STYLE_WORDS, word)) intent.style = STYLE_WORDS[word];
    else if (NUMBER_WORDS.includes(word)) intent.count = NUMBER_WORDS.indexOf(word) + 1;
    else if (/^\d{1,2}$/.test(word) && Number(word) >= 1 && Number(word) <= COUNT_MAX)
      intent.count = Number(word);
  }
  return intent;
}

/* Words that pad a search people type to find a page (best, free, generator, page, ui), and the joins between colors.
   A phrase that holds one is never a page of its own: navy and gold, landing page. The joins inside these few named
   transitions are part of the name. */
const PADDING = words(
  "color colors colour colours the a an of for and with in on to best free generator maker css ui web design website " +
    "ideas inspiration examples hex code codes top creator create online picker tool tools app page grabient png jpg svg " +
    "download image random builder finder io com www site"
);
const JOINED =
  /(?<=^| )(?:black and white|light to dark|dark to light|fade to (?:black|gray|white)s?)(?= |$)/g;

/** Whether a query holds a word that pads it, outside the transitions that name a gradient whole. */
export const padded = (query: string): boolean =>
  plainWords(plainWords(query).join(" ").replace(JOINED, " ").trim()).some(word =>
    PADDING.has(word)
  );
