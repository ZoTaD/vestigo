"""
Diagnóstico: imprime el typetree del primer componente de cada clase pedida.

  .venv/Scripts/python -m pipeline.peek LocationList ZoneSystem Pickable TreeBase

Sirve para la próxima vez que un parche cambie un campo: se mira acá antes de
tocar `extract.py`.
"""
import json, sys
from .unity import Game

SKIP = ("Effect", "effect", "Audio", "m_nview", "m_animator")


def short(v):
    if isinstance(v, dict):
        return {k: short(x) for k, x in v.items() if not any(s in k for s in SKIP)}
    if isinstance(v, list):
        return [short(x) for x in v[:2]] + ([f"...{len(v)}"] if len(v) > 2 else [])
    return v


if __name__ == "__main__":
    classes = set(sys.argv[1:])
    g = Game()
    g.index(classes)
    for c in classes:
        comps = g.components(c)
        print(f"===== {c}: {len(comps)}")
        if comps:
            print(json.dumps(short(comps[0].tree), ensure_ascii=False)[:3000])
