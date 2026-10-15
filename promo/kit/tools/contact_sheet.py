# The contact sheet: key frames of the rendered tweet in a grid, each with its time and what happens there.
#   python3 tools/contact_sheet.py <frames dir> <frames.json> <out.png>
# The frames dir holds the rendered PNG sequence (element-000.png ...); frames.json is the capture's, whose marks say
# when each step happens (the video starts at the capture's "open" mark).
import json
import sys

from PIL import Image, ImageDraw, ImageFont

src, meta_path, out = sys.argv[1], sys.argv[2], sys.argv[3]
meta = json.load(open(meta_path))
m = meta["marks"]
o = m["open"]
length = meta["count"] - o
fps = meta["fps"]
picks = [
    (0, "Opening frame: the palette list"),
    (m["toPlus"] - o + 4, "Pointer on a card: its tools appear"),
    (m["clickPlus"] - o - 4, "The plus: Add to selection"),
    (m["clickPlus"] - o + 12, "Selected: the check, Add to collection under it"),
    (m["clickPress"] - o - 3, "Add to collection"),
    (m["look"] - o + 12, "The account's collections, colors on hover"),
    (m["clickOcean"] - o - 2, "Press on Ocean moods"),
    (m["clickOcean"] - o + 8, "Added to Ocean moods"),
    (m["clickBrand"] - o + 8, "And to Brand explorations"),
    (m["clickCheck"] - o + 8, "The check pressed: list closed, selection left"),
    (m["rest"] - o - 4, "Pulling back to the list"),
    (length - 1, "Last frame, fading into the first"),
]
W = 640
font_path = str(__import__("pathlib").Path(__file__).resolve().parent / "fonts" / "Poppins-Medium.ttf")  # the kit's own copy (kit/tools/fonts)
font = ImageFont.truetype(font_path, 17)
small = ImageFont.truetype(font_path, 14)
tiles = []
for n, label in picks:
    im = Image.open(f"{src}/element-{n:03d}.png").convert("RGB")
    im = im.resize((W, int(im.height * W / im.width)), Image.LANCZOS)
    tile = Image.new("RGB", (W, im.height + 54), (24, 24, 28))
    tile.paste(im, (0, 0))
    d = ImageDraw.Draw(tile)
    d.text((12, im.height + 8), label, font=font, fill=(240, 240, 240))
    d.text((12, im.height + 31), f"{n / fps:5.2f} s  ·  frame {n}", font=small, fill=(150, 150, 160))
    tiles.append(tile)
cols = 4
rows = (len(tiles) + cols - 1) // cols
gap = 12
th = tiles[0].height
sheet = Image.new("RGB", (cols * W + (cols + 1) * gap, rows * th + (rows + 1) * gap + 50), (12, 12, 14))
d = ImageDraw.Draw(sheet)
d.text((gap, 14), f"Grabient collections promo · {meta['theme']} theme · {length / fps:.2f} s loop at {fps} fps · key frames of the 1280x720 video", font=font, fill=(230, 230, 230))
for i, t in enumerate(tiles):
    sheet.paste(t, (gap + (i % cols) * (W + gap), 50 + gap + (i // cols) * (th + gap)))
sheet.save(out)
print(out, sheet.size)
