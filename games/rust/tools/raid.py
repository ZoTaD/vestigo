
"""
Los datos de la calculadora de raideo de Rust (2026-10-05). Diseño: docs/design/2026-10-05-rust.md.

Por cada objetivo (pared de cada grado, puertas, ventanas, muros externos, deployables) la vida y la protección del
juego, y por cada explosivo su daño y su costo. La cuenta es la del juego: daño por unidad = Σ por tipo de daño
(daño × (1 − protección)); golpes = ⌈vida ÷ daño por unidad⌉. Se escribe ya hecha (`dmg` por objetivo y explosivo) para
que el sitio sólo divida: la fórmula vive en un solo lugar.

No se cuenta el radio de la explosión (se supone pegado al objetivo) ni las fallas de la carga de mochila y la bean can
(el sitio las avisa aparte, con su probabilidad).

Lee assetscenes, content e items.preload con el `World` de `world.py` (~30 s) y `games/rust/data/items.json` (nombres,
slugs y recetas). Escribe `games/rust/data/raid.json`.

Uso, desde la raíz del repo:
    python games/rust/tools/raid.py
"""
import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from extract import DATA  # noqa: E402
from world import World  # noqa: E402

# El enum `DamageType` del juego: el índice en `ProtectionProperties.amounts`. Relevado el 2026-10-05 (BlockStone tiene
# Explosion 0,5 en el 16 y Bullet 0,99 en el 9).
BULLET = 9
# La parte de bala de la munición explosiva cuenta al 40 % contra construcciones. Calibrado con dos valores conocidos de
# la comunidad (pared de piedra 185 balas, de madera 49), que el 0,4 da exactos; el origen en el código del juego no se
# encontró. Contra chapa y blindado no cambia nada: la protección contra bala es 0,9999.
BULLET_ON_BUILDING = 0.4

# Los grados de construcción: (BuildingGrade.m_Name, nombre en/es, ícono). Todas las piezas tienen
# `healthMultiplier` 1,0, así que "pared" vale por piso, cimiento o marco del mismo grado (la página lo aclara).
GRADES = [
    ("twigs", ("Twig wall", "Pared de ramitas"), "wood"),
    ("wood", ("Wooden wall", "Pared de madera"), "wood"),
    ("stone", ("Stone wall", "Pared de piedra"), "stones"),
    ("metal", ("Sheet metal wall", "Pared de chapa"), "metal.fragments"),
    ("toptier", ("Armored wall", "Pared blindada"), "metal.refined"),
]
# Los objetivos que son un objeto: (shortname, tipo, prefab). El nombre y el ícono salen del objeto.
P = "assets/prefabs/"
TARGETS = [
    ("door.hinged.wood", "door", P + "building/door.hinged/door.hinged.wood.prefab"),
    ("door.hinged.metal", "door", P + "building/door.hinged/door.hinged.metal.prefab"),
    ("door.hinged.toptier", "door", P + "building/door.hinged/door.hinged.toptier.prefab"),
    ("door.double.hinged.wood", "door", P + "building/door.double.hinged/door.double.hinged.wood.prefab"),
    ("door.double.hinged.metal", "door", P + "building/door.double.hinged/door.double.hinged.metal.prefab"),
    ("door.double.hinged.toptier", "door", P + "building/door.double.hinged/door.double.hinged.toptier.prefab"),
    ("wall.frame.garagedoor", "door", P + "building/wall.frame.garagedoor/wall.frame.garagedoor.prefab"),
    ("floor.ladder.hatch", "door", P + "building/floor.ladder.hatch/floor.ladder.hatch.prefab"),
    ("wall.frame.shopfront.metal", "door", P + "building/wall.frame.shopfront/wall.frame.shopfront.metal.prefab"),
    ("wall.window.bars.metal", "window", P + "building/wall.window.bars/wall.window.bars.metal.prefab"),
    ("wall.window.bars.toptier", "window", P + "building/wall.window.bars/wall.window.bars.toptier.prefab"),
    ("wall.window.glass.reinforced", "window", P + "building/wall.window.reinforcedglass/wall.window.glass.reinforced.prefab"),
    ("shutter.metal.embrasure.a", "window", P + "building/wall.window.embrasure/shutter.metal.embrasure.a.prefab"),
    ("wall.external.high", "external", P + "building/wall.external.high.wood/wall.external.high.wood.prefab"),
    ("wall.external.high.stone", "external", P + "building/wall.external.high.stone/wall.external.high.stone.prefab"),
    ("gates.external.high.wood", "external", P + "building/gates.external.high/gates.external.high.wood/gates.external.high.wood.prefab"),
    ("gates.external.high.stone", "external", P + "building/gates.external.high/gates.external.high.stone/gates.external.high.stone.prefab"),
    ("cupboard.tool", "deployable", P + "deployable/tool cupboard/cupboard.tool.deployed.prefab"),
    ("autoturret", "deployable", P + "npc/autoturret/autoturret_deployed.prefab"),
    ("wall.frame.cell", "deployable", P + "building/wall.frame.cell/wall.frame.cell.prefab"),
    ("wall.frame.cell.gate", "deployable", P + "building/wall.frame.cell/wall.frame.cell.gate.prefab"),
    ("floor.grill", "deployable", P + "building/floor.grill/floor.grill.prefab"),
    ("workbench3", "deployable", P + "deployable/tier 3 workbench/workbench3.deployed.prefab"),
    ("box.wooden.large", "deployable", P + "deployable/large wood storage/box.wooden.large.prefab"),
]
# Los explosivos, en el orden de la tabla: (shortname, prefab con `damageTypes`).
EXPLOSIVES = [
    ("explosive.timed", P + "tools/c4/explosive.timed.deployed.prefab"),
    ("ammo.rocket.basic", P + "ammo/rocket/rocket_basic.prefab"),
    ("ammo.rocket.hv", P + "ammo/rocket/rocket_hv.prefab"),
    ("explosive.satchel", P + "weapons/satchelcharge/explosive.satchel.deployed.prefab"),
    ("grenade.beancan", P + "weapons/beancan grenade/grenade.beancan.deployed.prefab"),
    ("ammo.rifle.explosive", P + "ammo/rifle/riflebullet_explosive.prefab"),
    ("ammo.grenadelauncher.he", P + "ammo/40mmgrenade/40mm_grenade_he.prefab"),
]
# Los intermedios que se abren al calcular el costo: el azufre está adentro de la pólvora, los explosivos y las bean cans
# (la carga de mochila lleva cuatro). Lo demás (tela, componentes, caños) se muestra tal cual.
EXPAND = {"gunpowder", "explosives", "grenade.beancan"}


