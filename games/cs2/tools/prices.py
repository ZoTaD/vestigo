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


def case_ev(case: dict, values: dict, names: dict | None = None) -> dict | None:
    """
    Valor esperado de abrir una caja: {ev, groups: {rareza: aporte}}; None si no es caja o falta un grupo entero.

    En el objeto especial cada acabado pesa igual: las fases de un Doppler o Gamma Doppler (`names`: slug → nombre sin
    fase) se promedian primero entre ellas. Si no, un Doppler con 7 fases pesaba como 7 cuchillos y Chroma 2 daba 86 %
    en vez de ~62 % (revisión del 3/11).
    """
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
        por_acabado: dict[str, list] = {}
        for s in case["rare"]:
            por_acabado.setdefault((names or {}).get(s, s), []).append(values.get(s))
        m = _mean([_mean(v) for v in por_acabado.values()])
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
        e = case_ev(ficha, values, {s: r["name"] for s, r in lista.items()})
        if e:
            r["ev"] = _r(e["ev"])
            r["groups"] = {k: round(v, 3) for k, v in e["groups"].items()}
            if ret(e["ev"], price) is not None:
                r["ret"] = round(ret(e["ev"], price), 4)
        out_cases[c["slug"]] = r
    return out_skins, out_cases


def all_prices() -> dict:
    """
    El precio de todo lo que vende Skinport por `market_hash_name` (etapa 3: el Inventario valúa stickers, llaveros,
    agentes, llaves…). La versión sin fase: el inventario de Steam no dice la fase de una Doppler.
    """
    out = {}
    for x in load("skinport"):
        if x.get("version"):
            continue
        v, _ = cell(x)
        if v is not None:
            out[x["market_hash_name"]] = v
    return dict(sorted(out.items()))


WEAR_AB = ["FN", "MW", "FT", "WW", "BS"]
# Para entrar a la pestaña Mercado: ventas en 30 días y mediana mínima (que no la muevan dos ventas de centavos).
MIN_SALES = 30
MIN_MEDIAN = 0.5


def _med(x: dict, k: str):
    w = x.get(k) or {}
    return w.get("median")


def build_market() -> tuple[list, dict]:
    """
    Las ventas reales de Skinport (`raw/sales.json`, etapa 4): por cada skin y caja, una fila por variante que se vende
    (desgaste × normal "", StatTrak "ST ", Souvenir "SV "; "-" en cajas y cuchillos sin pintura) con
    `[mediana 24 h, 7 d, 30 d, 90 d, ventas 30 d]`; y la lista de la pestaña con lo que pasa los umbrales:
    `[nombre, slug, rareza, m24, m7, m30, m90, v7, v30]`.
    """
    sales = {(x["market_hash_name"], x.get("version")): x for x in load("sales")}
    skins = {s["id"]: s for s in load("skins") if s["category"]["id"] in CATS}
    rarity = {s["slug"]: s["rarity"] for s in json.loads((DATA / "skins" / "list.json").read_text(encoding="utf-8"))}
    out: dict = {}
    market: list = []

    def add(slug: str, variant: str, name: str, rar: str, x: dict | None) -> None:
        v30 = ((x or {}).get("last_30_days") or {}).get("volume") or 0
        if not x or not v30:
            return
        m24, m7, m30, m90 = (_med(x, k) for k in ("last_24_hours", "last_7_days", "last_30_days", "last_90_days"))
        out.setdefault(slug, {})[variant] = [m24, m7, m30, m90, v30]
        if v30 >= MIN_SALES and (m30 or 0) >= MIN_MEDIAN:
            v7 = (x.get("last_7_days") or {}).get("volume") or 0
            market.append([name, slug, rar, m24, m7, m30, m90, v7, v30])

    for e in load("skins_not_grouped"):
        s = skins.get(e["skin_id"])
        if not s:
            continue
        slug = _slug_skin(s)
        pre = "ST " if e.get("stattrak") else "SV " if e.get("souvenir") else ""
        wear = (e.get("wear") or {}).get("name")
        variant = pre + (WEAR_AB[[w[0] for w in WEARS].index(wear)] if wear else "-")
        name = e["market_hash_name"] + (f" · {s['phase']}" if s.get("phase") else "")
        add(slug, variant.strip() or "-", name, rarity.get(slug, ""), sales.get((e["market_hash_name"], s.get("phase"))))
    for c in json.loads((DATA / "cases" / "list.json").read_text(encoding="utf-8")):
        add(c["slug"], "-", c["name"], "case", sales.get((c["name"], None)))
    market.sort(key=lambda r: -r[8])
    return market, out


def add_day(history: dict, values: dict, day: str) -> None:
    """Suma el precio del día a la serie de cada ficha; si la fecha ya está (la Action corrió dos veces), la pisa."""
    for slug, v in values.items():
        if v is None:
            continue
        serie = history.setdefault(slug, [])
        if serie and serie[-1][0] == day:
            serie[-1][1] = v
        else:
            serie.append([day, v])


def _sharded(folder, data: dict) -> bool:
    """Escribe `data` repartido en `CHUNKS` archivos por el hash del slug (`NN.json`, como las fichas)."""
    from cs2 import CHUNKS
    partes = [{} for _ in range(CHUNKS)]
    for slug, v in data.items():
        partes[shard(slug)][slug] = v
    cambio = False
    for i, p in enumerate(partes):
        cambio = write_json(folder / f"{i:02d}.json", p) or cambio
    return cambio


def _read_sharded(folder) -> dict:
    out = {}
    for f in sorted(folder.glob("*.json")) if folder.exists() else []:
        out.update(json.loads(f.read_text(encoding="utf-8")))
    return out


def main() -> None:
    skins, cases = build()
    a = write_json(PRICES / "skins.json", skins)
    b = write_json(PRICES / "cases.json", cases)
    a = write_json(PRICES / "all.json", all_prices()) or a
    # Etapa 4: las ventas reales y la serie diaria de cada ficha (el precio más bajo de la skin, o el de la caja).
    market, sales = build_market()
    a = write_json(PRICES / "market.json", market) or a
    a = _sharded(PRICES / "sales", sales) or a
    hoy = date.today().isoformat()
    history = _read_sharded(PRICES / "history")
    valores = {slug: min((v for v in p["n"] if v is not None), default=None) for slug, p in skins.items()}
    valores.update({slug: c.get("price") for slug, c in cases.items()})
    add_day(history, valores, hoy)
    a = _sharded(PRICES / "history", history) or a
    if a or b:
        write_json(PRICES / "meta.json", {"date": date.today().isoformat()})
    print(f"precios: {len(skins)} skins, {len(cases)} cajas{'' if a or b else ' (sin cambios)'}")


if __name__ == "__main__":
    main()
