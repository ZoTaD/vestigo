"""Arma los datos que lee el sitio (games/terraria/data) a partir de la caché que dejan `dump.ps1` y `sprites.py`.

Uso: python games/terraria/tools/site_data.py

No lee el juego: se puede volver a correr sin tenerlo instalado. `build()` es pura (entra la caché, sale un
diccionario archivo → contenido) y es lo que prueban los tests.
"""
from __future__ import annotations

import json
import re
import unicodedata
from collections import defaultdict
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "cache"
DATA = ROOT / "data"

VERSION = "1.4.5.8"
# En cuántos archivos se reparten las fichas: `TR_SHARDS` en `site/src/terraria/data.ts`, si cambia uno cambia el otro.
CHUNKS = 64

# Estaciones que no coloca ningún objeto: se nombran a mano.
TILE_NAMES = {
    26: ("Demon Altar", "Altar demoníaco"),
}

# Condiciones de receta, como bits. El sitio las lee con las mismas constantes (`terraria/data.ts`).
FLAGS = {"needWater": 1, "needHoney": 2, "needLava": 4, "needSnowBiome": 8, "needGraveyardBiome": 16, "corruption": 32, "crimson": 64}

# Los destacados de la portada, por nombre interno.
FEATURED = [
    "Zenith", "TerraBlade", "Meowmere", "NightsEdge", "Terrarian", "SDMG", "LastPrism", "RodofDiscord",
    "LifeCrystal", "ManaCrystal", "HellstoneBar", "ChlorophyteBar", "HallowedBar", "LunarBar", "LesserHealingPotion", "Torch",
]


