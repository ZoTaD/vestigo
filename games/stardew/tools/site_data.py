"""Arma los datos que lee el sitio (games/stardew/data) a partir de lo volcado en games/stardew/raw.

Uso: python games/stardew/tools/site_data.py

`build()` arma todo en memoria (y con `write=True` lo escribe); es lo que prueban los tests. Los sprites los
escribe `sprites.py`. Todo nombre y descripción sale de los textos del juego (`sdv.text`).
"""
import json
import re
import sys
from collections import Counter
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import relations  # noqa: E402
import sdv  # noqa: E402

DATA = Path(__file__).resolve().parents[1] / "data"

VERSION = "1.6.15"
# En cuántos archivos se reparten las fichas: `pzShardOf(slug, 64)` de `site/src/zomboid/shard.ts`.
CHUNKS = 64

# Bits de `has` en list.json.
GIFT, BUNDLE, MACHINE, RECIPE, GROWS, SHOP, FISH, FORAGE, MONSTER = 1, 2, 4, 8, 16, 32, 64, 128, 256

# Salas del Centro Comunitario en el orden del juego.
ROOMS = ["Pantry", "Crafts Room", "Fish Tank", "Boiler Room", "Bulletin Board", "Vault", "Abandoned Joja Mart"]
SEASONS = ["spring", "summer", "fall", "winter"]
# Categoría que usa la lista para los objetos grandes (-9 en el juego); se nombra como "Crafting" (-8).
CAT_BIG = -9

# Lugares de pesca y forraje sin `DisplayName` en Data/Locations: el texto del juego que los nombra.
# Clave -> (archivo, clave de texto).
_TEXTO_LUGAR = {
    "UndergroundMine": ("Strings/StringsFromCSFiles", "MapPage.cs.11098"),  # Minas
    "Submarine": ("Strings/StringsFromCSFiles", "Dialogue.cs.721"),
    "Caldera": ("Strings/WorldMap", "GingerIsland_North_Volcano"),
    "IslandSouthEastCave": ("Strings/WorldMap", "GingerIsland_SouthEast_PirateCove"),
    "IslandSouth": ("Strings/StringsFromCSFiles", "IslandName"),
    "IslandSouthEast": ("Strings/StringsFromCSFiles", "IslandName"),
    "IslandWest": ("Strings/StringsFromCSFiles", "IslandName"),
    "IslandNorth": ("Strings/StringsFromCSFiles", "IslandName"),
    "IslandNorthCave1": ("Strings/StringsFromCSFiles", "IslandName"),
    "BeachNightMarket": ("Strings/UI", "Billboard_NightMarket"),
}
# Tiendas cuyo nombre no es el de un dueño de Strings/NPCNames.
_TEXTO_TIENDA = {
    "Hospital": ("Strings/StringsFromCSFiles", "MapPage.cs.11076"),
    "Joja": ("Strings/StringsFromCSFiles", "MapPage.cs.11105"),
    "Bookseller": ("Strings/1_6_Strings", "Bookseller"),
    "BoxOffice": ("Strings/StringsFromCSFiles", "MovieTheater_Map"),
    "IceCreamStand": ("Strings/Objects", "IceCream_Name"),
    "VolcanoShop": ("Strings/WorldMap", "GingerIsland_North_Volcano"),
}
# Festival de cada tienda `Festival_<clave>_...` -> día en Data/Festivals/FestivalDates.
_FESTIVAL_TIENDA = {
    "EggFestival": "spring13", "FlowerDance": "spring24", "Luau": "summer11",
    "DanceOfTheMoonlightJellies": "summer28", "SpiritsEve": "fall27", "FestivalOfIce": "winter8",
    "FeastOfTheWinterStar": "winter25",
}


def fnv1a(s: str) -> int:
    """FNV-1a de 32 bits sobre los bytes UTF-8: `pzHash` de `site/src/zomboid/shard.ts`."""
    h = 0x811C9DC5
    for b in s.encode("utf-8"):
        h = ((h ^ b) * 0x01000193) & 0xFFFFFFFF
    return h


