"""Cultivos, árboles frutales y calendario de Stardew Valley para el sitio.

Uso: python games/stardew/tools/crops_data.py

Escribe `games/stardew/data/crops.json` y `calendar.json`. Los slugs son los de la lista del sitio
(`data/site/list.json` y `names-es.json`, que arma `site_data.py`); los nombres y los festivales salen
de los textos del juego (`sdv.text`).
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import relations  # noqa: E402
import sdv  # noqa: E402

DATA = Path(__file__).resolve().parents[1] / "data"
SEASONS = ["spring", "summer", "fall", "winter"]
# Tiendas que venden las semillas todo el año. El carro de viaje queda fuera: su precio es al azar.
TIENDAS_SEMILLAS = ("SeedShop", "Joja", "Sandy")
MINUTOS_POR_DIA = 1440


def _sitio() -> tuple[dict[str, tuple[str, str]], dict[str, str]]:
    """id -> (slug, slug en español) y id -> nombre, de lo que ya publica el sitio."""
    filas = json.loads((DATA / "site/list.json").read_text(encoding="utf-8"))
    es = json.loads((DATA / "site/names-es.json").read_text(encoding="utf-8"))
    return {f[0]: (f[1], e[1]) for f, e in zip(filas, es)}, {f[0]: e[0] for f, e in zip(filas, es)}


def _nombre(token: str | None) -> list[str]:
    return [sdv.text(token, "en"), sdv.text(token, "es")]


def _tienda_mas_barata(item: str, nombres) -> tuple[int | None, list[str] | None]:
    ofertas = [
        s for s in relations.sources_by_item().get(item, [])
        if s["k"] == "shop" and s["shop"] in TIENDAS_SEMILLAS
    ]
    if not ofertas:
        return None, None
    mejor = min(ofertas, key=lambda s: (s["price"], TIENDAS_SEMILLAS.index(s["shop"])))
    return mejor["price"], nombres.tienda(mejor["shop"])


def _productos(cosechado: str, nombres_obj: dict[str, list[str]], nombres) -> list[dict]:
    """Lo que hacen las máquinas con el cosechado: barril, envasadora y deshidratador."""
    from site_data import Nombres  # import tardío: site_data importa este módulo

    grandes = sdv.raw("Data/BigCraftables")
    out = []
    for m in relations.machines_by_input().get(cosechado, []):
        if m["machine"] not in ("(BC)12", "(BC)15", "(BC)Dehydrator") or "flavor" not in m:
            continue
        maq = grandes[m["machine"][4:]]
        out.append({
            "machine": m["machine"],
            "machineName": _nombre(maq["DisplayName"]),
            "name": Nombres.producto(m["out"], m["flavor"], nombres_obj),
            "price": m["price"],
            "days": round(m["minutes"] / MINUTOS_POR_DIA + m["days"], 2),
            "per": m["count"],
        })
    return out


def _nombres_objetos() -> dict[str, list[str]]:
    return {k: _nombre(v["DisplayName"]) for k, v in relations.objects().items()}


def crops() -> dict:
    from site_data import Nombres

    slugs, _ = _sitio()
    objs = relations.objects()
    nom = _nombres_objetos()
    nombres = Nombres()
    cultivos = []
    for semilla, c in sdv.raw("Data/Crops").items():
        h = c["HarvestItemId"]
        if h not in slugs or h not in objs:
            continue
        precio, tienda = _tienda_mas_barata(semilla, nombres)
        cultivos.append({
            "seed": semilla, "harvest": h, "slug": slugs[h][0], "slugEs": slugs[h][1], "name": nom[h],
            "seasons": list(c["Seasons"]), "phases": list(c["DaysInPhase"]),
            "regrow": c.get("RegrowDays", -1),
            "stack": [c["HarvestMinStack"], c["HarvestMaxStack"]],
            "extraChance": c["ExtraHarvestChance"], "perLevel": c["HarvestMaxIncreasePerFarmingLevel"],
            "raised": bool(c["IsRaised"]), "paddy": bool(c["IsPaddyCrop"]),
            "maxQuality": c.get("HarvestMaxQuality"),
            "price": objs[h]["Price"], "cat": objs[h].get("Category", 0),
            "seedPrice": precio, "seedShop": tienda,
            "products": _productos(h, nom, nombres),
        })
    arboles = []
    for retono, t in sdv.raw("Data/FruitTrees").items():
        h = t["Fruit"][0]["ItemId"]
        h = h[3:] if h.startswith("(O)") else h
        if h not in slugs or h not in objs:
            continue
        precio, tienda = _tienda_mas_barata(retono, nombres)
        arboles.append({
            "sapling": retono, "harvest": h, "slug": slugs[h][0], "slugEs": slugs[h][1], "name": nom[h],
            "treeName": _nombre(t["DisplayName"]),
            "seasons": list(t["Seasons"]), "price": objs[h]["Price"], "cat": objs[h].get("Category", 0),
            "saplingPrice": precio, "saplingShop": tienda,
            "products": _productos(h, nom, nombres),
        })
    return {"crops": cultivos, "fruitTrees": arboles}


def passive_festivals() -> list[dict]:
    """Todos los festivales de `Data/PassiveFestivals`, también los que el juego no marca en el calendario.

    Los que no traen `DisplayName` (Derby de la Trucha, Fiesta del Calamar) toman el nombre de
    `Strings/1_6_Strings:<clave>`.
    """
    out = []
    for clave, f in sdv.raw("Data/PassiveFestivals").items():
        token = f.get("DisplayName") or f"[LocalizedText Strings/1_6_Strings:{clave}]"
        nombre = _nombre(token)
        if "[" in nombre[0]:
            raise ValueError(f"festival pasivo sin nombre en el juego: {clave}")
        out.append({
            "id": clave, "name": nombre, "season": f["Season"],
            "from": f["StartDay"], "to": f["EndDay"], "passive": True,
        })
    return out


def active_festivals() -> list[dict]:
    """Festivales de un día de `Data/Festivals/FestivalDates` (clave `<estación><día>`)."""
    en = sdv.raw("Data/Festivals/FestivalDates")
    es = sdv.raw("Data/Festivals/FestivalDates.es-ES")
    out = []
    for clave, nombre in en.items():
        n = next(i for i, s in enumerate(SEASONS) if clave.startswith(s))
        dia = int(clave[len(SEASONS[n]):])
        out.append({
            "id": clave, "name": [nombre, es.get(clave) or nombre], "season": n,
            "from": dia, "to": dia, "passive": False,
        })
    return out


def calendar() -> dict:
    estaciones = [{"days": {}} for _ in SEASONS]

    def dia(n: int, d: int) -> dict:
        return estaciones[n]["days"].setdefault(str(d), {"birthdays": [], "festivals": []})

    for v in relations.villagers():
        s, d = v["birthday"]
        if s in range(4) and d:
            dia(s, int(d))["birthdays"].append(v["key"])
    for f in active_festivals() + passive_festivals():
        e = {k: f[k] for k in ("id", "name", "from", "to", "passive")}
        for d in range(f["from"], f["to"] + 1):
            dia(f["season"], d)["festivals"].append(e)
    for est in estaciones:
        est["days"] = dict(sorted(est["days"].items(), key=lambda kv: int(kv[0])))
    return {"seasons": estaciones}


def main() -> None:
    for nombre, datos in (("crops.json", crops()), ("calendar.json", calendar())):
        ruta = DATA / nombre
        ruta.write_text(json.dumps(datos, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(nombre, ruta.stat().st_size, "bytes")


if __name__ == "__main__":
    main()
