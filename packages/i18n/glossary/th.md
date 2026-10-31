# Thai (th)

How Thai says Grabient's own words. Read `README.md` for what each word means here, then use the Thai below every
time: the same control is never คัดลอก on one page and ทำสำเนา on the next.

## Register

- Neutral, polite Thai, without ครับ or ค่ะ. The reader is addressed as คุณ only where the English says "you" or
  "your" and Thai needs the word (คอลเลกชันของคุณ); a label or a tooltip leaves it out.
- Thai is written without spaces between words. A space separates phrases and sentences, and stands on each side of a
  number, a Latin word or a value that may hold one: `7 สี`, `ส่งออก SVG และ PNG`, `คัดลอก {format}`.
- No full stop at the end of a sentence (Thai does not use one). Where the English has two sentences, the Thai has
  two phrases with a space between. Colons stay where a label introduces a value or a list. The ellipsis of a state in
  progress stays: กำลังบันทึก…
- A list of Thai words is separated by spaces with และ or หรือ before the last; a list of format names keeps its
  commas: `CSS, SVG, PNG หรือเชดเดอร์`.
- Buttons, tabs and chips take the shortest natural word, usually a verb: คัดลอก, ดาวน์โหลด, บันทึก, ส่งออก, ลบ,
  ปิด, ล้าง.
- Thai has one plural form (`other`). Counts are the number then its word, the loanword serving as its own
  classifier: `# พาเลตต์`, `# สี`, `# คีย์เฟรม`, `# คอลเลกชัน`, `# จุดสี`.
- ๆ takes a space on both sides where it falls inside a sentence (เท่า ๆ กัน).
- Page titles and descriptions use what Thai searchers type: สร้างไล่เฉดสี, ไล่เฉดสี CSS, CSS gradient, พาเลตต์สี,
  โทนสี. The site's name and the `| Grabient` suffix stay as they are.
