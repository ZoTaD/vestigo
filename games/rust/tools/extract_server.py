"""
Rust: lo que sólo trae el servidor dedicado, a la caché `games/rust/cache/server/` (2026-10-09). Ver `cache_dump.py`.

El servidor (SteamCMD, app 258550; instalado fuera del repo, por defecto en `C:\\RustServer`, o en `RUST_SERVER_DIR`)
tiene los mismos tres bundles que el cliente (`Bundles/shared/assetscenes.bundle`, `content.bundle`,
`items.preload.bundle`) pero con lo que el cliente no lleva: los `SpawnGroup` de cada monumento (qué cajas y qué NPC
aparecen y cuántos), sus puntos de aparición y los `IndividualSpawner` (una entidad fija). Escribe:

  - `server/spawners.json`: cada grupo (`SpawnGroup` y sus subclases: `NPCSpawner`, `ScientistSpawner`,
    `AiLocationSpawner`, `JunkpileNPCSpawner`, `JunkPileWaterSpawner`, `GameModeSpawnGroup`) con su contexto (escena,
    raíz = el monumento o el prefab, posición), su typetree y `points`: cuántos puntos de aparición tiene adentro (el
    juego toma `GetComponentsInChildren<BaseSpawnPoint>()`, así que se cuentan los del GameObject y sus hijos);
  - `server/individual.json`: los `IndividualSpawner` (una entidad, siempre la misma);
  - `server/placed.json`: las cajas (`LootContainer` y parientes) y los NPC colocados tal cual en las escenas, sin
    grupo;
  - `server/npc_loot.json`: el botín de los científicos nuevos (`gen2/scientist2*.prefab`, los de las plataformas
    petroleras): no va en `HumanNPC.LootSpawnSlots` como el de los demás (`world.py`), sino en el estado de muerte de
    su `Scientist2FSM` (`dead.LootSpawnSlots`); se cuenta con las mismas funciones (`container_chances`), por ranura;
  - `server/code.json`: los valores por defecto que el servidor pone en código (alquiler de las tiendas, apartamentos,
    red eléctrica de Power Trip), leídos del `Assembly-CSharp.dll` del servidor con `server_code.ps1`;
  - `server/build.json`: el build del servidor (del `appmanifest`/`steam.inf`), para saber de cuándo es la caché.

Memoria: abre los tres bundles del servidor (~6 GB de pico; `content.bundle` del servidor pesa 1,4 GB). Uno por vez.

Uso, desde la raíz del repo (~2 min):
    python games/rust/tools/extract_server.py
"""
import json
import os
import subprocess
import sys
from pathlib import Path

SERVER = Path(os.environ.get("RUST_SERVER_DIR", r"C:\RustServer"))
# `world.World` abre los bundles de `RUST_DIR`: se apunta al servidor antes de importarlo.
os.environ["RUST_DIR"] = str(SERVER)
sys.path.insert(0, str(Path(__file__).resolve().parent))
from cache_dump import Dumper, rss_gb, write_json  # noqa: E402
from world import container_chances  # noqa: E402

# Los grupos que el servidor llena (todos heredan de `SpawnGroup`) y los puntos de aparición (`BaseSpawnPoint`).
GROUPS = {"SpawnGroup", "NPCSpawner", "ScientistSpawner", "AiLocationSpawner", "JunkpileNPCSpawner", "JunkPileWaterSpawner",
          "GameModeSpawnGroup"}
POINTS = {"GenericSpawnPoint", "SpaceCheckingSpawnPoint", "RadialSpawnPoint", "VehicleSpawnPoint"}
INDIVIDUAL = {"IndividualSpawner", "IndividualSpawnerNexusOnly"}
PLACED = {"LootContainer", "LockedByEntCrate", "HackableLockedCrate", "FreeableLootContainer", "LootContainerAchievement",
          "WhitelistLootContainer", "RespawnableLootFridge", "ScientistNPC", "ScientistNPC2", "TunnelDweller",
          "UnderwaterDweller", "ScarecrowNPC", "GingerbreadNPC", "BanditGuard", "NPCPlayer", "NPCAutoTurret",
          "BradleySpawner"}
FSM = "Scientist2FSM"
# Las clases cuyos valores por defecto en código hacen falta (ver `server_code.ps1`).
CODE = ["RentableShop", "ConVar.ApartmentCommands", "Powergrid", "ApartmentRoom"]


def scene(o):
    return o.assets_file.name.startswith("BuildPlayer-AssetScene")


def go_key(go_obj):
    return (go_obj.assets_file.name, go_obj.path_id)


