"""
Monumentos a la caché (`games/rust/cache/world/`), 2026-10-08. Ver `cache_dump.py`.

Los monumentos viven en `Bundles/shared/assetscenes.bundle`, en las escenas `AssetScene-monument.N` (qué monumento va
en cada escena lo dice `Bundles/AssetSceneManifest.json`, que se copia tal cual); `monuments.bundle` sólo trae mallas
y texturas. Escribe:
  - `world/monuments.json`: cada `MonumentInfo` (nombre oficial en/es por `displayPhrase`, `Type`, `Tier`, tamaño
    mínimo de mapa, zona segura, ícono del mapa) junto con su `Monument` (tamaño, radio) y el censo de lo que tiene
    adentro: cuántas entidades de cada clase (recicladoras, lectores de tarjeta, puertas, NPC, tiendas...);
  - `world/classes/<Clase>.json`: el typetree entero de cada instancia de las clases de `CLASSES` (lectores de
    tarjeta, reinicio de puzzles, radiación, zonas seguras, recicladoras, generadores de NPC, apartamentos, tiendas
    alquilables, clanes, generación del mapa...), con el monumento y la posición dentro;
  - `world/entities.json`: todas las entidades (clases con `prefabID`) colocadas dentro de cada monumento (y de las
    piezas de monumento de la escena de props: `assets/scenes/prefabs/...`), sólo
    con contexto, clase y nombre, para contar o ubicar lo que no tenga clase propia en `CLASSES`;
  - `world/map_icons/<nombre>.png`: los íconos de mapa de los monumentos (`MonumentInfo.mapIcon`).

Lo que el cliente NO trae: los `SpawnGroup` de las cajas y los NPC de cada monumento (el servidor los arma), así que el
botín por monumento no sale de acá; ver el README de la caché.

Uso, desde la raíz del repo (~4 min, ~12 GB de RAM; uno por vez):
    python games/rust/tools/extract_world.py
"""
import re
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from cache_dump import CACHE, Dumper, rss_gb, write_json  # noqa: E402
from extract import BUNDLES, read_content, text_of  # noqa: E402

CLASSES = {
    # monumento y mapa
    "MonumentInfo", "Monument", "MonumentSign", "MonumentNode", "MonumentMarker", "MonumentBlocker",
    "PlaceMonuments", "PlaceMonumentsOffshore", "PlaceMonumentsRoadside", "ProcessMonumentNodes", "ScriptableWorldConfig",
    "PointOfInterestMapMarker", "StaticMapMarker", "DeepSeaFloatingCityMapMarker", "GhostShipMapMarker",
    "TerrainConfig", "WorldPositionGenerator", "DungeonGridInfo", "DungeonBaseTransition", "BunkerEntrance",
    # peligros y zonas
    "TriggerRadiation", "TwoTierRadiationZoneBox", "TwoTierRadiationZoneSphere", "RadiationSphere", "TriggerSafeZone",
    "TriggerSafeZoneOverride", "DynamicSafeZoneArea", "TriggerBanditZone", "TriggerHostileWarningZone",
    "TriggerNoRespawnZone", "TriggerMonumentIOArea", "PreventBuildingMonumentTag",
    # puzzles y acceso
    "CardReader", "PuzzleReset", "PuzzleResetObject", "PressButton", "PressButton_TrainTunnel", "SwapKeycard",
    "ItemModKeycard", "ItemBasedFlowRestrictor", "DoorManipulator", "ElectricGenerator", "ElectricSwitch",
    "PowergridFuseBox", "SlidingProgressDoor", "TimerSwitch", "Elevator", "ElevatorStatic",
    # servicios
    "Recycler", "RecyclerConfig", "NPCVendingMachine", "InvisibleVendingMachine", "NPCShopKeeper", "VehicleVendor",
    "VendorList", "VendorListing", "SingleVendor", "LivestockVendor", "ModularVehicleShopFront", "Telephone",
    "WaterWell", "RespawnableLootFridge", "StaticRespawnArea", "Workbench", "RepairBench", "ResearchTable",
    "MixingTable", "ComputerStation", "CCTV_RC", "CH47DropZone", "CH47LandingZone", "HackableLockedCrate",
    "LootContainer", "SamSite", "NPCAutoTurret", "TravellingVendor", "TravellingVendorEvent",
    # NPC
    "NPCSpawner", "SpawnGroup", "Spawnable", "ConvarControlledSpawnPopulation", "DensitySpawnPopulation",
    "SpawnPointSpawnPopulation", "ScientistNPC", "ScientistNPC2", "ScientistBrain", "NPCMissionProvider",
    "NPCSimpleMissionProvider", "NPCApartmentSecurity", "NPCFarmAccess", "BanditGuard", "TunnelDweller",
    "UnderwaterDweller", "AIInformationZone",
    # Common Ground (2/7/2026): apartamentos, tiendas alquilables, clanes
    "ApartmentBuilding", "ApartmentDoor", "ApartmentElevatorLift", "ApartmentLock", "ApartmentMailbox", "ApartmentRoom",
    "ApartmentTerminal", "ApartmentUpkeepTerminal", "ApartmentVendor", "ItemModApartmentTax", "RentableShop",
    "RentableShopVendingMachine", "ShopFront", "ClanTable", "TriggerClanModify", "StampClanLogo", "ClanManager",
    # misiones
    "BaseMission", "MoveMission", "TutorialMission", "MissionManifest",
}


