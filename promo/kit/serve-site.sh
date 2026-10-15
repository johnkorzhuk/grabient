#!/bin/bash
# Serves a checkout of the site for the captures, built as a deploy is and served on http://127.0.0.1:25340, where
# every capture script looks for it. The captures drive the real site, so the checkout's local data is what they show:
# given a database file (a copy of a deploy's D1, as SQLite), the checkout's local D1 becomes that file first, and
# given a SQL file too, that file is run on it (a promo's own changes to its data, as collections/grid/replace.sql).
#   ./serve-site.sh <checkout> [<database.sqlite> [<changes.sql>]]
# Use a worktree of its own, never the main checkout, so its data and build stay apart, in the work folder:
#   git worktree add "$PROMO_WORK/site" staging && (cd "$PROMO_WORK/site" && pnpm install)
set -euo pipefail
source "$(dirname "$0")/../env.sh"
SITE=$(cd "$1" && pwd)
if [ -n "${2:-}" ]; then
  # the local D1's files, by the object ids the site's DB binding gets in local development
  D=$SITE/apps/web/.cloudflare/state/v3/d1/miniflare-D1DatabaseObject
  mkdir -p "$D"
  for id in faaf2b0445ab934c3aac48ddf0cdfade8f9bac050be98993748742cdd2cb05fb 2e39e3e05b75b2bab78302b8552e1947da68be866463f8570ceccc0d4a8a435c; do
    rm -f "$D/$id.sqlite-wal" "$D/$id.sqlite-shm"
    cp "$2" "$D/$id.sqlite"
    if [ -n "${3:-}" ]; then
      python3 -c 'import sqlite3, sys; db = sqlite3.connect(sys.argv[1]); db.executescript(open(sys.argv[2]).read()); db.commit()' "$D/$id.sqlite" "$3"
    fi
  done
  echo "the local D1 holds $2${3:+, changed by $3}"
fi
cd "$SITE/apps/web"
pnpm build
exec node node_modules/vite/bin/vite.js preview --mode staging --port 25340 --strictPort --host 127.0.0.1