- A consent line follows the formula ถือว่า…ยอมรับ ("is deemed to
  accept"), not a plain statement of agreement.

## Format notes

- A plural needs only `other` in Thai: `{count, plural, other {# พาเลตต์}}`. Where the English plural carries tags
  (`<n>#</n> <w>palettes</w>`), keep a `one` case too, word for word the same as `other`: the check counts every tag,
  and the English has each tag once per case.
- A value that may hold Latin text (a title, a search, a tag, a key, a format) gets a space on each side. A value that
  is always Thai (a color name or a translated label) joins the word beside it: `พาเลตต์สี{name}`,
  `ไล่เฉดสี{name}`, `{colors}โทนพาสเทล`.
- A control or section named inside a sentence, where the English marks it
  with capitals, stands in quotation marks “ ”: เลือก “อนุญาต”, ปิดอยู่ใน “ฟีเจอร์ของเว็บไซต์”. การตั้งค่า, which reads as its own page name, takes none.
- A palette's page title puts the style first: `{style} {name}` reads ไล่เฉดสีเชิงเส้น เหลืองอ่อนถึงชมพู.
- The search examples in the hints stay English (navy, cozy, sunset): the free search's vocabulary has no Thai
  (`packages/search/train/data/translations.json`), so a Thai example would find nothing for a reader who is signed out.

## The words

| English | Thai | Note |
| --- | --- | --- |
| Grabient | Grabient | Never translated or transliterated. |
| palette | พาเลตต์ | The main noun. พาเลตต์สี in titles, descriptions and alt text, where the page is found by it. Not จานสี, which reads as a painter's plate, and not the casual spelling พาเลท. |
| gradient | ไล่เฉดสี | The noun and the effect (Thai Canva and design tutorials say ไล่สี or ไล่เฉดสี, often with "Gradient" beside it). The drawn picture is ภาพไล่เฉดสี. "CSS gradient" stays in English beside it in descriptions, since Thai searchers type it that way. Kept over ไล่ระดับสี; Thai designers do not read ไล่เฉดสี as a hue term. |
| effect | เอฟเฟกต์ | สไตล์เคลื่อนไหวในเมนู "การแสดงผล": กระจกลายริ้วและบลอบ |
| linear / angular / radial (style names) | เชิงเส้น / เชิงมุม / รัศมี | The usual Thai names for gradient types (เชิงเส้น, รัศมี); เชิงมุม follows Figma's Angular. In a phrase: ไล่เฉดสีเชิงเส้น, ไล่เฉดสีเชิงมุม, ไล่เฉดสีแบบรัศมี. |
| swatches, bands | แถบสี | A palette drawn as hard bands: แถบสีเชิงเส้น, แถบสีเชิงมุม, แถบสีรัศมี. A single hard band is แถบ. |
| Swatches (the strip's swatch files) | ตัวอย่างสี | The files design apps import (Tokens, ASE, GPL, GRD), named as a design app's Swatches panel is, not the hard-band style. "Switch to swatches": เปลี่ยนเป็นตัวอย่างสี. |
| style | สไตล์ | |
| appearance | การแสดงผล | The press and menu that set style, steps and angle (รีเซ็ตการแสดงผล), and the admin's view of a palette (ตั้งค่าการแสดงผล). |
| steps (the control) | จำนวนสี | What the control sets is how many colors are sampled. Kept over จำนวนขั้น or สเต็ป, which would name the mechanism instead of what the reader sees change. |
| colors (a count) | สี | `7 สี`. |
| stop | จุดสี | A sampled or stored color point (color stop). |
| angle | มุม | |
| keyframe | คีย์เฟรม | As Thai animators say it. |
| held keyframes, hold, let go | คีย์เฟรมที่จับไว้, จับ, ปล่อย | Kept over ล็อก or ตรึง (lock), which would cover only half the meaning: held keyframes are also what invert, reverse and delete act on. "Hold" is the editor's own word for picking keyframes; เลือก is kept for the selection of palettes so the two never meet. |
| lock, unlock (the Lightness, Chroma and Hue locks) | ล็อก, ปลดล็อก | ล็อกความสว่าง, ปลดล็อกความสว่าง: a lock keeps a value through สุ่ม. The word kept free of holding above. |
| lightness | ความสว่าง | L of OKLCH (ค่าความสว่าง L* in Thai color measurement, and the HSL slider's name in Thai photo editing). |
| chroma | โครมา | The color-science term (ค่าโครมา C* in Thai color measurement), kept as the color-science word for this audience. Not ความอิ่มตัว, which is saturation. |
| hue | เฉดสี | H of OKLCH, the name Thai photo-editing guides give the Hue slider (beside ความอิ่มตัว and ความสว่าง). Color science also says มุมสี or ฮิว; เฉดสี is what designers read on a slider. |
| saturation and brightness (the color picker's square) | ความอิ่มตัวและความสว่าง | HSB's S and B, as Thai color pickers name them: ความอิ่มตัว {saturation}% ความสว่าง {brightness}%. Thai pickers give B the word Lightness has; only the square uses it for B. |
| travel (of hue) | ระยะทาง | How far the hue goes around the wheel, in degrees. |
| color space | ปริภูมิสี | |
| gamut | ขอบเขตสี | "gamut-mapped": ปรับเข้าขอบเขตสี. |
| color solid | ทรงตันสี | The 3D shape of a color space. |
| seed | รหัสพาเลตต์ | The palette's code in its address; รหัส alone once the sentence has said which. Not ซีด, which in Thai means pale or faded, a real misreading in a color tool. Kept for that reason. |
| shader | เชดเดอร์ | GLSL, WGSL and Shadertoy stay in English. |
| format, syntax (the code tabs) | รูปแบบ, ไวยากรณ์ | |
| text contrast, text color | คอนทราสต์ข้อความ, สีข้อความ | The pane of text colors over the palette's colors: เพิ่มสีข้อความ. คอนทราสต์ as Thai photo apps write it. |
| color picker, Pick color | เครื่องมือเลือกสี, ดูดสี | Not ตัวเลือกสี, which reads as color options. ดูดสี is the eyedropper's verb in Thai design tools. |
| collection | คอลเลกชัน | The Royal Institute's spelling. |
| selection | รายการที่เลือก | The palettes gathered with a card's plus, and the button that opens them. "{count} selected": เลือกแล้ว # พาเลตต์. |
| Popular / Rising / Saved (orders) | ยอดนิยม / กำลังมา / ที่บันทึกไว้ | Saved as a list is ที่บันทึกไว้; a button's "Saved" after a save is บันทึกแล้ว. |
| 1w / 3m / 1y (Rising's frames) | 1 สัปดาห์ / 3 เดือน / 1 ปี | Whole words: the language has no shorter form in use. Said in full for a screen reader: กำลังมา, 1 สัปดาห์. The admin's switches: กำลังมาในช่วง 3 เดือน, กำลังมาในช่วง 1 ปี. |
| Hot | มาแรง | The home page's order: พาเลตต์และคอลเลกชันมาแรง. |
| like, unlike | ถูกใจ, เลิกถูกใจ | As Facebook's Thai Like and Unlike. |
| like {name} (a search by a palette) | ที่คล้ายโทน{name} | พาเลตต์ที่คล้ายโทน{name}, คอลเลกชันที่คล้ายโทน{name}. Similar palettes: พาเลตต์ที่คล้ายกัน. |
| export | ส่งออก | Writes files. |
| copy | คัดลอก | To the clipboard. |
| download | ดาวน์โหลด | |
| save | บันทึก | Keeps palettes in the account or a collection. |
| saved collection / Update / Reset | คอลเลกชันที่บันทึกไว้; บันทึกแล้ว / อัปเดต / รีเซ็ต | Save on someone else's collection keeps the reader's own copy, once. Update takes in what changed in the collection it was saved from and keeps the reader's changes; Reset makes it that collection again. |
| Save to | บันทึกไปที่ | The label over the collections the selection can be saved to. |
| preview size | ขนาดภาพตัวอย่าง | "Auto" is อัตโนมัติ. |
| size presets: This screen, Ultrawide, a foldable's inner and cover screens | หน้าจอนี้, อัลตร้าไวด์, จอใน, จอนอก | A foldable's screen follows the device's name, as the menu lists it: `{device} จอใน`, `{device} จอนอก`, the words Thai tech reviews use. Ultrawide keeps the common spelling, as Story is สตอรี่. |
| layout (of an exported image) | เลย์เอาต์ | |
| shortcuts | ปุ่มลัด | One word for the page, the ? list and the menu: แสดงปุ่มลัด, เปลี่ยนปุ่มลัด; in a search title, ปุ่มลัดบนแป้นพิมพ์. A single keyboard key is ปุ่ม (เปลี่ยนปุ่ม). |
| panel (the editor's side) | แผง | แสดงแผง, ซ่อนแผง. |
| full screen | เต็มหน้าจอ | Exit full screen: ออกจากโหมดเต็มหน้าจอ. |
| First page (of a list) | ไปหน้า 1 | Not หน้าแรก, which is Home. |
| sign in / sign out | เข้าสู่ระบบ / ออกจากระบบ | |
| account / settings | บัญชี / การตั้งค่า | |
| a date's label: Joined, Connected, Updated {date} | เข้าร่วมเมื่อ, เชื่อมต่อเมื่อ, อัปเดตเมื่อ {date} | |
| app / connect / disconnect / Allow (the consent page's press) | แอป / เชื่อมต่อ / ยกเลิกการเชื่อมต่อ / อนุญาต | "แอป AI", "แอปที่เชื่อมต่อ". The MCP page says เลือก “อนุญาต”, so the consent page's press is อนุญาต. A custom connector is ตัวเชื่อมต่อแบบกำหนดเอง, an MCP server เซิร์ฟเวอร์ MCP. |
| agent | เอเจนต์ | Grabient's automated curators: เอเจนต์ของ Grabient. The seeding agents are เอเจนต์ผู้เติมพาเลตต์. |
| reader, people (visitors) | ผู้เข้าชม | Who opens and uses the site. People who make collections are ผู้ใช้: โดยผู้ใช้และเอเจนต์ของ Grabient. |
| note (for the agents) | โน้ต | Not บันทึก, which is save. |
| gallery | แกลเลอรี | |
| tag | แท็ก | |
| avatar | รูปโปรไฟล์ | |
| display name | ชื่อที่แสดง | What the code calls the username; to show it on palettes is ให้…ปรากฏ, which keeps clear of แสดง. |
| sign-in link, code | ลิงก์เข้าสู่ระบบ, รหัส | What the sign-in email sends: ส่งลิงก์, ส่งรหัส, รหัส 6 หลัก. Code to copy is โค้ด (คัดลอกโค้ด). |
| theme, dark, light | ธีม, ธีมมืด, ธีมสว่าง | |
| reduce motion | ลดการเคลื่อนไหว | The Settings section, named as iOS names the setting in Thai. Its button steps through ตามระบบ (System), เปิด (On) and ปิด (Off). Motion is การเคลื่อนไหว; animations are ภาพเคลื่อนไหว. |
| embedded view | มุมมองแบบฝัง | |
| offline, sync | ออฟไลน์, ซิงค์ | What opens offline once seen online: จะเปิดแบบออฟไลน์ได้ เมื่อคุณเคยดูขณะออนไลน์แล้ว |
| fit (a palette in a collection) | ความเข้ากัน | Good fit เข้ากันดี, Bad fit ไม่เข้ากัน. |
| undo / redo | เลิกทำ / ทำซ้ำ | |
| invert / reverse / random | กลับสี / กลับลำดับ / สุ่ม | |
| Straighten lightness | ปรับความสว่างเป็นเส้นตรง | Its status: ปรับความสว่างเป็นเส้นตรงแล้ว. |
| remove / delete / clear | นำออก / ลบ / ล้าง | Remove takes a palette, tag or note out of a list and keeps it; delete destroys it. A keyframe that is removed is gone from the palette, so it is ลบ (ลบคีย์เฟรม). |
| pastel | พาสเทล | |
| curation faults | ขุ่น, เป็นขั้น, หม่น, แสบตา, มืดเกินไป, สว่างเกินไป, เพี้ยนกลางทาง, ดูซ้ำกัน, ไม่ตรงชื่อ, ผิดรูปแบบ | Muddy, Banding, Dull, Harsh, Too dark, Too light, Ugly turn, Looks alike, Off title, Wrong form. |
| Matching, and "for {query}" in a search title | ที่ตรงกับ | Not สำหรับ, a literal "for": คอลเลกชันของคุณที่ตรงกับ {query}. Matching collections: คอลเลกชันที่ตรงกัน. |
| not found, No results. | ไม่พบ… | ไม่พบพาเลตต์, ไม่พบคอลเลกชัน, ไม่พบหน้านี้, ไม่พบผลลัพธ์. Not ไม่มี…ที่นี่. |
| Couldn't…, can't…, Invalid… (errors) | …ไม่สำเร็จ, …ไม่ได้, …ไม่ถูกต้อง | The action, then the outcome: คัดลอกไม่สำเร็จ, คัดลอกภาพที่นี่ไม่ได้, คำขอไม่ถูกต้อง. Try again is ลองอีกครั้ง, Try again later ลองอีกครั้งภายหลัง, with no โปรด. |
| busy (a service) | มีผู้ใช้งานหนาแน่น | Not ไม่ว่าง, which is for people and phone lines. |
| ignore (an email) | ไม่ต้องสนใจ | Not ละเว้น, which reads machine-made in an email. |
| confirmation email | อีเมลยืนยัน | Not การยืนยัน, which is the act. |
| admin | ผู้ดูแล | The account role, kept apart from เอเจนต์ (agent). |
| admin tools | เครื่องมือผู้ดูแล | The switch in the Admin section of Settings, whose heading is ผู้ดูแล. |
| address (a collection's web address) | ที่อยู่ | Kept beside the shown path (ที่อยู่นั้นถูกใช้แล้ว). Not ลิงก์ or URL within the same flow. |
| public gallery | แกลเลอรีสาธารณะ | |
| issue, lead palette (the newsletter's, admins only) | ฉบับ, พาเลตต์หลักของฉบับ | ตั้งเป็นพาเลตต์หลัก; the arrows go through the options: ตัวเลือกก่อนหน้า, ตัวเลือกถัดไป. |

## Color names

A generated palette name ("Pale yellow to pink") uses the bare color words, which read naturally after พาเลตต์สี,
ไล่เฉดสี and โทน: เหลืองอ่อนถึงชมพู.

| English | Thai |
| --- | --- |
| red, maroon, salmon | แดง, แดงเลือดหมู, แซลมอน |
| orange, burnt orange, peach | ส้ม, ส้มอิฐ, พีช |
| yellow, pale yellow, mustard | เหลือง, เหลืองอ่อน, เหลืองมัสตาร์ด |
| green, dark green, light green, lime green, olive | เขียว, เขียวเข้ม, เขียวอ่อน, เขียวมะนาว, เขียวมะกอก |
| teal, dark teal, cyan | เขียวหัวเป็ด, เขียวหัวเป็ดเข้ม, ฟ้าอมเขียว |
| blue, dark blue, light blue, gray blue, navy | น้ำเงิน, น้ำเงินเข้ม, ฟ้าอ่อน, ฟ้าอมเทา, กรมท่า |
| purple, dark purple, lavender, mauve, magenta | ม่วง, ม่วงเข้ม, ลาเวนเดอร์, ม่วงหม่น, บานเย็น |
| pink, light pink | ชมพู, ชมพูอ่อน |
| brown, tan, beige | น้ำตาล, น้ำตาลอ่อน, เบจ |
| black, white, off-white, gray, dark gray | ดำ, ขาว, ขาวนวล, เทา, เทาเข้ม |
| {start} to {end} | {start}ถึง{end} |
