# Tiếng Việt (vi)

How Grabient says its own words in Vietnamese. Read the English list in `README.md` first. Use the word below every
time; add a row when a new product word gets its translation.

## Register

- Neutral, concise Vietnamese. The reader is **bạn** when a sentence needs one ("Bộ sưu tập của bạn"); most labels need
  none.
- Sentence case: only the first word and names are capitalized ("Bảng màu đã lưu", not "Bảng Màu Đã Lưu").
- Buttons, tabs and chips are a verb or a noun, as short as Vietnamese allows: Sao chép, Tải xuống, Lưu, Xuất, Hủy,
  Đóng, Thử lại.
- No exclamation marks, no em dashes, no marketing. Punctuation as in English (no space before `:`), `…` for an
  action in progress ("Đang lưu…").
- Spelling: the older tone-mark placement used by Microsoft and most software: xóa, hòa, bão hòa, tùy chỉnh, hủy, thủy.
- Plurals: Vietnamese has one form (`other`). A plain count is `{count, plural, other {# bảng màu}}`. A plural with
  tags inside keeps the English `one` and `other` cases, the same words in both, because the check counts every tag.
- Page titles and descriptions use what Vietnamese searchers type: "tạo gradient", "gradient CSS", "bảng màu",
  "công cụ tạo gradient CSS".
- A palette's generated name is "{start} sang {end}" ("Vàng nhạt sang hồng"). It arrives capitalized, so a title puts it
  first and the style after it in parentheses: "Vàng nhạt sang hồng (gradient tuyến tính)".