def damage_per_unit(damage_types, prot):
    """Σ daño × (1 − protección) por tipo. `damage_types` es [(tipo, daño)]; `prot`, los 28 `amounts`."""
    return sum(amount * (1 - prot[t]) for t, amount in damage_types)


def hits(hp, dmg):
    """Cuántos hacen falta; `None` si no le hace daño. El −1e-9 evita que un 2,0000000001 por redondeo pida 3."""
    if dmg <= 0:
        return None
    return math.ceil(hp / dmg - 1e-9)


def craft_cost(sid, items, qty=1.0):
    """
    Lo que cuesta craftear `qty` unidades: {"raw": {id: cantidad}, "gunpowder": n, "time": segundos}, abriendo los
    intermedios de `EXPAND`. `gunpowder` cuenta toda la pólvora, también la que va adentro de los explosivos. `None` si
    el objeto no se craftea.
    """
    it = items.get(sid)
    c = it and it["craft"]
    if not c:
        return None
    crafts = qty / c["amount"]
    out = {"raw": {}, "gunpowder": 0.0, "time": crafts * c["time"]}
    for g in c["ingredients"]:
        n = g["amount"] * crafts
        if g["id"] == "gunpowder":
            out["gunpowder"] += n
        sub = craft_cost(g["id"], items, n) if g["id"] in EXPAND else None
        if sub:
            for k, v in sub["raw"].items():
                out["raw"][k] = out["raw"].get(k, 0.0) + v
            out["gunpowder"] += sub["gunpowder"]
            out["time"] += sub["time"]
        else:
            out["raw"][g["id"]] = out["raw"].get(g["id"], 0.0) + n
    return out


def rounded(cost):
    if cost is None:
        return None
    # Se redondea antes de mirar si tiene decimales: el ruido de coma flotante dejaba `650.0` en vez de `650`.
    r = lambda x: round(x, 2) if round(x, 2) % 1 else int(round(x, 2))  # noqa: E731
    return {
        "sulfur": r(cost["raw"].get("sulfur", 0)), "gunpowder": r(cost["gunpowder"]), "time": r(cost["time"]),
        "raw": {k: r(v) for k, v in sorted(cost["raw"].items())},
    }


# Las clases de los componentes que tienen la vida (`startHealth`/`baseProtection`) o el daño (`damageTypes`) de los
# prefabs de arriba. `World.behaviours` lee el typetree sólo de estas clases: pedirle todas leería 1,25 millones.
GAME_CLASSES = {
    "Door", "BuildingPrivlidge", "AutoTurret", "SimpleBuildingBlock", "Gate", "StabilityEntity", "ShopFront", "Workbench",
    "BoxStorage", "RFTimedExplosive", "TimedExplosive", "DudTimedExplosive", "Projectile",
}


