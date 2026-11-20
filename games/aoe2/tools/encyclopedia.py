"""
La enciclopedia de Age of Empires II: DE (2026-11-21): unidades, tecnologías, edificios, el árbol de cada civ, sus
bonos y los counters, leídos de la instalación del juego.

    python games/aoe2/tools/encyclopedia.py [--game "C:/Program Files (x86)/Steam/steamapps/common/AoE2DE"]

Lee:
  - `resources/_common/dat/empires2_x2_p1.dat` con `dat.py`: cifras de unidades y tecnologías, y efectos.
  - `resources/_common/dat/CivTechTrees/<CIV>.json`: qué tiene cada civ (y en qué edad y edificio).
  - `resources/_common/dat/civilizations.json`: el texto de bonos de cada civ y sus únicos.
  - los textos `en` y `mx` (nombre = id del `.dat`; ayuda = id + 21000; clases de armadura = 12400 + clase).
  - los íconos `widgetui/textures/ingame/{units,tech,buildings}/NNN_*.DDS` (NNN = "Picture Index" del árbol).

Escribe `games/aoe2/data/encyclopedia/{units,techs,tree,civinfo}.json` y los íconos en
`site/public/aoe2/{u,t,b}/<n>.webp` (64 px). El id de civ del `.dat` es el índice de `civilizations.json` (Gaia = 0),
que es `internal` en `civs.json`.
"""
from __future__ import annotations

import argparse
import json
import math
import re
from collections import Counter
from pathlib import Path

import dat
from game_data import DATA, JUEGO, PUBLIC, _escribir_json, _webp, parse_strings

SALIDA = DATA / "encyclopedia"
AYUDA = 21000
CLASES_ARMADURA = 12400
EDADES = {101: 2, 102: 3, 103: 4}
#: Atributos de combate que la calculadora sabe aplicar: vida, visión, velocidad, armadura, ataque, recarga, precisión,
#: alcance, alcance mínimo y costo (100, multiplicador).
ATRIBUTOS = {0, 1, 5, 8, 9, 10, 11, 12, 20, 100}
#: Tipos de efecto que tocan atributos: fijar, sumar y multiplicar.
MODIFICA = {0, 4, 5}
RECURSOS = {0: "food", 1: "wood", 2: "stone", 3: "gold"}
MUELLE = 45
PARTES = 8
#: Clases que no cuentan como rivales en los counters: comercio (2, 19), aldeano (4), transporte (20), pesquero (21),
#: monje (18), petardo (35), trebuchet (51, 54) y el asedio (13, 55): sin daño de área, una pelea pareja no lo representa.
NO_RIVALES = {2, 4, 13, 18, 19, 20, 21, 35, 51, 54, 55}


