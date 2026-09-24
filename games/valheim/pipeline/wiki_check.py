"""
Lo que el sitio dice de cada bioma contra lo que dice la wiki.

  cd games/valheim && .venv/Scripts/python -m pipeline.wiki_check

Lee `data/site/` (lo que publica `pipeline.site`) y la copia local de la wiki
(`wiki.py`), y escribe las diferencias que quedan. Cada una se revisa a mano:
la wiki también se equivoca (en la 1.0 se estaba editando), así que lo que se
decide va a `data/wiki-fixes.json` con su porqué, no se copia a ciegas.
"""
import json
import os
import sys

from . import wiki
from .biomes import BIOME_ORDER

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.normpath(os.path.join(HERE, "..", "data", "site"))


def load(name):
    with open(os.path.join(SITE, name), encoding="utf-8") as f:
        return json.load(f)


def main() -> int:
    out = []
    say = out.append

    foods = load("foods.json")
    say("## Comidas: bioma de progresión (sitio → wiki, tabla de Food)")
    fb = wiki.food_biomes()
    for r in foods:
        w = fb.get(wiki.norm(r["name"]["en"]))
        if w and w != r["tier"]:
            say(f"  {r['name']['en']}: {r['tier']} → {w}")
    missing = [r["name"]["en"] for r in foods if wiki.norm(r["name"]["en"]) not in fb]
    say(f"  (sin fila en la wiki: {len(missing)}: {', '.join(sorted(missing))})")

    say("\n## Criaturas: biomas (sitio → location de la wiki)")
    for c in load("creatures.json"):
        w = wiki.creature_biomes(c["name"]["en"])
        if w is None:
            say(f"  {c['name']['en']}: sin ficha en la wiki (sitio: {c['biomes']})")
        elif set(w) != set(c["biomes"]):
            say(f"  {c['name']['en']}: {c['biomes']} → {w}")

    say("\n## Armaduras: bioma (sitio → tabla Sets de Armor)")
    ab = wiki.armor_biomes()
    for r in load("armor.json"):
        w = ab.get(wiki.norm(r["name"]["en"]))
        if w and w != r["tier"]:
            say(f"  {r['name']['en']}: {r['tier']} → {w}")

    say("\n## Objetos: bioma de progresión (sitio → biomas del source de la wiki)")
    for tab in ("materials", "weapons", "armor", "tools", "meads", "foods"):
        for r in load(f"{tab}.json"):
            w = wiki.item_biomes(r["name"]["en"])
            if w and r["tier"] not in w:
                say(f"  [{tab}] {r['name']['en']}: {r['tier']} → {w}")

    say("\n## Biomas: lo que el sitio lista y la wiki pone en otro bioma")
    for b in load("biomes.json"):
        for group in ("resources", "creatureDrops", "plant", "foods"):
            for r in b.get(group) or []:
                w = wiki.item_biomes(r["name"]["en"])
                if group == "foods":
                    w = [wiki.food_biomes()[wiki.norm(r["name"]["en"])]] if wiki.norm(r["name"]["en"]) in wiki.food_biomes() else w
                if w and b["id"] not in w:
                    say(f"  {b['id']}/{group}: {r['name']['en']} (wiki: {w})")
        wb = wiki.biome_boxes().get(b["id"], {})
        listed = {wiki.norm(n) for k in ("passive", "hostile") for n in wb.get(k, [])}
        ours = {wiki.norm(c["name"]["en"]) for c in b["creatures"]}
        extra, lack = sorted(ours - listed), sorted(listed - ours)
        if extra or lack:
            say(f"  {b['id']}/criaturas: el sitio de más {extra} · falta {lack}")

    text = "\n".join(out)
    sys.stdout.buffer.write((text + "\n").encode("utf-8"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
