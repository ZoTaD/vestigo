"""
El mapa de Deadlock sacado del juego instalado → games/deadlock/data/map.json
y los íconos y retratos de site/public/deadlock/game/map/. El relieve de fondo
lo hace `map_relief.py`, aparte, porque pesa.

Qué hay en cada lugar (campamentos de la jungla, cajas, estatuas, vida
flotante, jefe del medio, objetivos, tiendas, tirolesas), cuánto aguanta,
cuánto da y a qué minuto aparece. Diseño: docs/design/2026-10-12-deadlock-mapa.md.

Uso (una vez por parche, en la PC que tiene el juego):
    python games/deadlock/tools/map_data.py --vrf <Source2Viewer-CLI.exe> [--cache <carpeta>]

Source2Viewer-CLI: github.com/ValveResourceFormat/ValveResourceFormat/releases
(cli-windows-x64.zip). Sólo LEE los paks del juego; no modifica nada.
Para calcar el minimapa hacen falta `numpy`, `Pillow` y `potracer`.
"""
import argparse, json, math, os, re, struct, subprocess, sys
from collections import Counter, defaultdict
from datetime import datetime, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
OUT_JSON = os.path.join(ROOT, "games", "deadlock", "data", "map.json")
OUT_IMG = os.path.join(ROOT, "site", "public", "deadlock", "game", "map")
GAME = r"C:/Program Files (x86)/Steam/steamapps/common/Deadlock/game/citadel"
MAP_VPK = GAME + "/maps/dl_midtown.vpk"
MAP_ENTS = "maps/dl_midtown/entities/default_ents.vents_c"
GAME_VPK = GAME + "/pak01_dir.vpk"

# `eneutraltroopertype` de cada punto de aparición → la unidad de `npc_units`.
# El 7 son los bichos de las alcantarillas (1 de vida, 1 alma): no van al mapa.
UNIT_BY_TYPE = {"1": "neutral_trooper_weak", "2": "neutral_trooper_normal", "3": "neutral_trooper_strong",
                "5": "npc_super_neutral", "6": "neutral_sinners_sacrifice"}
UNIT_SIZE = {"1": "weak", "2": "normal", "3": "strong", "5": "boss", "6": "vault"}
CAMP_KIND = {"neutral_camp_weak": "camp-small", "neutral_camp_medium": "camp-medium",
             "neutral_camp_strong": "camp-large", "neutral_camp_vaults": "vault",
             "neutral_camp_midboss": "midboss"}
BREAKABLE_KIND = {"citadel_breakable_prop_wooden_crate": "crate",
                  "citadel_breakable_prop_tough_crate": "crate",
                  "citadel_breakable_item_container": "statue"}
# Hasta dónde se busca el campamento de una criatura cuando el nombre no calza.
CAMP_RADIUS = 700.0


# ── Leer los volcados de Source 2 Viewer ────────────────────────────────────

def parse_entities(text):
    """El volcado de un `.vents_c`: una lista de diccionarios clave → texto."""
    out = []
    for block in re.split(r"\n====\d+====\n", text):
        ent = {}
        # Los valores de varias líneas (`pathnodes`) van entre comillas triples.
        for m in re.finditer(r'^(\S+)[ \t]+("""\n.*?\n"""|[^\n]*)$', block, re.M | re.S):
            ent[m.group(1)] = m.group(2).strip().strip('"').strip()
        if "classname" in ent:
            out.append(ent)
    return out


def vec(s):
    """`[ 1.0, 2.0, 3.0 ]` → (1.0, 2.0, 3.0)."""
    return tuple(float(x) for x in re.findall(r"-?\d+(?:\.\d+)?(?:[eE]-?\d+)?", s))


def parse_vdata(text):
    """
    Los bloques de primer nivel de un `.vdata` volcado, con sus campos simples.

    No es un lector de KV3 entero: alcanza con los escalares de primer nivel de
    cada bloque (vida, almas, tiempos) y con `_base`, que se resuelve en `field`.
    """
    blocks = {}
    for m in re.finditer(r"^\t(\w+) = \n\t\{\n(.*?)\n\t\}", text, re.M | re.S):
        fields = {}
        for f in re.finditer(r'^\t\t(\w+) = (?!\n)(.+)$', m.group(2), re.M):
            fields[f.group(1)] = f.group(2).strip().strip('"')
        blocks[m.group(1)] = fields
    return blocks


def field(blocks, name, key, default=None):
    """Un campo de un bloque, subiendo por `_base` hasta encontrarlo."""
    seen = set()
    while name in blocks and name not in seen:
        seen.add(name)
        if key in blocks[name]:
            return blocks[name][key]
        name = blocks[name].get("_base", "")
    return default


