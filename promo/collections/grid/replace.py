# Applies replace.sql to a worktree's local D1 files: python3 replace.py <worktree root>
import pathlib, sqlite3, sys
sql = (pathlib.Path(__file__).parent / "replace.sql").read_text()
d = pathlib.Path(sys.argv[1]) / "apps/web/.cloudflare/state/v3/d1/miniflare-D1DatabaseObject"
for f in sorted(d.glob("*.sqlite")):
    if f.name == "metadata.sqlite":
        continue
    db = sqlite3.connect(f)
    db.executescript(sql)
    db.commit()
    order = db.execute("SELECT seed, likes_count FROM k_palettes ORDER BY likes_count DESC, seed LIMIT 12").fetchall()
    db.close()
    print(f.name[:12], "slots 7 and 10 now", order[7], order[10])
