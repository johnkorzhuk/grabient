/** Matches hex codes: #RGB or #RRGGBB (works in arrays, quotes, or standalone) */
export const HEX_CODE_REGEX = /#([0-9a-fA-F]{3}(?![0-9a-fA-F])|[0-9a-fA-F]{6}(?![0-9a-fA-F]))/g;

/** Checks if a string is a valid hex color code */
export function isHexColor(str: string): boolean {
    return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(str);
}

/**
 * The curated shortlist. This is a menu a person reads, not the naming corpus:
 * it backs the popular-search chip rotation and the analogous/complementary
 * combination sets. Palette naming uses NAMED_COLORS below.
 */
export const BASIC_COLORS: Array<{ name: string; r: number; g: number; b: number }> = [
    { name: "black", r: 0, g: 0, b: 0 },
    { name: "white", r: 255, g: 255, b: 255 },
    { name: "red", r: 255, g: 0, b: 0 },
    { name: "green", r: 0, g: 128, b: 0 },
    { name: "blue", r: 0, g: 0, b: 255 },
    { name: "yellow", r: 255, g: 255, b: 0 },
    { name: "cyan", r: 0, g: 255, b: 255 },
    { name: "magenta", r: 255, g: 0, b: 255 },
    { name: "orange", r: 255, g: 165, b: 0 },
    { name: "pink", r: 255, g: 192, b: 203 },
    { name: "purple", r: 128, g: 0, b: 128 },
    { name: "brown", r: 165, g: 42, b: 42 },
    { name: "gray", r: 128, g: 128, b: 128 },
    { name: "gold", r: 255, g: 215, b: 0 },
    { name: "teal", r: 0, g: 128, b: 128 },
    { name: "navy", r: 0, g: 0, b: 128 },
    { name: "maroon", r: 128, g: 0, b: 0 },
    { name: "olive", r: 128, g: 128, b: 0 },
    { name: "turquoise", r: 64, g: 224, b: 208 },
    { name: "indigo", r: 75, g: 0, b: 130 },
    { name: "violet", r: 238, g: 130, b: 238 },
    { name: "beige", r: 245, g: 245, b: 220 },
    { name: "tan", r: 210, g: 180, b: 140 },
    { name: "coral", r: 255, g: 127, b: 80 },
    { name: "salmon", r: 250, g: 128, b: 114 },
    { name: "khaki", r: 240, g: 230, b: 140 },
    { name: "lavender", r: 230, g: 230, b: 250 },
    { name: "peach", r: 255, g: 218, b: 185 },
    { name: "mint", r: 189, g: 252, b: 201 },
    { name: "lime", r: 0, g: 255, b: 0 },
    { name: "aqua", r: 0, g: 255, b: 255 },
    { name: "silver", r: 192, g: 192, b: 192 },
    { name: "crimson", r: 220, g: 20, b: 60 },
    { name: "chocolate", r: 210, g: 105, b: 30 },
    { name: "ivory", r: 255, g: 255, b: 240 },
    { name: "azure", r: 240, g: 255, b: 255 },
    { name: "plum", r: 221, g: 160, b: 221 },
    { name: "orchid", r: 218, g: 112, b: 214 },
    { name: "rose", r: 255, g: 0, b: 127 },
    { name: "slate", r: 112, g: 128, b: 144 },
    { name: "charcoal", r: 54, g: 69, b: 79 },
];