def num(x, default=0.0):
    try:
        return float(x)
    except (TypeError, ValueError):
        return default


# ── Armar el mapa ───────────────────────────────────────────────────────────

# La subclase de una criatura → su retrato en `panorama/images/npcs/neutrals/`.
# Los nombres no calzan uno a uno: el teatro es "stagehand", la biblioteca
# "book", y la más grande se llama "heavy" salvo en dos familias.
PORTRAIT_FAMILY = {"theater": "stagehand", "library": "book", "barrel_01": "barrel", "barrel_02": "barrel"}
PORTRAITS = {"barrel_heavy", "barrel_normal", "book_normal", "book_weak", "drain_creature_normal",
             "drain_creature_strong", "drain_creature_weak", "lantern_normal", "lantern_strong", "mushroom_heavy",
             "mushroom_normal", "plant_heavy", "plant_normal", "plant_weak", "specimen_normal", "specimen_weak",
             "stagehand_heavy", "stagehand_normal", "underground_heavy", "underground_normal"}


def portrait(sub):
    """`neutral_theater_strong` → `stagehand_heavy`; None si no hay retrato de esa criatura."""
    m = re.match(r"neutral_(.+)_(weak|normal|strong)$", sub or "")
    if not m:
        return None
    family = PORTRAIT_FAMILY.get(m.group(1), m.group(1))
    sizes = {"weak": ["weak", "normal"], "normal": ["normal", "weak"], "strong": ["strong", "heavy", "normal"]}[m.group(2)]
    return next((f"{family}_{z}" for z in sizes if f"{family}_{z}" in PORTRAITS), None)


def base_name(name):
    """`[PR#]1376238_amber_sewer_a1_neutrals` → `amber_sewer_a1_neutrals`."""
    return re.sub(r"^\[PR#\](\d+_)?", "", name or "")


def normalize(x, y, bound):
    """De coordenadas del mundo a 0..1 sobre el minimapa (la Y va invertida)."""
    return [round((x + bound) / (2 * bound), 4), round((bound - y) / (2 * bound), 4)]


