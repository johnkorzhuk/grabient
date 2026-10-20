# Deutsch (de)

How German says Grabient's words. Read `README.md` for what each word means here; use the word below every time.

## Register

- **du**, informal and consistent everywhere, as Figma and Canva speak to German users:
  „Melde dich an“, „Passe die Palette an“, „Bitte versuche es erneut.“ Never Sie.
- **Buttons, menu items and chips are infinitives**, noun first: Kopieren, Herunterladen, Speichern, Exportieren,
  Anmelden, „Palette löschen“, „Sammlung löschen“, „Bedienfeld einblenden“. Headings and tabs are nouns (Export,
  Darstellung, Sammlungen).
- **Tooltips** name the press as its button does, then its key: „Umkehren · E“, „Invertieren · I“.
- **Progress** is „Wird gespeichert…“, „Wird gesendet…“, „Suche läuft…“, „Weitere werden geladen…“, the ellipsis
  without a space.
- **Quotation marks** „…“ (U+201E, U+201C).
- **Numbers**: decimal comma in prose („0,86“), a space before % and units („12 %“, „5 MB“, „in 30 s“). Values that come
  from code (readouts, hex, `oklch()`) stay as the code writes them.
- **No em dashes**; a colon or a comma instead. Sentence case; nouns are capitalized as German requires, also inside
  the lowercase captions of the figures („hell · L 1“, „Farbton +120°“).
- **No comma before „oder“ or „und“** when they join parts of one clause; an English comma before them is not
  carried over („Suche mit Wörtern oder Hex-Farben oder füge einen Palettenlink ein“, not „…, oder …“).
- **Compounds stay readable**: a hyphen after a name or code („CSS-Farbverlauf“, „sRGB-Farbkörper“, „Paletten-Seed“,
  „Grabient-Agenten“), and the shortest natural word in narrow labels („Stufen“, „Ecken“).
- **Search terms in titles and descriptions**: Farbverlauf-Generator (hyphenated, not the regular compound
  „Farbverlaufsgenerator“, because that is what people search), CSS-Farbverlauf, Farbpalette, Farbverläufe und
  Farbpaletten. „Gradient palettes“ becomes „Farbverläufe und Farbpaletten“ in a title, since that is what people search.
- The free search speaks English words, so its examples stay English („etwa „navy“, „cozy“ oder „sunset““).

## The words