def shard(slug: str) -> int:
    """En qué archivo de fichas va un slug: `pzShardOf(slug, CHUNKS)` (el archivo se llama con dos dígitos)."""
    return fnv1a(slug) % CHUNKS


def _t(archivo: str, clave: str) -> list[str] | None:
    """Un texto del juego como [en, es]; None si no existe."""
    en = sdv.raw(archivo).get(clave)
    if en is None:
        return None
    return [en, sdv.raw(archivo + ".es-ES").get(clave) or en]


def _mayuscula(s: str) -> str:
    return s[:1].upper() + s[1:]


def _en_palabras(clave: str) -> str:
    """Sin texto del juego: la clave separada en palabras (`WitchSwamp` -> `Witch Swamp`)."""
    s = re.sub(r"(?<=[a-z])(?=[A-Z])", " ", clave.replace("_", " ").replace(":", " "))
    return _mayuscula(s)


def _festival(dia: str) -> list[str]:
    en = sdv.raw("Data/Festivals/FestivalDates")[dia]
    return [en, sdv.raw("Data/Festivals/FestivalDates.es-ES").get(dia) or en]


class Nombres:
    """Nombres [en, es] de lugares, tiendas y monstruos, con la lista de claves que no tienen texto en el juego."""

    def __init__(self) -> None:
        self.sin_texto: set[str] = set()
        es = sdv.raw("Strings/NPCNames.es-ES")
        self._npc = {k: [v, es.get(k) or v] for k, v in sdv.raw("Strings/NPCNames").items()}
        self._lugares = sdv.raw("Data/Locations")
        self._tiendas = sdv.raw("Data/Shops")

    def _falta(self, clave: str) -> list[str]:
        self.sin_texto.add(clave)
        palabras = _en_palabras(clave)
        return [palabras, palabras]

    def lugar(self, clave: str) -> list[str]:
        if clave.startswith("CrabPot:"):
            agua = clave.split(":", 1)[1]
            base = _t("Strings/Objects", "CrabPot_Name")
            tipo = _t("Strings/StringsFromCSFiles", "TV_Fishing_Channel_Ocean") if agua == "ocean" else None
            if tipo is None:
                self.sin_texto.add(clave)
                tipo = [agua, agua]
            return [f"{base[i]} ({tipo[i].lower()})" for i in (0, 1)]
        token = self._lugares.get(clave, {}).get("DisplayName")
        if token:
            en, es = sdv.text(token, "en"), sdv.text(token, "es")
            if "[" not in en:
                return [en, es]
        if clave in _TEXTO_LUGAR:
            return [_mayuscula(x) for x in _t(*_TEXTO_LUGAR[clave])]
        return self._falta(clave)

    def tienda(self, clave: str) -> list[str]:
        festival = None
        m = re.match(r"Festival_(\w+?)_", clave)
        if m and m.group(1) in _FESTIVAL_TIENDA:
            festival = _festival(_FESTIVAL_TIENDA[m.group(1)])
        base = self._tienda_base(clave)
        if festival and base:
            return [f"{base[i]} ({festival[i]})" for i in (0, 1)]
        return base or festival or self._falta(clave)

    def _tienda_base(self, clave: str) -> list[str] | None:
        if clave in _TEXTO_TIENDA:
            return _t(*_TEXTO_TIENDA[clave])
        if clave.startswith("Festival_NightMarket"):
            return _t("Strings/UI", "Billboard_NightMarket")
        for o in self._tiendas.get(clave, {}).get("Owners", []):
            if o.get("Name") in self._npc:
                return self._npc[o["Name"]]
        m = re.match(r"Festival_\w+?_(\w+)$", clave)
        if m and m.group(1) in self._npc:  # Festival_Luau_Pierre
            return self._npc[m.group(1)]
        return None

    @staticmethod
    def monstruo(clave: str, es: str) -> list[str]:
        return [sdv.raw("Data/Monsters")[clave].split("/")[-1], es]


