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
ELECTRIC = 0


def slots(raw):
    return [{"n": s["niceName"], "t": s["type"], "m": s["mainPowerSlot"]} for s in raw]


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


def build():
    prefabs = json.loads(PREFABS.read_text(encoding="utf-8"))
    configs = json.loads(CONFIGS.read_text(encoding="utf-8"))
    items = {i["id"]: i for i in json.loads(ITEMS.read_text(encoding="utf-8"))["items"]}
    comps, names, seen = [], {}, set()
    for e in prefabs:
        cls, d = e["class"], e["data"]
        deploy = [i for i in e.get("items", []) if i.get("as") == "deploy" and not i.get("hidden")]
        if not deploy or cls in ov.EXCLUDE:
            continue
        ins, outs = slots(d.get("inputs", [])), slots(d.get("outputs", []))
        if not any(s["t"] == ELECTRIC for s in ins + outs):
            continue
        for it in deploy:
            sid = it["sid"]
            if sid in ov.EXCLUDE_ITEMS or sid in seen:
                continue
            seen.add(sid)
            site = items.get(sid)
            use, src = consumption(cls, d)
            c = {
                "id": sid, "cls": cls, "cat": ov.CATEGORY.get(cls, "appliance"),
                "name": site["name"] if site else it["name"],
                "slug": site["slug"] if site else None, "slugEs": site["slugEs"] if site else None,
                "in": ins, "out": outs, "use": use, "useSrc": src,
                "p": {k: d[k] for k in ov.PARAMS.get(cls, []) if k in d},
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
            comps.append(c)
    order = {k: i for i, k in enumerate(ov.CATEGORIES)}
    comps.sort(key=lambda c: (order[c["cat"]], c["name"]["en"].lower(), c["id"]))
    return {"categories": ov.CATEGORIES, "components": comps, "names": dict(sorted(names.items()))}


def main():
    doc = build()
    OUT.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"[electricity] {len(doc['components'])} componentes en {OUT}")


if __name__ == "__main__":
    main()
