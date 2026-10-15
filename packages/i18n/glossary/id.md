# Bahasa Indonesia (id)

How Indonesian says Grabient's own words. Read `README.md` for what each word means here; use the word below every
time, and add a row when a new product word gets its translation.

## Register

- Standard Indonesian (bahasa baku) that does not read stiff: the words a designer or developer in Jakarta uses in
  Figma, Canva and CSS tutorials. Loanwords that are what people actually say stay loanwords (keyframe, seed, shader,
  padding, grid, browser, feed, story, seamless); an Indonesian word is used wherever one is in common use (unduh, salin, tautan).
- The reader is addressed as **Anda**, capitalized, and only where the English says "you" or "your" (Koleksi Anda).
  A label, a button or a tooltip leaves it out.
- Buttons, tabs and chips are a bare verb or noun: Salin, Unduh, Simpan, Ekspor, Hapus, Tutup, Acak, Balik. Tooltips
  are the press's name, as on its button, then its key; status lines are short sentences in the same plain voice. Errors say what went wrong and what to do
  ("Tautan tidak dapat dikirim. Coba lagi."); "Silakan" only where the English says "Please". "Try again in a moment"
  is coba lagi dalam beberapa saat, never coba lagi sebentar lagi (lagi twice reads clumsy); "Try again later" is
  coba lagi nanti.
- An imperative label does not open with a bare root that is also a noun ("Gambar" reads first as "image"); use
  Tampilkan (or Gambarkan) there. Digambar in a description is unaffected.
- Sentence case, as the English. The exceptions keep the English casing: the home title
  ("Grabient — Pembuat Gradien CSS & Palet Warna"), which keeps the title the site ranks under, and the legal
  documents' names inside prose (Kebijakan Privasi, Ketentuan Layanan).
- Indonesian has no plural forms: every plural is `{count, plural, other {# palet}}`, and a noun after a number stays
  singular (7 warna, 12 palet).
- Numbers in prose use the Indonesian decimal comma (0,86) and thousands point (5.000, 2.048). Numbers inside code,
  CSS, formulas and hex codes stay as they are.
- Page titles and descriptions use what Indonesian searchers type: pembuat gradien, gradien CSS, palet warna,
  palet gradien. "Browse" is Telusuri, "Explore" is Jelajahi.

## The words

