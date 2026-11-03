"""
Precios y valor esperado de CS2 en `games/cs2/prices/` (2026-11-03), a partir de Skinport (`raw/skinport.json`) y del
catálogo de `games/cs2/data/`.

    python games/cs2/tools/prices.py

Lo corre todos los días `publish-cs2.yml`. La carpeta está fuera de los `paths` de `deploy.yml`: el commit diario sale
con el siguiente build de Deadlock, sin build propio (ver el diseño).

- `skins.json`: `{slug: {n: [FN..BS], st?: [...], sv?: [...], sug?: máscara}}`. Precio mostrado = `min_price`; si no
  hay publicaciones, el `suggested_price` (bit en `sug`). Un cuchillo sin pintura tiene un solo valor.
- `cases.json`: `{slug: {price?, ev?, ret?, groups?}}`. `ev` sólo en cajas con llave (`kind == "case"`).
"""
import json
from datetime import date

from cs2 import DATA, PRICES, WEARS, load, write_json
from site_data import CATS, _slug_skin, shard

# Lo que publica Valve para las cajas de armas: la probabilidad de cada grupo y la del objeto especial.
ODDS = {"covert": 0.0064, "classified": 0.032, "restricted": 0.1598, "milspec": 0.7992}
SPECIAL = 0.0026
STATTRAK = 0.1
KEY = 2.49  # la llave en la tienda de Steam; Skinport no vende llaves
MIN_QTY = 3  # con menos publicaciones, el valor esperado usa el precio sugerido


def cell(x: dict | None) -> tuple[float | None, bool]:
    """(precio a mostrar, ¿es el sugerido?)."""
    if not x:
        return None, False
    if x.get("min_price") is not None:
        return x["min_price"], False
    return x.get("suggested_price"), x.get("suggested_price") is not None


def ev_cell(x: dict | None) -> float | None:
    """El precio para el valor esperado: una sola publicación barata no lo tuerce."""
    if not x:
        return None
    if (x.get("quantity") or 0) < MIN_QTY:
        return x.get("suggested_price") or x.get("min_price")
    return x.get("min_price") or x.get("suggested_price")


def wear_avg(lo: float | None, hi: float | None, arr: list) -> float | None:
    """Precio promedio de una skin si el float cae uniforme en [lo, hi]; los desgastes sin precio no cuentan."""
    if lo is None:
        return arr[0] if arr else None
    span = hi - lo
    tot = pond = 0.0
    for (_, a, b), p in zip(WEARS, arr):
        parte = max(0.0, min(b, hi) - max(a, lo))
        if parte > 0 and p is not None:
            tot += parte
            pond += parte * p
    return pond / tot if tot and span > 0 else None


def skin_value(sk: dict, p: dict) -> float | None:
    n = wear_avg(sk["min"], sk["max"], p.get("n") or [])
    if n is None:
        return None
    st = wear_avg(sk["min"], sk["max"], p["st"]) if sk.get("st") and p.get("st") else None
    return n if st is None else (1 - STATTRAK) * n + STATTRAK * st


def _mean(xs: list) -> float | None:
    xs = [x for x in xs if x is not None]
    return sum(xs) / len(xs) if xs else None


def case_ev(case: dict, values: dict) -> dict | None:
    """Valor esperado de abrir una caja: {ev, groups: {rareza: aporte}}; None si no es caja o falta un grupo entero."""
    if case["kind"] != "case":
        return None
    groups = {}
    for g in case["groups"]:
        if g["rarity"] not in ODDS:
            continue
        m = _mean([values.get(s) for s in g["skins"]])
        if m is None:
            return None
        groups[g["rarity"]] = ODDS[g["rarity"]] * m
    if case["rare"]:
        m = _mean([values.get(s) for s in case["rare"]])
        if m is None:
            return None
        groups["special"] = SPECIAL * m
    return {"ev": sum(groups.values()), "groups": groups}


def ret(ev: float, price: float | None) -> float | None:
    return ev / (price + KEY) if price is not None else None


def _r(x):
    return None if x is None else round(x, 2)


def build() -> tuple[dict, dict]:
    sp = {}
    for x in load("skinport"):
        sp[(x["market_hash_name"], x.get("version"))] = x
    # skin_id de ByMykel → (slug, fase) de las skins del sitio.
    skins = {s["id"]: s for s in load("skins") if s["category"]["id"] in CATS}
    filas = {}
    for e in load("skins_not_grouped"):
        s = skins.get(e["skin_id"])
        if not s:
            continue
        slug = _slug_skin(s)
        clave = "st" if e.get("stattrak") else "sv" if e.get("souvenir") else "n"
        wear = (e.get("wear") or {}).get("name")
        i = next((k for k, w in enumerate(WEARS) if w[0] == wear), 0)
        x = sp.get((e["market_hash_name"], s.get("phase")))
        f = filas.setdefault(slug, {})
        largo = 5 if wear else 1
        f.setdefault(clave, [None] * largo)
        f.setdefault("_ev_" + clave, [None] * largo)
        v, sug = cell(x)
        f[clave][i] = _r(v)
        f["_ev_" + clave][i] = ev_cell(x)
        if sug and clave == "n":
            f["sug"] = f.get("sug", 0) | (1 << i)

    lista = {r["slug"]: r for r in json.loads((DATA / "skins" / "list.json").read_text(encoding="utf-8"))}
    values = {}
    out_skins = {}
    for slug, f in filas.items():
        values[slug] = skin_value(lista[slug], {"n": f.get("_ev_n"), "st": f.get("_ev_st")}) if slug in lista else None
        out = {k: v for k, v in f.items() if not k.startswith("_")}
        # Una skin que sólo existe como Souvenir (MP5-SD | Lab Rats) lleva igual su fila normal, vacía.
        out.setdefault("n", [None] * len(next(iter(out.values()))))
        out_skins[slug] = {"n": out.pop("n"), **out}

    out_cases = {}
    for c in json.loads((DATA / "cases" / "list.json").read_text(encoding="utf-8")):
        ficha = json.loads((DATA / "cases" / "f" / f"{shard(c['slug']):02d}.json").read_text(encoding="utf-8"))[c["slug"]]
        price, _ = cell(sp.get((c["name"], None)))
        r = {}
        if price is not None:
            r["price"] = price
        e = case_ev(ficha, values)
        if e:
            r["ev"] = _r(e["ev"])
            r["groups"] = {k: round(v, 3) for k, v in e["groups"].items()}
            if ret(e["ev"], price) is not None:
                r["ret"] = round(ret(e["ev"], price), 4)
        out_cases[c["slug"]] = r
    return out_skins, out_cases


def main() -> None:
    skins, cases = build()
    a = write_json(PRICES / "skins.json", skins)
    b = write_json(PRICES / "cases.json", cases)
    if a or b:
        write_json(PRICES / "meta.json", {"date": date.today().isoformat()})
    print(f"precios: {len(skins)} skins, {len(cases)} cajas{'' if a or b else ' (sin cambios)'}")


if __name__ == "__main__":
    main()
