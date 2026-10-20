# Arabic (ar) glossary

Modern Standard Arabic, neutral and concise, right to left. Read `README.md` first; this file says how Arabic says the
product's words. Use the chosen word every time.

## Register

- Modern Standard Arabic, no dialect. Plain and specific, as the English is; no marketing, no exclamation marks, no
  em dashes in the site's own sentences.
- Buttons and one-shot actions are imperatives: انسخ، نزّل، احفظ، صدّر، أضف، أزل، احذف، افتح، أعد المحاولة.
  A label that is also a heading, a menu item or a page title takes the verbal noun instead: تسجيل الدخول،
  تسجيل الخروج، تصدير، حذف الحساب، إزالة من المجموعة، ضبط طريقة العرض. Cancel and Close are the usual إلغاء and إغلاق.
  So are back, return and exit, as Arabic apps write them: رجوع، العودة إلى الأعلى، العودة إلى {host}، الخروج من
  ملء الشاشة; Back to top's other state is التمرير إلى الأسفل.
- A tooltip is the press's name, as on its button, then its key. A screen reader name that adds to a visible label
  starts with that label: the إغلاق press of the selection is إغلاق التحديد.
- Progress lines: جارٍ … (جارٍ الحفظ…، جارٍ البحث…). Failures: تعذّر … (تعذّر نسخ اللوحة.). Try again in a line:
  حاول مجددًا, later: حاول مجددًا لاحقًا; the press is أعد المحاولة.
- Arabic punctuation: ، ؛ ؟ and «» where Arabic quotes are needed.
- Numbers are values the app writes in Western digits; never write Arabic-Indic digits and never convert a number
  inside a message. Literal numbers in the English (5 minutes, 2,048) stay as written.
- Brand, format and standard names stay in Latin script: Grabient, OKLCH, OKLab, sRGB, Display P3, CSS, SVG, PNG,
  JPEG, WebP, JSON, Shader, GLSL, WGSL, Shadertoy, Figma, MCP, URL, Markdown, JavaScript, Google, Cloudflare, hex,
  oklch(). The conjunction و attaches to them (وPNG). No preposition attaches to a Latin name (بـGrabient): the
  sentence takes a separate word instead (عن، مع، على، بينهم وبين).
- No bidi control characters: the page sets the direction, and values, hex codes and sizes sit in their own
  left-to-right islands. Every value the code drops into a sentence isolates the same way (a hex code, a size,
  a name), so translators never reorder a value to make it display correctly.
- Arrows that point along the line of reading are mirrored: "Open →" is افتح ←. A progression of values is said in
  words rather than with an arrow (من 0.86 إلى 0.32), except inside code (`<c>` tags), which stays as written.
- Example words follow what the control understands. The palette search knows Arabic words (its lexicon has كحلي،
  مريح، غروب الشمس), so its hint gives Arabic examples.

## Plurals

Every count gives all six Arabic forms: zero, one, two, few (3 to 10), many (11 to 99), other (100 and up).
The counted noun follows the number rules of Arabic:

| form | لوحة (palette, f.) | لون (color, m.) | نقطة توقف (stop) | إطار رئيسي (keyframe) |
| --- | --- | --- | --- | --- |
| zero | # لوحات | # ألوان | # نقاط توقف | # إطارات رئيسية |
| one | لوحة واحدة | لون واحد | نقطة توقف واحدة | إطار رئيسي واحد |
| two | لوحتان (لوحتين after a preposition) | لونان | نقطتا توقف | إطاران رئيسيان |
| few | # لوحات | # ألوان | # نقاط توقف | # إطارات رئيسية |
| many | # لوحة | # لونًا | # نقطة توقف | # إطارًا رئيسيًا |
| other | # لوحة | # لون | # نقطة توقف | # إطار رئيسي |

One and two are said with the noun alone (لوحة واحدة، لوحتان), as Arabic does, except where the number is drawn
apart from the word (a big count with a small label under it): there the label is the bare noun in each form.

A message whose plural cases each carry a rich tag (`<n>#</n> <w>palettes</w>`) keeps the tags as many times as the
English has them (the check counts them): the outer plural keeps `=1` and `other` with the tags, and a plural inside
the tag gives the six forms of the word. See `{count, plural, one {<n>#</n> <w>palette</w>} ...}` in `ar.json`.

A value count the code passes as plain text (`{max}` in a server error) cannot inflect, so those sentences are built
around it: يتراوح عدد أحرفه بين 1 و{max}، ما لا يزيد على {max} من الوسوم.

## The words

