# The sheets: every option's end card, dark beside light (options.png), the key frames of one loop (loop-sheet.png), and
# the harness beside the site (harness-check.png).
#   python3 tools/sheets.py options <stills dir: end-<n>-<theme>.png> <out.png>
#   python3 tools/sheets.py loop <frames dir: element-NNN.png> <data/timeline.json> <out.png>
#   python3 tools/sheets.py check <dir: check-<theme>-site.png, check-<theme>-harness.png from harness/check.mjs> <out.png>
import json
import sys

from PIL import Image, ImageDraw, ImageFont

FONT = str(__import__("pathlib").Path(__file__).resolve().parent / "fonts" / "Poppins-Medium.ttf")  # the kit's own copy (kit/tools/fonts)
OPTIONS = [
    ("New on Grabient", "Collect the palettes you love"),
    ("Collections", "Keep the palettes that belong together"),
    ("New on Grabient", "Save any palette to a collection"),
    ("Collections are here", "Group palettes by project, mood or brand"),
    ("Now on Grabient", "Every palette you love, in one place"),
    ("Collections", "Palettes that go together, kept together"),
]
GROUND = (12, 12, 14)
GAP = 14


def tile(im, w, label, sub):
    im = im.convert("RGB")
    im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
    t = Image.new("RGB", (w, im.height + 52), (24, 24, 28))
    t.paste(im, (0, 0))
    d = ImageDraw.Draw(t)
    d.text((12, im.height + 7), label, font=ImageFont.truetype(FONT, 16), fill=(238, 238, 236))
    d.text((12, im.height + 29), sub, font=ImageFont.truetype(FONT, 13), fill=(150, 150, 158))
    return t


def grid(tiles, cols, title, out):
    th, tw = tiles[0].height, tiles[0].width
    rows = (len(tiles) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * tw + (cols + 1) * GAP, rows * th + (rows + 1) * GAP + 48), GROUND)
    ImageDraw.Draw(sheet).text((GAP, 13), title, font=ImageFont.truetype(FONT, 18), fill=(232, 232, 230))
    for i, t in enumerate(tiles):
        sheet.paste(t, (GAP + (i % cols) * (tw + GAP), 48 + GAP + (i // cols) * (th + GAP)))
    sheet.save(out)
    print(out, sheet.size)


if sys.argv[1] == "check":
    pass
elif sys.argv[1] == "options":
    src, out = sys.argv[2], sys.argv[3]
    tiles = []
    for n, (eyebrow, headline) in enumerate(OPTIONS, 1):
        for theme in ("dark", "light"):
            tiles.append(tile(Image.open(f"{src}/end-{n}-{theme}.png"), 640, f"Option {n} · {theme}", f"{eyebrow} / {headline}"))
    grid(tiles, 2, "Grabient collections promo, v2 · the end card (the loop's first frame) of each copy option, dark and light", out)
else:
    src, tl_path, out = sys.argv[2], sys.argv[3], sys.argv[4]
    tl = json.load(open(tl_path))
    p, m, fps, L = tl["parts"], tl["marks"], tl["fps"], tl["length"]
    picks = [
        (0, "The end card: the loop's first frame"),
        (p["listIn"][1] - 4, "The list comes in below the wordmark"),
        (p["pull"][0] + 30, "The whole page pulls back; the bar turns to the first palette"),
        (p["approach"] - 4, "The page, the wordmark at the top left"),
        (m["clickHeart"] + 10, "A like: the heart fills"),
        (m["clickPress"] - 3, "Add to collection"),
        (m["clickBrand"] + 8, "Added to Ocean moods and Brand explorations"),
        (p["rest"], "The interactions done, still in close"),
        (p["morph"][0] + 14, "At once: the rest fades, the picture shrinks where it is"),
        (p["morph"][0] + 30, "The picture narrows into the bar"),
        (p["lettersIn"][1], "The letters over the bar"),
        (L - 1, "The end card again, dissolving into the first"),
    ]
    tiles = [tile(Image.open(f"{src}/element-{n:03d}.png"), 640, label, f"{n / fps:5.2f} s  ·  frame {n}") for n, label in picks]
    grid(tiles, 4, f"Grabient collections promo, v3 · one {L / fps:.2f} s loop at {fps} fps · key frames of the 1280x720 video, dark, option 1", out)


def check_sheet(src, out):
    """harness-check.png: the site's header over its water beside the harness's, dark and light."""
    rows = []
    for theme in ("dark", "light"):
        pair = []
        sides = (
            ("site", "The site: a brand page's header (/privacy), its bar open on the water", "4 s of frames on a stepped clock, after a few it drew as the page loaded"),
            ("harness", "The harness: Logo.tsx over startFlow, the same colors and place", "4 s of frames on the driver's clock"),
        )
        for side, label, age in sides:
            pair.append(tile(Image.open(f"{src}/check-{theme}-{side}.png"), 760, label, f"{theme} theme · wordmark 48 px tall · {age}"))
        rows += pair
    grid(rows, 2, "Grabient collections promo, v2 · the harness against the site", out)


if len(sys.argv) > 1 and sys.argv[1] == "check":
    check_sheet(sys.argv[2], sys.argv[3])
