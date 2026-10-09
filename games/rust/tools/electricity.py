"""
Los componentes de la pestaña Electricidad (2026-10-09). Plan: docs/superpowers/plans/2026-10-09-rust-electricidad.md.

Lee la caché del cliente (`games/rust/cache/io/prefabs.json` y `configs.json`, de `extract_io.py`) y los objetos ya
extraídos (`games/rust/data/items.json`: nombre, slug y receta), le suma `electricity_overrides.py` (lo que el juego
calcula en código) y escribe `games/rust/data/electricity.json`:

  - `categories`: el orden de la paleta;
  - `components`: cada componente que se coloca y tiene un enchufe eléctrico, con
      `id` (shortname), `cls` (clase del juego, que elige el comportamiento del motor), `cat`, `name` {en, es},
      `slug`/`slugEs` (la ficha de Objetos, si tiene), `in`/`out` (enchufes: `n` niceName, `t` IOType, `m`
      mainPowerSlot), `use` (consumo) y `useSrc` (de dónde sale: `field`, `code`, `formula`, `base` o `nocode`), `gen`
      (lo máximo que genera una fuente), `p` (los campos del prefab que el motor usa), `range` (lo que el jugador puede
      configurar) y `craft` (la receta, para la lista de materiales);
  - `names`: el nombre de cada ingrediente.

No abre bundles: corre en un segundo. Desde la raíz del repo:
    python games/rust/tools/electricity.py
"""
import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import electricity_overrides as ov  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "cache" / "io"
PREFABS = CACHE / "prefabs.json"
CONFIGS = CACHE / "configs.json"
ITEMS = ROOT / "data" / "items.json"
OUT = ROOT / "data" / "electricity.json"
# Lo poco que muestra el bloque "Electricidad" de las fichas de Objetos (viaja con la pestaña Objetos: tiene que ser chico).
OUT_ITEMS = ROOT / "data" / "electricity-items.json"
ELECTRIC = 0
FLUID = 1
INDUSTRIAL = 4
# Las redes que entran al editor: energía, agua e industrial (2026-10-09).
NETS = {ELECTRIC, FLUID, INDUSTRIAL}
IND = ROOT / "cache" / "industrial"
OUT_IND = ROOT / "data" / "industrial-items.json"


def slots(raw):
    """Cada enchufe: nombre, tipo, si es la entrada principal y su altura en el prefab (`h`, para la gravedad del agua)."""
    return [{"n": s["niceName"], "t": s["type"], "m": s["mainPowerSlot"], "h": round(s["handlePosition"]["y"], 3)} for s in raw]


def consumption(cls, data):
    """El consumo y de dónde sale: el campo del prefab manda; si no, el código; si no, el de `IOEntity` (1)."""
    for f in ov.USE_FIELDS:
        if f in data and cls not in ov.CODE_USE:
            return int(data[f]), "field"
    if cls in ov.CODE_USE:
        return ov.CODE_USE[cls][0], "code"
    if cls in ov.FORMULA_USE:  # Mathf.CeilToInt(maxDamageOutput / powerToDamageRatio)
        return math.ceil(data["maxDamageOutput"] / data["powerToDamageRatio"]), "formula"
    if cls in ov.BASE_USE:
        return 1, "base"
    if cls in ov.NO_CODE_USE:
        return ov.NO_CODE_USE[cls], "nocode"
    raise ValueError(f"{cls}: sin consumo conocido (sumalo a electricity_overrides.py)")


def generation(cls, data):
    return {
        "SolarPanel": lambda: data["maximalPowerOutput"],
        "ElectricWindmill": lambda: data["maxPowerGeneration"],
        "ElectricWaterWheel": lambda: data["maxPowerGenerationFromWater"],
        "FuelGenerator": lambda: data["outputEnergy"],
        "ElectricGenerator": lambda: int(data["electricAmount"]),
    }.get(cls, lambda: None)()


def config_range(configs, name):
    d = configs[name][0]["data"]
    lo, hi = d["minValue"], d["maxValue"]
    return [int(lo) if float(lo).is_integer() and name != "TimerConfig" else lo, int(hi) if name != "TimerConfig" else hi]


def params(cls, d, configs):
    """Los campos del prefab que usa el motor; los de contenedor de agua y las tasas del colector, si corresponde."""
    keys = list(ov.PARAMS.get(cls, [])) + (ov.CONVEYOR_PARAMS if cls == "IndustrialConveyor" else [])
    if cls in ov.LIQUID_CLASSES:
        keys += ov.LIQUID_PARAMS
    p = {k: d[k] for k in keys if k in d}
    rates = d.get("collectionRates")
    if cls == "WaterCatcher" and rates:
        r = next(x["data"] for x in configs["WaterCatcherCollectRate"] if x["data"]["m_Name"] == rates["name"])
        p.update({f"rate_{k}": r[k] for k in ("baseRate", "rainRate", "snowRate", "fogRate")})
    return p


def category(cls, d):
    if d.get("ioType") == FLUID or cls in ov.WATER_CLASSES:
        return "water"
    if d.get("ioType") == INDUSTRIAL:
        return "industrial"
    return ov.CATEGORY.get(cls, "appliance")