def _slug(nombre: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", nombre.lower()).strip("-")


def clase_valor(d: float) -> tuple[int, int]:
    """Ataque y armadura en los efectos: clase × 256 + valor (un byte con signo)."""
    n = int(round(d))
    v = n & 0xFF
    if v > 127:
        v -= 256
    return (n - v) // 256, v


_ETIQUETA = re.compile(r"<[^>]*>")


def limpiar_ayuda(t: str) -> list[str]:
    """El texto de ayuda de una unidad o tecnología en párrafos, sin la línea de "Crear X (costo)", sin etiquetas y sin
    la línea final de íconos (`<hp> <attack>…`)."""
    partes = [p.strip() for p in t.replace("\\n", "\n").split("\n")]
    out = []
    for i, p in enumerate(partes):
        if i == 0 and "<cost>" in p:
            continue
        p = _ETIQUETA.sub("", p).strip()
        if p:
            out.append(p)
    return out


def partes_civ(t: str) -> dict:
    """El texto de la civ en el árbol del juego: tipo, bonos y bono de equipo (los únicos salen de los datos)."""
    bloques = [b.strip() for b in t.replace("\\n", "\n").split("\n\n")]
    sin = lambda s: _ETIQUETA.sub("", s).strip()
    out = {"kind": sin(bloques[0]) if bloques else "", "bonuses": [], "team": ""}
    for b in bloques[1:]:
        lineas = [sin(x) for x in b.split("\n") if sin(x)]
        if not lineas:
            continue
        cab = lineas[0].rstrip(": ").lower()
        if lineas[0].startswith("•"):
            out["bonuses"] = [x.lstrip("• ").strip() for x in lineas if x.startswith("•")]
        elif len(lineas) > 1 and ("team" in cab or "equipo" in cab):
            out["team"] = " ".join(lineas[1:])
    return out


def danio(ataques: dict[int, int], armaduras: dict[int, int]) -> int:
    """El daño de un golpe: la suma, por cada clase que tienen los dos, de ataque − armadura (sin bajar de 0); mínimo 1."""
    return max(1, sum(max(0, a - armaduras[c]) for c, a in ataques.items() if c in armaduras))


def _dps(a: dict, b: dict) -> float:
    if not a["attacks"] or not a["reload"]:
        return 0.0
    return danio(a["attacks"], b["armors"]) * a["accuracy"] / 100 / a["reload"]


def puntaje(a: dict, b: dict) -> float:
    """Cuánto rinde A contra B gastando lo mismo, sin mejoras ni micro: > 1 gana A. Ley cuadrática de Lanchester, con
    una ventaja para el de más alcance: dispara solo mientras el otro cruza la diferencia de alcance."""
    ab, ba = _dps(a, b), _dps(b, a)
    if not ab:
        return 0.0
    if not ba:
        return math.inf
    na, nb = 1 / a["cost"], 1 / b["cost"]  # unidades por recurso
    dif = a.get("range", 0) - b.get("range", 0)
    if dif > 0 and b.get("speed"):
        nb = max(nb - na * ab * (dif / b["speed"]) / b["hp"], 1e-9)
    elif dif < 0 and a.get("speed"):
        na = max(na - nb * ba * (-dif / a["speed"]) / a["hp"], 1e-9)
    return (ab / b["hp"] * na**2) / (ba / a["hp"] * nb**2)


def lineas(nodos: list[dict]) -> dict[int, list[int]]:
    """La línea de mejora de cada unidad (Caballero → Caballero pesado → Paladín) según los vínculos del árbol."""
    padre: dict[int, int] = {}
    for n in nodos:
        if n.get("Use Type") == "Unit" and n.get("Link Node Type") in ("Unit", "UnitUpgrade", "UniqueUnit") and n.get("Link ID", -1) >= 0:
            padre[n["Node ID"]] = n["Link ID"]
    hijos: dict[int, int] = {p: h for h, p in padre.items()}
    out: dict[int, list[int]] = {}
    for n in nodos:
        if n.get("Use Type") != "Unit":
            continue
        r = n["Node ID"]
        while r in padre:
            r = padre[r]
        cadena = [r]
        while cadena[-1] in hijos:
            cadena.append(hijos[cadena[-1]])
        out[n["Node ID"]] = cadena
    return out


def _afecta(cmd: tuple, u: dat.Unidad) -> bool:
    tipo, uid, clase, attr, _ = cmd
    if tipo not in MODIFICA or attr not in ATRIBUTOS:
        return False
    if uid == -1 and clase == -1:
        return False
    return (uid == -1 or uid == u.id) and (clase == -1 or clase == u.clase)


def _fx(efecto: list[tuple]) -> list[list]:
    return [[t, a, b, c, round(d, 4)] for t, a, b, c, d in efecto if t in MODIFICA and c in ATRIBUTOS]


def _slugs_unicos(filas: list[dict]) -> None:
    """Dos cosas con el mismo nombre en inglés: la de id más bajo se queda el slug y las demás llevan su id."""
    vistos: set[str] = set()
    for f in sorted(filas, key=lambda f: f["id"]):
        if f["slug"] in vistos or not f["slug"]:
            f["slug"] = f"{f['slug'] or 'x'}-{f['id']}"
        vistos.add(f["slug"])


def _icono(carpeta: Path, n: int) -> Path | None:
    return next(iter(sorted(carpeta.glob(f"{n:03d}_*.DDS"))), None)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--game", type=Path, default=JUEGO)
    ap.add_argument("--no-icons", action="store_true")
    args = ap.parse_args()
    res = args.game / "resources"
    textos = {k: parse_strings((res / k / "strings" / "key-value" / "key-value-strings-utf8.txt").read_text(encoding="utf-8")) for k in ("en", "mx")}
    nombre = lambda i: {"en": textos["en"].get(i, ""), "es": textos["mx"].get(i) or textos["en"].get(i, "")}
    d = dat.leer(res / "_common" / "dat" / "empires2_x2_p1.dat")
    lista = json.loads((res / "_common" / "dat" / "civilizations.json").read_text(encoding="utf-8"))["civilization_list"]
    nuestras = {c["internal"]: c for c in json.loads((DATA / "civs.json").read_text(encoding="utf-8"))}

    # Árboles: por civ (slug) sus nodos, con el estado de cada uno.
    arboles: dict[str, dict] = {}
    for i, c in enumerate(lista):
        # Las civs de Chronicles (era "antiquity") no se juegan en ranking: afuera de la enciclopedia.
        if i not in nuestras or nuestras[i]["era"] == "antiquity":
            continue
        ruta = res / "_common" / "dat" / "CivTechTrees" / f"{c['tech_tree_name']}.json"
        if ruta.exists():
            arboles[nuestras[i]["slug"]] = {"i": i, "t": json.loads(ruta.read_text(encoding="utf-8"))}

    unidades: dict[int, dict] = {}
    techs: dict[int, dict] = {}
    edificios: dict[int, dict] = {}
    estado: dict[str, dict[str, str]] = {}
    cadenas: dict[int, Counter] = {}
    for slug, x in arboles.items():
        e = estado.setdefault(slug, {})
        for n in x["t"]["civ_techs_buildings"]:
            if n.get("Node Type") is None:
                continue
            edificios.setdefault(n["Node ID"], {"id": n["Node ID"], "pic": n["Picture Index"], "age": n["Age ID"], "nameId": n["Name String ID"]})
            e[f"b{n['Node ID']}"] = n["Node Status"]
        nodos_civ = [n for n in x["t"]["civ_techs_units"] if n.get("Node Type") is not None]
        for uid, cad in lineas(nodos_civ).items():
            cadenas.setdefault(uid, Counter())[tuple(cad)] += 1
        for n in nodos_civ:
            k = "u" if n["Use Type"] == "Unit" else "t"
            dest = unidades if k == "u" else techs
            dest.setdefault(n["Node ID"], {"id": n["Node ID"], "pic": n["Picture Index"], "age": n["Age ID"], "building": n["Building ID"], "node": n["Node Type"], "trigger": n.get("Trigger Tech ID", -1)})
            e[f"{k}{n['Node ID']}"] = n["Node Status"]
    # La línea de cada unidad es la de la mayoría de las civs (los persas tienen Savar en lugar de Paladín).
    linea = {uid: list(c.most_common(1)[0][0]) for uid, c in cadenas.items()}

    # Cifras del `.dat`: de la primera civ que tiene cada unidad disponible.
    def unidad_dat(uid: int) -> dat.Unidad | None:
        for slug, x in arboles.items():
            if estado[slug].get(f"u{uid}") != "NotAvailable" and uid in d.civs[x["i"]].unidades:
                return d.civs[x["i"]].unidades[uid]
        return d.civs[0].unidades.get(uid)

    afectan: dict[int, list[int]] = {}
    ayudas: dict[str, dict[int, dict]] = {"u": {}, "t": {}}
    out_u = []
    stats_counter: dict[int, dict] = {}
    for uid, n in unidades.items():
        u = unidad_dat(uid)
        if not u:
            continue
        fila = {
            "id": uid, "slug": _slug(textos["en"].get(u.name_id) or u.nombre), "name": nombre(u.name_id),
            "pic": n["pic"], "age": n["age"], "building": n["building"], "kind": n["node"], "class": u.clase,
            "line": linea.get(uid, [uid]), "trigger": n["trigger"],
            "hp": u.vida, "los": round(u.vision, 2), "speed": round(u.velocidad or 0, 3), "range": round(u.alcance, 2), "minRange": round(u.alcance_min, 2),
            "reload": round(u.recarga, 3), "accuracy": u.precision, "projectiles": round(u.proyectiles, 2),
            "attacks": sorted([c, v] for c, v in u.ataques.items()), "armors": sorted([c, v] for c, v in u.armaduras.items()),
            "cost": {RECURSOS[t]: v for t, v in sorted(u.costo.items()) if t in RECURSOS}, "time": u.tiempo,
            "naval": n["building"] == MUELLE,
        }
        ayudas["u"][uid] = {k: limpiar_ayuda(textos[k].get(u.name_id + AYUDA, "")) for k in ("en", "mx")}
        out_u.append(fila)
        if u.ataques and u.recarga and n["building"] not in (-1,):
            stats_counter[uid] = {"hp": u.vida, "attacks": u.ataques, "armors": u.armaduras, "reload": u.recarga, "accuracy": u.precision or 100, "cost": max(1, sum(u.costo.values())), "naval": fila["naval"], "range": u.alcance, "speed": u.velocidad or 0}

    _slugs_unicos(out_u)

    # Counters: contra quién rinde más y menos, del mismo medio (tierra o agua) y de edades vecinas. Los rivales son las
    # unidades comunes y regionales que pelean contra unidades (sin aldeanos, comercio, monjes, arietes, trebuchets,
    # petardos ni barcos de demolición) y sin las variantes repetidas.
    def rival(f: dict) -> bool:
        armaduras = {c for c, _ in f["armors"]}
        return (
            f["kind"] in ("Unit", "UnitUpgrade", "RegionalUnit")
            and f["class"] not in NO_RIVALES
            and 17 not in armaduras
            and "demolition" not in f["slug"]
            and not f["slug"].endswith(f"-{f['id']}")
        )

    rivales = {f["id"]: f for f in out_u if f["id"] in stats_counter and rival(f)}
    for f in out_u:
        a = stats_counter.get(f["id"])
        f["good"], f["bad"] = [], []
        if not a or f["class"] in NO_RIVALES:
            continue
        pares = [(puntaje(a, stats_counter[bid]), bid) for bid, b in rivales.items() if bid != f["id"] and b["naval"] == f["naval"] and abs(b["age"] - f["age"]) <= 1]
        f["good"] = [bid for p, bid in sorted(pares, key=lambda x: -x[0]) if p >= 1.5][:6]
        f["bad"] = [bid for p, bid in sorted(pares, key=lambda x: x[0]) if 0 < p <= 1 / 1.5][:6]

    out_t = []
    por_id_u = {f["id"]: d_u for f in out_u if (d_u := unidad_dat(f["id"]))}
    for tid, n in techs.items():
        if tid >= len(d.techs):
            continue
        t = d.techs[tid]
        efecto = d.efectos[t.efecto][1] if 0 <= t.efecto < len(d.efectos) else []
        toca = sorted(uid for uid, u in por_id_u.items() if any(_afecta(c, u) for c in efecto))
        for uid in toca:
            afectan.setdefault(uid, []).append(tid)
        ayudas["t"][tid] = {k: limpiar_ayuda(textos[k].get(t.name_id + AYUDA, "")) for k in ("en", "mx")}
        fila = {
            "id": tid, "slug": _slug(textos["en"].get(t.name_id) or t.nombre), "name": nombre(t.name_id),
            "pic": n["pic"], "age": n["age"], "building": n["building"], "kind": n["node"],
            "cost": {RECURSOS[k]: v for k, v in sorted(t.costo.items()) if k in RECURSOS}, "time": t.tiempo,
            "units": toca, "fx": _fx(efecto),
        }
        out_t.append(fila)
    _slugs_unicos(out_t)
    for f in out_u:
        f["upgrades"] = sorted(afectan.get(f["id"], []))

    out_b = []
    for bid, b in edificios.items():
        u = d.civs[0].unidades.get(bid)
        out_b.append({"id": bid, "slug": _slug(textos["en"].get(b["nameId"], "") or (u.nombre if u else str(bid))), "name": nombre(b["nameId"]), "pic": b["pic"], "age": b["age"]})

    # Bonos de cada civ: texto del juego y los efectos que la calculadora aplica (árbol de la civ, técnicas gratis por
    # edad y bono de equipo).
    civinfo = {}
    for slug, x in arboles.items():
        c = lista[x["i"]]
        dc = d.civs[x["i"]]
        gratis = []
        for t in d.techs:
            if t.civ == x["i"] and t.edificio == -1 and not t.costo and 0 <= t.efecto < len(d.efectos):
                fx = _fx(d.efectos[t.efecto][1])
                if fx:
                    edad = max([EDADES.get(r, 1) for r in t.requisitos] or [1])
                    gratis.append([edad, fx])
        tt = _fx(d.efectos[dc.tech_tree][1]) if 0 <= dc.tech_tree < len(d.efectos) else []
        if tt:
            gratis.insert(0, [1, tt])
        civinfo[slug] = {
            "desc": {"en": partes_civ(textos["en"].get(c["tech_tree_description_string_id"], "")), "es": partes_civ(textos["mx"].get(c["tech_tree_description_string_id"], ""))},
            "uu": [u for u in (c.get("unique_unit_id"), c.get("elite_unique_unit_id")) if u is not None and u in unidades],
            "ut": [t for t in (c.get("unique_tech_id_1"), c.get("unique_tech_id_2")) if t is not None and t in techs],
            "bonus": gratis,
            "team": _fx(d.efectos[dc.bono_equipo][1]) if 0 <= dc.bono_equipo < len(d.efectos) else [],
        }

    clases = {c: {"en": textos["en"].get(CLASES_ARMADURA + c, f"Class {c}"), "es": textos["mx"].get(CLASES_ARMADURA + c, f"Clase {c}")} for c in range(0, 64) if (CLASES_ARMADURA + c) in textos["en"]}
    nodos = sorted({k for e in estado.values() for k in e})
    arbol = {"nodes": nodos, "civs": {s: "".join({"ResearchedCompleted": "1", "ResearchRequired": "2"}.get(estado[s].get(k, ""), "0") for k in nodos) for s in sorted(estado)}}

    _escribir_json(SALIDA / "units.json", {"classes": clases, "units": sorted(out_u, key=lambda f: (f["building"], f["age"], f["id"]))})
    _escribir_json(SALIDA / "techs.json", sorted(out_t, key=lambda f: (f["building"], f["age"], f["id"])))
    _escribir_json(SALIDA / "tree.json", {"buildings": sorted(out_b, key=lambda b: (b["age"], b["id"])), **arbol})
    _escribir_json(SALIDA / "civinfo.json", civinfo)
    # La ayuda, por idioma y partida en PARTES pedazos por id: una ficha baja sólo el suyo.
    for idioma, clave in (("en", "en"), ("es", "mx")):
        for parte in range(PARTES):
            _escribir_json(SALIDA / "help" / idioma / f"{parte}.json", {k: {str(i): x[clave] for i, x in v.items() if i % PARTES == parte} for k, v in ayudas.items()})

    escritas = 0
    if not args.no_icons:
        tex = args.game / "widgetui" / "textures" / "ingame"
        for carpeta, destino, pics in (("units", "u", {f["pic"] for f in out_u}), ("tech", "t", {f["pic"] for f in out_t}), ("buildings", "b", {b["pic"] for b in out_b})):
            for p in sorted(pics):
                origen = _icono(tex / carpeta, p)
                if origen:
                    escritas += _webp(origen, PUBLIC / destino / f"{p}.webp", 64)
    print(f"{len(out_u)} unidades, {len(out_t)} tecnologías, {len(out_b)} edificios, {len(civinfo)} civs; {escritas} íconos nuevos o cambiados")


if __name__ == "__main__":
    main()