def read_game(w):
    """Del juego: {grado: (vida, amounts)}, {prefab: (vida, amounts)}, {prefab: (damageTypes, dud)} y el radial de la bala."""
    grades = {}
    for o, tt, _ in w.behaviours({"BuildingGrade"}):
        if tt["m_Name"] in {g for g, _, _ in GRADES}:
            grades[tt["m_Name"]] = (tt["baseHealth"], w.tree(w.obj(o, tt["damageProtecton"]))["amounts"])
    wanted_targets = {path for _, _, path in TARGETS}
    wanted_ex = {path for _, path in EXPLOSIVES}
    targets, explosives = {}, {}

    def take(o, tt, path):
        if path in wanted_targets and "startHealth" in tt and path not in targets:
            prot = w.obj(o, tt["baseProtection"])
            targets[path] = (tt["startHealth"], w.tree(prot)["amounts"])
        if path in wanted_ex and "damageTypes" in tt and path not in explosives:
            explosives[path] = ([(d["type"], d["amount"]) for d in tt["damageTypes"]], round(tt.get("dudChance", 0) or 0, 3))

    # Sólo el prefab mismo: su GameObject raíz se llama con la ruta completa; las copias en escenas tienen nombre corto.
    for o, tt, _ in w.behaviours(GAME_CLASSES):
        take(o, tt, w.go_name(o, tt))

    # El daño radial de la bala explosiva vive en el objeto (items.preload): su dueño es el `ItemDefinition` del mismo
    # GameObject, por un índice armado una vez (como `world.item_prefabs`).
    sid_of = {(o.assets_file.name, tt["m_GameObject"]["m_PathID"]): tt["shortname"]
              for o, tt, _ in w.behaviours({"ItemDefinition"})}
    radial = None
    for o, tt, _ in w.behaviours({"ItemModProjectileRadialDamage"}):
        if sid_of.get((o.assets_file.name, tt["m_GameObject"]["m_PathID"])) == "ammo.rifle.explosive":
            d = tt["damage"]
            d = d[0] if isinstance(d, list) else d  # un `DamageTypeEntry`; por las dudas, también una lista de uno
            radial = (d["type"], d["amount"])
    missing = sorted((wanted_targets - set(targets)) | (wanted_ex - set(explosives)))
    if missing or len(grades) != len(GRADES) or radial is None:
        # Un prefab que falta suele tener la vida o el daño en una clase que no está en `GAME_CLASSES`: hay que buscarla
        # y sumarla. Recorrer todos los GameObject para encontrarla sola choca con la memoria, por eso se corta acá.
        raise SystemExit(f"faltan datos de raideo: prefabs {missing} (¿su clase falta en GAME_CLASSES?), "
                         f"grados {sorted(grades)}, radial {radial}")
    return grades, targets, explosives, radial


def collect():
    items = {i["id"]: i for i in json.loads((DATA / "items.json").read_text(encoding="utf-8"))["items"]}
    grades, prefab_targets, prefab_ex, radial = read_game(World())

    explosives = []
    damage_of = {}
    for sid, path in EXPLOSIVES:
        types, dud = prefab_ex[path]
        if sid == "ammo.rifle.explosive":
            # La bala al 40 % contra construcciones, más la explosión radial del objeto.
            types = [(t, a * BULLET_ON_BUILDING if t == BULLET else a) for t, a in types] + [radial]
        damage_of[sid] = types
        it = items[sid]
        explosives.append({"id": sid, "slug": it["slug"], "name": it["name"], "dud": dud, "cost": rounded(craft_cost(sid, items))})

    def dmg_map(prot):
        out = {}
        for sid, _ in EXPLOSIVES:
            d = damage_per_unit(damage_of[sid], prot)
            if d > 0:
                out[sid] = round(d, 3)
        return out

    targets = []
    for g, (en, es), icon in GRADES:
        hp, prot = grades[g]
        targets.append({"id": f"building.{g}", "kind": "building", "slug": None, "item": None, "icon": icon,
                        "name": {"en": en, "es": es}, "hp": int(hp), "dmg": dmg_map(prot)})
    for sid, kind, path in TARGETS:
        hp, prot = prefab_targets[path]
        it = items[sid]
        targets.append({"id": sid, "kind": kind, "slug": it["slug"], "item": sid, "icon": sid,
                        "name": {"en": it["name"]["en"], "es": it["name"]["es"]}, "hp": int(hp), "dmg": dmg_map(prot)})
    return {"explosives": explosives, "targets": targets}


def main():
    got = collect()
    (DATA / "raid.json").write_text(json.dumps(got, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"[rust] raideo: {len(got['targets'])} objetivos, {len(got['explosives'])} explosivos")


if __name__ == "__main__":
    main()