// =============================================================================
// Naming corpus
// =============================================================================
//
// BASIC_COLORS above stays at 41 curated names because it drives things a
// designer reads as a menu: the popular-search chip rotation, and the
// analogous/complementary combination sets. A thousand entries there would
// surface "pale grey green" as a suggested search.
//
// Naming a palette is the opposite problem. With 41 names the nearest entry to
// an arbitrary palette colour averages 0.077 in OkLab (measured over 3,504
// distinct colours from 144 live seeds) — far enough that a sage lands on
// "green" and a burnt orange lands on "brown". This corpus takes that to 0.026,
// and the names are ones people type into a search box.
//
// Composition (920 entries, all permissively licensed):
//   xkcd colour survey   774  CC0-1.0  https://xkcd.com/color/rgb.txt
//   CSS Color 4 keywords 105  spec facts, de-concatenated for display
//   BASIC_COLORS          41  first, so existing name->hex answers do not move
//
// The xkcd survey is a record of what 200,000 people actually call colours,
// which is the same thing as what they search for — and also why it contains
// "baby shit brown". The first cut (2026-08-16) filtered 151 xkcd source names
// and two CSS keywords, most on taste: scatological, pejorative ("ugly blue"),
// morbid, trademarked ("barbie pink", "windows blue"), ethnically loaded
// ("indian red"). On 2026-08-17 the owner requested the unfiltered survey
// vocabulary restored, so those 77 display entries are back — including six the
// taste pass had removed by accident ("azul", "velvet", "manila") and nine that
// sit within 0.01 OkLab of a kept name ("dried blood" beside "mahogany"; the
// corpus already tolerated that — "peach" and "peach puff" share a hex).
//
// What remains display-filtered is technical only: 48 names that cannot work
// as display strings — 15 survey artifacts ("blue blue", "grey/green"), 9
// misspellings and the variant spelling "ocher" (all aliased to the correct
// form), 15 bare modifiers with no hue ("dark"), and 8 colloquial "-y" forms
// whose twin is already present ("blurple" → "blue purple") — those 8 now
// alias like the 27 colloquial forms that always did. Restoration moves the
// nearest-name mean toward the 0.0245 unfiltered-union figure: over the
// 867-seed prose fixture (20,864 distinct colours at 3/5/7/9/11/13 steps) it
// is 0.0273 → 0.0268, and a restored name becomes the nearest name for 5.5% of
// colours — so headline/title strings on existing pages can change, which is
// the stated intent of the restore.
//
// Packed as "name:rrggbb," rather than an object literal: measured at the
// 843-entry corpus, 15.7KB of source against 43KB, and 26KB less in the built
// worker (2.4KB gzipped); the restore adds 1.3KB of string. Parsed once at
// module init. This module is server-only — no island imports it, so none of
// it reaches the browser bundle.
const PACKED_COLORS =
    "acid green:8ffe09,adobe:bd6c48,algae:54ac68,algae green:21c36f,alice blue:f0f8ff,almost blac" +
    "k:070d0d,amber:feb308,amethyst:9b5fc0,antique white:faebd7,apple:6ecb3c,apple green:76cd26,a" +
    "pricot:ffb16d,aqua:00ffff,aqua blue:02d8e9,aqua green:12e193,aqua marine:2ee8bb,aquamarine:7" +
    "fffd4,army green:4b5d16,asparagus:77ab56,aubergine:3d0734,auburn:9a3001,avocado:90b134,avoca" +
    "do green:87a922,azul:1d5dec,azure:f0ffff,baby blue:a2cffe,baby green:8cff9e,baby pink:ffb7ce" +
    ",baby poo:ab9004,baby poop:937c00,baby poop green:8f9805,baby puke green:b6c406,baby purple:" +
    "ca9bf7,baby shit brown:ad900d,baby shit green:889717,banana:ffff7e,banana yellow:fafe4b,barb" +
    "ie pink:fe46a5,barf green:94ac02,barney:ac1db8,barney purple:a00498,battleship gray:6b7c85,b" +
    "eige:f5f5dc,berry:990f4b,bile:b5c306,bisque:ffe4c4,black:000000,blanched almond:ffebcd,bland" +
    ":afa88b,blood:770001,blood orange:fe4b03,blood red:980002,blue:0000ff,blue gray:607c8e,blue " +
    "green:137e6d,blue purple:5729ce,blue violet:8a2be2,blueberry:464196,bluegray:85a3b2,bluegree" +
    "n:017a79,bluish gray:748b97,bluish green:10a674,bluish purple:703be7,blush:f29e8e,blush pink" +
    ":fe828c,booger:9bb53c,booger green:96b403,bordeaux:7b002c,boring green:63b365,bottle green:0" +
    "44a05,brick:a03623,brick orange:c14a09,brick red:8f1402,bright aqua:0bf9ea,bright blue:0165f" +
    "c,bright cyan:41fdfe,bright green:01ff07,bright lavender:c760ff,bright light blue:26f7fd,bri" +
    "ght light green:2dfe54,bright lilac:c95efb,bright lime:87fd05,bright lime green:65fe08,brigh" +
    "t magenta:ff08e8,bright olive:9cbb04,bright orange:ff5b00,bright pink:fe01b1,bright purple:b" +
    "e03fd,bright red:ff000d,bright sea green:05ffa6,bright sky blue:02ccfe,bright teal:01f9c6,br" +
    "ight turquoise:0ffef9,bright violet:ad0afd,bright yellow:fffd01,bright yellow green:9dff00,b" +
    "ritish racing green:05480d,bronze:a87900,brown:a52a2a,brown gray:8d8468,brown green:706c11,b" +
    "rown orange:b96902,brown red:922b05,brown yellow:b29705,brownish gray:86775f,brownish green:" +
    "6a6e09,brownish orange:cb7723,brownish pink:c27e79,brownish purple:76424e,brownish red:9e362" +
    "3,brownish yellow:c9b003,bruise:7e4071,bubble gum pink:ff69af,bubblegum:ff6cb5,bubblegum pin" +
    "k:fe83cc,buff:fef69e,burgundy:610023,burlywood:deb887,burnt orange:c04e01,burnt red:9f2305,b" +
    "urnt siena:b75203,burnt sienna:b04e0f,burnt umber:a0450e,burnt yellow:d5ab09,butter:ffff81,b" +
    "utter yellow:fffd74,butterscotch:fdb147,cadet blue:5f9ea0,camel:c69f59,camo:7f8f4e,camo gree" +
    "n:526525,camouflage green:4b6113,canary:fdff63,canary yellow:fffe40,candy pink:ff63e9,carame" +
    "l:af6f09,carmine:9d0216,carnation:fd798f,carnation pink:ff7fa7,carolina blue:8ab8fe,celadon:" +
    "befdb7,celery:c1fd95,cement:a5a391,cerise:de0c62,cerulean:0485d1,cerulean blue:056eee,charco" +
    "al:36454f,charcoal gray:3c4142,chartreuse:7fff00,cherry:cf0234,cherry red:f7022a,chestnut:74" +
    "2802,chocolate:d2691e,chocolate brown:411900,cinnamon:ac4f06,claret:680018,clay:b66a50,clay " +
    "brown:b2713d,clear blue:247afd,cloudy blue:acc2d9,cobalt:1e488f,cobalt blue:030aa7,cocoa:875" +
    "f42,coffee:a6814c,cool blue:4984b8,cool gray:95a3a6,cool green:33b864,copper:b66325,coral:ff" +
    "7f50,coral pink:ff6163,corn silk:fff8dc,cornflower:6a79f7,cornflower blue:6495ed,cranberry:9" +
    "e003a,cream:ffffc2,creme:ffffb6,crimson:dc143c,custard:fffd78,cyan:00ffff,dandelion:fedf08,d" +
    "ark aqua:05696b,dark aquamarine:017371,dark beige:ac9362,dark blue:00008b,dark blue gray:1f3" +
    "b4d,dark blue green:005249,dark brown:341c02,dark coral:cf524e,dark cream:fff39a,dark cyan:0" +
    "08b8b,dark forest green:002d04,dark fuchsia:9d0759,dark gold:b59410,dark goldenrod:b8860b,da" +
    "rk grass green:388004,dark gray:a9a9a9,dark gray blue:29465b,dark green:006400,dark green bl" +
    "ue:1f6357,dark hot pink:d90166,dark indigo:1f0954,dark khaki:bdb76b,dark lavender:856798,dar" +
    "k lilac:9c6da5,dark lime:84b701,dark lime green:7ebd01,dark magenta:8b008b,dark maroon:3c000" +
    "8,dark mauve:874c62,dark mint:48c072,dark mint green:20c073,dark mustard:a88905,dark navy:00" +
    "0435,dark navy blue:00022e,dark olive:373e02,dark olive green:556b2f,dark orange:ff8c00,dark" +
    " orchid:9932cc,dark pastel green:56ae57,dark peach:de7e5d,dark periwinkle:665fd1,dark pink:c" +
    "b416b,dark plum:3f012c,dark purple:35063e,dark red:8b0000,dark rose:b5485d,dark royal blue:0" +
    "2066f,dark sage:598556,dark salmon:e9967a,dark sand:a88f59,dark sea green:8fbc8f,dark seafoa" +
    "m:1fb57a,dark seafoam green:3eaf76,dark sky blue:448ee4,dark slate blue:483d8b,dark slate gr" +
    "ay:2f4f4f,dark tan:af884a,dark taupe:7f684e,dark teal:014d4e,dark turquoise:00ced1,dark viol" +
    "et:9400d3,dark yellow:d5b60a,dark yellow green:728f02,darkblue:030764,darkgreen:054907,deep " +
    "aqua:08787f,deep blue:040273,deep brown:410200,deep green:02590f,deep lavender:8d5eb7,deep l" +
    "ilac:966ebd,deep magenta:a0025c,deep orange:dc4d01,deep pink:ff1493,deep purple:36013f,deep " +
    "red:9a0200,deep rose:c74767,deep sea blue:015482,deep sky blue:00bfff,deep teal:00555a,deep " +
    "turquoise:017374,deep violet:490648,denim:3b638c,denim blue:3b5b92,desert:ccad60,diarrhea:9f" +
    "8303,dim gray:696969,dirt:8a6e45,dirt brown:836539,dirty blue:3f829d,dirty green:667e2c,dirt" +
    "y orange:c87606,dirty pink:ca7b80,dirty purple:734a65,dirty yellow:cdc50a,dodger blue:1e90ff" +
    ",drab:828344,drab green:749551,dried blood:4b0101,duck egg blue:c3fbf4,dull blue:49759c,dull" +
    " brown:876e4b,dull green:74a662,dull orange:d8863b,dull pink:d5869d,dull purple:84597e,dull " +
    "red:bb3f3f,dull teal:5f9e8f,dull yellow:eedc5b,dusk:4e5481,dusk blue:26538d,dusky blue:475f9" +
    "4,dusky pink:cc7a8b,dusky purple:895b7b,dusky rose:ba6873,dust:b2996e,dusty blue:5a86ad,dust" +
    "y green:76a973,dusty lavender:ac86a8,dusty orange:f0833a,dusty pink:d58a94,dusty purple:825f" +
    "87,dusty red:b9484e,dusty rose:c0737a,dusty teal:4c9085,earth:a2653e,easter green:8cfd7e,eas" +
    "ter purple:c071fe,ecru:feffca,egg shell:fffcc4,eggplant:380835,eggplant purple:430541,eggshe" +
    "ll:ffffd4,eggshell blue:c4fff7,electric blue:0652ff,electric green:21fc0d,electric lime:a8ff" +
    "04,electric pink:ff0490,electric purple:aa23ff,emerald:01a049,emerald green:028f1e,evergreen" +
    ":05472a,faded blue:658cbb,faded green:7bb274,faded orange:f0944d,faded pink:de9dac,faded pur" +
    "ple:916e99,faded red:d3494e,faded yellow:feff7f,fawn:cfaf7b,fern:63a950,fern green:548d44,fi" +
    "re brick:b22222,fire engine red:fe0002,flat blue:3c73a8,flat green:699d4c,floral white:fffaf" +
    "0,fluorescent green:08ff08,fluro green:0aff02,foam green:90fda9,forest:0b5509,forest green:2" +
    "28b22,forrest green:154406,french blue:436bad,fresh green:69d84f,frog green:58bc08,fuchsia:f" +
    "f00ff,gainsboro:dcdcdc,ghost white:f8f8ff,gold:ffd700,golden:f5bf03,golden brown:b27a01,gold" +
    "en rod:f9bc08,golden yellow:fec615,goldenrod:daa520,grape:6c3461,grape purple:5d1451,grapefr" +
    "uit:fd5956,grass:5cac2d,grass green:3f9b0b,grassy green:419c03,gray:808080,gray blue:6b8ba4," +
    "gray brown:7f7053,gray green:789b73,gray pink:c3909b,gray purple:826d8c,gray teal:5e9b8a,gra" +
    "yblue:77a1b5,grayish blue:5e819d,grayish brown:7a6a4f,grayish green:82a67d,grayish pink:c88d" +
    "94,grayish purple:887191,grayish teal:719f91,green:008000,green apple:5edc1f,green blue:06b4" +
    "8b,green brown:544e03,green gray:77926f,green teal:0cb577,green yellow:adff2f,greenblue:23c4" +
    "8b,greenish beige:c9d179,greenish blue:0b8b87,greenish brown:696112,greenish cyan:2afeb7,gre" +
    "enish gray:96ae8d,greenish tan:bccb7a,greenish teal:32bf84,greenish turquoise:00fbb0,greenis" +
    "h yellow:cdfd02,gross green:a0bf16,gunmetal:536267,hazel:8e7618,heather:a484ac,heliotrope:d9" +
    "4ff5,highlighter green:1bfc06,honeydew:f0fff0,hospital green:9be5aa,hot green:25ff29,hot mag" +
    "enta:f504c9,hot pink:ff69b4,hot purple:cb00f5,hunter green:0b4008,ice:d6fffa,ice blue:d7fffe" +
    ",icky green:8fae22,indian red:cd5c5c,indigo:4b0082,indigo blue:3a18b1,iris:6258c4,irish gree" +
    "n:019529,ivory:fffff0,jade:1fa774,jade green:2baf6a,jungle green:048243,kelly green:02ab2e,k" +
    "ermit green:5cb200,key lime:aeff6e,khaki:f0e68c,khaki green:728639,kiwi:9cef43,kiwi green:8e" +
    "e53f,lavender:e6e6fa,lavender blue:8b88f8,lavender blush:fff0f5,lavender pink:dd85d7,lawn gr" +
    "een:7cfc00,leaf:71aa34,leaf green:5ca904,leafy green:51b73b,leather:ac7434,lemon:fdff52,lemo" +
    "n chiffon:fffacd,lemon green:adf802,lemon lime:bffe28,lemon yellow:fdff38,lichen:8fb67b,ligh" +
    "t aqua:8cffdb,light aquamarine:7bfdc7,light beige:fffeb6,light blue:add8e6,light blue gray:b" +
    "7c9e2,light blue green:7efbb3,light bluish green:76fda8,light bright green:53fe5c,light brow" +
    "n:ad8150,light burgundy:a8415b,light coral:f08080,light cyan:e0ffff,light eggplant:894585,li" +
    "ght forest green:4f9153,light gold:fddc5c,light goldenrod yellow:fafad2,light grass green:9a" +
    "f764,light gray:d3d3d3,light gray blue:9dbcd4,light gray green:b7e1a1,light green:90ee90,lig" +
    "ht green blue:56fca2,light greenish blue:63f7b4,light indigo:6d5acf,light khaki:e6f2a2,light" +
    " lavender:dfc5fe,light lilac:edc8ff,light lime:aefd6c,light lime green:b9ff66,light magenta:" +
    "fa5ff7,light maroon:a24857,light mauve:c292a1,light mint:b6ffbb,light mint green:a6fbb2,ligh" +
    "t moss green:a6c875,light mustard:f7d560,light navy:155084,light navy blue:2e5a88,light neon" +
    " green:4efd54,light olive:acbf69,light olive green:a4be5c,light orange:fdaa48,light pastel g" +
    "reen:b2fba5,light pea green:c4fe82,light peach:ffd8b1,light periwinkle:c1c6fc,light pink:ffb" +
    "6c1,light plum:9d5783,light purple:bf77f6,light red:ff474c,light rose:ffc5cb,light royal blu" +
    "e:3a2efe,light sage:bcecac,light salmon:ffa07a,light sea green:20b2aa,light seafoam:a0febf,l" +
    "ight seafoam green:a7ffb5,light sky blue:87cefa,light slate gray:778899,light steel blue:b0c" +
    "4de,light tan:fbeeac,light teal:90e4c1,light turquoise:7ef4cc,light urple:b36ff6,light viole" +
    "t:d6b4fc,light yellow:ffffe0,light yellow green:ccfd7f,light yellowish green:c2ff89,lightblu" +
    "e:7bc8f6,lighter green:75fd63,lighter purple:a55af4,lightgreen:76ff7b,lilac:cea2fd,lime:00ff" +
    "00,lime green:32cd32,lime yellow:d0fe1d,linen:faf0e6,lipstick:d5174e,lipstick red:c0022f,mag" +
    "enta:ff00ff,mahogany:4a0100,maize:f4d054,mango:ffa62b,manila:fffa" +
    "86,marigold:fcc006,marine:042e60,marine blue:01386a,maroon:800000,mauve:ae7181,medium aquama" +
    "rine:66cdaa,medium blue:0000cd,medium brown:7f5112,medium gray:7d7f7c,medium green:39ad48,me" +
    "dium orchid:ba55d3,medium pink:f36196,medium purple:9370db,medium sea green:3cb371,medium sl" +
    "ate blue:7b68ee,medium spring green:00fa9a,medium turquoise:48d1cc,medium violet red:c71585," +
    "melon:ff7855,merlot:730039,metallic blue:4f738e,mid blue:276ab3,mid green:50a747,midnight:03" +
    "012d,midnight blue:191970,midnight purple:280137,military green:667c3e,milk chocolate:7f4e1e" +
    ",mint:bdfcc9,mint cream:f5fffa,mint green:8fff9f,minty green:0bf77d,misty rose:ffe4e1,moccas" +
    "in:ffe4b5,mocha:9d7651,moss:769958,moss green:658b38,mossy green:638b27,mud:735c12,mud brown" +
    ":60460f,mud green:606602,muddy brown:886806,muddy green:657432,muddy yellow:bfac05,mulberry:" +
    "920a4e,murky green:6c7a0e,mushroom:ba9e88,mustard:ceb301,mustard brown:ac7e04,mustard green:" +
    "a8b504,mustard yellow:d2bd0a,muted blue:3b719f,muted green:5fa052,muted pink:d1768f,muted pu" +
    "rple:805b87,nasty green:70b23f,navajo white:ffdead,navy:000080,navy blue:001146,navy green:3" +
    "5530a,neon blue:04d9ff,neon green:0cff0c,neon pink:fe019a,neon purple:bc13fe,neon red:ff073a" +
    ",neon yellow:cfff04,nice blue:107ab0,night blue:040348,ocean:017b92,ocean blue:03719c,ocean " +
    "green:3d9973,ochre:bf9005,off blue:5684ae,off green:6ba353,off white:ffffe4,off yellow:f1f33" +
    "f,old lace:fdf5e6,old pink:c77986,old rose:c87f89,olive:808000,olive brown:645403,olive drab" +
    ":6b8e23,olive green:677a04,olive yellow:c2b709,orange:ffa500,orange brown:be6400,orange pink" +
    ":ff6f52,orange red:ff4500,orange yellow:ffad01,orangered:fe420f,orangey yellow:fdb915,orangi" +
    "sh brown:b25f03,orangish red:f43605,orchid:da70d6,pale aqua:b8ffeb,pale blue:d0fefe,pale bro" +
    "wn:b1916e,pale cyan:b7fffa,pale gold:fdde6c,pale goldenrod:eee8aa,pale gray:fdfdfe,pale gree" +
    "n:98fb98,pale lavender:eecffe,pale light green:b1fc99,pale lilac:e4cbff,pale lime:befd73,pal" +
    "e lime green:b1ff65,pale magenta:d767ad,pale mauve:fed0fc,pale olive:b9cc81,pale olive green" +
    ":b1d27b,pale orange:ffa756,pale peach:ffe5ad,pale pink:ffcfdc,pale purple:b790d4,pale red:d9" +
    "544d,pale rose:fdc1c5,pale salmon:ffb19a,pale sky blue:bdf6fe,pale teal:82cbb2,pale turquois" +
    "e:afeeee,pale violet:ceaefa,pale violet red:db7093,pale yellow:ffff84,papaya whip:ffefd5,par" +
    "chment:fefcaf,pastel blue:a2bffe,pastel green:b0ff9d,pastel orange:ff964f,pastel pink:ffbacd" +
    ",pastel purple:caa0ff,pastel red:db5856,pastel yellow:fffe71,pea:a4bf20,pea green:8eab12,pea" +
    " soup:929901,pea soup green:94a617,peach:ffdab9,peach puff:ffdab9,peachy pink:ff9a8a,peacock" +
    " blue:016795,pear:cbf85f,periwinkle:8e82fe,periwinkle blue:8f99fb,peru:cd853f,petrol:005f6a," +
    "pig pink:e78ea5,pine:2b5d34,pine green:0a481e,pink:ffc0cb,pink purple:db4bda,pink red:f5054f" +
    ",pinkish brown:b17261,pinkish gray:c8aca9,pinkish orange:ff724c,pinkish purple:d648d7,pinkis" +
    "h red:f10c45,pinkish tan:d99b82,piss yellow:ddd618,pistachio:c0fa8b,plum:dda0dd,plum purple:" +
    "4e0550,poison green:40fd14,poo:8f7303,poo brown:885f01,poop:7f5e00,poop brown:7a5901,poop gr" +
    "een:6f7c00,powder blue:b0e0e6,powder pink:ffb2d0,primary blue:0804f9,prussian blue:004577,pu" +
    "ce:a57e52,puke:a5a502,puke brown:947706,puke green:9aae07,puke yellow:c2be0e,pumpkin:e17701," +
    "pumpkin orange:fb7d07,pure blue:0203e2,purple:800080,purple blue:632de9,purple brown:673a3f," +
    "purple gray:866f85,purple pink:e03fd8,purple red:990147,purplish blue:601ef9,purplish brown:" +
    "6b4247,purplish gray:7a687f,purplish pink:ce5dae,purplish red:b0054b,putty:beae8a,racing gre" +
    "en:014600,radioactive green:2cfa1f,raspberry:b00149,raw sienna:9a6200,raw umber:a75e09,reall" +
    "y light blue:d4ffff,rebecca purple:663399,red:ff0000,red brown:8b2e16,red orange:fd3c06,red " +
    "pink:fa2a55,red purple:820747,red violet:9e0168,red wine:8c0034,reddish brown:7f2b0a,reddish" +
    " gray:997570,reddish orange:f8481c,reddish pink:fe2c54,reddish purple:910951,rich blue:021bf" +
    "9,rich purple:720058,robin egg blue:8af1fe,robin's egg:6dedfd,robin's egg blue:98eff9,rosa:f" +
    "e86a4,rose:ff007f,rose pink:f7879a,rose red:be013c,rosy brown:bc8f8f,rosy pink:f6688e,rouge:" +
    "ab1239,royal blue:4169e1,royal purple:4b006e,ruby:ca0147,russet:a13905,rust:a83c09,rust brow" +
    "n:8b3103,rust orange:c45508,rust red:aa2704,rusty orange:cd5909,rusty red:af2f0d,saddle brow" +
    "n:8b4513,saffron:feb209,sage:87ae73,sage green:88b378,salmon:fa8072,salmon pink:fe7b7c,sand:" +
    "e2ca76,sand brown:cba560,sand yellow:fce166,sandstone:c9ae74,sandy:f1da7a,sandy brown:f4a460" +
    ",sandy yellow:fdee73,sap green:5c8b15,sapphire:2138ab,scarlet:be0119,sea:3c9992,sea blue:047" +
    "495,sea green:2e8b57,seafoam:80f9ad,seafoam blue:78d1b6,seafoam green:7af9ab,seashell:fff5ee" +
    ",seaweed:18d17b,seaweed green:35ad6b,sepia:985e2b,shamrock:01b44c,shamrock green:02c14d,shit" +
    ":7f5f00,shit brown:7b5804,shit green:758000,shocking pink:fe02a2,sick green:9db92c,sickly gr" +
    "een:94b21c,sickly yellow:d0e429,sienna:a0522d,silver:c0c0c0,sky:82cafc,sky blue:87ceeb,slate" +
    ":708090,slate blue:6a5acd,slate gray:708090,slate green:658d6d,slime green:99cc04,snot:acbb0" +
    "d,snot green:9dc100,snow:fffafa,soft blue:6488ea,soft green:6fc276,soft pink:fdb0c0,soft pur" +
    "ple:a66fb5,spearmint:1ef876,spring green:00ff7f,spruce:0a5f38,squash:f2ab15,steel:738595,ste" +
    "el blue:4682b4,steel gray:6f828a,stone:ada587,stormy blue:507b9c,straw:fcf679,strawberry:fb2" +
    "943,strong blue:0c06f7,strong pink:ff0789,sun yellow:ffdf22,sunflower:ffc512,sunflower yello" +
    "w:ffda03,sunny yellow:fff917,sunshine yellow:fffd37,swamp:698339,swamp green:748500,tan:d2b4" +
    "8c,tan brown:ab7e4c,tan green:a9be70,tangerine:ff9408,taupe:b9a281,tea:65ab7c,tea green:bdf8" +
    "a3,teal:008080,teal blue:01889f,teal green:25a36f,tealish green:0cdc73,terra cotta:c9643b,te" +
    "rracotta:ca6641,thistle:d8bfd8,tiffany blue:7bf2da,tomato:ff6347,tomato red:ec2d01,topaz:13b" +
    "baf,toxic green:61de2a,tree green:2a7e19,true blue:010fcc,true green:089404,turquoise:40e0d0" +
    ",turquoise blue:06b1c4,turquoise green:04f489,turtle green:75b84f,twilight:4e518b,twilight b" +
    "lue:0a437a,ugly blue:31668a,ugly brown:7d7103,ugly green:7a9703,ugly pink:cd7584,ugly purple" +
    ":a442a0,ugly yellow:d0c101,ultramarine:2000b1,ultramarine blue:1805db,umber:b26400,velvet:75" +
    "0851,vermillion:f4320c,very dark blue:000133,very dark brown:1d0200,very dark green:062e03,v" +
    "ery dark purple:2a0134,very light blue:d5ffff,very light brown:d3b683,very light green:d1ffb" +
    "d,very light pink:fff4f2,very light purple:f6cefc,very pale blue:d6fffe,very pale green:cffd" +
    "bc,vibrant blue:0339f8,vibrant green:0add08,vibrant purple:ad03de,violet:ee82ee,violet blue:" +
    "510ac9,violet pink:fb5ffc,violet red:a50055,viridian:1e9167,vivid blue:152eff,vivid green:2f" +
    "ef10,vivid purple:9900fa,vomit:a2a415,vomit green:89a203,vomit yellow:c7c10c,warm blue:4b57d" +
    "b,warm brown:964e02,warm gray:978a84,warm pink:fb5581,warm purple:952e8f,washed out green:bc" +
    "f5a6,water blue:0e87cc,watermelon:fd4659,weird green:3ae57f,wheat:f5deb3,white:ffffff,white " +
    "smoke:f5f5f5,windows blue:3778bf,wine:80013f,wine red:7b0323,wintergreen:20f986,wisteria:a87" +
    "dc2,yellow:ffff00,yellow brown:b79400,yellow green:9acd32,yellow ochre:cb9d06,yellow orange:" +
    "fcb001,yellow tan:ffe36e,yellowgreen:bbf90f,yellowish brown:9b7a01,yellowish green:b0dd16,ye" +
    "llowish orange:ffab0f,yellowish tan:fcfc81";

