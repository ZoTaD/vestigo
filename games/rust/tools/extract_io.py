"""
Electricidad, agua e industrial a la caché (`games/rust/cache/io/`), 2026-10-08. Ver `cache_dump.py`.

Una clase cuenta como componente IO si su typetree trae `inputs` y `outputs` (los campos de `IOEntity`): así entran
solas las clases nuevas de un parche. Escribe:
  - `io/classes.json`: las clases IO con sus campos propios (los que no son de `IOEntity`) y cuántas instancias hay;
  - `io/prefabs.json`: cada prefab IO (la raíz `assets/...prefab` de la escena de prefabs) con el typetree entero del
    componente IO (entradas/salidas con nombre y tipo, consumo, generación, capacidad, rango...), las clases de los
    otros componentes del mismo GameObject y los objetos que lo colocan (shortname, nombre en/es);
  - `io/monument_instances.json`: los componentes IO colocados dentro de los monumentos (lectores de tarjeta, cajas de
    fusibles, generadores de la red, botones, puertas), con el monumento y la posición;
  - `io/configs.json`: lo que acompaña (colores de cable, paneles de configuración del temporizador y el sensor
    sísmico, la red eléctrica de la isla y sus etapas, `ItemModChildIO`, el adaptador de almacenamiento, etc.);
  - `io/items.json`: los objetos de la categoría Electricidad (y los que colocan un prefab IO) con su typetree.

Uso, desde la raíz del repo (~2 min, ~12 GB de RAM; uno por vez):
    python games/rust/tools/extract_io.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from cache_dump import Dumper, rss_gb, write_json  # noqa: E402
from extract import read_content, text_of  # noqa: E402
from world import item_prefabs  # noqa: E402

# Lo que no es IOEntity pero hace falta para la pestaña: configuración, la red de la isla (Power Trip, 6/8/2026) y lo
# industrial.
CONFIG_CLASSES = {
    "WireColorSettings", "SeismicSensorConfig", "TimerConfig", "PowergridStageConfig", "PowergridFuseBox",
    "PowergridManager", "PowergridIOAccessPoint", "PowergridClientToggle", "PowergridEngineFx", "PowerlineNode",
    "PowerlinePowergridAccessPointSpawn", "PlacePowerlineObjects", "GeneratePowerlineLayout", "GeneratePowerlineTopology",
    "PathSequencePowerline", "PowerLineWireConnectionHelper", "TriggerMonumentIOArea", "ItemModChildIO",
    "ItemModConveyorOptions", "WorldModelItemFlowRestrictorConfig", "IOEntityUISlotEntry", "ElectricOven",
    "WaterCatcherCollectRate", "WireTool", "IOHandle", "NoPlayersIOReset", "WaterTreatmentFlowRateBroadcast",
    "OilSwitchBroadcast", "PowerBar", "IOEntityMovementChecker", "ItemModWiretool", "ItemModRFListener",
}
ELECTRICAL = 16


def io_classes(d):
    """Las clases con `inputs` y `outputs`, leyendo el typetree de una sola instancia por clase."""
    first = {}
    for o in d.w.mono:
        cls = d.mono_class(o)
        if cls not in first:
            first[cls] = o
    out, base = {}, None
    for cls, o in first.items():
        try:
            keys = list(d.w.tree(o).keys())
        except Exception:  # noqa: BLE001
            continue
        if "inputs" in keys and "outputs" in keys:
            out[cls] = keys
            if cls == "IOEntity":
                base = set(keys)
    return {c: [k for k in keys if k not in (base or set())] for c, keys in out.items()}


def main():
    texts, _ = read_content()
    d = Dumper()
    print(f"[io] bundles abiertos, RAM {rss_gb()} GB", flush=True)
    classes = io_classes(d)
    prefabs = item_prefabs(d.w, d.paths)
    by_prefab = {}
    for sid, p in prefabs.items():
        for what, path in p.items():
            by_prefab.setdefault(path, []).append({"sid": sid, "as": what})

    defs = {}
    for o, tt, _ in d.w.behaviours({"ItemDefinition"}):
        defs[tt["shortname"]] = (o, tt)

    def item_info(sid):
        o, tt = defs.get(sid, (None, None))
        if tt is None:
            return {"sid": sid}
        tok = tt["displayName"]["token"]
        dtok = tt["displayDescription"]["token"]
        return {"sid": sid, "hidden": bool(tt["hidden"]), "category": tt["category"],
                "name": {"en": text_of(texts, "en", tok) or tt["displayName"]["english"], "es": text_of(texts, "es", tok)},
                "desc": {"en": text_of(texts, "en", dtok) or tt["displayDescription"]["english"],
                         "es": text_of(texts, "es", dtok)}}

    pre, inst, counts = [], [], {}
    for o, tt, cls in d.instances(classes):
        counts[cls] = counts.get(cls, 0) + 1
        ctx = d.context(o, tt)
        entry = {"class": cls, "ctx": ctx, "data": d.plain(o, tt)}
        go = ctx.get("go", "")
        if go.startswith("assets/") and ctx.get("root") == go:
            entry["siblings"] = d.siblings(o, tt)
            entry["items"] = [{**item_info(x["sid"]), "as": x["as"]} for x in by_prefab.get(go, [])]
            pre.append(entry)
        else:
            inst.append(entry)
    pre.sort(key=lambda e: e["ctx"]["go"])
    print(f"[io] {len(pre)} prefabs IO, {len(inst)} instancias en escenas; RAM {rss_gb()} GB", flush=True)

    write_json("io/classes.json", {c: {"count": counts.get(c, 0), "ownFields": f} for c, f in sorted(classes.items())})
    write_json("io/prefabs.json", pre)
    write_json("io/monument_instances.json", inst)
    write_json("io/configs.json", d.dump(CONFIG_CLASSES))

    io_paths = {e["ctx"]["go"] for e in pre}
    wanted = {sid for sid, (_, tt) in defs.items() if tt["category"] == ELECTRICAL}
    wanted |= {x["sid"] for p in io_paths for x in by_prefab.get(p, [])}
    items = []
    for sid in sorted(wanted):
        o, tt = defs[sid]
        items.append({**item_info(sid), "prefabs": prefabs.get(sid, {}), "data": d.plain(o, tt)})
    write_json("io/items.json", items)
    d.w.report_unresolved()
    print(f"[io] listo: {len(classes)} clases, {len(items)} objetos; RAM {rss_gb()} GB", flush=True)


if __name__ == "__main__":
    main()
