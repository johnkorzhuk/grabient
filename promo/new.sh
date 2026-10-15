#!/bin/bash
# Starts a promo from the collections promo, the kit's worked example:
#   ./new.sh <name>
# Copies its capture, plan, composition and render scripts into <name>/ (no data or frames: those go in
# $PROMO_WORK/<name>), points the render scripts at that work folder, and says what to change first.
set -euo pipefail
cd "$(dirname "$0")"
NAME=${1:?"Name the promo: ./new.sh <name>"}
[[ $NAME =~ ^[a-z0-9][a-z0-9-]*$ ]] || { echo "Name it in lowercase letters, digits and hyphens" >&2; exit 1; }
[ -e "$NAME" ] && { echo "$NAME/ already exists" >&2; exit 1; }
cp -r collections "$NAME"
rm -rf "$NAME/remotion/src/data" "$NAME/remotion/public/frames" "$NAME/grid" "$NAME/data/determinism.txt"
sed -i "s|\$PROMO_WORK/collections|\$PROMO_WORK/$NAME|g; s|The collections promo|The $NAME promo|g" "$NAME/render.sh" "$NAME/render-hd.sh"
sed -i "s|\"collections-promo\"|\"$NAME-promo\"|; s|The collections promo's composition|The $NAME promo's composition|" "$NAME/remotion/package.json"
cat > "$NAME/README.md" <<README
# $NAME

Started from the collections promo (../collections/README.md tells how that one is built). Its frames, builds and
finished files go in \$PROMO_WORK/$NAME (env.sh).

What to change first:

1. \`capture/capture.mjs\`: what the pointer does, on which page, and the marks it records; \`capture/collections.mjs\` is
   the mocked account's data, and \`capture/simplify.css\` what the page leaves out.
2. \`timeline.mjs\`: the plan of every frame (the camera, which capture frame shows, what the harness paints, the words).
3. \`remotion/src/copy.ts\` for the words, and \`remotion/src/Promo.tsx\` where the scene itself differs.
4. \`data/page.json\`: the palettes the harness paints on the wordmark's bar.

Then \`./render.sh --frames\`, with the site served (../kit/serve-site.sh). Before a long render, show stills of the hard
moments (\`"\$REMOTION" still\` in remotion/, after sourcing ../env.sh) and agree on them.
README
echo "Made $NAME/. Its README says what to change first."