- Search examples stay in English where the search only knows English words: the free search hint ("như navy, cozy
  hoặc sunset"). Translated, they would match nothing.

## The words

| English | Tiếng Việt | Note |
| --- | --- | --- |
| Grabient | Grabient | Never translated. |
| palette | bảng màu | |
| gradient | gradient | The loanword Vietnamese designers and searchers use ("tạo gradient", "gradient CSS", "màu gradient"). Not "dải màu", so one word serves the UI and search. |
| swatches, bands (the style) | sọc màu, sọc | Hard bands of the colors. "khối" is taken by the color solid, and "ô màu" reads as square tiles. "{count} hard bands" = "{count} sọc". |
| Swatches (the strip's swatch files) | Mẫu màu | The files design apps import (Tokens, ASE, GPL, GRD), named as a design app's Swatches panel is, not the hard-band style. "Switch to swatches": Chuyển sang mẫu màu. |
| style | kiểu | "Sai kiểu, số bước hoặc góc". |
| Linear / Angular / Radial | Tuyến tính / Hình nón / Xuyên tâm | Angular is CSS's conic gradient, "gradient hình nón" in Vietnamese CSS writing. "Góc" would clash with Angle. Bands: "Sọc tuyến tính", "Sọc hình nón", "Sọc xuyên tâm". |
| As saved | Như đã lưu | |
| Appearance (style, steps and angle) | cách hiển thị | Not "giao diện", which is Theme. The same words as Set view ("Đặt cách hiển thị"): "Đặt lại cách hiển thị" (Reset appearance). |
| steps | số bước (the control), bước | |
| colors (a count) | màu | "7 màu". |
| stop | điểm dừng | The CSS term "điểm dừng màu". "{count} stops" = "{count} điểm dừng". |
| angle | góc | |
| keyframe | keyframe | Loanword from motion and design tools. Plural "các keyframe". Not "khung hình chính", which means a video frame. |
| hold / let go (keyframes) | giữ / thả | "các keyframe đang giữ", "Giữ tất cả keyframe", "Thả các keyframe". |
| lock / unlock (the editor's Lightness, Chroma and Hue locks) | khóa / mở khóa | "Khóa độ tươi", "Mở khóa độ tươi". Kept apart from holding keyframes (giữ). |
| lightness | độ sáng | |
| chroma | độ tươi | Judgment: Vietnamese has no settled color-science word. Not "độ bão hòa" (saturation) and not "sắc độ" (hue in Microsoft's Vietnamese, value in art schools). "Độ tươi" is how Vietnamese OKLCH explanations gloss chroma: gray to vivid. The About page pairs it with C wherever the math needs precision. |
| hue | tông màu | Designers' word for hue. "sắc độ" avoided for the reason above. "Tông" also names color families ("Tông xám", "Tông đất"), which is fine since those are names. "Tông màu" itself must never mean "tone" or "color scheme" in the UI, or the H slider's meaning blurs. |
| travel (hue) | quãng xoay | How far the hue turns from the first keyframe to the last, laps included. |
| saturation, brightness (the color picker's square) | độ bão hòa, độ sáng | HSB's S and B, in the words of Vietnamese color pickers: "Độ bão hòa và độ sáng". Saturation is never chroma (độ tươi). Brightness shares its word with lightness; beside "độ bão hòa" it reads as HSB. |
| collection | bộ sưu tập | |
| not found (a page, palette or collection) | Không tìm thấy … | One pattern for every missing thing: "Không tìm thấy bộ sưu tập". |
| Couldn't … / can't … | Không … được / Không thể … | A failure: "Không tải được bảng màu.", "Không lưu được." What isn't possible: "Không thể xuất bảng màu này." |
| Try again, Try again later | Thử lại, Thử lại sau | No "Vui lòng": "Quá nhiều yêu cầu. Thử lại sau." |
| busy (sign-in, search) | quá tải | "Tìm kiếm đang quá tải." |
| offline / online | ngoại tuyến / trực tuyến | "Bạn đang ngoại tuyến."; "chỉ mở được khi ngoại tuyến nếu bạn đã từng xem nó lúc trực tuyến". |
| No results. | Không có kết quả. | Also a heading. |
| selection | mục đã chọn; the button is "Đã chọn" | "Thêm vào mục đã chọn", "Đã chọn 5". |
| select | chọn | "Đã chọn {count}". |
| Popular / Rising / Saved | Phổ biến / Đang lên / Đã lưu | Same words for the orders, the tags' lead and the "Saved" confirmation. |
| 1w / 3m / 1y (Rising's frames) | 1 tuần / 3 tháng / 1 năm | Whole words, lowercase. Said in full for a screen reader: Đang lên, 1 tuần. The admin switches: "Đang lên trong 3 tháng", "Đang lên trong 1 năm". |
| Hot | thịnh hành | YouTube's word for trending: "Bảng màu và bộ sưu tập thịnh hành". |
| like / liked / Unlike | thích / đã thích / Bỏ thích | Facebook's words. |
| export / copy / download / save | xuất / sao chép / tải xuống / lưu | Kept distinct everywhere. "Copied" = "Đã sao chép". |
| saved collection / Update / Reset | bộ sưu tập đã lưu; "Đã lưu" / Cập nhật / Đặt lại | Save on someone else's collection keeps the reader's own copy, once. Update takes in what changed in the collection it was saved from and keeps the reader's changes; Reset makes it that collection again. |
| Save or export (the export column's toggle), Save to | Lưu hoặc xuất, Lưu vào | Save to heads the list of the reader's collections. |
| delete / remove | xóa / gỡ | Delete is gone for good; remove takes a palette out of a list ("Gỡ khỏi bộ sưu tập"). A keyframe is "xóa". |
| remove from the selection, Clear (it) | bỏ khỏi mục đã chọn, Bỏ chọn hết | "Bỏ", the verb of "bỏ chọn" (deselect): "Bỏ bảng màu {number}". "Gỡ" stays for a collection. |
| preview size / Auto | kích thước xem trước / Tự động | |
| This screen, Ultrawide (size presets) | Màn hình này, Siêu rộng | A shape is said in Vietnamese, as "Vuông" (Square) is; "Story" keeps the platform's word. |
| inner / cover (a foldable's two screens) | màn trong / màn ngoài | "{device} màn trong", "{device} màn ngoài". "Màn" is the short "màn hình" of tech writing (màn gập, màn phụ). Bare "trong" or "ngoài" after a device name does not say screen. |
| tag | thẻ | |
| shortcuts | phím tắt | The page's title in search results, Keyboard shortcuts, is "Phím tắt bàn phím". "Đổi phím" (Change key), "Hiện phím tắt" (Show shortcuts). |
| sign in / sign out / account / settings | đăng nhập / đăng xuất / tài khoản / cài đặt | |
| app / connect / disconnect / Allow (the consent page's press) | ứng dụng / kết nối / ngắt kết nối / Cho phép | "ứng dụng AI", "Ứng dụng đã kết nối". The MCP page says Chọn “Cho phép”, so the consent page's press is Cho phép. A custom connector is trình kết nối tùy chỉnh, an MCP server máy chủ MCP. |
| sign-in link, sign-in code; Send link, Send code | liên kết đăng nhập, mã đăng nhập; Gửi liên kết, Gửi mã | The presses say only what they send. |
| taken (a username or an address) | đã được sử dụng | Same wording for a username and an address: "Tên người dùng này đã được sử dụng", "Địa chỉ đó đã được sử dụng". |
| agent | tác nhân; AI agents: tác nhân AI | The word Vietnamese tech press uses. "seeding agents" = "các tác nhân tạo bảng màu". The people beside them are "người dùng": "do người dùng và các tác nhân Grabient tạo". |
| reader, people (in admin lines) | khách truy cập | "khi khách truy cập nhấn Đang lên lần nữa". |
| gallery | thư viện | The public list of palettes: "thư viện công khai", "Chỉ thư viện" (Gallery only). |
| browse | duyệt | Already used consistently across the catalog. |
| More X (load more on a feed) | Xem thêm X | Never "Thêm X": on a button "thêm" is the add verb ("Thêm keyframe"). "More palettes" = "Xem thêm bảng màu", "More collections" = "Xem thêm bộ sưu tập". |
| like {name} (a search by a palette), Similar palettes | tương tự {name}, Bảng màu tương tự | "Bộ sưu tập tương tự {name}". |
| Matching collections | Bộ sưu tập trùng khớp | Not "phù hợp", which is the fit vote. "matched by color and mood" = "khớp theo màu sắc và cảm xúc". |
| color, mood or theme (what to search for) | màu, cảm xúc, chủ đề | Theme here is a subject, never "giao diện". |
| seed | seed, mã seed | Kept as developers say it; "mã seed" in a sentence, "Seed" on the tab. |
| color space / color solid | không gian màu / khối màu | "the sRGB solid" = "khối sRGB". |
| gamut, in gamut, gamut-mapped | gam màu, trong gam màu, được ánh xạ gam màu | A color that fits the screen "nằm trong gam"; avoid "vừa". |
| Text contrast, text color | Độ tương phản chữ, màu chữ | The pane and the colors tried on the palette: "Thêm màu chữ", "Đổi {hex}", "Gỡ {hex}". Its readouts say "chữ": "đủ cho chữ", "chỉ cho chữ lớn", "quá thấp cho chữ". |
| color picker, Pick color | bộ chọn màu, Hút màu | "Hút màu" is the eyedropper's action in Vietnamese design tools. |
| editor / panel | trình chỉnh sửa / bảng điều khiển | |
| Show / Hide, Show fewer | Hiện / Ẩn, Thu gọn | "Hiện bảng điều khiển", "Ẩn không gian màu". Show fewer folds the whole list back: "Thu gọn", the word that pairs with "Xem thêm". |
| full screen, Exit full screen | toàn màn hình, Thoát toàn màn hình | |
| click (a pointer) / press | nhấp / nhấn | "Nhấp để ẩn"; "Nhấn lần nữa để xóa". |
| theme | giao diện | "Giao diện sáng", "Giao diện tối". |
| Reduce motion, and its System / On / Off | Giảm chuyển động; Hệ thống / Bật / Tắt | The name Vietnamese iPhones and Macs give the same setting. Animations are "hiệu ứng động", motion is "chuyển động": "Nền và hiệu ứng động đứng yên." |
| random / reverse / invert | ngẫu nhiên / đảo chiều / đảo màu | The shortcut list names them as the buttons do. |
| straighten lightness | làm thẳng độ sáng | Its statuses: "Đã làm thẳng độ sáng.", "Không có gì để làm thẳng." |
| fit (a collection vote) | độ phù hợp: phù hợp / không phù hợp | |
| private / public | riêng tư / công khai | Make private, Make public: "Đặt riêng tư", "Đặt công khai"; the press after: "Đã đặt riêng tư", "Đã đặt công khai". |
| note (for the agents) | ghi chú | |
| admin | quản trị viên | |
| Admin (the Settings section), Admin tools | Quản trị, Công cụ quản trị | The person stays "quản trị viên" ("Chỉ quản trị viên mới thấy phần này"). The tools: tuyển chọn (curation), bình chọn (votes; one vote is "phiếu bầu"), ghi chú cho các tác nhân (agent notes), đặt công khai (publishing, as the Make public press). Publishing palettes and collections as Grabient, on the consent page, is "đăng": "Đăng và lên lịch …". |
| banding (the fault) | vỡ màu | Admin curation chip; the gradient-banding fault. Not "phân dải", which isn't a real term. Keep apart from "sọc", the swatches style. |
| undo / redo | hoàn tác / làm lại | |
| shader | shader | "mã shader". |
| Privacy policy / Terms of service | Chính sách quyền riêng tư / Điều khoản dịch vụ | |
| Contact, message (to Grabient) | Liên hệ, lời nhắn | The form itself is "biểu mẫu liên hệ". "Lời nhắn" is the form's own field label. "Tin nhắn" reads as a chat or SMS message. |
| Privacy, Analytics, Session replay (the Settings section and its switches) | Quyền riêng tư, Phân tích, Ghi lại phiên truy cập | The labels, capitalized, when the text names the switch ("bật hoặc tắt Phân tích và Ghi lại phiên truy cập"). In running text: "tính năng phân tích", "tính năng ghi lại phiên truy cập". A recording is "bản ghi". |
| issue, test issue (of the newsletter) | số, số thử | "Gửi các số của bản tin", "Chỉ gửi số thử đến {email}". |
| lead palette (of an issue, admins) | bảng màu chính | The palette an issue opens with: "Đặt làm bảng màu chính", "Bảng màu chính tiếp theo", "Bảng màu chính trước đó". A counter "3 of 13" is "3/13". |
| Grabient, OKLCH, OKLab, sRGB, Display P3, CSS, SVG, PNG, JSON, GLSL, WGSL, Shadertoy, Figma, MCP, URL, Markdown, hex | unchanged | |

## Color names

đen, trắng, xám, xám đậm; đỏ, cam, vàng, xanh lá, xanh cổ vịt (teal), xanh dương, tím, hồng;
"dark X" = "X đậm", "light X" = "X nhạt" ("vàng nhạt", "xanh dương đậm").