def powerline_pole(by_path):
    """
    El poste de tendido eléctrico de Power Trip (6/8/2026). No es un objeto: es el prefab estático
    `powergrid_powerline_io.static.prefab` (`PowergridIOAccessPoint`, 6 salidas). Lo que da sale del código del servidor
    dedicado (build 25823813): `PowergridManager.Server_GetCurrentPowerlineEnergy` = `(int) Lerp(5, 50, (F − 1) / 19)`
    con F fusibles pesados en la central (0 sin fusibles), repartido entre las salidas conectadas; en el editor se elige
    F (`PowerlinePole` en `sources.ts`). Ícono prestado del fusible de alto grado (no hay uno propio).
    """
    e = by_path[ov.POWERLINE_POLE]
    d = e["data"]
    return {
        "id": "powerline.pole", "cls": e["class"], "cat": "source", "io": d.get("ioType", 0), "icon": "fuse.highgrade",
        "name": {"en": "Powerline pole", "es": "Poste de tendido eléctrico"}, "slug": None, "slugEs": None,
        "in": slots(d.get("inputs", [])), "out": slots(d.get("outputs", [])), "use": 0, "useSrc": "code", "gen": 50,
        "p": {}, "craft": [],
    }


def load_ind(name):
    return json.loads((IND / f"{name}.json").read_text(encoding="utf-8"))


def by_root(entries):
    """La instancia que es la raíz de su prefab (no las copias puestas en los monumentos)."""
    return {e["ctx"]["go"]: e["data"] for e in entries if e["ctx"].get("go", "").startswith("assets/") and e["ctx"].get("root") == e["ctx"]["go"]}


def containers(by_path, items, names):
    """Cajas y hornos con el adaptador puesto: los enchufes del adaptador y el inventario de su contenedor."""
    ad = by_path[ov.ADAPTOR]["data"]
    deploys = load_ind("deploys")
    boxes, ovens = by_root(load_ind("BoxStorage")), by_root(load_ind("BaseOven"))
    sid_of_go = {i["go"]: i["sid"] for i in load_ind("items")}
    out = []
    for sid in ov.CONTAINERS:
        path = deploys[sid]["deploy"]
        site = items[sid]
        if path in ovens:
            d = ovens[path]
            cls = "BaseOven"
            p = {k: d[k] for k in ov.OVEN_PARAMS}
            p["slots"] = d["inventorySlots"]
            p["cookingTemperature"] = ov.OVEN_TEMPERATURE[d["temperature"]]
            fuel = sid_of_go.get((d.get("fuelType") or {}).get("go"))
            fuel_type = fuel
        else:
            d = boxes[path]
            cls = "BoxStorage"
            p = {"slots": d["inventorySlots"]}
            fuel_type = None
        c = {
            "id": sid, "cls": cls, "cat": "industrial", "io": ad.get("ioType", 0),
            "name": site["name"], "slug": site["slug"], "slugEs": site["slugEs"],
            "in": slots(ad["inputs"]), "out": slots(ad["outputs"]), "use": 0, "useSrc": "code",
            "p": p, "adaptor": True,
            "craft": [{"id": g["id"], "amount": g["amount"]} for g in (site.get("craft") or {}).get("ingredients", [])],
        }
        if fuel_type:
            c["fuel"] = fuel_type
        for g in c["craft"]:
            names[g["id"]] = items[g["id"]]["name"] if g["id"] in items else {"en": g["id"], "es": None}
        out.append(c)
    return out


def industrial_items(site_items):
    """
    Lo que la red industrial necesita de cada objeto: pila, categoría, si se funde (`ItemModCookable`: en qué, cuánto,
    en cuánto tiempo y a qué temperatura), si es combustible (`ItemModBurnable`) y su receta (para el crafteador).
    """
    ind = {i["sid"]: i for i in load_ind("items")}
    sid_of_go = {i["go"]: i["sid"] for i in ind.values()}
    cook = {}
    for e in load_ind("ItemModCookable"):
        go = e["ctx"].get("go")
        if go in sid_of_go and e["data"].get("becomeOnCooked"):
            d = e["data"]
            cook[sid_of_go[go]] = {"into": sid_of_go.get(d["becomeOnCooked"].get("go")), "n": d["amountOfBecome"],
                                   "time": d["cookTime"], "low": d["lowTemp"], "high": d["highTemp"]}
    burn = {}
    for e in load_ind("ItemModBurnable"):
        go = e["ctx"].get("go")
        if go in sid_of_go:
            d = e["data"]
            burn[sid_of_go[go]] = {"fuel": d["fuelAmount"], "by": sid_of_go.get((d.get("byproductItem") or {}).get("go")),
                                   "byN": d["byproductAmount"], "byChance": d["byproductChance"]}
    out = {}
    for i in site_items.values():
        if not i.get("slug"):
            continue
        sid = i["id"]
        row = {"stack": (ind.get(sid) or {}).get("stackable") or i.get("stack") or 1, "cat": i["category"],
               "name": i["name"]}
        if sid in cook and cook[sid]["into"]:
            row["cook"] = cook[sid]
        if sid in burn:
            row["burn"] = burn[sid]
        cr = i.get("craft")
        if cr:
            row["craft"] = {"in": [[g["id"], g["amount"]] for g in cr["ingredients"]], "n": cr["amount"], "time": cr["time"],
                            "wb": cr["workbench"]}
        out[sid] = row
    return dict(sorted(out.items()))


