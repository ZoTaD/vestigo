"""
Diagnóstico: enlaces de `data/site` que apuntan a una ficha que no está listada.

  cd games/valheim && .venv/Scripts/python -m pipeline.check_links

Se corre después de `pipeline.site`; tiene que dar 0.
"""
import glob
import json
import os
from collections import Counter

from .site import OUT


def broken() -> list[tuple[str, str]]:
    tabs = {}
    for f in glob.glob(os.path.join(OUT, "*.json")):
        n = os.path.basename(f)[:-5]
        if n not in ("index", "meta"):
            tabs[n] = {r["slug"] for r in json.load(open(f, encoding="utf-8"))}
    bad = []

    def walk(o):
        if isinstance(o, dict):
            if o.get("slug") and o.get("tab") and o["slug"] not in tabs.get(o["tab"], set()):
                bad.append((o["tab"], o["slug"]))
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)

    for f in glob.glob(os.path.join(OUT, "*.json")):
        walk(json.load(open(f, encoding="utf-8")))
    return bad


if __name__ == "__main__":
    b = broken()
    print("enlaces rotos:", len(b), Counter(t for t, _ in b).most_common(5), sorted(set(b))[:10])