| English | Deutsch | Note |
| --- | --- | --- |
| Grabient | Grabient | Genitive „Grabients“; compounds „Grabient-Paletten“. |
| palette | Palette, Paletten | „Farbpalette“ in titles, descriptions and alt text, where people search for it. |
| gradient | Farbverlauf, Farbverläufe | Never the bare Adobe short form „Verlauf“ in the UI. „CSS-Farbverlauf“. |
| swatches | Farbfelder | Adobe's own word. „{name} swatches“ is „Farbfelder {name}“; „linear swatches“ is „lineare Farbfelder“. |
| Swatches (the strip's swatch files) | Farbfelder | The files design apps import (Tokens, ASE, GPL, GRD), named as a design app's Swatches panel is, not the hard-band style. "Switch to swatches": Auf Farbfelder umschalten. |
| bands (the style names „Linear bands“ …) | gestuft; a band is a Stufe | „Linear gestuft“, „Konisch gestuft“, „Radial gestuft“; „gestufte Stile“; „# harte Stufen“ in the code notes. Short enough for the style tiles on a phone. |
| style | Stil | |
| appearance (style, steps and angle) | Darstellung | The press's tooltip and its menu's heading; „Darstellung: {label}“, „Darstellung zurücksetzen“. |
| Linear / Angular / Radial | Linear / Konisch / Radial | Angular is konisch, as CSS `conic-gradient` is on MDN („konischer Verlauf“) and in Affinity, not Photoshop's „Winkelverlauf“: „Winkel“ already names the angle here. |
| As saved | Wie gespeichert | |
| steps (the Steps control) | Stufen | As Illustrator DE calls steps. |
| colors („7 colors“) | Farben | |
| stop | Stopp, Stopps | MDN's „Farbstopp“, short in labels and counts; the About page's „color stops“ are „Farbstopps“. |
| angle | Winkel | |
| keyframe | Keyframe, Keyframes (der) | As in After Effects and Figma. „bearbeitbarer OKLCH-Keyframe“. |
| hold / held / let go (keyframes) | festhalten / festgehalten / loslassen | Not „auswählen“: that word belongs to the selection. „Alle Keyframes festhalten“, „Keyframes loslassen“. The color space: „Farbraum ausblenden“, „Klicken zum Festhalten“, „Klicken zum Ausblenden“. |
| lock / unlock (Random's locks on Lightness, Chroma and Hue) | sperren / entsperren | „Helligkeit sperren“, „Farbton entsperren“: the lock at a field's end, whose value Würfeln keeps. Not „festhalten“, which holds keyframes. |
| Reverse / Invert / Straighten lightness | Umkehren / Invertieren / Helligkeit begradigen | The editor's presses and tooltips. Statuses: „Helligkeit begradigt.“, „Nichts zu begradigen.“ |
| lightness | Helligkeit | L of OKLCH. |
| chroma | Chroma (das) | The international color-science term; German writing about OKLCH uses it too. DIN's own colorimetry word is „Buntheit“ (hue: „Buntton“), but this audience knows OKLCH's term, not DIN's. Never „Sättigung“. |
| hue | Farbton, Farbtöne | H of OKLCH. The color wheel is „Farbkreis“. |
| travel (hue) | Farbtonweg | Everywhere, the field's label included; the same length as „Helligkeit“ in the same rows. Not „Drehung“: „drehen“ is the angle's word („Um 15° drehen“). The bare „Weg“ stands only in running text where „Farbton“ is already the subject, e.g. „einem Weg von 360°“. |
| color space / color solid | Farbraum / Farbkörper | „sRGB-Farbkörper“. |
| gamut / gamut mapping | Gamut / Gamut-Mapping | „im Gamut“. Not Adobe's „Farbumfang“; this audience knows „Gamut“ from CSS Color 4. |
| spline | Spline (der) | „Catmull-Rom-Spline“. |
| seed | Seed (der) | „Paletten-Seed“. |
| graph | Graph, Graphen | The editor's curves, 2D or 3D. |
| Text contrast (the pane) | Textkontrast | Its own text colors are „Textfarben“ („Textfarbe hinzufügen“). A cell's tooltip: „{text} auf {ground}: {ratio}, ausreichend für Text“, „… nur für großen Text“, „… zu gering für Text“. |
| color picker / Pick color | Farbwähler / Farbe aufnehmen | Photoshop's words; „Farbe aufnehmen“ is the eyedropper. |
| saturation / brightness (the picker's square) | Sättigung / Helligkeit | HSB's words, as Photoshop's picker says them, though „Helligkeit“ is also lightness: the square is only ever read out. |
| panel (the editor's) | Bedienfeld | Adobe's German word for a panel. „Bedienfeld einblenden“, „Bedienfeld ausblenden“. |
| full screen | Vollbild | „Vollbild beenden“. |
| collection | Sammlung, Sammlungen | |
| selection | Auswahl | „Zur Auswahl hinzufügen“, „Aus der Auswahl entfernen“; „Leeren“ empties it. The export tab „Selection“ is „Auswahl“. |
| Popular / Rising / Saved | Beliebt / Im Kommen / Gespeichert | The segmented control; „Saved“ after a save is „Gespeichert“ too. |
| 1w / 3m / 1y (Rising's frames) | 1 Wo. / 3 Mon. / 1 Jahr | The usual abbreviations with their periods; Jahr is short enough whole. Said in full for a screen reader: Im Kommen, 1 Woche. The admin switches „Rising over 1 year“ and „… 3 months“ are „Im Kommen, 1 Jahr“ and „Im Kommen, 3 Monate“: „über 1 Jahr“ reads as more than a year. |
| Hot | angesagt | „Angesagte Paletten und Sammlungen“. |
| like / Unlike | Gefällt mir / Like entfernen; the noun is „Like“ | The heart's two tooltips. „Most liked“ is „mit den meisten Likes“; „Liked by someone“ is „Von jemandem gelikt“. |
| export | Exportieren (button), Export (the panel's heading) | |
| copy | Kopieren; „Kopiert“ when done | The clipboard. A copy of a collection is a „Kopie“. |
| shareable (URL) | zum Teilen | Never „teilbar“, which first reads as divisible: „URLs zum Teilen“. |
| download | Herunterladen | |
| save | Speichern | |
| Copying. Switch to download (the format row's toggle) | Kopieren / Herunterladen / Links kopieren, then Auf Kopieren / Herunterladen / Links umschalten | What the row is doing, then the mode it turns to: "Kopieren. Auf Herunterladen umschalten". |
| saved collection / Update / Reset | gespeicherte Sammlung; „Gespeichert“ / Aktualisieren / Zurücksetzen | Save on someone else's collection keeps the reader's own copy, once. Update takes in what changed in the collection it was saved from and keeps the reader's changes; Reset makes it that collection again. |
| preview size | Vorschaugröße | „Auto“ stays „Auto“. The presets („Vorgaben“, Adobe's own word) are Quadrat, Story, Benutzerdefiniert. |
| screen sizes (size presets) | Dieser Bildschirm; 1080p, 1440p, 4K, Ultrawide | The reader's own screen is „Dieser Bildschirm“. The resolution names stay as German tech writing has them („Ultrawide-Monitor“), not „ultrabreit“. A foldable's two screens are „{device} innen“ and „{device} außen“ (the cover screen), short for Innen- and Außendisplay. |
| curation reasons (admin) | Trüb, Banding, Flau, Schrill, Zu dunkel, Zu hell, Unschöne Wendung, Zu ähnlich, Thema verfehlt, Falsche Form | Muddy, Banding, Dull, Harsh, Too dark, Too light, Ugly turn, Looks alike, Off title, Wrong form. |
| tag | Tag, Tags (das) | The search vocabulary's own words stay English. |
| shortcuts | Tastenkürzel | The page, its title and the nav; „Tastenkürzel ändern“, „Tastenkürzel anzeigen“. A key is „Taste“ („Taste ändern“); a key already used is „belegt“ („{key} ist mit „{action}“ belegt.“). A shortcut „gilt“ somewhere, never „funktioniert“. |
| key names (`key` context) | Strg, Umschalt, Alt, Esc, Tab, Leertaste, Rücktaste, Entf, Eingabe | For Ctrl, Shift, Alt, Esc, Tab, Space, Backspace, Delete, Enter, as German keyboards and Microsoft's German documentation name them. Windows was showing the English words; „Esc“ stays. |
| theme (light / dark) | Design: „Helles Design“, „Dunkles Design“ | As Google and YouTube say it. |
| reduce motion | Bewegung reduzieren | Settings' section, in the words iOS and macOS use for the same setting, so the heading keeps the infinitive. Its button steps through System, An, Aus; „System“ stays „System“. |
| sign in / sign out | Anmelden / Abmelden | |
| sign-in link / code | Anmeldelink / Anmeldecode | „Link senden“, „Code senden“. Both „laufen in 5 Minuten ab“. |
| account / settings | Konto / Einstellungen | |
| app / connect / disconnect / Allow (the consent page's press) | App (die) / verbinden / trennen / Erlauben | „KI-App“, „Verbundene Apps“. The MCP page tells the reader to choose „Erlauben“, so the consent page's press says the same. A custom connector is „benutzerdefinierter Konnektor“, an MCP server „MCP-Server“. „Connect again from your app.“ is „Verbinde dich erneut über deine App.“; „Return to“ and „Returns to“ are „Zurück zu“. |
| admin / admin tools | Admin, Admins / Admin-Tools | The short word German developers use, the Settings section's heading included: „Admin-Konten“, „Nur Admins können …“. |
| lead (a newsletter issue's lead palette, admins only) | Hauptpalette | The palette an issue opens with: „Als Hauptpalette verwenden“, „Nächste Hauptpalette“, „{at} von {count}“. |
| avatar | Profilbild | |
| display name | Anzeigename | What the code calls the username. |
| agent | Agent, Agenten | „Grabient-Agenten“, „Agenten-Sammlungen“. |
| gallery | Galerie | |
| retry / try again | Erneut versuchen; in a sentence „Versuche es erneut.“ | „Try again later.“ is „Versuche es später erneut.“ The sign-in button's countdown says what it will do: „Erneut senden in 30 s“. |
| Couldn't … (errors) | „… konnte nicht … werden.“ | „Die Palette konnte nicht gespeichert werden.“ With nothing named: „Kopieren fehlgeschlagen.“, „Speichern fehlgeschlagen.“ |
| No results. | Keine Ergebnisse. | |
| offline / online | offline / online | „Du bist offline.“; a page opens offline once seen online: „ist offline verfügbar, sobald du sie einmal online aufgerufen hast“. |
| When off, … (admin switches' lines) | Wenn ausgeschaltet, … | |
| About / home | Über / Startseite | „Über Grabient“ is the page's title. |
| undo / redo | Rückgängig / Wiederholen | |
| random (editor button) | Würfeln | Infinitive, like the neighbouring actions (Umkehren, Invertieren); not the noun „Zufall“. The key-list label stays „Zufallspalette“. |
| Privacy (the Settings section) | Datenschutz | One word with the footer's link to the policy. |
| Privacy / Terms (links) | Datenschutz / Nutzungsbedingungen | The pages: „Datenschutzerklärung“, „Nutzungsbedingungen“. |
| Contact | Kontakt | The page and its links. „Contact is temporarily unavailable.“ means its form: „Das Kontaktformular ist vorübergehend nicht verfügbar.“ |
| color names | nouns, capitalized | Schwarz, Weiß, Grau, Rot, Orange, Gelb, Grün, Türkis (teal), Blau, Marineblau (navy), Violett (purple), Rosa (pink), with Hell-, Dunkel- and Blass- („Blassgelb bis Rosa“). |
| {start} to {end} | {start} bis {end} | A palette's name: „Blassgelb bis Rosa“. Inside a sentence the name stays as it is („Paletten wie Blassgelb bis Rosa“); with a style it takes a comma („Blassgelb bis Rosa, linearer Farbverlauf“). |