def ancestors(d, tt, owner):
    """Los GameObject (archivo, path_id) del objeto y de todos sus padres, del más cercano al más lejano."""
    go = d.w.obj(owner, tt["m_GameObject"])
    if go is None:
        return []
    out = [go_key(go)]
    _, tr = d.transform_of(go)
    for _ in range(200):
        if tr is None:
            break
        t = tr.read()
        if not (t.m_Father and t.m_Father.m_PathID):
            break
        tr = t.m_Father.deref()
        out.append(go_key(tr.read().m_GameObject.deref()))
    return out


def server_build():
    """El build del servidor: `buildid` del appmanifest de SteamCMD si está, y la fecha del bundle de contenido."""
    info = {"dir": str(SERVER)}
    content = SERVER / "Bundles" / "shared" / "content.bundle"
    if content.exists():
        import datetime
        info["contentDate"] = datetime.date.fromtimestamp(content.stat().st_mtime).isoformat()
    for acf in (SERVER / "steamapps" / "appmanifest_258550.acf", Path(r"C:\SteamCMD\steamapps\appmanifest_258550.acf")):
        if acf.exists():
            import re
            m = re.search(r'"buildid"\s+"(\d+)"', acf.read_text(encoding="utf-8", errors="replace"))
            if m:
                info["buildid"] = int(m.group(1))
            break
    return info


def fsm_loot(d, o, tt):
    """El botín de un científico nuevo: `dead.LootSpawnSlots` de su FSM, como lo cuenta `world.collect_npcs`."""
    slots = (tt.get("dead") or {}).get("LootSpawnSlots") or []
    res = {"lootDefinition": None, "maxDefinitionsToSpawn": 0, "scrapAmount": 0, "LootSpawnSlots": [
        {"definition": d.w.spawn_tree(o, s["definition"]), "numberToSpawn": s["numberToSpawn"], "probability": s["probability"]}
        for s in slots if not s.get("onlyWithLoadoutNamed")
    ]}
    got = container_chances(res, lambda x: x, sum_slots=False)
    rows = [{"sid": sid, "bp": bp, "chance": round(p, 4), "min": lo, "max": hi}
            for (sid, bp), (p, lo, hi) in got.items() if round(p, 4) > 0]
    return sorted(rows, key=lambda r: (-r["chance"], r["sid"], r["bp"]))


def read_code():
    ps1 = Path(__file__).resolve().parent / "server_code.ps1"
    res = subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(ps1),
                          "-Server", str(SERVER), "-Types", ",".join(CODE)],
                         capture_output=True, text=True, encoding="utf-8", check=True)
    return json.loads(res.stdout)


def main():
    if not (SERVER / "Bundles" / "shared" / "content.bundle").exists():
        raise SystemExit(f"No encontré el servidor en {SERVER} (RUST_SERVER_DIR)")
    write_json("server/code.json", read_code())
    write_json("server/build.json", server_build())

    d = Dumper()
    print(f"[server] bundles abiertos, {rss_gb()} GB", flush=True)
    groups, points, individual, placed, npc_loot = [], [], [], [], {}
    for o, tt, cls in d.instances(GROUPS | POINTS | INDIVIDUAL | PLACED | {FSM}, scene):
        if cls == FSM:
            path = d.w.go_name(o, tt)
            if path.startswith("assets/"):  # el prefab; las copias en escenas dan lo mismo
                npc_loot[path] = fsm_loot(d, o, tt)
            continue
        if cls in POINTS:
            points.append((cls, ancestors(d, tt, o)))
            continue
        entry = {"class": cls, "ctx": d.context(o, tt), "data": d.plain(o, tt)}
        if cls in GROUPS:
            go = d.w.obj(o, tt["m_GameObject"])
            entry["_go"] = go_key(go) if go is not None else None
            groups.append(entry)
        elif cls in INDIVIDUAL:
            individual.append(entry)
        else:
            placed.append(entry)
    # Cada punto cuenta para el grupo más cercano hacia arriba (el del mismo GameObject o el de un padre).
    by_go = {}
    for g in groups:
        if g["_go"]:
            by_go.setdefault(g["_go"], []).append(g)
    orphans = 0
    for cls, chain in points:
        owner = next((by_go[k] for k in chain if k in by_go), None)
        if owner is None:
            orphans += 1
            continue
        for g in owner:
            g.setdefault("points", {}).setdefault(cls, 0)
            g["points"][cls] += 1
    for g in groups:
        g.pop("_go")
        g.setdefault("points", {})
    print(f"[server] {len(groups)} grupos, {len(points)} puntos ({orphans} sin grupo), {len(individual)} individuales, "
          f"{len(placed)} colocados; {rss_gb()} GB", flush=True)
    write_json("server/spawners.json", groups)
    write_json("server/individual.json", individual)
    write_json("server/placed.json", placed)
    write_json("server/npc_loot.json", dict(sorted(npc_loot.items())))
    d.w.report_unresolved()


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
