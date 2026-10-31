# Русский (ru)

How Russian says Grabient's own words. Read `README.md` first for what each word means. Use the chosen word every time.

## Register

- The reader is addressed as «вы», lowercase, in the plural imperative: «Настройте», «Выберите», «Войдите».
- Buttons and menu commands are infinitives: «Копировать», «Скачать», «Сохранить», «Удалить», «Убрать», «Закрыть»,
  «Сбросить», «Отменить», «Войти», «Выйти». A few labels are not verbs because the English is not one: «Ещё палитры»,
  «Наверх», «Первая страница», «Наугад» (the dice button), «Экспорт» (a panel heading).
- Status lines are nouns with an ellipsis: «Поиск…», «Сохранение…», «Загрузка продолжения…», «Обновление…».
- Errors say what failed: «Не удалось сохранить палитру.», «Не удалось отключить приложение. Попробуйте ещё раз.»
- Quotes are « ». A value that is a name (a palette's generated name, a collection's title, a search's words) goes in
  « » or after a colon, so its case never has to agree with the words around it: «Палитра «{name}»»,
  «Палитры, похожие на «{name}»», «{subject}: градиенты и цветовые палитры», «Цвет: {label}».
- No em dashes, as in English. Russian puts a dash between two nouns in «X — это Y»; rephrase instead
  («Каждая точка задаёт цвет в OKLCH»), or use a colon.
- Plurals always have one, few, many and other. `other` is the fractional form (1,5 палитры), usually the genitive singular.
  `one` also covers 21 and 31, so a case without `#` that means exactly one is written `=1` beside it.
- Decimal numbers in prose take a comma (0,86); numbers inside code and figure readouts stay as the code writes them.
- Page titles and descriptions use the words Russian searchers type: «генератор CSS градиентов», «цветовая палитра»,
  «CSS градиент» (written without a hyphen, as it is searched), «палитры градиентов».

## The words

| English | Русский | Note |
| --- | --- | --- |
| Grabient | Grabient | Never transliterated. |
| palette | палитра | |
| gradient | градиент | «CSS градиент», «линейный градиент». |
| effect | эффект, эффекты | Полоса «Эффекты» на листе редактора: рифлёное стекло и капля. |
| swatches (a style) | полосы, секторы, кольца | Named by what each draws: hard bands, wedges, rings. The style picker's tiles are narrow on a phone, and «Радиальные полосы» did not fit where "Radial bands" does, so Linear bands, Angular bands and Radial bands are «Полосы», «Секторы», «Кольца». In page titles the swatch styles are «цветовые полосы», «цветовые секторы», «цветовые кольца»; a card drawn as swatches is «Цветовые полосы «{name}»». «Образцы» (Adobe's Swatches panel) reads as color samples, not bands. |
| Swatches (the strip's swatch files) | Образцы | The files design apps import (Tokens, ASE, GPL, GRD), named as a design app's Swatches panel is, not the hard-band style. "Switch to swatches": Переключить на образцы. |
| style | стиль | Gradient styles: «Линейный», «Угловой» (Photoshop's name for the angle gradient), «Радиальный». |
| appearance (style, steps and angle) | оформление | macOS's and Illustrator's word: «Оформление», «Сбросить оформление». Not «вид», which is the admin's view («Задать вид»). |
| steps (the control, and a count of them) | шаги | Illustrator's word for blend steps: «7 шагов», «Меньше или больше шагов». |
| colors / stops (a count of colors) | цвета | «7 цветов», «# цветов sRGB». |
| color stop (CSS's and Figma's, on the About page) | контрольная точка цвета | Photoshop's name for a gradient's stop; kept apart from «ключевая точка». |
| dot (a keyframe on the About page's figures) | маркер | Not «точка», which would read as the keyframe itself. |
| angle | угол | |
| keyframe | ключевая точка | Not «ключевой кадр»: there is no time axis, and the curve runs through points. Keeps "key". |
| hold / held / let go (keyframes) | выделить / выделенные / снять выделение | Canvas selection words. Kept apart from «выбранное» (the selection of palettes). |
| random | наугад (button), случайная (adjective) | Not «случайно», which reads first as "by accident." |
| lock / unlock (the Lightness, Chroma and Hue locks) | зафиксировать / снять фиксацию | A lock keeps a value through «Наугад»: «Зафиксировать светлоту»; while closed, its tip is «Снять фиксацию светлоты». Not «заблокировать», which reads as a field that can't be edited, and not «закрепить», the 3D view's keep. |
| lightness | светлота | The colorimetric term (CIE L*), not «яркость», which is the color picker's HSB brightness. |
| chroma | хрома | The color-science term for chroma, as in CIE LCh and CIECAM. «Насыщенность» is saturation, the color picker's HSB S, never chroma; «хрома» is also the letter C that OKLCH-literate developers already read. |
| hue | тон | Short for «цветовой тон». «Путь тона» for hue travel. |
| travel (hue travel) | путь | Slider label «Путь»; in prose «путь тона». |
| collection | коллекция | |
| selection | выбранное | The palettes gathered with a card's plus: «Добавить в выбранное», «Убрать из выбранного», button «Выбранное 5», «Выбрано: 5». Not «подборка», which Russian sites use for exactly what a collection is. |
| Popular / Rising / Saved | Популярные / Восходящие / Сохранённые | Plural adjectives: they agree with «палитры» and «коллекции». Sort control's name: «Сортировка». |
| 1w / 3m / 1y (Rising's frames) | 1 нед. / 3 мес. / 1 год | The usual abbreviations with their periods; год is short enough whole. Said in full for a screen reader: Восходящие, 1 неделя. |
| Hot | горячие | «Горячие палитры и коллекции», the word Russian feeds (Pikabu) use. |
| like | лайк (noun), «Нравится» (the heart) | Heart tooltip «Нравится»; once liked, the tooltip is «Убрать лайк» (Unlike). |
| like {name} (a search by a palette) | похожие на «{name}» | «Палитры, похожие на «{name}»», «Похожие палитры». |
| export | экспорт, экспортировать | Panel heading «Экспорт». |
| copy | копировать | Copied is «Готово», not «Скопировано»: the same message replaces a hex code inside a stop chip, which is sized for seven characters. |
| download | скачать | |
| save | сохранить | Kept distinct from the three above. |
| saved collection / Update / Reset | сохранённая коллекция; «Сохранена» / Обновить / Сбросить | Save on someone else's collection keeps the reader's own copy, once. Update takes in what changed in the collection it was saved from and keeps the reader's changes; Reset makes it that collection again. |
| preview size | размер превью | |
| Auto | Авто | |
| inner / cover (a foldable's screen, a size preset) | внутренний / внешний | «{device}, внутренний», «{device}, внешний»: the adjective agrees with an unsaid «экран», and these are the words Russian reviews use for a foldable's two screens. The other presets are «Этот экран» and «Ультраширокий»; devices and formats keep their own names. |
| full screen | во весь экран | «Во весь экран», «Выйти из полноэкранного режима», as video players say it. |
| shortcuts | горячие клавиши | The title in search; the page, its nav link and the ? list are the shorter «Клавиши»: «Изменить клавиши», «Показать клавиши», «Изменить клавишу». |
| sign in / sign out | войти / выйти | «Войти через Google», «Вход по email». |
| account / settings | аккаунт / настройки | |
| app / connect / disconnect / Allow (the consent page's press) | приложение / подключить / отключить / Разрешить | «ИИ-приложение», «Подключённые приложения». The MCP page tells the reader to choose «Разрешить», so the consent page's press says the same. "Connect again from your app" is «Подключитесь заново из приложения». A custom connector is «пользовательский коннектор», an MCP server «MCP-сервер». |
| admin | администратор | The Settings section only an admin sees is «Администрирование»; its switch is «Инструменты администратора», and what the switch shows is «кураторство», «голоса», «заметки для агентов» and «публикация». |
| When off (an admin switch's line) | Если выключено | «Если выключено, поиск использует последний.» |
| agent | агент | «созданные людьми и агентами Grabient». Seeding agents are «агенты наполнения». |
| seed | сид | The developers' word for a seed. |
| gamut / gamut-mapped / in gamut | охват / приведено к охвату / в пределах охвата | |
| color space | цветовое пространство | |
| color solid | цветовое тело | The colorimetric term. |
| graph | график | |
| reverse (button) | развернуть | The developers' word for reversing a sequence («развернуть массив/строку»); a designer might read it as "expand," but the flip icon and hover preview make it clear. The key list says it the same way. |
| invert (button) | инвертировать | Photoshop's Invert; what it makes is a «негатив». |
| Straighten lightness | выпрямить светлоту | Its statuses: «Светлота выпрямлена.», «Нечего выпрямлять.» |
| undo / redo (the editor's) | отменить / повторить | The pair Word and Photoshop use. |
| theme | тема | «Светлая тема», «Тёмная тема». |
| reduce motion (the setting) | уменьшить движение | macOS's name for the same setting (iOS: «Уменьшение движения»). Its button steps through «Как в системе», «Вкл.», «Выкл.». Following the device, the line under it reads «Как на устройстве: включено.», as Theme's reads «Как на устройстве: тёмная.». |
| Private / Public (collection) | приватная / публичная | |
| save to (the label over the collections) | сохранить в | Its choices are «Новая коллекция» and «Ваши коллекции». After a preposition a collection's title follows the word «коллекция» in « », so it keeps its own case: «Добавлено в коллекцию «{title}»». |
| tag | тег | |
| No results. | Ничего не найдено. | What Russian search pages say. |
| busy (sign-in, search) | перегружен | «Поиск сейчас перегружен. Попробуйте позже.» |
| offline | нет сети | «Нет сети», «Вы не в сети.» What opens offline once seen online: «будет открываться без сети, когда вы посмотрите её в сети». |
| Email (the Site features switch) | Почта | The site's sign-in and contact email, apart from the address field, which stays «Email». |
| issue / lead palette (the newsletter's, admins only) | выпуск / главная палитра выпуска | «Сделать эту палитру главной»; the arrows go through the options: «Предыдущий вариант», «Следующий вариант». |
| text contrast / text color | контраст текста / цвет текста | «Контраст текста» names the pane; «Добавить цвет текста», as Google Docs names a text's color. |
| color picker | выбор цвета | Not Photoshop's «палитра цветов»: «палитра» is Grabient's palette. |
| Pick color (the eyedropper) | взять цвет | What Russian designers say of the eyedropper («взять цвет пипеткой»); the tool itself is «пипетка». |
| saturation / brightness (the picker's square) | насыщенность / яркость | HSB's S and B, as Photoshop's picker says them: «Насыщенность и яркость». |
| sign-in link / public gallery | ссылка для входа / публичная галерея | The contact page is «Контакты». Settings in running text is «в настройках». "cookie" stays in Latin letters, masculine and indeclinable («cookie, который», «эти cookie»). |

## Color names (generated palette names)

Each color is one message in the masculine nominative, the form a color takes as a name. Two ends join with «и»
(«Светло-жёлтый и розовый»): Russian says «от жёлтого к розовому» with cases a single message cannot change, and
an arrow would be read aloud as «стрелка вправо». A name stands in « » or after a colon inside a sentence.

black чёрный · white белый · gray серый · red красный · orange оранжевый · yellow жёлтый · green зелёный ·
teal бирюзовый · blue синий, light blue голубой, dark blue тёмно-синий, navy морской синий · purple фиолетовый · pink розовый.
Dark and light are «тёмно-» and «светло-».