def build(ents, misc, units, generic_text):
    by = defaultdict(list)
    for e in ents:
        by[e["classname"]].append(e)

    corners = [vec(e["origin"]) for e in by["citadel_minimap_boundary"]]
    bound = max(abs(c) for corner in corners for c in corner[:2]) if corners else 10752.0
    at = lambda e: normalize(*vec(e["origin"])[:2], bound)

    # Las criaturas, por campamento: primero por nombre, si no por cercanía.
    camps = [e for e in by["info_neutral_trooper_camp"] if e.get("subclass_name") in CAMP_KIND]
    by_name = {}
    for i, c in enumerate(camps):
        for key in (c.get("targetname"), c.get("campname")):
            if key:
                by_name[base_name(key)] = i
    members = defaultdict(Counter)
    for sp in by["info_neutral_trooper_spawn"]:
        t = sp.get("eneutraltroopertype")
        if t not in UNIT_BY_TYPE:
            continue
        i = by_name.get(base_name(sp.get("campname")))
        if i is None:
            x, y, z = vec(sp["origin"])[:3]
            near = min(range(len(camps)), key=lambda j: math.dist((x, y, z), vec(camps[j]["origin"])[:3]))
            if math.dist((x, y, z), vec(camps[near]["origin"])[:3]) > CAMP_RADIUS:
                continue
            i = near
        members[i][(t, sp.get("neutralsubclass") or UNIT_BY_TYPE[t])] += 1

    def unit_stats(t, sub):
        name = sub if sub in units else UNIT_BY_TYPE[t]
        return {
            # El jefe del medio no trae vida máxima: arranca con una y gana por minuto.
            "health": int(num(field(units, name, "m_nMaxHealth")) or num(field(units, name, "m_iStartingHealth"))),
            "healthGrowth": int(num(field(units, name, "m_iHealthGainPerMinute"))) if t == "5" else 0,
            "souls": num(field(units, name, "m_flGoldReward")),
            "growth": num(field(units, name, "m_flGoldRewardBonusPercentPerMinute")),
        }

    out_camps = []
    for i, c in enumerate(camps):
        sizes = Counter()
        health = souls = 0.0
        growth = 0.0
        health_growth = 0
        for (t, sub), n in members[i].items():
            s = unit_stats(t, sub)
            sizes[UNIT_SIZE[t]] += n
            health += s["health"] * n
            souls += s["souls"] * n
            growth = max(growth, s["growth"])
            health_growth += s["healthGrowth"] * n
        x, y = at(c)
        out_camps.append({
            "kind": CAMP_KIND[c["subclass_name"]],
            "x": x, "y": y,
            "units": dict(sorted(sizes.items())),
            # Qué criaturas son, de la más grande a la más chica: es el retrato que se muestra.
            "creatures": list(dict.fromkeys(
                portrait(sub) for (t, sub), _ in sorted(members[i].items(), key=lambda kv: -int(kv[0][0])) if portrait(sub))),
            "health": int(health),
            "souls": round(souls),
            "growth": growth,
            **({"healthGrowth": health_growth} if health_growth else {}),
        })

    kinds = {}
    for sub, kind in CAMP_KIND.items():
        kinds[kind] = {
            "group": "jungle",
            "initial": int(num(field(misc, sub, "m_iInitialSpawnDelayInSeconds"))),
            "respawn": int(num(field(misc, sub, "m_iSpawnIntervalInSeconds"))),
            "count": sum(1 for c in out_camps if c["kind"] == kind),
        }
        step = int(num(field(misc, sub, "m_iSpawnIntervalChange")))
        if step:
            kinds[kind]["respawnStep"] = step
            kinds[kind]["respawnMin"] = int(num(field(misc, sub, "m_iSpawnIntervalMin")))

    # Los rompibles reaparecen por grupo: la tabla está en `generic_data`.
    groups = [(int(a), int(b)) for a, b in re.findall(
        r"m_flInitialSpawnTime = (\d+)\s+m_flRespawnInterval = (\d+)",
        generic_text[generic_text.find("m_BreakableSpawnTimeDesc"):generic_text.find("m_BreakablePowerupLootParams")])]
    points = defaultdict(list)
    for e in by["citadel_breakable_prop"]:
        kind = BREAKABLE_KIND.get(e.get("subclass_name"))
        if not kind:
            continue
        g = int(num(e.get("breakable_spawn_group")))
        points[kind].append(at(e) + [g])
    for kind in ("crate", "statue"):
        kinds[kind] = {"group": "loot", "count": len(points[kind]),
                       "timers": [{"initial": a, "respawn": b} for a, b in groups]}
    # Lo que suelta una caja: almas base, lo que suma por minuto y con qué probabilidad.
    kinds["crate"]["souls"] = num(field(misc, "small_gold_pickup", "m_flGoldAmount"))
    kinds["crate"]["soulsPerMinute"] = num(field(misc, "small_gold_pickup", "m_flGoldPerMinuteAmount"))
    kinds["crate"]["dropChance"] = num(field(misc, "citadel_breakable_prop_wooden_crate", "m_flPowerupDropChance")) / 100

    for e in by["citadel_pickup_spawner"]:
        points["health"].append(at(e))
    first = by["citadel_pickup_spawner"][0] if by["citadel_pickup_spawner"] else {}
    delay = int(num(first.get("spawn_delay_override"), 180))
    kinds["health"] = {"group": "loot", "initial": delay, "respawn": delay, "count": len(points["health"])}

    for e in by["citadel_item_powerup_spawner"]:
        points["buff"].append(at(e))
    kinds["buff"] = {"group": "loot",
                     "initial": int(num(field(misc, "citadel_item_powerup_spawner", "m_flInitialSpawnTime"))),
                     "respawn": int(num(field(misc, "citadel_item_powerup_spawner", "m_flSpawnInterval"))),
                     "count": len(points["buff"])}

    # Los objetivos llevan su equipo: 2 es Hidden King, 3 es Archmother.
    def objectives(kind, classname, health_of):
        for e in by[classname]:
            points[kind].append(at(e) + [int(num(e.get("teamnumber")))])
        health = sorted({health_of(e) for e in by[classname]} - {0})
        kinds[kind] = {"group": "objectives", "count": len(points[kind])}
        if health:
            kinds[kind]["health"] = health[-1]

    objectives("walker", "npc_boss_tier2", lambda e: int(num(field(units, e.get("subclass_name"), "m_nMaxHealth"))))
    objectives("base-guardian", "npc_barrack_boss", lambda e: int(num(field(units, e.get("subclass_name"), "m_nMaxHealth"))))
    objectives("shrine", "destroyable_building", lambda e: int(num(e.get("building_health"))))
    # El Patrón tiene fases, cada una con su vida: una sola cifra mentiría.
    objectives("patron", "npc_boss_tier3", lambda e: 0)

    for e in by["trigger_item_shop"]:
        points["shop"].append(at(e))
    kinds["shop"] = {"group": "places", "count": len(points["shop"])}

    # Las tirolesas: cada nodo son nueve números y los tres primeros son su
    # posición relativa al origen del recorrido.
    ziplines = []
    for e in by["citadel_zipline_path"]:
        ox, oy = vec(e["origin"])[:2]
        nodes = re.findall(r"\[\s*((?:-?[\d.eE-]+,\s*){9})\]", e.get("pathnodes", ""))
        pts = []
        for n in nodes:
            v = vec(n)
            pts.append(normalize(ox + v[0], oy + v[1], bound))
        if len(pts) > 1:
            ziplines.append({"lane": int(num(e.get("lane_number"))), "points": pts})
    ziplines.sort(key=lambda z: z["lane"])

    return {
        "bound": bound,
        "kinds": kinds,
        "camps": out_camps,
        "points": {k: sorted(v) for k, v in sorted(points.items())},
        "ziplines": ziplines,
    }