| English | Indonesia | Note |
| --- | --- | --- |
| Grabient | Grabient | Never translated or transliterated. |
| palette | palet | "color palette" is palet warna (the search phrase, used in titles and descriptions); palet alone in the UI. |
| gradient | gradien | The word in design tools and CSS tutorials (gradien CSS, gradien linear). Judgment: never gradasi, the everyday word for any color transition. |
| swatches (style) | pita warna | Judgment: the style draws hard bands, and the English menu itself says "bands". Pita is the band of pita frekuensi; blok warna would suggest squares. Menu: Pita linear, Pita angular, Pita radial. In titles: pita warna linear. |
| Swatches (the strip's swatch files) | Swatch | The files design apps import (Tokens, ASE, GPL, GRD), named as a design app's Swatches panel is, not the hard-band style. "Switch to swatches": Beralih ke mode swatch. |
| style | gaya | Canva's word. Linear, Angular, Radial stay as Figma names them (gradien linear, gradien angular, gradien radial). |
| steps | langkah | The Steps control; a count is # langkah, and Fewer or more steps is Kurangi atau tambah langkah. |
| colors (a count) | warna | "7 colors" is 7 warna. |
| stop (color stop) | warna (a count), titik warna (the thing) | Judgment: a count of stops is the number of colors drawn, so it is # warna (# warna sRGB sebagai hex). On the About page and in the figures a stop is a stored color point: titik warna, shortened to titik where the sentence has already named it. |
| angle | sudut | Corners (the export's rounding) is therefore Pembulatan, never sudut. |
| keyframe | keyframe | Judgment: the loanword Indonesian motion and UI designers use (After Effects, Figma); bingkai kunci reads as a textbook calque. No plural marking. |
| hold / held / let go (keyframes) | pegang / dipegang / lepaskan | "the held keyframes" is keyframe yang dipegang. Kept apart from the palette selection (pilihan). |
| lock / unlock (the editor's Lightness, Chroma and Hue locks) | kunci / buka kunci | Kunci kroma, Buka kunci kroma, as Canva says it. Judgment: Kunci also reads as the noun (the chroma lock), and either reading names the toggle. Kept apart from pegang. |
| lightness | kecerahan | The L of OKLCH. Straighten lightness is Luruskan kecerahan, and its status Kecerahan diluruskan. |
| chroma | kroma | The color-science term (Munsell, CIE LCh: rona, nilai, kroma). Never saturasi. |
| hue | rona | The Indonesian color-theory term (rona warna). |
| travel (hue travel) | pergeseran | How far the hue turns, in degrees; pergeseran rona in prose ("hue shift" is how Indonesian artists say it). |
| collection | koleksi | |
| selection | pilihan | The set a reader gathers with the plus. Button: Pilihan 3. Tambahkan ke pilihan, Hapus dari pilihan, Keluarkan dari pilihan, Tutup pilihan, "3 dipilih". With the grid icon and count it reads as "your picks". Options (a menu) is Opsi, so pilihan never means a menu. |
| Popular / Rising / Saved (orders) | Populer / Naik daun / Tersimpan | Saved as a button's state after saving is also Tersimpan. "Saved palettes" is Palet tersimpan. |
| 1w / 3m / 1y (Rising's frames) | 1 mgg / 3 bln / 1 thn | The usual abbreviations of minggu, bulan and tahun, without periods. Said in full for a screen reader: Naik daun, 1 minggu. |
| Hot | sedang tren | "Hot palettes and collections" is Palet dan koleksi yang sedang tren. Kept apart from Populer. |
| like / liked | suka / disukai | The heart: Suka, and Batalkan suka (Unlike) once liked; Liked by someone is Disukai seseorang; the noun is tanda suka. "Most liked" is paling banyak disukai. |
| export / copy / download / save | ekspor / salin / unduh / simpan | Always these four. Copied is Tersalin. |
| edit | edit | The press Edit and the verb: mengedit, dapat diedit, Edit warna, langkah, sudut, dan gaya. Never sunting. |
| saved collection / Update / Reset | koleksi tersimpan; "Tersimpan" / Perbarui / Atur ulang | Save on someone else's collection keeps the reader's own copy, once: "Your copy" is Salinan Anda. Update takes in what changed in the collection it was saved from and keeps the reader's changes; Reset makes it that collection again. |
| remove / delete | hapus dari / hapus; keluarkan | Delete destroys (Hapus palet, Hapus akun). Remove from a set says the set (Hapus dari koleksi, Hapus dari pilihan). In the export preview, "Remove" takes a palette out of the selection: its tooltip is Hapus, and Remove palette {number} is Keluarkan palet {number}. Clear beside the selection count is Kosongkan; Clear search is Hapus pencarian. |
| preview size | ukuran pratinjau | Auto is Otomatis. |
| shortcuts | pintasan keyboard / Pintasan | Google's Indonesian term. A key is tombol ("Press a key": Tekan tombol). Change key is Ubah tombol, Change shortcuts Ubah pintasan, Show shortcuts Tampilkan pintasan. |
| sign in / sign out | masuk / keluar | "Sign in to …" is Masuk untuk … |
| account / settings | akun / pengaturan | "Your account" is Akun Anda. |
| app / connect / disconnect / Allow (the consent page's press) | aplikasi / hubungkan, terhubung / putuskan sambungan / Izinkan | "aplikasi AI", "Aplikasi terhubung". Never the bare Putuskan, which also reads as "decide". The MCP page says Pilih “Izinkan”, so the consent page's press is Izinkan. A custom connector is konektor kustom, an MCP server server MCP. |
| agent | agen | Grabient's automated curators: agen Grabient; `{name} (agen)`. Seeding agents are agen pengisi; "by people and Grabient agents" is buatan orang-orang dan agen Grabient. |
| gallery | galeri | |
| home (page) | beranda | "Grabient, beranda"; a list refreshing says Memperbarui… |
| Copied / Saved (states) | Tersalin / Tersimpan | The ter- form names a state reached; a status line in progress is me- (Menyimpan…, Mengirim…). |
| Copying. Switch to download (the format strip) | Menyalin / Mengunduh / Menyalin tautan, then Beralih ke mode salin / mode unduh / mode tautan | What the strip is doing, then the mode it turns to. Judgment: Indonesian wants a noun after ke, and mode is the word its apps use for one. |
| seed | seed | The palette's code; kept as the developer's loanword (as in random seed). |
| shader | shader | |
| color space / color solid / gamut | ruang warna / bangun ruang warna / gamut | Bangun ruang is the geometry word for a solid. "Gamut-mapped" is dipetakan ke gamut; "in gamut" dalam gamut. |
| text contrast | kontras teks | The pane is Kontras teks; a cell reads {text} di atas {ground}: {ratio}, cukup untuk teks (hanya untuk teks besar, terlalu rendah untuk teks). |
| text color | warna teks | Add text color is Tambah warna teks; a reader's own one is Ubah {hex} and Hapus {hex}. |
| color picker | pemilih warna | The floating picker and the swatch that opens it. |
| Pick color (the eyedropper) | Ambil warna | Judgment: the action as Indonesian tutorials say it (mengambil warna dari gambar); pilih would mean choose. |
| saturation / brightness (the picker's square) | saturasi / kecerahan | HSB's S and B, the words Indonesian photo and color tools use: Saturasi 40%, kecerahan 80%. Saturasi is never chroma's word. Judgment: kecerahan is also lightness; the square and its percent tell the two apart. |
| view / Appearance (a palette's style, steps and angle) | tampilan | "Set view" is Atur tampilan; the Appearance press and its menu are Tampilan, and Reset appearance is Atur ulang tampilan. |
| tag | tag | |
| sign-in link / code | tautan masuk / kode masuk | Send link is Kirim tautan, Send code Kirim kode, and while it waits Kirim ulang dalam # dtk (Resend there is the verb, not the company). Sign-in as a service (busy, unavailable) is layanan masuk; Google sign-in is Masuk dengan Google. |
| theme | tema | Tema terang / Tema gelap. |
| avatar / username / profile | avatar / nama pengguna / profil | |
| email | email | The word Indonesian products use; surel is not. |
| browser | browser | Judgment: the everyday word (Google and Microsoft Indonesian use it); peramban reads as a dictionary word. |
| reset / undo / redo | atur ulang / urungkan / ulangi | |
| invert / reverse | Inversi / Balik | Invert makes the negative; Reverse runs the palette the other way. Kept apart: the invert is never "balik". |
| show / hide | tampilkan / sembunyikan | Tampilkan panel, Sembunyikan ruang warna, Tampilkan lebih sedikit. |
| full screen | layar penuh | Exit full screen is Keluar dari layar penuh. |
| random | acak | Random palette is Palet acak. |
| fit (a palette in a collection) | kecocokan | Good fit Cocok, Bad fit Tidak cocok. |
| like {name} (a search by a palette) | yang mirip {name} | Palet yang mirip {name}, Koleksi Anda yang mirip {name}. Similar palettes is Palet serupa. |
| curation faults (admin) | Keruh, Bergaris, Kusam, Mencolok, Terlalu gelap, Terlalu terang, Belokan jelek, Mirip, Melenceng, Bentuk salah | Judgment: "Banding" is Bergaris, because banding in Indonesian means an appeal. |
| admin / Admin tools | admin / Alat admin | The word Indonesian products use; administrator reads stiff. The Settings section is Admin and its switch is Alat admin. The switch's line names kurasi, suara, catatan untuk agen, dan publikasi. A vote is suara (Suara Anda tidak dapat disimpan). A feature switch's line says Saat nonaktif for "When off". |
| reader / everyone (admin lines) | pengunjung / semua orang | The people who use the site are pengunjung (saat pengunjung menekan Naik daun lagi); "for everyone" is bagi semua orang. |
| reduce motion | kurangi gerakan | The name Indonesian iOS and macOS give the setting. Its button steps through Sistem, Aktif, Nonaktif, and under Sistem its line is Mengikuti perangkat Anda: aktif. Motion is gerakan, an animation is animasi, and the background is latar belakang: latar alone means a setting or a surface. |
| save to (a collection) | simpan ke | The label over Koleksi baru and the reader's collections; Save collection is Simpan koleksi, and the confirmation is Ditambahkan ke {title}. |
| a foldable's inner / cover screen (sizes) | layar dalam / layar luar | `{device} layar dalam`, `{device} layar luar`. After a name, dalam or luar alone reads as a preposition (in, outside). The device comes first so its rows stay together. Ultrawide stays Ultrawide, the word Indonesian monitor listings use. "This screen" is Layar ini. |
| Analytics / Session replay (consent switches) | Analitik / Rekaman sesi | The switches under Privasi, capitalized where a sentence names the switch; otherwise lowercase (analitik, rekaman sesi). What PostHog keeps is rekaman (Merekam kunjungan Anda). |
| error | kesalahan | "Something went wrong" is Terjadi kesalahan. |
| Couldn't … / Invalid … (errors) | … tidak dapat di… / … tidak valid | The thing first, passive: Palet tidak dapat disalin, Koleksi tidak dapat dimuat; with no object, Tidak dapat menyalin. A length rule is Panjang judul 1 sampai {max} karakter; "Use up to" is Gunakan hingga, "Use at least" Gunakan minimal. |
| No results. | Tidak ada hasil. | An empty search. "No palettes." is Tidak ada palet. |
| offline / online | offline / online | The loanwords Indonesian apps use: Offline, Anda sedang offline; baru dapat dibuka saat offline setelah Anda melihatnya saat online. |
| newsletter issue / lead palette (admins) | edisi / palet utama | The palette an issue opens with, as berita utama is a paper's lead: Jadikan palet utama, Palet utama berikutnya. |

## Color names and generated names

Color names (`colorname.ts`) are whole phrases, lowercase: merah, oranye, kuning, hijau, hijau toska (teal), biru,
ungu, merah muda (pink), hitam, putih, abu-abu. Dark and light follow the hue, always as **gelap** and
**terang**: biru gelap, biru terang, merah muda terang, abu-abu gelap. Judgment: the everyday muda/tua (biru muda,
biru tua) would clash with merah muda, which every Indonesian reads as pink. Two ends are `{start} ke {end}`
(biru terang ke merah muda); the code capitalizes the first letter.

The generated name is capitalized by the code, so in a title or description it opens the sentence and the rest follows
it as an apposition: `{name}, {style}` (Biru terang ke merah muda, gradien linear), `{name}, palet dengan 7 warna`.
Where it follows a noun only a screen reader hears it (Palet {name}, Gradien {name}).

## Search examples

The palette search knows Indonesian words (its lexicon has nyaman, biru navy, senja), so its examples are Indonesian:
"seperti biru navy, nyaman, atau senja".

Names of formats and standards stay as they are: OKLCH, OKLab, sRGB, Display P3, CSS, SVG, PNG, JPG, WebP, JSON,
GLSL, WGSL, Shadertoy, Figma, MCP, URL, Markdown, JavaScript, and the companies and products (Google, Cloudflare,
PostHog, Resend, iPhone).