def _slugs_unicos(ids: list[str], en: dict[str, str], es: dict[str, str]) -> tuple[dict[str, str], dict[str, str]]:
    """Un slug en inglés y otro en español por objeto, sin repetidos.

    Si dos objetos dan el mismo slug, al segundo se le suma el id (`slug-123`). El slug español no puede ser el
    inglés de otro objeto: la dirección se lee en los dos idiomas.
    """
    slug: dict[str, str] = {}
    usados: set[str] = set()
    for i in ids:
        s = sdv.slugify(en[i]) or sdv.slugify(i)
        if s in usados:
            s = f"{s}-{sdv.slugify(i)}"
        slug[i] = s
        usados.add(s)
    slug_es: dict[str, str] = {}
    usados_es: set[str] = set()
    for i in ids:
        s = sdv.slugify(es[i]) or slug[i]
        if s != slug[i] and s in usados:
            s = f"{s}-{sdv.slugify(i)}"
        if s in usados_es:
            s = f"{s}-{sdv.slugify(i)}"
        slug_es[i] = s
        usados_es.add(s)
    return slug, slug_es


def build(write: bool = False) -> dict:
    objs = relations.objects()
    grandes = sdv.raw("Data/BigCraftables")
    ids = list(objs) + ["(BC)" + k for k in grandes]

    def dato(i: str) -> dict:
        return grandes[i[4:]] if i.startswith("(BC)") else objs[i]

    name_en = {i: sdv.text(dato(i)["DisplayName"], "en") for i in ids}
    name_es = {i: sdv.text(dato(i)["DisplayName"], "es") for i in ids}
    desc = {i: [sdv.text(dato(i).get("Description"), "en"), sdv.text(dato(i).get("Description"), "es")] for i in ids}
    slug, slug_es = _slugs_unicos(ids, name_en, name_es)
    tam = {i: (16, 32) if i.startswith("(BC)") else (16, 16) for i in ids}
    cat = {i: CAT_BIG if i.startswith("(BC)") else dato(i).get("Category", 0) for i in ids}
    nombres = Nombres()

    # --- aldeanos ----------------------------------------------------------------------------------------------
    aldeanos = relations.villagers()
    v_slug = {v["key"]: sdv.slugify(v["name"][0]) for v in aldeanos}
    v_slug_es = {v["key"]: sdv.slugify(v["name"][1]) for v in aldeanos}
    choque = set(v_slug) & set(ids)
    if choque:
        raise ValueError(f"un aldeano comparte clave con un objeto: {choque}")
    por_key = {v["key"]: v for v in aldeanos}

    def ref(i: str) -> list:
        return [slug[i], slug_es[i], name_en[i], name_es[i], *tam[i]]

    def ref_aldeano(v: dict) -> list:
        return [v_slug[v["key"]], v_slug_es[v["key"]], v["name"][0], v["name"][1], 64, 64]

    # --- relaciones, indexadas por objeto -----------------------------------------------------------------------
    gustos = relations.tastes_by_item()
    paquetes = relations.bundles_by_item()
    maquinas = relations.machines_by_input()
    fuentes = relations.sources_by_item()
    hace: dict[str, list] = {}
    usa: dict[str, list] = {}
    for r in relations.recipes():
        hace.setdefault(r["out"], []).append([r["kind"], r["key"], r["qty"], r["ings"]])
        for ing, _ in r["ings"]:
            if not ing.startswith("-"):
                usa.setdefault(ing, []).append([r["kind"], r["key"], r["out"]])
    hecho_en: dict[str, dict[tuple, list]] = {}
    for entrada, lista in maquinas.items():
        for m in lista:
            if m["out"] != entrada:
                hecho_en.setdefault(m["out"], {})[(m["machine"], m["minutes"], m["days"])] = [m["machine"], m["minutes"], m["days"]]

    fichas: dict[str, dict] = {}
    filas: list[list] = []
    faltan: Counter = Counter()
    for i in ids:
        d = dato(i)
        refs: dict[str, list] = {}

        def sumar_ref(x: str) -> None:
            if x in slug:
                refs[x] = ref(x)
            elif x in por_key:
                refs[x] = ref_aldeano(por_key[x])
            elif not x.startswith("-"):
                faltan[x] += 1

        tastes = gustos.get(i, {})
        for lista in tastes.values():
            for k in lista:
                sumar_ref(k)
        entradas = [dict(m) for m in maquinas.get(i, [])]
        for e in entradas:
            for k in ("machine", "out", "flavor"):
                if k in e:
                    sumar_ref(e[k])
        hecho = list(hecho_en.get(i, {}).values())
        for maq, _, _ in hecho:
            sumar_ref(maq)
        make = hace.get(i, [])
        use = usa.get(i, [])
        for _, _, _, ings in make:
            for ing, _ in ings:
                sumar_ref(ing)
        for _, _, out in use:
            sumar_ref(out)
        fuentes_i = []
        for s in fuentes.get(i, []):
            s = dict(s)
            if s["k"] == "crop":
                sumar_ref(s["seed"])
            elif s["k"] == "tree":
                sumar_ref(s["sapling"])
            elif s["k"] == "shop":
                s["shop"] = nombres.tienda(s["shop"])
            elif s["k"] in ("fish", "forage"):
                s["where"] = [list(n) for n in dict.fromkeys(tuple(nombres.lugar(w)) for w in s["where"])]  # sin repetir (varios lugares de la isla)
            elif s["k"] == "monster":
                s["who"] = nombres.monstruo(*s["who"])
            fuentes_i.append(s)

        has = 0
        if tastes:
            has |= GIFT
        if i in paquetes:
            has |= BUNDLE
        if entradas or hecho:
            has |= MACHINE
        if make or use:
            has |= RECIPE
        for s in fuentes_i:
            has |= {"crop": GROWS, "tree": GROWS, "shop": SHOP, "fish": FISH, "forage": FORAGE, "monster": MONSTER}[s["k"]]

        precio = d.get("Price", 0)
        en = None if i.startswith("(BC)") else sdv.energy(d.get("Edibility", -300))
        fichas[slug[i]] = {
            "id": i, "slug": slug[i], "slugEs": slug_es[i],
            "name": [name_en[i], name_es[i]], "desc": desc[i], "cat": cat[i],
            "prices": sdv.sell_prices(precio, cat[i]),
            "energy": list(en) if en else None,
            "tastes": tastes, "bundles": paquetes.get(i, []),
            "recipes": {"make": make, "use": use},
            "machines": {"in": entradas, "madeIn": hecho},
            "sources": fuentes_i, "refs": dict(sorted(refs.items())),
        }
        filas.append([i, slug[i], cat[i], precio, *tam[i], has])

    # --- aldeanos para el sitio ---------------------------------------------------------------------------------
    villagers = []
    for v in aldeanos:
        t = {g: [i for i in objs if v["key"] in gustos.get(i, {}).get(g, [])] for g in ("love", "like", "dislike", "hate")}
        villagers.append({
            "key": v["key"], "slug": v_slug[v["key"]], "slugEs": v_slug_es[v["key"]], "name": v["name"],
            "birthday": v["birthday"], "romance": v["romance"], "region": v["region"], "tastes": t,
        })

    # --- Centro Comunitario -------------------------------------------------------------------------------------
    todos = relations.bundles()
    salas = []
    for room in ROOMS:
        bs = sorted((b for b in todos if b["room"] == room), key=lambda b: b["index"])
        refs = {}
        for b in bs:
            for item_id, _, _ in b["items"]:
                if item_id in slug:
                    refs[item_id] = ref(item_id)
            if b["reward"] and b["reward"][0] in slug:
                refs[b["reward"][0]] = ref(b["reward"][0])
        salas.append({
            "room": room, "name": bs[0]["room_name"],
            "bundles": [{k: b[k] for k in ("index", "name", "items", "need", "reward")} for b in bs],
            "refs": dict(sorted(refs.items())),
        })
    if len(todos) != sum(len(s["bundles"]) for s in salas):
        raise ValueError("hay paquetes en una sala que no está en ROOMS")

    # --- portada ------------------------------------------------------------------------------------------------
    por_cat = Counter(cat[i] for i in objs if cat[i] != 0)
    tiene = {r[0]: r[6] for r in filas}
    destacados = []
    for c, _ in por_cat.most_common(12):
        candidatos = [i for i in objs if cat[i] == c]
        regalos = [i for i in candidatos if tiene[i] & GIFT]
        destacados.append(max(regalos or candidatos, key=lambda i: objs[i].get("Price", 0)))
    fechas = sdv.raw("Data/Festivals/FestivalDates")
    estaciones = []
    for n, est in enumerate(SEASONS):
        estaciones.append({
            "birthdays": sorted([v["birthday"][1], v["key"]] for v in aldeanos if v["birthday"][0] == n),
            "festivals": sorted([int(k[len(est):]), _festival(k)] for k in fechas if k.startswith(est)),
        })

    categorias = {str(k): list(v) for k, v in sdv.CATEGORIES.items()}
    if -8 in sdv.CATEGORIES:
        categorias[str(CAT_BIG)] = list(sdv.CATEGORIES[-8])
    meta = {
        "version": VERSION, "generatedAt": date.today().isoformat(),
        "counts": {"items": len(filas), "villagers": len(villagers), "bundles": len(todos), "recipes": len(relations.recipes())},
        "categories": categorias,
    }

    # --- archivos -----------------------------------------------------------------------------------------------
    home = {"featured": destacados, "seasons": estaciones}
    names_en = [name_en[r[0]] for r in filas]
    names_es = [[name_es[r[0]], slug_es[r[0]]] for r in filas]
    files: dict[str, object] = {
        "meta.json": meta, "home.json": home, "villagers.json": villagers, "bundles.json": salas,
        "site/list.json": filas, "site/names-en.json": names_en, "site/names-es.json": names_es,
    }
    pedazos: dict[int, dict] = {}
    pedazos_es: dict[int, dict] = {}
    for r in filas:
        pedazos.setdefault(shard(r[1]), {})[r[1]] = fichas[r[1]]
        pedazos_es.setdefault(shard(slug_es[r[0]]), {})[slug_es[r[0]]] = r[1]
    for n, c in sorted(pedazos.items()):
        files[f"site/items/{n:02d}.json"] = c
    for n, c in sorted(pedazos_es.items()):
        files[f"site/es/{n:02d}.json"] = c

    out = {
        "list": filas, "fichas": fichas, "villagers": villagers, "bundles": salas, "home": home, "meta": meta,
        "names_en": names_en, "names_es": names_es, "files": files,
        "sin_texto": sorted(nombres.sin_texto), "refs_perdidas": dict(faltan),
    }
    if write:
        escribir(files)
    return out


def escribir(files: dict) -> None:
    for name, content in files.items():
        path = DATA / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(content, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    for carpeta in ("items", "es"):
        for viejo in (DATA / "site" / carpeta).glob("*.json"):
            if f"site/{carpeta}/{viejo.name}" not in files:
                viejo.unlink()


def main() -> None:
    out = build(write=True)
    print(out["meta"]["counts"])
    if out["sin_texto"]:
        print("claves sin texto del juego:", ", ".join(out["sin_texto"]))
    if out["refs_perdidas"]:
        print("referencias a ids fuera del sitio:", out["refs_perdidas"])


if __name__ == "__main__":
    main()
