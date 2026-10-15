#!/bin/bash
# Builds the harness (the site's water and wordmark, drawn a frame at a time: harness/) against this checkout's own
# modules, into harness/dist. The checkout's packages must be installed (pnpm install at its root).
#   ./build-harness.sh
set -euo pipefail
source "$(dirname "$0")/../env.sh"
H=$PROMO/kit/harness
ln -sfn "$REPO/apps/design/node_modules" "$H/node_modules"
(cd "$H" && REPO=$REPO node node_modules/vite/bin/vite.js build)