// Spellings that resolve but are never displayed: CSS single-token keywords
// ("cornflowerblue"), British "grey", misspellings ("liliac", "terracota"),
// and the colloquial forms filtered above. A user who types one still gets the
// right swatch.
//
// "macaroni and cheese" joined them on 2026-08-18, the one entry moved out of
// the display list since the restore, and for a technical reason rather than
// taste: it is a DISH, not a colour word, so a machine translator renders it as
// the food (ES "macarrones con queso"), and D20.4 makes translatability binding
// on every generated string — this one reached the h1, the meta description and
// a /palettes/ chip. The survey's other food words ("chocolate", "salmon",
// "peach", "mustard") are ordinary colour words in translation and stay. Its
// hex now names as "dark yellow", the next entry 0.007 away in OkLab.
const PACKED_ALIASES =
    "aliceblue=alice blue,antiquewhite=antique white,darkcyan=dark cyan,darkturquoise=dark turquo" +
    "ise,deepskyblue=deep sky blue,mediumblue=medium blue,mediumspringgreen=medium spring green,s" +
    "pringgreen=spring green,midnightblue=midnight blue,dodgerblue=dodger blue,lightseagreen=ligh" +
    "t sea green,forestgreen=forest green,seagreen=sea green,darkslategray=dark slate gray,darksl" +
    "ategrey=dark slate gray,dark slate grey=dark slate gray,limegreen=lime green,mediumseagreen=" +
    "medium sea green,royalblue=royal blue,steelblue=steel blue,darkslateblue=dark slate blue,med" +
    "iumturquoise=medium turquoise,darkolivegreen=dark olive green,cadetblue=cadet blue,cornflowe" +
    "rblue=cornflower blue,mediumaquamarine=medium aquamarine,dimgray=dim gray,dimgrey=dim gray,d" +
    "im grey=dim gray,slateblue=slate blue,olivedrab=olive drab,slategray=slate gray,slategrey=sl" +
    "ate gray,slate grey=slate gray,lightslategray=light slate gray,lightslategrey=light slate gr" +
    "ay,light slate grey=light slate gray,mediumslateblue=medium slate blue,lawngreen=lawn green," +
    "grey=gray,lightskyblue=light sky blue,skyblue=sky blue,blueviolet=blue violet,darkmagenta=da" +
    "rk magenta,darkred=dark red,saddlebrown=saddle brown,darkseagreen=dark sea green,mediumpurpl" +
    "e=medium purple,darkviolet=dark violet,palegreen=pale green,darkorchid=dark orchid,darkgray=" +
    "dark gray,darkgrey=dark gray,dark grey=dark gray,greenyellow=green yellow,paleturquoise=pale" +
    " turquoise,lightsteelblue=light steel blue,powderblue=powder blue,firebrick=fire brick,darkg" +
    "oldenrod=dark goldenrod,mediumorchid=medium orchid,rosybrown=rosy brown,darkkhaki=dark khaki" +
    ",mediumvioletred=medium violet red,lightgray=light gray,lightgrey=light gray,light grey=ligh" +
    "t gray,palevioletred=pale violet red,lightcyan=light cyan,darksalmon=dark salmon,palegoldenr" +
    "od=pale goldenrod,lightcoral=light coral,sandybrown=sandy brown,mintcream=mint cream,whitesm" +
    "oke=white smoke,ghostwhite=ghost white,lightgoldenrodyellow=light goldenrod yellow,oldlace=o" +
    "ld lace,blanchedalmond=blanched almond,cornsilk=corn silk,darkorange=dark orange,deeppink=de" +
    "ep pink,floralwhite=floral white,hotpink=hot pink,lavenderblush=lavender blush,lemonchiffon=" +
    "lemon chiffon,lightpink=light pink,lightsalmon=light salmon,lightyellow=light yellow,mistyro" +
    "se=misty rose,papayawhip=papaya whip,peachpuff=peach puff,rebeccapurple=rebecca purple,grey " +
    "teal=gray teal,light grey green=light gray green,reddish grey=reddish gray,darkish pink=dark" +
    " pink,battleship grey=battleship gray,browny green=brownish green,charcoal grey=charcoal gra" +
    "y,browny orange=brownish orange,greyish teal=grayish teal,cool grey=cool gray,darkish purple" +
    "=dark purple,dark blue grey=dark blue gray,darkish red=dark red,macaroni and cheese=dark yel" +
    "low,reddy brown=reddish brown,li" +
    "ght blue grey=light blue gray,lightish purple=light purple,lightish red=light red,yellowy br" +
    "own=yellowish brown,brown grey=brown gray,dark grey blue=dark gray blue,greeny brown=greenis" +
    "h brown,light grey blue=light gray blue,pale grey=pale gray,purply pink=purplish pink,greeny" +
    " yellow=greenish yellow,warm grey=warm gray,bluey green=bluish green,grey pink=gray pink,med" +
    "ium grey=medium gray,purpley pink=purplish pink,greeny blue=greenish blue,pinkish grey=pinki" +
    "sh gray,orangey red=orangish red,lightish green=light green,orangey brown=orangish brown,bro" +
    "wnish grey=brownish gray,purplish grey=purplish gray,greyish pink=grayish pink,bluey purple=" +
    "bluish purple,darkish green=dark green,purply blue=purplish blue,greyish brown=grayish brown" +
    ",steel grey=steel gray,yellowy green=yellowish green,darkish blue=dark blue,pinky red=pinkis" +
    "h red,lightish blue=light blue,purpley blue=purplish blue,purple grey=purple gray,grey brown" +
    "=gray brown,green grey=green gray,bluish grey=bluish gray,grey purple=gray purple,pinky purp" +
    "le=pinkish purple,greenish grey=greenish gray,greyish purple=grayish purple,greyish green=gr" +
    "ayish green,greyish blue=grayish blue,grey green=gray green,blue grey=blue gray,grey blue=gr" +
    "ay blue,kelley green=kelly green,bluegrey=bluegray,greyblue=grayblue,indianred=indian red,na" +
    "vajowhite=navajo white,manilla=manila,light lavendar=light lavender,liliac=lilac,ocher=ochre" +
    ",ocre=ochre,perrywinkle=periwinkle,purpleish blue=purplish blue,purpleish pink=purplish pink" +
    ",terracota=terracotta,toupe=taupe,bluey grey=bluish gray,greeny grey=greenish gray,purpley g" +
    "rey=purplish gray,blurple=blue purple,burple=purple blue,pinky=pink,purpley=purple,purply=pu" +
    "rple";

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
    const clean = hex.replace("#", "").toLowerCase();
    let expanded = clean;
    if (clean.length === 3) {
        expanded = `${clean[0]}${clean[0]}${clean[1]}${clean[1]}${clean[2]}${clean[2]}`;
    }
    return {
        r: parseInt(expanded.slice(0, 2), 16),
        g: parseInt(expanded.slice(2, 4), 16),
        b: parseInt(expanded.slice(4, 6), 16),
    };
}

