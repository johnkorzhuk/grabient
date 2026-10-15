# The promo kit's environment, for every script here (they source it):
#   PROMO            this folder
#   REPO             the site's checkout the harness and the captures draw from: the one this folder stands in
#   PROMO_WORK       where each promo's captures, frames, builds and finished files go, a folder per promo. Big (the
#                    collections promo holds about 30 GB) and never in git. Default ~/.cache/grabient-promo
#   CHROME_PATH      Chrome with WebGL, for the captures and the water (setup.sh installs Chrome 152 in .tools)
#   HEADLESS_SHELL   Chrome's headless shell, for Remotion's renders
#   GIFSKI           gifski, for the GIFs
#   FONTCONFIG_FILE  the captures' fonts (kit/fonts/fonts.conf)
#   REMOTION         Remotion's command line (render, still, studio), run in a promo's remotion/
#   COMPOSITOR       Remotion's own binaries: its ffmpeg codes the MP4s
# Whatever this machine needs besides (a Node on PATH, Chrome's libraries, browsers kept elsewhere) goes in env.local.sh
# beside this file, which git ignores and this file reads first.
PROMO=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=/dev/null
[ -f "$PROMO/env.local.sh" ] && source "$PROMO/env.local.sh"
export PROMO
# the kit's own Python, where setup.sh made one
[ -d "$PROMO/.tools/venv/bin" ] && export PATH=$PROMO/.tools/venv/bin:$PATH
export REPO=${REPO:-$(cd "$PROMO/.." && pwd)}
export PROMO_WORK=${PROMO_WORK:-$HOME/.cache/grabient-promo}
export CHROME_PATH=${CHROME_PATH:-$PROMO/.tools/chrome/linux-152.0.7977.54/chrome-linux64/chrome}
export HEADLESS_SHELL=${HEADLESS_SHELL:-$PROMO/.tools/chrome-headless-shell/linux-152.0.7977.54/chrome-headless-shell-linux64/chrome-headless-shell}
export GIFSKI=${GIFSKI:-$PROMO/.tools/bin/gifski}
export FONTCONFIG_FILE=$PROMO/kit/fonts/fonts.conf
export COMPOSITOR=$PROMO/node_modules/@remotion/compositor-linux-x64-gnu
export REMOTION=$PROMO/node_modules/.bin/remotion