def build():
    prefabs = json.loads(PREFABS.read_text(encoding="utf-8"))
    configs = json.loads(CONFIGS.read_text(encoding="utf-8"))
    items = {i["id"]: i for i in json.loads(ITEMS.read_text(encoding="utf-8"))["items"]}
    by_path = {e["ctx"]["go"]: e for e in prefabs}
    comps, names, seen = [], {}, set()
    for e in prefabs:
        cls, d = e["class"], e["data"]
        deploy = [i for i in e.get("items", []) if i.get("as") == "deploy" and not i.get("hidden")]
        if not deploy or cls in ov.EXCLUDE:
            continue
        ins, outs = slots(d.get("inputs", [])), slots(d.get("outputs", []))
        if not any(s["t"] in NETS for s in ins + outs):
            continue
        for it in deploy:
            sid = it["sid"]
            if sid in ov.EXCLUDE_ITEMS or sid in seen:
                continue
            seen.add(sid)
            site = items.get(sid)
            use, src = consumption(cls, d)
            c = {
                "id": sid, "cls": cls, "cat": category(cls, d), "io": d.get("ioType", 0),
                "name": site["name"] if site else it["name"],
                "slug": site["slug"] if site else None, "slugEs": site["slugEs"] if site else None,
                "in": ins, "out": [dict(s) for s in outs], "use": use, "useSrc": src,
                "p": params(cls, d, configs),
            }
            gen = generation(cls, d)
            if gen is not None:
                c["gen"] = gen
            rng = {}
            for k, r in ov.RANGES.get(cls, {}).items():
                rng[k] = config_range(configs, r) if isinstance(r, str) else r
            if rng:
                c["range"] = rng
            craft = (site or {}).get("craft")
            c["craft"] = [{"id": g["id"], "amount": g["amount"]} for g in craft["ingredients"]] if craft else []
            for g in c["craft"]:
                gi = items.get(g["id"])
                names[g["id"]] = gi["name"] if gi else {"en": g["id"], "es": None}
            # El purificador deja el agua dulce en otra entidad (`storagePrefab`, su depósito) que tiene el "Water Out":
            # va como componente oculto y sus salidas se muestran en el purificador (`v` = índice en el hijo).
            child = (d.get("storagePrefab") or {}).get("prefab")
            if child and child in by_path:
                ce = by_path[child]
                cid = f"{sid}#storage"
                cd = ce["data"]
                comps.append({
                    "id": cid, "cls": ce["class"], "cat": "water", "io": cd.get("ioType", 0), "hidden": True,
                    "name": c["name"], "slug": None, "slugEs": None,
                    "in": slots(cd.get("inputs", [])), "out": slots(cd.get("outputs", [])),
                    "use": consumption(ce["class"], cd)[0], "useSrc": consumption(ce["class"], cd)[1],
                    "p": params(ce["class"], cd, configs), "craft": [],
                })
                c["child"] = cid
                c["out"] += [{**o, "v": i} for i, o in enumerate(slots(cd.get("outputs", [])))]
            comps.append(c)
    comps.append(powerline_pole(by_path))
    comps += containers(by_path, items, names)
    order = {k: i for i, k in enumerate(ov.CATEGORIES)}
    comps.sort(key=lambda c: (order[c["cat"]], c["name"]["en"].lower(), c["id"]))
    for w in ("water", "water.salt"):
        names[w] = items[w]["name"]
    return {"categories": ov.CATEGORIES, "components": comps, "names": dict(sorted(names.items()))}


def items_view(doc):
    """Por shortname: enchufes (nombre y tipo), consumo y generación. Sólo lo eléctrico que tiene ficha de Objetos."""
    out = {}
    for c in doc["components"]:
        # Las cajas y hornos van con el adaptador puesto: en su ficha no tiene sentido mostrar los enchufes del adaptador.
        if not c["slug"] or c.get("hidden") or c.get("adaptor"):
            continue
        row = {"in": [[s["n"], s["t"]] for s in c["in"]], "out": [[s["n"], s["t"]] for s in c["out"]], "use": c["use"]}
        if "gen" in c:
            row["gen"] = c["gen"]
        if c["cls"] == "ElectricBattery":
            row["bat"] = [c["p"]["maxOutput"], round(c["p"]["maxCapactiySeconds"] / 60)]
        out[c["id"]] = row
    return out


def main():
    doc = build()
    OUT.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    OUT_ITEMS.write_text(json.dumps(items_view(doc), ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    site = {i["id"]: i for i in json.loads(ITEMS.read_text(encoding="utf-8"))["items"]}
    OUT_IND.write_text(json.dumps(industrial_items(site), ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"[electricity] {len(doc['components'])} componentes en {OUT}")


if __name__ == "__main__":
    main()