// =============================================================================
// OkLCh Color Space (Perceptually Uniform)
// Reference: https://bottosson.github.io/posts/oklab/
// =============================================================================

export interface OkLch {
    L: number; // Lightness 0-1
    C: number; // Chroma (saturation) 0-0.4+
    h: number; // Hue 0-360
}

/** Convert sRGB component (0-255) to linear RGB (0-1) */
export function srgbToLinear(c: number): number {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/**
 * WCAG 2.1 relative luminance of a hex color, 0 (black) to 1 (white).
 *
 * This is the linearized, properly weighted quantity — NOT the old
 * `0.299r + 0.587g + 0.114b` luma, which is an NTSC broadcast approximation
 * applied to gamma-encoded channels and misjudges saturated blues badly.
 */
export function relativeLuminance(hex: string): number {
    const { r, g, b } = hexToRgb(hex);
    return (
        0.2126 * srgbToLinear(r) +
        0.7152 * srgbToLinear(g) +
        0.0722 * srgbToLinear(b)
    );
}

/**
 * Whether black or white ink has the higher WCAG contrast on this color.
 *
 * Contrast against white is `1.05 / (L + 0.05)` and against black is
 * `(L + 0.05) / 0.05`; setting them equal puts the crossover at
 * `L = sqrt(1.05 * 0.05) - 0.05`, about 0.179. Every color above it is better
 * served by black ink, every color below it by white — no tuning, no threshold
 * to guess, and the choice is optimal by construction.
 */
export const INK_CROSSOVER = Math.sqrt(1.05 * 0.05) - 0.05;

export function bestInk(hex: string): "black" | "white" {
    return relativeLuminance(hex) > INK_CROSSOVER ? "black" : "white";
}

/** Cartesian OkLab: [L, a, b]. The polar form (OkLCh) is derived from this. */
export type Oklab = readonly [number, number, number];

/** Convert sRGB (0-255) to OkLab. */
export function rgbToOklab(r: number, g: number, b: number): Oklab {
    // sRGB to linear RGB
    const lr = srgbToLinear(r);
    const lg = srgbToLinear(g);
    const lb = srgbToLinear(b);

    // Linear RGB to LMS
    const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
    const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
    const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;

    // Cube root
    const lp = Math.cbrt(l);
    const mp = Math.cbrt(m);
    const sp = Math.cbrt(s);

    // LMS to OkLab
    return [
        0.2104542553 * lp + 0.793617785 * mp - 0.0040720468 * sp,
        1.9779984951 * lp - 2.428592205 * mp + 0.4505937099 * sp,
        0.0259040371 * lp + 0.7827717662 * mp - 0.808675766 * sp,
    ];
}

/** Convert hex color to OkLCh (perceptually uniform color space) */
export function hexToOkLch(hex: string): OkLch {
    const { r, g, b } = hexToRgb(hex);
    const [L, a, ob] = rgbToOklab(r, g, b);

    // OkLab to OkLCh (polar)
    const C = Math.sqrt(a * a + ob * ob);
    let h = (Math.atan2(ob, a) * 180) / Math.PI;
    if (h < 0) h += 360;

    return { L, C, h };
}

/**
 * Perceptual distance between two OkLab colors. Roughly 0.02 is one
 * just-noticeable difference; 0.4 spans black to white.
 *
 * This replaced a squared-RGB nearest-neighbour search. RGB distance is not
 * perceptual — it over-weights green (which carries most of the luma) and
 * under-weights blue, so a mid-tone blue-green would land on a name chosen by
 * how much green channel it happened to have. Holding the corpus fixed and
 * measuring over 3,504 colors from 144 live seeds, switching to OkLab moves the
 * chosen name for 40% of them: #332f26 goes from "charcoal gray" to "dark
 * brown", #ff4a54 from "watermelon" to "light red".
 */
export function oklabDistance(a: Oklab, b: Oklab): number {
    return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

// =============================================================================
// The sRGB gamut ceiling — chroma vs saturation
// =============================================================================

/**
 * OkLab back to LINEAR sRGB. The exact inverse of the matrices in `rgbToOklab`
 * (Ottosson's published pair), stopping before the sRGB transfer function
 * because every caller here only asks "is this inside [0,1]?", and clipping is
 * decided in linear light.
 */
function oklabToLinearRgb(L: number, a: number, b: number): [number, number, number] {
    const lp = L + 0.3963377774 * a + 0.2158037573 * b;
    const mp = L - 0.1055613458 * a - 0.0638541728 * b;
    const sp = L - 0.0894841775 * a - 1.291485548 * b;
    const l = lp * lp * lp;
    const m = mp * mp * mp;
    const s = sp * sp * sp;
    return [
        4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ];
}

/** Slack on the [0,1] gamut test, in linear light: below one part in a million. */
const GAMUT_EPSILON = 1e-6;

/**
 * Chroma above every sRGB color: the OkLab a/b plane never reaches 0.4 inside
 * the cube (the far corner is the blue primary at C ≈ 0.313), so this is a
 * safe upper bracket for the search below.
 */
const MAX_POSSIBLE_CHROMA = 0.4;

/**
 * Bisection steps. From a bracket of 0.4 this resolves to 0.4/2^24 ≈ 2.4e-8,
 * which is exact for any use here; 16 steps was measured at 0.06% worst-case
 * relative error and 12 steps at 0.87%, so the last few are nearly free
 * insurance rather than a tuning knob.
 */
const GAMUT_BISECTIONS = 24;

/**
 * The largest chroma sRGB can hold at this lightness and hue.
 *
 * WHY THIS EXISTS. Chroma is an absolute distance from the neutral axis;
 * saturation is that distance as a fraction of what the display can actually
 * produce there, and the two are not interchangeable because the sRGB gamut is
 * a lopsided solid: at L 0.92 it holds barely C 0.04 in the blues, at L 0.5 it
 * holds C 0.14, and at the primaries' cusps more than 0.3. Reading absolute
 * chroma as "how much colour is here" therefore calls every light tint gray.
 * That is not hypothetical — the palette #ceeaff,#fcd3d4,#ffffed,#ffffff,
 * #deffff,#d5e3f6 (plainly blue, pink, cream, cyan on screen) classified
 * `grayscale` because its mean chroma is 0.029, while its stops sit at 90-101%
 * of the chroma sRGB physically permits at their own lightness.
 *
 * HOW. Binary search on chroma along the (L, h) ray, testing the OkLab →
 * linear-sRGB matrices above.
 *
 * NO TABLE, DELIBERATELY, against the obvious instinct to precompute. Measured
 * against exact bisection over 6,960 real palette stops (2026-08-17):
 *
 *   grid       build     mean err   p95     p99      worst
 *   32x36      14.2 ms   1.60%      8.26%   16.31%   48.15% @ L 0.992 h 113
 *   65x144     57.6 ms   0.40%      2.36%   10.19%   11.97% @ L 0.063 h 264
 *   129x180    100.7 ms  0.29%      1.55%    6.90%   15.60% @ L 0.361 h 264
 *
 * A grid fails exactly where this bug lives: near the cusps the ceiling is a
 * sharp tent in L (at L 0.99 around yellow it collapses from 0.04 to 0.02 in a
 * hundredth of a unit), so interpolation misreads the light tints whose
 * saturation the fix depends on, and it charges every isolate a cold-start tax
 * to be wrong. Exact bisection measures 360 ns per lookup, 61 lookups per
 * palette (48 dense + 13 rendered stops) = 22 us, and costs nothing at load.
 * Inside paletteFeatures (min of 15 passes over the 867-seed fixture) that is
 * 59.5 us per palette with the lookups stubbed out against 81.2 us with them.
 * The pre-fix module measures 78-83 us across runs, so the pass costs what it
 * did before: attaching saturation to the stops also removed a duplicate
 * hex → OkLCh conversion that paid for the gamut work.
 */
export function maxChromaFor(L: number, hue: number): number {
    if (!(L > 0) || L >= 1) return 0; // black and white hold no chroma at all
    const rad = (hue * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    let lo = 0;
    let hi = MAX_POSSIBLE_CHROMA;
    for (let i = 0; i < GAMUT_BISECTIONS; i++) {
        const mid = (lo + hi) * 0.5;
        const [r, g, b] = oklabToLinearRgb(L, mid * cos, mid * sin);
        const inside =
            r >= -GAMUT_EPSILON &&
            r <= 1 + GAMUT_EPSILON &&
            g >= -GAMUT_EPSILON &&
            g <= 1 + GAMUT_EPSILON &&
            b >= -GAMUT_EPSILON &&
            b <= 1 + GAMUT_EPSILON;
        if (inside) lo = mid;
        else hi = mid;
    }
    return lo;
}

/**
 * Where the ceiling itself stops meaning anything. One 8-bit step away from
 * white or black moves chroma by roughly 0.001, so under 1e-4 both the stop's
 * chroma and its ceiling are floating-point residue and their ratio is noise:
 * pure white measured 9.2% saturation before this guard (C 2.7e-8 over a
 * ceiling of 2.9e-7), which would have made white a colour.
 */
const MIN_MEANINGFUL_CEILING = 1e-4;

/**
 * Relative saturation: chroma as a fraction of the gamut ceiling at that
 * lightness and hue, 0 (neutral) to 1 (as colorful as sRGB gets there).
 *
 * Clamped at 1 because the ceiling is measured in linear light while the stop
 * came back through an 8-bit hex, so a stop sitting exactly on the boundary
 * rounds to 1.01 about as often as to 0.99.
 */
export function relativeSaturation(color: OkLch): number {
    const ceiling = maxChromaFor(color.L, color.h);
    if (ceiling < MIN_MEANINGFUL_CEILING) return 0;
    return Math.min(1, color.C / ceiling);
}

export interface NamedColor {
    name: string;
    r: number;
    g: number;
    b: number;
    lab: Oklab;
}

function parseCorpus(): NamedColor[] {
    const out: NamedColor[] = [];
    for (const entry of PACKED_COLORS.split(",")) {
        const cut = entry.lastIndexOf(":");
        const name = entry.slice(0, cut);
        const hex = entry.slice(cut + 1);
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        out.push({ name, r, g, b, lab: rgbToOklab(r, g, b) });
    }
    return out;
}

/** The full naming corpus, in alphabetical order. See PACKED_COLORS above. */
export const NAMED_COLORS: NamedColor[] = parseCorpus();

const NAMED_COLOR_MAP = new Map(NAMED_COLORS.map((c) => [c.name, c]));

for (const entry of PACKED_ALIASES.split(",")) {
    const cut = entry.lastIndexOf("=");
    const target = NAMED_COLOR_MAP.get(entry.slice(cut + 1));
    if (target) NAMED_COLOR_MAP.set(entry.slice(0, cut), target);
}

/** Nearest corpus entry to a color already in OkLab. */
function nearestNamed(lab: Oklab): NamedColor {
    let closest = NAMED_COLORS[0]!;
    let min = Infinity;
    for (const color of NAMED_COLORS) {
        const dist = oklabDistance(lab, color.lab);
        if (dist < min) {
            min = dist;
            closest = color;
        }
        if (dist === 0) break;
    }
    return closest;
}

export function hexToColorName(hex: string): string {
    const { r, g, b } = hexToRgb(hex);
    return nearestNamed(rgbToOklab(r, g, b)).name;
}

/** Replaces all hex codes in a string with their closest color names */
export function replaceHexWithColorNames(query: string): string {
    return query.replace(HEX_CODE_REGEX, (match) => hexToColorName(match));
}

const COLOR_NAME_MAP = new Map(
    BASIC_COLORS.map((c) => [c.name.toLowerCase(), c]),
);

/**
 * Resolves against the full corpus and its aliases, not just BASIC_COLORS, so
 * that every name the app can now *produce* is also a name it can look up. The
 * corpus was built with BASIC_COLORS claiming its names first, so the 41
 * curated answers are unchanged.
 */
export function colorNameToHex(name: string): string | null {
    const color = NAMED_COLOR_MAP.get(name.toLowerCase().trim());
    if (!color) return null;
    const toHex = (n: number) => n.toString(16).padStart(2, "0");
    return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
}

export function isColorName(word: string): boolean {
    return NAMED_COLOR_MAP.has(word.toLowerCase().trim());
}

/**
 * Longest match first, up to `maxWords` words, so "deep sky blue" resolves as
 * one color rather than three. Returns the matched name and how many words it
 * consumed, or null.
 */
export function matchColorName(
    words: string[],
    start: number,
    maxWords = 3,
): { name: string; length: number } | null {
    const limit = Math.min(maxWords, words.length - start);
    for (let take = limit; take >= 1; take--) {
        const candidate = words.slice(start, start + take).join(" ").toLowerCase();
        if (NAMED_COLOR_MAP.has(candidate)) return { name: candidate, length: take };
    }
    return null;
}

export function simplifyHex(hex: string): string {
    const clean = hex.replace("#", "").toLowerCase();
    if (clean.length !== 6) return hex;

    if (
        clean[0] === clean[1] &&
        clean[2] === clean[3] &&
        clean[4] === clean[5]
    ) {
        return `#${clean[0]}${clean[2]}${clean[4]}`;
    }
    return hex;
}

export function isExactColorMatch(hex: string): boolean {
    const rgb = hexToRgb(hex);
    for (const color of BASIC_COLORS) {
        if (color.r === rgb.r && color.g === rgb.g && color.b === rgb.b) {
            return true;
        }
    }
    return false;
}

export interface ColorNameOptions {
    /** Hard cap on how many names come back. */
    max?: number;
    /**
     * How far an interior stop must sit from every already-chosen stop, in
     * OkLab, before it earns its own name.
     */
    minSeparation?: number;
    /**
     * The looser bar the last stop clears. Below this the two ends of the
     * gradient are the same color and one name describes it.
     */
    endpointSeparation?: number;
}

/** Defaults are tuned in seo-research/color-corpus.md against 144 live seeds. */
export const DEFAULT_MAX_COLOR_NAMES = 4;
const DEFAULT_MIN_SEPARATION = 0.12;
const DEFAULT_ENDPOINT_SEPARATION = 0.05;

/**
 * Name the colors that actually characterise a palette, in ramp order.
 *
 * The old version named every stop and removed duplicates, which had two
 * failure modes that got worse as the corpus grew. A thirteen-step charcoal
 * ramp produced a dozen near-synonyms ("charcoal, gunmetal, dim gray, dark
 * blue gray…"); and callers that wanted a short answer took the first N, which
 * is the head of the ramp rather than a description of it.
 *
 * Instead this is farthest-point (max-min) selection over the stops. The first
 * stop anchors the ramp; the last joins it if the two ends differ at all; then
 * each further stop is admitted only if it is `minSeparation` from *every*
 * name already chosen — not merely from its neighbour, which is what let a run
 * of grays each claim a slot. Selection stops as soon as the best remaining
 * candidate is closer than that, so the count is set by how much perceptual
 * ground the palette covers, not by its step count.
 *
 * That is the whole adaptive rule: a subtle charcoal ramp has nowhere to put a
 * third point and stays two names, while a beige→red→green→magenta sweep has
 * room for four. Cosine palettes oscillate, so the interior genuinely matters
 * — one live seed runs #000004 → #000000 through #e8cd7e, and naming it by its
 * endpoints alone called the whole thing "black".
 */
export function getUniqueColorNames(
    hexColors: string[],
    options?: ColorNameOptions,
): string[] {
    const max = options?.max ?? DEFAULT_MAX_COLOR_NAMES;
    const minSeparation = options?.minSeparation ?? DEFAULT_MIN_SEPARATION;
    const endpointSeparation =
        options?.endpointSeparation ?? DEFAULT_ENDPOINT_SEPARATION;

    if (hexColors.length === 0 || max < 1) return [];

    const labs = hexColors.map((hex) => {
        const { r, g, b } = hexToRgb(hex);
        return rgbToOklab(r, g, b);
    });

    const chosen = [0];
    const last = labs.length - 1;
    if (
        max > 1 &&
        last > 0 &&
        oklabDistance(labs[0]!, labs[last]!) >= endpointSeparation
    ) {
        chosen.push(last);
    }

    while (chosen.length < max) {
        let bestIndex = -1;
        let bestDistance = -1;
        for (let i = 0; i < labs.length; i++) {
            if (chosen.includes(i)) continue;
            let nearest = Infinity;
            for (const c of chosen) {
                nearest = Math.min(nearest, oklabDistance(labs[i]!, labs[c]!));
            }
            if (nearest > bestDistance) {
                bestDistance = nearest;
                bestIndex = i;
            }
        }
        if (bestIndex < 0 || bestDistance < minSeparation) break;
        chosen.push(bestIndex);
    }

    // Ramp order, and two chosen stops can still round to one name.
    chosen.sort((a, b) => a - b);
    const names: string[] = [];
    for (const index of chosen) {
        const name = nearestNamed(labs[index]!).name;
        if (!names.includes(name)) names.push(name);
    }
    return names;
}

/**
 * Generate a human-readable gradient description for accessibility.
 * Example: "gradient with coral, salmon, pink, and lavender"
 */
export function getGradientAriaLabel(hexColors: string[]): string {
    const names = getUniqueColorNames(hexColors);

    if (names.length === 0) return "gradient";
    if (names.length === 1) return `${names[0]} gradient`;
    if (names.length === 2) return `gradient from ${names[0]} to ${names[1]}`;

    const last = names[names.length - 1];
    const rest = names.slice(0, -1).join(", ");
    return `gradient with ${rest}, and ${last}`;
}

function rgbToHex(r: number, g: number, b: number): string {
    const toHex = (n: number) => n.toString(16).padStart(2, "0");
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Convert RGB to HSL. Returns hue in degrees (0-360), saturation and lightness as 0-1.
 */
export function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
    r /= 255;
    g /= 255;
    b /= 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;

    if (max === min) {
        return { h: 0, s: 0, l };
    }

    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    let h = 0;
    if (max === r) {
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    } else if (max === g) {
        h = ((b - r) / d + 2) / 6;
    } else {
        h = ((r - g) / d + 4) / 6;
    }

    return { h: h * 360, s, l };
}

export function getColorsWithHex(): Array<{ name: string; hex: string }> {
    return BASIC_COLORS.map((c) => ({
        name: c.name,
        hex: rgbToHex(c.r, c.g, c.b),
    }));
}

export interface ColorWithHue {
    name: string;
    hex: string;
    hue: number;
    saturation: number;
    lightness: number;
}

/**
 * Get colors with HSL values, optionally filtered and sorted by hue.
 * Excludes achromatic colors (black, white, grays) by default.
 */
export function getColorsWithHue(options?: {
    excludeAchromatic?: boolean;
    minSaturation?: number;
}): ColorWithHue[] {
    const { excludeAchromatic = true, minSaturation = 0.1 } = options ?? {};

    return BASIC_COLORS
        .map((c) => {
            const { h, s, l } = rgbToHsl(c.r, c.g, c.b);
            return {
                name: c.name,
                hex: rgbToHex(c.r, c.g, c.b),
                hue: h,
                saturation: s,
                lightness: l,
            };
        })
        .filter((c) => !excludeAchromatic || c.saturation >= minSaturation)
        .sort((a, b) => a.hue - b.hue);
}

/**
 * Check if a tag/word is a basic color name
 */
export function isBasicColor(tag: string): boolean {
    return COLOR_NAME_MAP.has(tag.toLowerCase());
}

/**
 * Get the ColorWithHue data for a basic color name
 */
function getColorData(colorName: string): ColorWithHue | null {
    const color = COLOR_NAME_MAP.get(colorName.toLowerCase());
    if (!color) return null;

    const { h, s, l } = rgbToHsl(color.r, color.g, color.b);
    return {
        name: color.name,
        hex: rgbToHex(color.r, color.g, color.b),
        hue: h,
        saturation: s,
        lightness: l,
    };
}

/**
 * Get all chromatic colors (non-gray colors with sufficient saturation) sorted by hue
 */
function getChromaticColors(): ColorWithHue[] {
    return getColorsWithHue({ excludeAchromatic: true, minSaturation: 0.15 });
}

/**
 * Find the closest color by hue, searching in a specific direction
 * @param targetHue - The hue to search from (0-360)
 * @param direction - 1 for clockwise, -1 for counter-clockwise
 * @param excludeNames - Color names to exclude from results
 * @param count - Number of colors to find
 */
function findColorsByHueDirection(
    targetHue: number,
    direction: 1 | -1,
    excludeNames: Set<string>,
    count: number
): ColorWithHue[] {
    const chromatic = getChromaticColors();
    const results: ColorWithHue[] = [];

    const sortedByDistance = chromatic
        .filter(c => !excludeNames.has(c.name))
        .map(c => {
            let diff = c.hue - targetHue;
            if (direction === 1) {
                if (diff < 0) diff += 360;
            } else {
                if (diff > 0) diff -= 360;
                diff = Math.abs(diff);
            }
            return { color: c, distance: diff };
        })
        .sort((a, b) => a.distance - b.distance);

    for (const item of sortedByDistance) {
        if (results.length >= count) break;
        if (!excludeNames.has(item.color.name)) {
            results.push(item.color);
            excludeNames.add(item.color.name);
        }
    }

    return results;
}

/**
 * Find complementary colors (opposite on the color wheel, ~180 degrees apart)
 */
function findComplementaryColors(
    targetHue: number,
    excludeNames: Set<string>,
    count: number
): ColorWithHue[] {
    const chromatic = getChromaticColors();
    const complementHue = (targetHue + 180) % 360;

    const sortedByDistance = chromatic
        .filter(c => !excludeNames.has(c.name))
        .map(c => {
            const diff = Math.abs(c.hue - complementHue);
            const distance = Math.min(diff, 360 - diff);
            return { color: c, distance };
        })
        .sort((a, b) => a.distance - b.distance);

    const results: ColorWithHue[] = [];
    for (const item of sortedByDistance) {
        if (results.length >= count) break;
        results.push(item.color);
    }

    return results;
}

export interface ColorCombinationSet {
    type: "analogous" | "complementary";
    colors: string[];
}

/**
 * Generate color combination sets for a given base color.
 * Returns sets for gradient generation:
 * - 2 analogous sets of 2 (one in each direction on color wheel)
 * - 2 analogous sets of 3 (one in each direction on color wheel)
 * - 2 complementary sets of 2 (base + complement variations)
 * - 2 complementary sets of 3 (base + analogous + complement variations)
 */
export function generateColorCombinations(baseColorName: string): ColorCombinationSet[] {
    const baseData = getColorData(baseColorName);
    if (!baseData || baseData.saturation < 0.1) {
        return [];
    }

    const baseName = baseData.name;
    const baseHue = baseData.hue;
    const results: ColorCombinationSet[] = [];

    // Analogous Set of 2: clockwise neighbor
    const clockwise1 = findColorsByHueDirection(baseHue, 1, new Set([baseName]), 1);
    if (clockwise1.length > 0 && clockwise1[0]) {
        results.push({
            type: "analogous",
            colors: [baseName, clockwise1[0].name],
        });
    }

    // Analogous Set of 2: counter-clockwise neighbor
    const counterClockwise1 = findColorsByHueDirection(baseHue, -1, new Set([baseName]), 1);
    if (counterClockwise1.length > 0 && counterClockwise1[0]) {
        results.push({
            type: "analogous",
            colors: [baseName, counterClockwise1[0].name],
        });
    }

    // Analogous Set of 3: clockwise (base + 2 neighbors)
    const clockwise2 = findColorsByHueDirection(baseHue, 1, new Set([baseName]), 2);
    if (clockwise2.length >= 2 && clockwise2[0] && clockwise2[1]) {
        results.push({
            type: "analogous",
            colors: [baseName, clockwise2[0].name, clockwise2[1].name],
        });
    }

    // Analogous Set of 3: counter-clockwise (base + 2 neighbors)
    const counterClockwise2 = findColorsByHueDirection(baseHue, -1, new Set([baseName]), 2);
    if (counterClockwise2.length >= 2 && counterClockwise2[0] && counterClockwise2[1]) {
        results.push({
            type: "analogous",
            colors: [baseName, counterClockwise2[0].name, counterClockwise2[1].name],
        });
    }

    // Complementary Sets of 2
    const complements = findComplementaryColors(baseHue, new Set([baseName]), 2);
    if (complements.length >= 1 && complements[0]) {
        results.push({
            type: "complementary",
            colors: [baseName, complements[0].name],
        });
    }
    if (complements.length >= 2 && complements[1]) {
        results.push({
            type: "complementary",
            colors: [baseName, complements[1].name],
        });
    }

    // Complementary Set of 3: base + clockwise neighbor + complement
    if (clockwise1.length > 0 && complements.length >= 1 && clockwise1[0] && complements[0]) {
        results.push({
            type: "complementary",
            colors: [baseName, clockwise1[0].name, complements[0].name],
        });
    }

    // Complementary Set of 3: base + counter-clockwise neighbor + second complement
    if (counterClockwise1.length > 0 && complements.length >= 2 && counterClockwise1[0] && complements[1]) {
        results.push({
            type: "complementary",
            colors: [baseName, counterClockwise1[0].name, complements[1].name],
        });
    }

    return results;
}

/**
 * Process a list of tags and expand any basic color names into color combination sets.
 * Non-color tags are passed through unchanged.
 * Returns both the original tags and the generated combination tags.
 */
export function expandColorTags(tags: string[]): {
    originalTags: string[];
    colorCombinations: Array<{ baseColor: string; combinations: ColorCombinationSet[] }>;
} {
    const originalTags: string[] = [];
    const colorCombinations: Array<{ baseColor: string; combinations: ColorCombinationSet[] }> = [];

    for (const tag of tags) {
        originalTags.push(tag);

        if (isBasicColor(tag)) {
            const combinations = generateColorCombinations(tag);
            if (combinations.length > 0) {
                colorCombinations.push({
                    baseColor: tag.toLowerCase(),
                    combinations,
                });
            }
        }
    }

    return { originalTags, colorCombinations };
}

/**
 * Convert a color combination set to a tag string for use in queries.
 * Example: ["gold", "yellow"] => "gold yellow"
 */
export function combinationToTag(combination: ColorCombinationSet): string {
    return combination.colors.join(" ");
}

/**
 * Get all expanded tags from a list, including both original and color combinations.
 */
export function getAllExpandedTags(tags: string[]): string[] {
    const result: string[] = [];
    const { originalTags, colorCombinations } = expandColorTags(tags);

    result.push(...originalTags);

    for (const { combinations } of colorCombinations) {
        for (const combo of combinations) {
            result.push(combinationToTag(combo));
        }
    }

    return result;
}