# ── Sacar los archivos del juego ────────────────────────────────────────────

def vpk_file(path, want):
    """Los bytes de UN archivo de un VPK v2 de un solo archivo."""
    with open(path, "rb") as f:
        sig, ver, tree = struct.unpack("<III", f.read(12))
        assert sig == 0x55AA1234, "no es un VPK"
        head = 12
        if ver == 2:
            f.read(16)
            head = 28
        data = f.read(tree)
        pos = 0

        def cstr():
            nonlocal pos
            end = data.index(b"\0", pos)
            s = data[pos:end].decode("utf-8", "replace")
            pos = end + 1
            return s

        while True:
            ext = cstr()
            if not ext:
                break
            while True:
                d = cstr()
                if not d:
                    break
                while True:
                    name = cstr()
                    if not name:
                        break
                    _crc, preload, arch, off, length, _term = struct.unpack_from("<IHHIIH", data, pos)
                    pre = data[pos + 18:pos + 18 + preload]
                    pos += 18 + preload
                    if f"{d}/{name}.{ext}" == want:
                        assert arch == 0x7FFF, "el archivo está en otro pak"
                        f.seek(head + tree + off)
                        return pre + f.read(length)
    raise FileNotFoundError(want)


def extract(vrf, cache):
    os.makedirs(cache, exist_ok=True)
    ents_c = os.path.join(cache, "default_ents.vents_c")
    ents = os.path.join(cache, "default_ents.txt")
    if not os.path.exists(ents):
        print("Sacando las entidades del mapa…")
        with open(ents_c, "wb") as f:
            f.write(vpk_file(MAP_VPK, MAP_ENTS))
        subprocess.run([vrf, "-i", ents_c, "-o", ents, "-d"], check=True, stdout=subprocess.DEVNULL)
    if not os.path.exists(os.path.join(cache, "scripts", "misc.vdata")):
        print("Sacando las tablas del juego…")
        subprocess.run([vrf, "-i", GAME_VPK, "-o", cache, "-d", "-f", "scripts/", "-e", "vdata_c", "--threads", "4"],
                       check=True, stdout=subprocess.DEVNULL)
    if not os.path.isdir(os.path.join(cache, "panorama", "images", "minimap")):
        print("Sacando el minimapa…")
        subprocess.run([vrf, "-i", GAME_VPK, "-o", cache, "-d", "-f", "panorama/images/minimap/",
                        "-e", "vtex_c,vsvg_c", "--threads", "4"], check=True, stdout=subprocess.DEVNULL)
    if not os.path.isdir(os.path.join(cache, "panorama", "images", "npcs")):
        print("Sacando los retratos…")
        for path in ("panorama/images/npcs/", "panorama/images/hud/data_feed_golden_idol_png.vtex_c"):
            subprocess.run([vrf, "-i", GAME_VPK, "-o", cache, "-d", "-f", path, "-e", "vtex_c", "--threads", "4"],
                           check=True, stdout=subprocess.DEVNULL)
    return ents


# Las imágenes del juego que usa la pestaña: archivo de salida → archivo de `panorama/images/`.
# Los íconos del minimapa se agrandan (vienen de 20 px); los retratos se achican.
ICONS = {"camp-small": "minimap/neutral_small_psd", "camp-medium": "minimap/neutral_medium_psd",
         "camp-large": "minimap/neutral_large_psd", "vault": "minimap/neutral_vault_psd",
         "shop": "minimap/minimap_shop_psd", "health": "minimap/health_pad_psd"}
ART = {"midboss": "minimap/super_neutral_marker_psd", "statue": "hud/data_feed_golden_idol_png",
       "walker": "npcs/tier_2_boss_psd", "base-guardian": "npcs/tier_1_boss_psd", "shrine": "npcs/shield_generator_psd",
       "patron-2": "npcs/patron_hiddenking_psd", "patron-3": "npcs/patron_archmother_psd"}


