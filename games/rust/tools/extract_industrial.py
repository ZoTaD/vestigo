"""
Lo industrial a la caché (`games/rust/cache/industrial/`), 2026-10-09. Ver `cache_dump.py`.

Escribe `industrial/<Clase>.json` con el typetree entero de cada instancia de `CLASSES`: hornos (`BaseOven`, con
`smeltSpeed`, ranuras de combustible/entrada/salida, temperatura y `IndustrialMode`), crafteador industrial, cinta,
adaptador, cajas (`StorageContainer`, `BoxStorage`), y lo que hace falta para fundir: `ItemModCookable` (tiempo, temperatura y en qué
se convierte) e `ItemModBurnable` (cuánto dura el combustible y qué deja). Además `industrial/items.json`: shortname,
categoría, pila y el `GameObject` de cada `ItemDefinition`, para unir los mods con su objeto.

Uso, desde la raíz del repo (~2 min, ~12 GB de RAM; uno por vez):
    python games/rust/tools/extract_industrial.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from cache_dump import Dumper, rss_gb, write_json  # noqa: E402
from world import item_prefabs  # noqa: E402

CLASSES = {
    "BaseOven", "ElectricOven", "IndustrialCrafter", "IndustrialConveyor", "IndustrialStorageAdaptor", "StorageContainer",
    "ItemModCookable", "ItemModBurnable", "Locker", "DropBox", "BoxStorage",
}


def main():
    d = Dumper()
    print(f"[industrial] bundles abiertos, RAM {rss_gb()} GB", flush=True)
    dumped = d.dump(CLASSES)
    for cls, entries in sorted(dumped.items()):
        write_json(f"industrial/{cls}.json", entries)
    items = []
    for o, tt, _ in d.w.behaviours({"ItemDefinition"}):
        if o.assets_file.name.startswith("BuildPlayer"):
            continue  # las copias de la escena son iguales a las de items.preload
        go = d.context(o, tt).get("go")
        items.append({"sid": tt["shortname"], "go": go, "category": tt["category"], "stackable": tt["stackable"],
                      "hidden": bool(tt["hidden"])})
    items.sort(key=lambda i: i["sid"])
    write_json("industrial/items.json", items)
    # Qué prefab coloca cada objeto (la caja, el horno, el crafteador…), para unir los objetos con sus contenedores.
    write_json("industrial/deploys.json", {sid: p for sid, p in sorted(item_prefabs(d.w, d.paths).items())})
    print(f"[industrial] listo: {sum(len(v) for v in dumped.values())} instancias de {len(dumped)} clases, "
          f"{len(items)} objetos; RAM {rss_gb()} GB", flush=True)


if __name__ == "__main__":
    main()