| English | Arabic | Note |
| --- | --- | --- |
| Grabient | Grabient | Never translated or transliterated. Masculine when a verb needs it (يحسب Grabient). |
| palette | لوحة ألوان; short لوحة، pl. لوحات | The product's main noun. لوحة alone once a palette is already on screen; the full لوحة ألوان / لوحات الألوان at entry points with none visible (sign-in, the About intro, emails, page titles, meta descriptions), where a bare لوحة first reads as a panel or a painting. |
| color palette (titles, search) | لوحة ألوان، لوحات ألوان | What Arabic searchers type. |
| gradient | تدرج لوني; short تدرج، pl. تدرجات | CSS gradient: تدرج CSS. Gradient generator: مولد تدرجات. |
| linear / angular / radial gradient | تدرج خطي / تدرج زاوي / تدرج شعاعي | Adobe's Arabic words for the three gradient types. |
| swatches | عينات (عينات خطية، عينات زاوية، عينات شعاعية) | The page titles' word for the hard-band styles. |
| Swatches (the strip's swatch files) | عينات الألوان | The files design apps import (Tokens, ASE, GPL, GRD), named as a design app's Swatches panel is, not the hard-band style. "Switch to swatches": بدّل إلى عينات الألوان. |
| bands (the style labels) | أشرطة (أشرطة خطية، أشرطة زاوية، أشرطة شعاعية); a hard band: شريط حاد | The app's style menu says bands; titles say swatches. Kept as the English keeps them. |
| style | النمط | |
| As saved (style auto) | كما حُفظ | |
| steps (the control) | الخطوات | How many colors are sampled. |
| colors (a count) | ألوان (7 ألوان) | |
| stop (color stop) | نقطة توقف، pl. نقاط توقف | The CSS term for a color stop. |
| angle | الزاوية | Plural الزوايا. Not used for corners. |
| keyframe | إطار رئيسي، pl. إطارات رئيسية | Adobe's Arabic word for keyframe; kept because the product keeps the animation word. Add keyframe / Remove keyframe / Remove keyframes: أضف إطارًا رئيسيًا / أزل إطارًا رئيسيًا / أزل الإطارات الرئيسية. |
| hold / held / let go (keyframes) | ثبّت / المثبّت، المثبّتة / ألغِ التثبيت (with an object: ألغِ تثبيت …) | Holding a keyframe keeps it from a redraw and makes it what the controls act on. Not حدّد, which is the selection's verb, and not حرّر: that verb stays Edit's (تحرير, المحرر), which Let go does not share, and ثبّت / ألغِ التثبيت is the pin/unpin pair Arabic apps already use. |
| lock / unlock (the Lightness, Chroma and Hue locks) | أقفل / ألغِ القفل (with an object: ألغِ قفل …) | A lock keeps its value through عشوائي: أقفل الإضاءة; while closed, its tip is ألغِ قفل الإضاءة, as Unlike is ألغِ الإعجاب. Not ثبّت, which holds keyframes. |
| lightness | الإضاءة | The L of OKLCH. |
| chroma | الكروما | The color-science term (Munsell and CIE texts in Arabic use الكروما). Not التشبع, which is saturation. |
| hue | الصبغة | The color-science term. Not تدرج اللون (Adobe's word), which would collide with تدرج (gradient), nor درجة اللون, which collides with degrees. |
| travel (hue travel) | المسافة | How far the hue goes, in degrees, laps included: مسافة الصبغة. مدى الصبغة would say more; kept short only because the label has no room for it. |
| color space | فضاء الألوان | |
| gamut / in gamut / gamut mapping | النطاق اللوني / ضمن النطاق / مواءمة النطاق | |
| solid (the sRGB solid) | مجسّم | مجسّم sRGB. |
| Text contrast (the pane) | تباين النص | Its cells: {text} على {ground}: {ratio}، then كافٍ للنص / للنص الكبير فقط / منخفض جدًا للنص. |
| text color (one the reader adds there) | لون النص | Add text color: أضف لون نص. Its presses: غيّر {hex} / أزل {hex}. |
| color picker | منتقي الألوان | The floating dialog, and the swatch beside a hex field that opens it. |
| Pick color (the eyedropper) | التقط لونًا | The eyedropper's action, التقاط اللون. |
| saturation and brightness (the picker's square) | التشبع والسطوع | HSB's S and B, as color pickers name them. Never الكروما or الإضاءة, which are the palette's chroma and lightness. |
| spline | منحنى | منحنى Catmull–Rom. |
| seed | البذرة | The palette's code in the address. |
| shader | Shader | Latin script, like the GLSL, WGSL and Shadertoy tabs under it; shader code: كود Shader. Not مظلّل, a coinage developers don't read or search for. |
| Format / Syntax (the code tabs) | الصيغة / الصياغة | A file's format is صيغة everywhere (بصيغة JSON). Syntax picks hex or oklch, GLSL or WGSL. |
| collection | مجموعة، pl. مجموعات | Never used for anything else. |
| selection | التحديد | The palettes gathered with the plus. Selected: محددة. Select: حدّد. Add to / Remove from selection: أضف إلى التحديد / أزل من التحديد; Clear: امسح. |
| Popular / Rising / Saved (orders) | الأكثر شعبية / الصاعدة / المحفوظة | The segmented control. |
| 1w / 3m / 1y (Rising's frames) | أسبوع / 3 أشهر / سنة | The language's own short forms, digits only where it writes them: a week and a year stand as the noun alone. Said in full for a screen reader: الصاعدة، أسبوع واحد. The admin switches: الصاعدة على مدى سنة، الصاعدة على مدى 3 أشهر. |
| Popular (lead of the tag row) | الشائعة | Agrees with الوسوم. |
| Hot | رائجة | لوحات ومجموعات رائجة. |
| like / Like / Unlike | إعجاب / أعجبني / ألغِ الإعجاب | The heart's tooltip, before and after a like. |
| export | صدّر (button), تصدير (heading) | Writes files. |
| copy | انسخ; Copied: تم النسخ | Puts text or an image on the clipboard. |
| download | نزّل; تنزيل | Saves a file. |
| Copying. Switch to download (the format row's last press) | النسخ / التنزيل / نسخ الروابط، then بدّل إلى النسخ / بدّل إلى التنزيل / بدّل إلى الروابط | What the row is doing, then the mode it turns to. Its chips: انسخ {format}، نزّل {format}، انسخ رابط {format}. |
| save | احفظ; Saved: تم الحفظ | Keeps palettes in the account or a collection. |
| saved collection / Update / Reset | مجموعة محفوظة؛ Saved: محفوظة / حدّث / أعد الضبط | Save on someone else's collection keeps the reader's own copy, once. Update takes in what changed in the collection it was saved from and keeps the reader's changes; Reset makes it that collection again. A title follows "المجموعة", never an attached لـ. |
| Save or export / Save to (the export column's toggles, and the label over its collections) | حفظ أو تصدير / الحفظ في | Verbal nouns: they name choices, not an action. |
| preview size | حجم المعاينة | Auto: تلقائي. |
| Home (the page frame's link) | الرئيسية | Short for الصفحة الرئيسية, as Arabic sites label it. |
| shortcuts | اختصارات لوحة المفاتيح; the page, its nav link and the ? list: الاختصارات | Show shortcuts: اعرض الاختصارات; Change shortcuts: غيّر الاختصارات; Change key: غيّر المفتاح. |
| sign in / sign out | تسجيل الدخول / تسجيل الخروج | Verbal nouns: they are also headings and menu items. |
| account / settings | الحساب / الإعدادات | |
| Offline | غير متصل | You're offline.: أنت غير متصل. What opens offline once seen online: تُفتح هذه الصفحة دون اتصال بعد أن تزورها مرة وأنت متصل. |
| app / connect / disconnect / Allow (the consent page's press) | تطبيق، pl. تطبيقات / اربط، مرتبط / ألغِ الربط / اسمح | An app is linked to the account (ربط), as Arabic apps say of accounts: التطبيقات المرتبطة. The MCP page says اختر «اسمح», so the consent page's press is اسمح. A custom connector is موصّل مخصص, an MCP server خادم MCP. Connect again from your app: أعد الربط من تطبيقك. |
| agent | وكيل، pl. وكلاء | وكلاء Grabient. |
| admin | مشرف، pl. المشرفون | The word Arabic group and community apps use for an admin. The Settings section is الإشراف; Admin tools is أدوات المشرف: الانتقاء (curation)، التصويت (votes)، الملاحظات للوكلاء، النشر (publishing). Agent notes are an admin's notes for the agents, so ملاحظات للوكلاء, never ملاحظات الوكلاء, which reads as the agents' own. |
| issue / lead palette (the newsletter's, admins only) | عدد، pl. أعداد / اللوحة الافتتاحية | The palette an issue opens with. Lead with this palette: افتتح العدد بهذه اللوحة; its arrows: اللوحة الافتتاحية السابقة / التالية. Not الرئيسية, which is Home's word and the keyframe's. |
| tag | وسم، pl. وسوم | |
| gallery | المعرض | |
| No results. | لا توجد نتائج. | Also a heading. Other empty states say لا توجد … the same way (لا توجد لوحات.). |
| address (a collection's slug, a page's address) | الرابط | Not عنوان, which is the title. Only Copy address, beside an email address or the MCP server's, is انسخ العنوان. |
| URL (in interface copy) | الرابط | Same word as address: انسخ الرابط, not انسخ عنوان URL. Latin URL stays only inside a technical sentence (see Register). |
| taken (a name or address in use) | مستخدَم بالفعل | Not مأخوذ, which reads only as "comes from" (رابطها مأخوذ من عنوانها). |
| title | العنوان | |
| view / Appearance (a palette's style, steps and angle, and the press that sets them) | طريقة العرض | Not العرض alone, which is Width, nor المظهر, which is Theme. Reset appearance: أعد ضبط طريقة العرض. |
| width / height | العرض / الارتفاع | |
| panel (the editor's) | الشريط الجانبي | Not لوحة, which is the palette. Show / Hide panel: أظهر الشريط الجانبي / أخفِ الشريط الجانبي. |
| Full screen / Exit full screen | ملء الشاشة / الخروج من ملء الشاشة | As Arabic video players say them. |
| theme (light / dark) | المظهر (الفاتح / الداكن) | |
| Reduce motion (the setting) | تقليل الحركة | Apple's Arabic name for the same setting. Its one button steps through النظام / تشغيل / إيقاف (System / On / Off, the switch's own words); the line under it calls the device جهازك. |
| Invert / Reverse | اعكس الألوان / اعكس الترتيب | The object is said so the two never read alike. |
| Random | عشوائي | |
| Straighten lightness | قوّم الإضاءة | تقويم can also read as "assessment", but the button's live sparkline and tooltip make the meaning plain. Its status: تم تقويم الإضاءة. |
| Undo / Redo (the editor's) | تراجع / إعادة | The pair Arabic editors use, and the key list's. Their tooltips are the same names. A vote taken back is تراجع too. |
| editor | المحرر | |
| avatar / username | الصورة الرمزية / اسم المستخدم | |
| letters (input rule) | الأحرف الإنجليزية | Only where the rule takes a–z alone, as the username validator does ([a-zA-Z0-9_-]). Plain الأحرف is right where any script is accepted (tags, collection titles: \p{L}). |
| Layout / Gap / Padding / Corners / Columns (export grid) | التخطيط / الفاصل / الحشو / الاستدارة / الأعمدة | Corners is the rounding, in percent. |
| Square / Story (export sizes) | مربع / قصة | |
| This screen / Ultrawide / a foldable's inner and cover (export sizes) | هذه الشاشة / فائقة العرض / {device} الداخلية، {device} الخارجية | Feminine, for the unsaid الشاشة; the device keeps its own name. The noun stays out on purpose: a long row ends in an ellipsis before its pixels, and the word it would cut is the one that tells the two screens apart. |
| color names | أسود، أبيض، رمادي، أحمر، برتقالي، أصفر، أخضر، فيروزي (teal)، أزرق، بنفسجي (purple)، وردي، عنابي (maroon); light/dark: فاتح / داكن | Masculine singular nouns: أزرق فاتح. |
| {start} to {end} | من {start} إلى {end} | A palette's name. Messages that take a name put a noun before it (لوحة {name}، تدرج {name}، لوحات تشبه لوحة {name}) so no preposition meets its من. |
| palette name kinds (dark, muted, vivid, warm, cool, pastel, neon, seamless; monochrome, duotone, tritone, analogous, complementary, triadic) | {colors} بدرجات داكنة / هادئة / زاهية / دافئة / باردة / الباستيل / النيون؛ {colors} بلا فواصل؛ {colors} (أحادي اللون / ثنائي اللون / ثلاثي اللون / ألوان متجاورة / ألوان متتامة / تناغم ثلاثي) | The color names come first and the kind after them. |
| Privacy (the Settings section) | الخصوصية | One word, as in the footer's link. In running text a switch that is on is مفعّلة and off is معطّلة; turn on / off is فعّل / أوقف. A sentence that names a section, switch or button sets the label in «» (اختر «حذف الحساب»). |
| cookie | ملف تعريف الارتباط، pl. ملفات تعريف الارتباط | |
| sign-in link / sign-in code | رابط تسجيل الدخول / رمز تسجيل الدخول | Send link / Send code: أرسل الرابط / أرسل الرمز. A code the reader types is الرمز; program code is الكود (انسخ الكود، كود Shader). |