def images(cache):
    """Íconos del minimapa y retratos de criaturas y objetivos → site/public/deadlock/game/map/."""
    from PIL import Image

    src = os.path.join(cache, "panorama", "images")
    os.makedirs(OUT_IMG, exist_ok=True)

    def load(rel):
        im = Image.open(os.path.join(src, rel + ".png")).convert("RGBA")
        return im.crop(im.getbbox())

    for name, rel in ICONS.items():
        im = load(rel)
        im.resize((im.width * 3, im.height * 3), Image.LANCZOS).save(os.path.join(OUT_IMG, name + ".webp"), quality=92, method=6)
    for name, rel in ART.items():
        im = load(rel)
        im.thumbnail((160, 160))
        im.save(os.path.join(OUT_IMG, name + ".webp"), quality=88, method=6)
    for slug in sorted(PORTRAITS):
        im = load(f"npcs/neutrals/neutral_{slug}_psd")
        im.thumbnail((160, 160))
        im.save(os.path.join(OUT_IMG, slug + ".webp"), quality=88, method=6)


def trace(mask):
    """Una máscara booleana → el `d` de un path SVG en coordenadas 0..1000."""
    import potrace  # `pip install potracer`

    scale = 1000.0 / mask.shape[0]
    p = lambda pt: f"{pt.x * scale:.1f} {pt.y * scale:.1f}"
    out = []
    # `alphamax` bajo: el mapa es de esquinas rectas, no de curvas.
    # potracer calca lo que vale 0: se le pasa la máscara al revés.
    for curve in potrace.Bitmap((~mask).astype("uint8") * 255).trace(turdsize=12, alphamax=0.45, opticurve=True, opttolerance=0.4):
        out.append(f"M{p(curve.start_point)}")
        for seg in curve.segments:
            if seg.is_corner:
                out.append(f"L{p(seg.c)}L{p(seg.end_point)}")
            else:
                out.append(f"C{p(seg.c1)} {p(seg.c2)} {p(seg.end_point)}")
        out.append("Z")
    return "".join(out)


def shape(cache):
    """
    El mapa propio: el minimapa del juego calcado a vectores.

    En la imagen del juego el suelo es opaco y tanto los edificios como el
    afuera son transparentes. Se calcan dos formas: el suelo (con los edificios
    como huecos) y la silueta entera (el suelo con los huecos rellenos), para
    poder pintar los edificios distinto del afuera.
    """
    import numpy as np
    from PIL import Image, ImageDraw

    src = os.path.join(cache, "panorama", "images", "minimap", "base", "minimap_midtown_mid_psd.png")
    ground = np.array(Image.open(src).convert("RGBA"))[:, :, 3] > 100
    # El afuera es lo transparente que se alcanza desde el borde.
    flood = Image.fromarray((~ground).astype("uint8") * 255).convert("L")
    padded = Image.new("L", (flood.width + 2, flood.height + 2), 255)
    padded.paste(flood, (1, 1))
    ImageDraw.floodfill(padded, (0, 0), 128)
    outside = np.array(padded)[1:-1, 1:-1] == 128
    return {"ground": trace(ground), "silhouette": trace(~outside)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--vrf", required=True, help="ruta a Source2Viewer-CLI.exe")
    ap.add_argument("--cache", default=os.path.join(ROOT, ".cache", "deadlock-map"))
    args = ap.parse_args()

    ents_path = extract(args.vrf, args.cache)
    read = lambda *p: open(os.path.join(args.cache, *p), encoding="utf-8", errors="replace").read()
    data = build(parse_entities(open(ents_path, encoding="utf-8", errors="replace").read()),
                 parse_vdata(read("scripts", "misc.vdata")),
                 parse_vdata(read("scripts", "npc_units.vdata")),
                 read("scripts", "generic_data.vdata"))
    data = {"generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%d"), **data, "shape": shape(args.cache)}
    with open(OUT_JSON, "w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, separators=(",", ":"))
    images(args.cache)

    for k, v in data["kinds"].items():
        print(f"  {k:14} {v}")
    print(f"  campamentos sin criaturas: {sum(1 for c in data['camps'] if not c['units'])}")
    print(f"  tirolesas: {[(z['lane'], len(z['points'])) for z in data['ziplines']]}")
    print(f"-> {os.path.relpath(OUT_JSON, ROOT)} ({os.path.getsize(OUT_JSON) / 1024:.0f} KB)")


if __name__ == "__main__":
    sys.exit(main())