def slugify(name: str) -> str:
    """Copia de `slugify` de `site/src/route.ts`: si cambia una, cambia la otra."""
    plain = unicodedata.normalize("NFD", name).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", re.sub(r"['.]", "", plain)).strip("-")


def chunk_of(slug: str) -> str:
    """En qué archivo de fichas va un slug: FNV-1a de 32 bits, igual que `pzShardOf` en `site/src/zomboid/shard.ts`."""
    h = 0x811C9DC5
    for c in slug.encode():
        h = ((h ^ c) * 0x01000193) & 0xFFFFFFFF
    return f"{h % CHUNKS:02d}"


def kind_of(it: dict) -> str:
    """El tipo de objeto para los filtros de la lista. Los campos que faltan valen 0 (el volcado omite los ceros)."""
    slot = any(it.get(k, 0) >= 0 for k in ("headSlot", "bodySlot", "legSlot"))
    if slot:
        return "vanity" if it.get("vanity") else "armor"
    if it.get("accessory"):
        return "vanity" if it.get("vanity") else "accessory"
    if it.get("pick") or it.get("axe") or it.get("hammer") or it.get("fishingPole"):
        return "tool"
    if it.get("ammo") and not it.get("useStyle"):
        return "ammo"
    if it.get("damage", 0) > 0:
        if it.get("melee"):
            return "melee"
        if it.get("ranged"):
            return "ranged"
        if it.get("magic"):
            return "magic"
        if it.get("summon") or it.get("sentry"):
            return "summon"
        return "ammo" if it.get("ammo") else "melee"
    if it.get("createTile", 0) >= 0 or it.get("createWall", 0) > 0:
        return "block"
    if it.get("consumable") or it.get("potion") or it.get("healLife") or it.get("healMana") or it.get("buffType"):
        return "consumable"
    if it.get("material"):
        return "material"
    return "misc"


STAT_KEYS = (
    "damage", "crit", "useTime", "useAnimation", "knockBack", "defense", "pick", "axe", "hammer", "mana", "healLife",
    "healMana", "value", "maxStack", "tileBoost", "fishingPole", "bait", "buffTime", "consumable", "expert", "master",
    "melee", "ranged", "magic", "summon", "sentry", "accessory", "vanity", "material", "autoReuse",
)


def clean_tip(text: str) -> str:
    """Saca las marcas del juego: `[c/RRGGBB:texto]` → texto, `[i:123]` → nada."""
    text = re.sub(r"\[c/[0-9A-Fa-f]+:([^\]]*)\]", r"\1", text)
    text = re.sub(r"\[[a-z]+(?:/[^:\]]*)?:[^\]]*\]", "", text)
    return "\n".join(line.strip() for line in text.split("\n") if line.strip())


def raw_tip(loc: dict, internal: str, lang: str) -> str:
    """La descripción cruda, para las que el juego no pudo resolver sin teclado. Las líneas con marcas sin resolver se van."""
    raw = loc.get("ItemTooltip", {}).get(internal, "")
    common = loc.get("CommonItemTooltip", {})
    raw = re.sub(r"\{\$CommonItemTooltip\.(\w+)\}", lambda m: common.get(m.group(1), ""), raw)
    click = {"en": ("Right-click", "Left-click"), "es": ("Clic derecho", "Clic izquierdo")}[lang]
    raw = raw.replace("<right>", click[0]).replace("<left>", click[1])
    return "\n".join(line for line in raw.split("\n") if "{" not in line and "<" not in line)


def unique_slugs(pairs: list[tuple[int, str]], anchor: dict[int, str]) -> dict[int, str]:
    """Un slug por id, sin repetidos. Los que ya estaban publicados (`anchor`) no cambian; de los nuevos, el de id más
    bajo se queda con el slug limpio y los demás llevan el id."""
    out: dict[int, str] = {}
    taken: set[str] = set()
    for i, _ in pairs:
        if i in anchor:
            out[i] = anchor[i]
            taken.add(anchor[i])
    for i, name in sorted(pairs):
        if i in out:
            continue
        slug = slugify(name) or f"item-{i}"
        if slug in taken:
            slug = f"{slug}-{i}"
        out[i] = slug
        taken.add(slug)
    return out


def build(cache: dict, prev_slugs: dict | None = None, today: str | None = None) -> dict[str, object]:
    """`cache`: items, recipes, texts_en, texts_es, drops, npcs, sprites, loc_en, loc_es (los JSON de la caché ya leídos).
    `prev_slugs`: el `site/slugs.json` publicado, `{id: [en, es]}`. Devuelve archivo → contenido."""
    prev = {int(k): v for k, v in (prev_slugs or {}).items()}
    es_text = cache["texts_es"]["items"]
    en_text = cache["texts_en"]["items"]

    items = [it for it in cache["items"] if it["name"] and not it["deprecated"]]
    ids = {it["id"] for it in items}
    by_id = {it["id"]: it for it in items}

    name_es = {it["id"]: (es_text.get(str(it["id"]), ["", ""])[0] or it["name"]) for it in items}
    slug_en = unique_slugs([(it["id"], it["name"]) for it in items], {i: v[0] for i, v in prev.items() if i in ids})
    slug_es = unique_slugs([(i, n) for i, n in name_es.items()], {i: v[1] for i, v in prev.items() if i in ids})

    # --- grupos de receta -------------------------------------------------------------------------------------
    groups = {}
    for gid, g in cache["texts_en"]["groups"].items():
        valid = [i for i in g["order"] if i in ids]
        if valid:
            groups[int(gid)] = {"en": g["name"], "es": cache["texts_es"]["groups"][gid]["name"], "items": valid}

    # --- recetas ----------------------------------------------------------------------------------------------
    recipes: list[list] = []
    made_by: dict[int, list[int]] = defaultdict(list)
    used_in: dict[int, list[int]] = defaultdict(list)
    tiles_used: set[int] = set()
    for r in cache["recipes"]:
        out = r["createItem"]["type"]
        if out not in ids:
            continue
        accepted = [g for g in r.get("acceptedGroups", []) if g in groups]
        ings = []
        ok = True
        for ing in r["requiredItem"]:
            t = ing["type"]
            if t not in ids:
                ok = False
                break
            g = next((g for g in accepted if t in groups[g]["items"]), None)
            ings.append([-(g + 1) if g is not None else t, ing["stack"]])
        if not ok:
            continue
        flags = sum(bit for key, bit in FLAGS.items() if r.get(key))
        tile = r.get("requiredTile", 0)
        n = len(recipes)
        recipes.append([out, r["createItem"]["stack"], tile, flags, ings])
        made_by[out].append(n)
        if tile >= 0:
            tiles_used.add(tile)
        for key, _ in ings:
            for member in (groups[-key - 1]["items"] if key < 0 else [key]):
                if n not in used_in[member]:
                    used_in[member].append(n)

    # --- estaciones: el objeto que coloca cada una -------------------------------------------------------------
    placer: dict[int, int] = {}
    for it in sorted(items, key=lambda x: (x.get("placeStyle", 0), x["id"])):
        t = it.get("createTile", 0)
        if t >= 0 and t not in placer:
            placer[t] = it["id"]
    tiles = {}
    for t in sorted(tiles_used):
        if t in TILE_NAMES:
            tiles[t] = {"en": TILE_NAMES[t][0], "es": TILE_NAMES[t][1], "item": 0}
        elif t in placer:
            i = placer[t]
            tiles[t] = {"en": by_id[i]["name"], "es": name_es[i], "item": i}
        else:
            raise ValueError(f"la estación {t} no tiene objeto ni nombre a mano (TILE_NAMES)")

    # --- botín ------------------------------------------------------------------------------------------------
    npc_en, npc_es = cache["npcs"]["en-US"], cache["npcs"]["es-ES"]
    drops: dict[int, dict[tuple, list]] = defaultdict(dict)
    for d in cache["drops"]:
        if d["item"] not in ids:
            continue
        name = npc_en.get(str(d["npc"]), "")
        if not name:
            continue
        conds = {c[0] for c in d["if"]}
        mode = "m" if "IsMasterMode" in conds else "e" if "IsExpert" in conds else "n" if "NotExpert" in conds else ""
        key = (name, mode)
        row = [d["npc"], d["min"], d["max"], round(d["rate"], 5), mode]
        # Las variantes de un mismo enemigo comparten nombre: queda una fila, la de mayor chance.
        if key not in drops[d["item"]] or drops[d["item"]][key][3] < row[3]:
            drops[d["item"]][key] = row

    # --- fichas, repartidas en pedazos -------------------------------------------------------------------------
    sprites = cache["sprites"]

    def ref(i: int) -> list:
        w, h = sprites.get(str(i), [0, 0])
        return [slug_en[i], slug_es[i], by_id[i]["name"], name_es[i], by_id[i].get("rare", 0), w, h]

    # Todos los archivos siempre, aunque alguno quede vacío: el sitio los carga con un glob.
    chunks: dict[str, dict] = {f"{n:02d}": {} for n in range(CHUNKS)}
    rows = []
    for it in sorted(items, key=lambda x: x["id"]):
        i = it["id"]
        tip_en = clean_tip(en_text[str(i)][1] or raw_tip(cache["loc_en"], it["internal"], "en"))
        tip_es = clean_tip(es_text[str(i)][1] or raw_tip(cache["loc_es"], it["internal"], "es"))
        kind = kind_of(it)
        w, h = sprites.get(str(i), [0, 0])
        chunk = chunks[chunk_of(slug_en[i])]
        need = {i}
        for n in made_by[i]:
            for key, _ in recipes[n][4]:
                need.update(groups[-key - 1]["items"][:1] if key < 0 else [key])
        uses = []
        for n in used_in[i]:
            out, _, tile, _, ings = recipes[n]
            qty = next(q for key, q in ings if key == i or (key < 0 and i in groups[-key - 1]["items"]))
            uses.append([out, qty, tile])
            need.add(out)
        item_drops = sorted(drops[i].values(), key=lambda r: (-r[3], r[0]))
        npcs = {str(row[0]): [npc_en[str(row[0])], npc_es.get(str(row[0])) or npc_en[str(row[0])]] for row in item_drops}
        for t in {recipes[n][2] for n in made_by[i]} | {u[2] for u in uses}:
            if t in tiles and tiles[t]["item"]:
                need.add(tiles[t]["item"])
        chunk[slug_en[i]] = {
            "id": i,
            "slug": slug_en[i],
            "slugEs": slug_es[i],
            "name": [it["name"], name_es[i]],
            "rare": it.get("rare", 0),
            "size": [w, h],
            "kind": kind,
            "tip": [tip_en, tip_es],
            "stats": {k: it[k] for k in STAT_KEYS if k in it},
            "recipes": [recipes[n] for n in made_by[i]],
            "uses": uses,
            "drops": item_drops,
            # Todo lo que la ficha nombra, para dibujarla sin bajar la lista entera.
            "refs": {str(n): ref(n) for n in sorted(need - {i})},
            "npcs": npcs,
        }
        figure = it.get("damage", 0) if it.get("damage", 0) > 0 else it.get("defense", 0)
        rows.append([i, slug_en[i], kind, it.get("rare", 0), w, h, figure])

    out: dict[str, object] = {
        "site/list.json": rows,
        "site/names-en.json": [by_id[r[0]]["name"] for r in rows],
        "site/names-es.json": [[name_es[r[0]], slug_es[r[0]]] for r in rows],
        # Inglés → español, sólo los que cambian: la forma que recibe `registerTerrariaSlugs`.
        "site/slugs-es.json": {"items": {r[1]: slug_es[r[0]] for r in rows if slug_es[r[0]] != r[1]}},
        "site/slugs.json": {str(r[0]): [r[1], slug_es[r[0]]] for r in rows},
        "site/recipes.json": {"recipes": recipes, "groups": {str(k): v for k, v in groups.items()}, "tiles": {str(k): v for k, v in tiles.items()}},
        "meta.json": {
            "version": VERSION,
            "generatedAt": today or date.today().isoformat(),
            "counts": {"items": len(rows), "recipes": len(recipes), "craftable": sum(1 for v in made_by.values() if v), "drops": sum(len(v) for v in drops.values())},
        },
        # Los destacados llevan todo lo que hace falta para dibujarlos: la portada no baja la lista.
        "home.json": {"featured": [[it["id"], *ref(it["id"])] for name in FEATURED for it in items if it["internal"] == name]},
    }
    for n, chunk in chunks.items():
        out[f"site/items/{n}.json"] = chunk
    return out


def read(name: str):
    return json.loads((CACHE / name).read_text(encoding="utf-8-sig"))


def read_loose(name: str):
    """Los JSON de textos del juego traen comas de más antes de cerrar: se sacan antes de leer."""
    text = (CACHE / name).read_text(encoding="utf-8-sig")
    return json.loads(re.sub(r",(\s*[}\]])", r"\1", text))


def main() -> None:
    cache = {
        "items": read("items.json"),
        "recipes": read("recipes.json"),
        "texts_en": read("texts.en-US.json"),
        "texts_es": read("texts.es-ES.json"),
        "drops": read("drops.json") if (CACHE / "drops.json").exists() else [],
        "npcs": read("npcs.json") if (CACHE / "npcs.json").exists() else {"en-US": {}, "es-ES": {}},
        "sprites": read("sprites.json"),
        "loc_en": read_loose("loc.en-US.Items.json"),
        "loc_es": read_loose("loc.es-ES.Items.json"),
    }
    prev_file = DATA / "site" / "slugs.json"
    prev = json.loads(prev_file.read_text(encoding="utf-8")) if prev_file.exists() else None
    out = build(cache, prev)
    for name, content in out.items():
        path = DATA / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(content, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    counts = out["meta.json"]["counts"]  # type: ignore[index]
    wanted = {DATA / n for n in out}
    for old in (DATA / "site" / "items").glob("*.json"):
        if old not in wanted:
            old.unlink()
    sizes = sorted((DATA / "site" / "items").glob("*.json"), key=lambda p: p.stat().st_size)
    print(counts, f"pedazo más grande: {sizes[-1].stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