def monument_files(o):
    return o.assets_file.name.startswith("BuildPlayer-AssetScene-monument")


def census_files(o):
    """Las escenas de monumentos y la de props, donde viven las piezas que se suman a un monumento (la red eléctrica de
    la central, lo que mantienen los jugadores en el aeródromo, las tiendas alquilables)."""
    return monument_files(o) or o.assets_file.name == "BuildPlayer-AssetScene-props.other"


# En la escena de props, sólo cuentan las raíces de piezas de monumento.
SUB_PREFAB = ("assets/scenes/prefabs/", "assets/bundled/prefabs/autospawn/monument/")


def entity_classes(d):
    """Las clases que son entidades (`prefabID` en el typetree), con una instancia por clase."""
    first = {}
    for o in d.w.mono:
        cls = d.mono_class(o)
        if cls not in first:
            first[cls] = o
    out = set()
    for cls, o in first.items():
        try:
            if "prefabID" in d.w.tree(o):
                out.add(cls)
        except Exception:  # noqa: BLE001
            pass
    return out


def safe(name):
    return re.sub(r"[^A-Za-z0-9._-]+", "_", name)


def main():
    texts, _ = read_content()
    d = Dumper()
    print(f"[world] bundles abiertos, RAM {rss_gb()} GB", flush=True)
    (CACHE / "world").mkdir(parents=True, exist_ok=True)
    shutil.copy2(BUNDLES / "AssetSceneManifest.json", CACHE / "world" / "AssetSceneManifest.json")

    dumped = d.dump(CLASSES)
    for cls, entries in sorted(dumped.items()):
        write_json(f"world/classes/{cls}.json", entries)
    print(f"[world] {sum(len(v) for v in dumped.values())} instancias de {len(dumped)} clases; RAM {rss_gb()} GB", flush=True)

    ents = entity_classes(d)
    census, entities = {}, []
    for o, tt, cls in d.instances(ents, census_files):
        ctx = d.context(o, tt)
        root = ctx.get("root", "?")
        if not monument_files(o) and not root.startswith(SUB_PREFAB):
            continue
        census.setdefault(root, {}).setdefault(cls, 0)
        census[root][cls] += 1
        entities.append({"class": cls, "go": ctx.get("go"), "root": root, "local": ctx.get("local"),
                         "prefabID": tt.get("prefabID"), "file": ctx["file"], "pid": ctx["pid"]})
    write_json("world/entities.json", entities)
    print(f"[world] {len(entities)} entidades en monumentos; RAM {rss_gb()} GB", flush=True)

    # Los monumentos, con nombre e ícono.
    icons_dir = CACHE / "world" / "map_icons"
    icons_dir.mkdir(parents=True, exist_ok=True)
    mons_by_root = {}
    for e in dumped.get("Monument", []):
        mons_by_root.setdefault(e["ctx"].get("root"), []).append(e["data"])
    out, saved = [], set()
    for e, (o, tt, _) in zip(dumped.get("MonumentInfo", []), d.instances({"MonumentInfo"})):
        data = e["data"]
        tok = (data.get("displayPhrase") or {}).get("token") or ""
        icon = data.get("mapIcon")
        icon_file = None
        if icon and icon.get("ref"):
            x = d.w.obj(o, tt["mapIcon"])
            if x is not None:
                icon_file = safe(icon.get("name") or str(x.path_id)) + ".png"
                if icon_file not in saved:
                    try:
                        x.read().image.save(icons_dir / icon_file)
                        saved.add(icon_file)
                    except Exception as ex:  # noqa: BLE001
                        print(f"[world] no pude guardar el ícono {icon_file}: {ex}", file=sys.stderr)
                        icon_file = None
        root = e["ctx"].get("root")
        out.append({
            "root": root, "go": e["ctx"].get("go"), "file": e["ctx"]["file"], "token": tok,
            "name": {"en": text_of(texts, "en", tok) if tok else None, "es": text_of(texts, "es", tok) if tok else None,
                     "english": (data.get("displayPhrase") or {}).get("english")},
            "type": data.get("Type"), "tier": data.get("Tier"), "minWorldSize": data.get("MinWorldSize"),
            "safeZone": data.get("IsSafeZone"), "shouldDisplayOnMap": data.get("shouldDisplayOnMap"),
            "bounds": data.get("Bounds"), "mapIcon": icon_file, "monument": mons_by_root.get(root),
            "census": census.get(root, {}),
        })
    out.sort(key=lambda m: (m["root"] or "", m["go"] or ""))
    write_json("world/monuments.json", out)
    # Las raíces con entidades que no tienen MonumentInfo (sub-prefabs, cuevas, piezas de la red eléctrica).
    write_json("world/census_by_root.json", census)
    d.w.report_unresolved()
    print(f"[world] listo: {len(out)} monumentos, {len(saved)} íconos; RAM {rss_gb()} GB", flush=True)


if __name__ == "__main__":
    main()
