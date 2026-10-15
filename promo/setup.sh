#!/bin/bash
# Readies the promo kit, once per machine, and again after a change of its packages: the packages (on their own, not as
# part of the app's workspace), Python's, Chrome 152 and its headless shell, gifski and the emoji font. Each step that is
# already done is skipped. Needs Node 22.6 or later, pnpm, Python 3 with pip, and cargo for gifski.
#   ./setup.sh
set -euo pipefail
source "$(dirname "$0")/env.sh"
cd "$PROMO"
node -e 'const [a, b] = process.versions.node.split(".").map(Number); if (a < 22 || (a === 22 && b < 6)) { console.error(`Node 22.6 or later: this is ${process.version}`); process.exit(1); }'
pnpm install
# numpy and Pillow: the system's where it has them, else a virtual environment of the kit's own, which env.sh puts first
if ! python3 -c "import numpy, PIL" 2> /dev/null; then
  python3 -m venv "$PROMO/.tools/venv"
  "$PROMO/.tools/venv/bin/pip" install --quiet -r requirements.txt
fi
[ -x "$CHROME_PATH" ] || npx --yes @puppeteer/browsers install chrome@152.0.7977.54 --path "$PROMO/.tools"
[ -x "$HEADLESS_SHELL" ] || npx --yes @puppeteer/browsers install chrome-headless-shell@152.0.7977.54 --path "$PROMO/.tools"
[ -x "$GIFSKI" ] || cargo install gifski --version 1.34.0 --locked --root "$PROMO/.tools"
[ -f kit/fonts/NotoColorEmoji.ttf ] || curl -fsSL -o kit/fonts/NotoColorEmoji.ttf \
  https://raw.githubusercontent.com/googlefonts/noto-emoji/v2026-09-24-unicode18_0/2D/fonts/NotoColorEmoji.ttf
"$CHROME_PATH" --version
"$GIFSKI" --version
echo "The promo kit is ready: README.md says what to run."
