#!/usr/bin/env python3
"""Stamp each media/manifest.json video entry with a short content hash ("v").

The page appends ?v=<hash> to video and poster URLs, so a re-encoded clip is
never served from a stale browser cache next to a fresh manifest (which would
desync hero captions from the video). Run after changing any file in media/.
"""
import hashlib, json, pathlib, sys

root = pathlib.Path(__file__).resolve().parent.parent
path = root / "media" / "manifest.json"
data = json.loads(path.read_text())
changed = 0
for v in data["videos"]:
    h = hashlib.sha256()
    for key in ("file", "poster"):
        rel = v.get(key)
        if not rel:
            continue
        p = root / (rel if rel.startswith("media/") else f"media/{rel}")
        if p.exists():
            h.update(p.read_bytes())
    stamp = h.hexdigest()[:10]
    if v.get("v") != stamp:
        v["v"] = stamp
        changed += 1
if changed:
    path.write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n")
print(f"stamped {changed} entr{'y' if changed == 1 else 'ies'}")
sys.exit(0)
