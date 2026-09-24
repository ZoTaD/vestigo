"""
Saca del Valheim instalado todo lo que muestra la sección.

  cd games/valheim && .venv/Scripts/python -m pipeline.extract

Se corre A MANO, una vez por parche (decisión de ZoTaD del 2026-09-24: los
parches de Valheim salen poco). Tarda ~1-2 min. Escribe `games/valheim/data/`
y los webp de `games/tft/ui/public/valheim/`.

Qué entra:
- Objetos: los de `ObjectDB.m_items` que tienen nombre traducido. Es la lista
  que el propio juego usa para saber qué existe; los ItemDrop sueltos que no
  están ahí son ataques de monstruos y piezas de prueba.
- Recetas: `ObjectDB.m_recipes` habilitadas.
- Piezas: las de cada `PieceTable` (martillo, azada, cultivador…), con la
  herramienta que las construye.
- Conversiones: `CookingStation`, `Fermenter` y `Smelter` (horno, fundición,
  alto horno, molino, rueca, refinería de eitr…).
- Criaturas: `Humanoid`/`Character` con `CharacterDrop`; su bioma sale de
  `SpawnSystemList` descartando las máscaras de 7+ biomas (eventos).
- Recolectables y minerales: los prefabs de la vegetación de `ZoneSystem` y de
  cada `LocationList` (ahí definen Mistlands, Ashlands y el Norte profundo su
  vegetación), con su `Pickable`, `MineRock5`, `MineRock`, `TreeBase` o
  `DropOnDestroyed`.
- Cultivos: cada `Plant` (brote del cultivador) con el recolectable en que se
  convierte; y la colmena (`Beehive`). Sus biomas son dónde se pueden plantar.
- Recolectables de ubicaciones: los `Pickable` que no están en ninguna lista de
  vegetación viven dentro de cuevas, criptas y ruinas (setas amarillas, larvas
  luminosas, helechos). Entran sin bioma: el juego los ubica por la ubicación,
  no por el bioma.
- Comerciantes: `Trader`. La Bruja del pantano trae el nombre vacío; se toma
  del prefab (`npc_bogwitch`).
- Los banquetes están duplicados con el mismo nombre; el que no tiene fuente
  toma la del otro (`share_by_name`).
"""
import json, os, re, sys, time
from datetime import datetime, timezone
from .unity import Game
from .loc import Loc, parse_localization
from .biomes import BIOMES, BIOME_ORDER, biomes_of, is_everywhere
from .records import item_record, recipe_record, requirements, drop_table, character_drops, trader_items, damage_mods
from .sources import build_sources, build_used_in, share_by_name

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.normpath(os.path.join(HERE, "..", "data"))
PUBLIC = os.path.normpath(os.path.join(HERE, "..", "..", "tft", "ui", "public", "valheim"))

CLASSES = {"ObjectDB", "ItemDrop", "Recipe", "Piece", "PieceTable", "CraftingStation", "CookingStation",
           "Fermenter", "Smelter", "Humanoid", "Character", "CharacterDrop", "SpawnSystemList", "ZoneSystem",
           "LocationList", "Pickable", "MineRock5", "MineRock", "TreeBase", "DropOnDestroyed", "Trader",
           "Plant", "Beehive", "TreeLog", "Destructible", "Container", "OfferingBowl", "ItemStand", "EnvMan",
           "StationExtension"}

# Los jefes en el orden en que se enfrentan, con su bioma. Es la única tabla
# escrita a mano del extractor: el juego sabe el bioma del altar por la
# ubicación, y las ubicaciones se cargan por referencia blanda (SoftRef), que
# este lector no resuelve. Ocho filas que no cambian entre parches.
BOSS_BIOME = {"Eikthyr": "meadows", "gd_king": "blackforest", "Bonemass": "swamp", "Dragon": "mountain",
              "GoblinKing": "plains", "SeekerQueen": "mistlands", "Fader": "ashlands", "FrozenKing": "deepnorth"}
# Arte de cada jefe: el de los logros del juego (bundle d59cfac).
BOSS_ART = {"Eikthyr": "eikthyr_sony", "gd_king": "elder_sony", "Bonemass": "bonemass_sony", "Dragon": "moder_sony",
            "GoblinKing": "yagluth_sony", "SeekerQueen": "queen_sony", "Fader": "fader_sony", "FrozenKing": "frozen_king_sony"}
# Ilustración de cada bioma (852×480, bundle d59cfac). El Norte profundo no
# tiene: se usa su logo.
BIOME_ART = {"biome_meadows": "meadows", "biome_blackforest": "blackforest", "biome_swamp": "swamp",
             "biome_mountain": "mountain", "biome_heath": "plains", "biome_ocean": "ocean",
             "biome_mistlands": "mistlands", "biome_ashlands": "ashlands", "Valheim_DeepNorth_Logo": "deepnorth"}

# Pistas de bioma por nombre, para lo que vive en las salas de una mazmorra
# (prefabs aparte, sin ubicación que diga el bioma) y los cofres sueltos.
# De lo más específico a lo más general; "shipwreck" es costa: queda sin bioma.
NAME_BIOME = [("forestcrypt", "blackforest"), ("fcrypt", "blackforest"), ("trollcave", "blackforest"),
              ("sunkencrypt", "swamp"), ("mountaincave", "mountain"), ("frostcave", "mountain"),
              ("dvergr", "mistlands"), ("infested", "mistlands"), ("mistlands", "mistlands"),
              ("charred", "ashlands"), ("morgen", "ashlands"), ("ashland", "ashlands"),
              ("deepnorth", "deepnorth"), ("morkhalla", "deepnorth"),
              # El lino y la cebada silvestres de las aldeas de fulings.
              ("pickable_flax", "plains"), ("pickable_barley", "plains"), ("heath", "plains"), ("goblin", "plains"), ("plains", "plains"),
              ("blackforest", "blackforest"), ("swamp", "swamp"), ("mountain", "mountain"), ("meadows", "meadows")]


BIT_OF = {bid: bit for bit, bid, _ in BIOMES}
EXTRA_GATHER = {"GuckSack": "swamp", "GuckSack_small": "swamp", "giant_brain": "mistlands",
                "LeviathanLava": "ashlands", "MineRock_Meteorite": "ashlands", "Beehive": "meadows"}


def hint_biome(*names: str) -> int:
    for n in names:
        low = (n or "").lower()
        for key, bid in NAME_BIOME:
            if key in low:
                return BIT_OF[bid]
    return 0


# Personalización (barbas y peinados): son "objetos" para el juego pero no se
# consiguen ni se usan; eran 114 sin ícono.
CUSTOMIZATION = 10


def dump(name: str, obj) -> None:
    os.makedirs(DATA, exist_ok=True)
    with open(os.path.join(DATA, name), "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1, sort_keys=True)


class Icons:
    """Exporta cada sprite una sola vez, por nombre, a webp."""

    def __init__(self, game: Game, folder: str):
        self.game, self.folder, self.done = game, folder, set()
        os.makedirs(folder, exist_ok=True)

    def save(self, file, pptr) -> str | None:
        name = self.game.sprite_name(file, pptr)
        if not name:
            return None
        slug = name.lower().replace(" ", "_")
        if slug not in self.done:
            img = self.game.sprite_image(file, pptr)
            if img is None:
                return None
            img.save(os.path.join(self.folder, f"{slug}.webp"), "WEBP", quality=90, method=6)
            self.done.add(slug)
        return slug


# Los gráficos de interfaz que usa la sección (bundle 9fe0899c). Lista cerrada a
# propósito: son ~30 de 246 y cada uno que se sume tiene que tener un uso.
UI_SPRITES = [
    "woodpanel_crafting", "woodpanel_info", "woodpanel_400_tileable", "woodpanel_512x512", "woodpanel_flik",
    "woodpanel_trophys", "button", "button_highlight", "button_pressed", "button_disabled", "button_tab",
    "button_tab_hover", "button_tab_selected", "item_bkg", "item_bkgh", "item_background", "item_background_sunken",
    "panel_bkg_256", "panel_bkg_128", "panel_border_128", "panel_interior_bkg_128", "panel_separator",
    "selection_frame", "crafting_panel_bkg", "inv_bkg", "tabletop", "skill_bkg", "chest_bkg", "trophy_board",
]
OFL_FONTS = {"AveriaSerifLibre-Regular", "AveriaSerifLibre-Bold", "AveriaSansLibre-Regular", "AveriaSansLibre-Bold"}


def export_ui(g: Game) -> int:
    out = os.path.join(PUBLIC, "ui")
    os.makedirs(out, exist_ok=True)
    want, n = set(UI_SPRITES), 0
    for o in g.ui_sprites():
        s = o.read()
        if s.m_Name in want:
            s.image.save(os.path.join(out, f"{s.m_Name}.webp"), "WEBP", lossless=True)
            want.discard(s.m_Name)
            n += 1
    if want:
        print("⚠ sprites de interfaz que no aparecieron:", sorted(want))
    return n


def export_fonts(g: Game) -> int:
    """Sólo Averia (OFL). Norse queda afuera hasta confirmar su licencia."""
    out = os.path.join(PUBLIC, "fonts")
    os.makedirs(out, exist_ok=True)
    hechas = set()
    for o in g.env.objects:
        if o.type.name != "Font":
            continue
        f = o.read()
        if f.m_Name in OFL_FONTS and f.m_Name not in hechas and f.m_FontData:
            hechas.add(f.m_Name)
            with open(os.path.join(out, f"{f.m_Name}.ttf"), "wb") as fh:
                fh.write(bytes(f.m_FontData))
    return len(hechas)



def export_art(g: Game) -> int:
    """Las ilustraciones de los biomas y el arte de los jefes, para las guías."""
    out = os.path.join(PUBLIC, "art")
    os.makedirs(out, exist_ok=True)
    want = {**{k: f"biome_{v}" for k, v in BIOME_ART.items()}, **{v: f"boss_{k.lower()}" for k, v in BOSS_ART.items()}}
    n = 0
    for o in g.ui_sprites():
        s = o.read()
        if s.m_Name in want:
            s.image.save(os.path.join(out, f"{want.pop(s.m_Name)}.webp"), "WEBP", quality=85, method=6)
            n += 1
    if want:
        print("⚠ arte que no apareció:", sorted(want))
    return n


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    t0 = time.time()
    g = Game()
    g.index(CLASSES)
    loc = Loc({})
    for text in g.localization_texts():
        loc.table.update(parse_localization(text))
    icons = Icons(g, os.path.join(PUBLIC, "icons"))
    print(f"juego cargado ({g.unity_version}), {len(loc.table)} textos, {time.time() - t0:.0f}s")

    # --- ObjectDB: la que más objetos tiene es la del juego (hay 3 copias).
    odb = max(g.components("ObjectDB"), key=lambda c: len(c.tree["m_items"]))
    item_gos = {g.ref(odb.file, p) for p in odb.tree["m_items"]}
    recipe_keys = {g.ref(odb.file, p) for p in odb.tree["m_recipes"]}

    # --- Estaciones de crafteo: token → nombre e ícono.
    stations = {}
    station_by_key = {}
    for c in g.components("CraftingStation"):
        tok = c.tree["m_name"].lstrip("$")
        station_by_key[c.key] = tok
        if tok not in stations:
            stations[tok] = {"name": loc.t(tok), "icon": icons.save(c.file, c.tree.get("m_icon"))}

    # --- Objetos
    items = {}
    build_tables = {}   # clave de PieceTable → herramienta
    for c in g.components("ItemDrop"):
        if c.go not in item_gos:
            continue
        prefab = g.prefab(c.go)
        sh = c.tree["m_itemData"]["m_shared"]
        if sh["m_itemType"] == CUSTOMIZATION:
            continue
        icon = icons.save(c.file, sh["m_icons"][0]) if sh.get("m_icons") else None
        rec = item_record(prefab, sh, loc, icon)
        if rec:
            items[prefab] = rec
            bt = g.ref(c.file, sh.get("m_buildPieces"))
            if bt:
                build_tables[bt] = prefab

    # --- Recetas
    recipes = []
    for c in g.components("Recipe"):
        if c.key not in recipe_keys:
            continue
        r = recipe_record(c.tree, g.name_of_in(c.file), lambda p, f=c.file: station_by_key.get(g.ref(f, p)))
        if r and r["item"] in items:
            recipes.append(r)

    # --- Piezas, con la herramienta que las construye
    pieces = {}
    piece_categories = {}
    for t in g.components("PieceTable"):
        tool = build_tables.get(t.go) or build_tables.get(t.key)
        # Las pestañas del menú de cada herramienta. El martillo trae una
        # sin token ("DEEPNORTH"); se nombra con el bioma.
        labels = {}
        for cat, tok in zip(t.tree.get("m_categories", []), t.tree.get("m_categoryLabels", [])):
            labels[str(cat)] = loc.t(tok) or (loc.t("biome_deepnorth") if tok == "DEEPNORTH" else {"en": tok, "es": tok})
        if tool and labels:
            piece_categories[tool] = labels
        for p in t.tree["m_pieces"]:
            go = g.ref(t.file, p)
            # Las extensiones (especiero, yunques, telar…) suben de nivel la
            # estación que tengan cerca: cada una suma uno (pedido de ZoTaD,
            # 2026-09-24: ver en el caldero con qué se mejora).
            extends = next((station_by_key.get(g.ref(x.file, x.tree.get("m_craftingStation")))
                            for x in g.comps_on(go) if x.cls == "StationExtension"), None)
            for pc in g.comps_on(go):
                if pc.cls != "Piece":
                    continue
                name = loc.t(pc.tree["m_name"])
                if not name:
                    continue
                prefab = g.prefab(go)
                pieces[prefab] = {
                    "id": prefab, "name": name, "desc": loc.t(pc.tree.get("m_description")),
                    "icon": icons.save(pc.file, pc.tree.get("m_icon")), "tool": tool,
                    "category": pc.tree["m_category"], "comfort": pc.tree["m_comfort"] or None,
                    "station": station_by_key.get(g.ref(pc.file, pc.tree["m_craftingStation"])),
                    "requirements": [{"item": q["item"], "amount": q["amount"]} for q in requirements(pc.tree["m_resources"], g.name_of_in(pc.file))],
                    "extends": extends,
                }

    # --- Conversiones (sin repetir la misma estación con el mismo par)
    conversions, seen = [], set()
    for cls in ("CookingStation", "Fermenter", "Smelter"):
        for c in g.components(cls):
            st = c.tree["m_name"].lstrip("$")
            name_of = g.name_of_in(c.file)
            for cv in c.tree.get("m_conversion", []):
                frm, to = name_of(cv["m_from"]), name_of(cv["m_to"])
                if not frm or not to or (st, frm, to) in seen:
                    continue
                seen.add((st, frm, to))
                time_s = cv.get("m_cookTime") or (c.tree.get("m_fermentationDuration") if cls == "Fermenter" else c.tree.get("m_secPerProduct"))
                conversions.append({"station": st, "from": frm, "to": to, "time": time_s, "yield": cv.get("m_producedItems", 1)})
            if st not in stations:
                stations[st] = {"name": loc.t(st), "icon": None}

    # --- Criaturas y sus biomas
    # Una aparición con llave de jefe ("defeated_queen", "defeated_fader") es
    # una criatura de un bioma más avanzado que visita los anteriores de noche
    # después de ese jefe: no es fauna de la zona (el buscador salía "en las
    # Praderas", 2026-09-24). Cuenta como hábitat sólo si la criatura no
    # aparece en ningún lado sin llave.
    spawn_biomes: dict[str, set] = {}
    keyed_biomes: dict[str, set] = {}
    for c in g.components("SpawnSystemList"):
        for s in c.tree["m_spawners"]:
            if not s.get("m_enabled", 1) or is_everywhere(s["m_biome"]):
                continue
            name = g.prefab(g.ref(c.file, s["m_prefab"]))
            if name:
                keyed = (s.get("m_requiredGlobalKey") or "").startswith("defeated_")
                (keyed_biomes if keyed else spawn_biomes).setdefault(name, set()).update(biomes_of(s["m_biome"]))
    for name, bs in keyed_biomes.items():
        if name not in spawn_biomes:
            spawn_biomes[name] = set(bs)
    creatures = {}
    for cls in ("Humanoid", "Character"):
        for c in g.components(cls):
            prefab = g.prefab(c.go)
            name = loc.t(c.tree.get("m_name"))
            if not prefab or not name or prefab in creatures or prefab == "Player":
                continue
            drops = next((character_drops(d.tree, g.name_of_in(d.file)) for d in g.comps_on(c.go) if d.cls == "CharacterDrop"), [])
            drops = [d for d in drops if d["item"] in items]
            trophy = next((d["item"] for d in drops if items[d["item"]]["itemType"] == 13), None)
            creatures[prefab] = {"id": prefab, "name": name, "health": c.tree.get("m_health"), "boss": bool(c.tree.get("m_boss")),
                                 "biomes": sorted(spawn_biomes.get(prefab, []), key=BIOME_ORDER.index),
                                 "faction": c.tree.get("m_faction"), **damage_mods(c.tree.get("m_damageModifiers", {})),
                                 "drops": drops, "trophy": trophy, "icon": items[trophy]["icon"] if trophy else None}

    # --- Jefes: el altar dice qué se ofrece y cuántas; el soporte del trofeo,
    # qué poder deja.
    powers = {}
    for c in g.components("ItemStand"):
        gp = g.ref(c.file, c.tree.get("m_guardianPower"))
        o = g._objs.get(gp) if gp else None
        if o is None:
            continue
        t = o.read_typetree()
        for sup in c.tree.get("m_supportedItems", []):
            tro = g.name_of_in(c.file)(sup)
            if tro and tro not in powers:
                powers[tro] = {"name": loc.t(t.get("m_name")), "tooltip": loc.t((t.get("m_tooltip") or "").strip()),
                               "cooldown": t.get("m_cooldown")}
    bosses = {}
    for c in g.components("OfferingBowl"):
        no = g.name_of_in(c.file)
        bp = no(c.tree["m_bossPrefab"])
        if bp not in creatures or bp in bosses:
            continue
        cr = creatures[bp]
        cr["boss"] = True
        # Kall Fimbulbringer pelea en tres fases (FrozenKing, _p2, _p3) y el
        # botín lo suelta la última: se toma de la fase que lo tenga.
        if not cr["drops"]:
            phase = next((c for k, c in creatures.items() if k.startswith(bp + "_") and c["drops"]), None)
            if phase:
                cr["drops"], cr["trophy"], cr["icon"] = phase["drops"], phase["trophy"], phase["icon"]
        item, amount = no(c.tree["m_bossItem"]), c.tree["m_bossItems"]
        if not item and c.tree.get("m_useItemStands"):
            # Moder no se invoca en el altar: se ponen huevos en los soportes
            # que lo rodean (los que empiezan con `m_itemStandPrefix`).
            pre = c.tree.get("m_itemStandPrefix") or ""
            stands = {g.prefab(st.go): st for st in g.components("ItemStand")
                      if st.file is c.file and (g.prefab(st.go) or "").startswith(pre)}
            sup = [g.name_of_in(st.file)(x) for st in stands.values() for x in st.tree.get("m_supportedItems", [])]
            item, amount = (sup[0], len(stands)) if sup else (None, 0)
        bosses[bp] = {"id": bp, "name": cr["name"], "health": cr["health"], "biome": BOSS_BIOME.get(bp),
                      "order": list(BOSS_BIOME).index(bp) if bp in BOSS_BIOME else 99,
                      "summon": {"item": item if item in items else None, "amount": amount, "altar": loc.t(c.tree["m_name"])},
                      "power": powers.get(cr["trophy"]), "weak": cr["weak"], "resist": cr["resist"], "immune": cr["immune"],
                      "drops": cr["drops"], "trophy": cr["trophy"], "icon": cr["icon"],
                      "art": f"boss_{bp.lower()}" if bp in BOSS_ART else None}

    # --- Entornos por bioma: frío, congelante, mojado.
    env_flags, biome_envs = {}, {}
    for c in g.components("EnvMan") + g.components("LocationList"):
        for e in c.tree.get("m_environments", []):
            env_flags.setdefault(e["m_name"], {k: bool(e.get(f"m_is{k[0].upper()}{k[1:]}")) for k in ("cold", "freezing", "wet", "coldAtNight", "freezingAtNight")})
        for b in c.tree.get("m_biomes", []) + c.tree.get("m_biomeEnvironments", []):
            for bid in biomes_of(b["m_biome"]):
                biome_envs.setdefault(bid, set()).update(x["m_environment"] for x in b.get("m_environments", []))
    environments = {}
    for bid, envs in biome_envs.items():
        flags = [env_flags[e] for e in envs if e in env_flags]
        environments[bid] = {k: any(f[k] for f in flags) for k in ("cold", "freezing", "wet", "coldAtNight", "freezingAtNight")}
        environments[bid]["envs"] = sorted(envs)

    # --- Consejos de Hugin y Munin (los cuervos): tema, título y texto oficiales.
    hugin = {}
    for key in loc.table:
        if key.startswith("tutorial_") and key.endswith("_topic"):
            topic = key[len("tutorial_"):-len("_topic")]
            text = loc.t(f"tutorial_{topic}_text")
            if text:
                hugin[topic] = {"topic": loc.t(key), "label": loc.t(f"tutorial_{topic}_label"), "text": text}

    # --- Vegetación → recolectables y minerales
    veg: dict[tuple, int] = {}
    for cls in ("ZoneSystem", "LocationList"):
        for c in g.components(cls):
            for v in c.tree.get("m_vegetation", []):
                if v.get("m_enable"):
                    k = g.ref(c.file, v["m_prefab"])
                    if k:
                        veg[k] = veg.get(k, 0) | v["m_biome"]
    def log_drops(file, pptr, depth=0) -> list[dict]:
        """El tronco que deja un árbol, y el que deja ese tronco: ahí está la madera noble."""
        out = []
        for lc in g.comps_on(g.ref(file, pptr)) if depth < 4 else []:
            if lc.cls == "TreeLog":
                out += drop_table(lc.tree["m_dropWhenDestroyed"], g.name_of_in(lc.file))["items"]
                out += log_drops(lc.file, lc.tree.get("m_subLogPrefab"), depth + 1)
        return out

    def drops_of(go, depth=0) -> list[tuple[str, dict]]:
        """
        Qué suelta un prefab de la vegetación, y de qué manera.

        Sigue dos cadenas del juego: el `Destructible` que al romperse deja otro
        prefab (`m_spawnWhenDestroyed`: la veta de cobre entera sólo tiene eso,
        y la fracturada es la que suelta el mineral), y el árbol que deja
        troncos (`log_drops`).
        """
        out = []
        for pc in g.comps_in_tree(go):
            name_of = g.name_of_in(pc.file)
            if pc.cls == "Pickable":
                it = name_of(pc.tree["m_itemPrefab"])
                items_ = [{"item": it, "min": pc.tree["m_amount"], "max": pc.tree["m_amount"], "weight": 1.0}] if it else []
                out.append(("pickable", {"items": items_ + drop_table(pc.tree["m_extraDrops"], name_of)["items"]}))
            elif pc.cls in ("MineRock5", "MineRock"):
                out.append(("mine", drop_table(pc.tree["m_dropItems"], name_of)))
            elif pc.cls == "TreeBase":
                d = drop_table(pc.tree["m_dropWhenDestroyed"], name_of)
                d["items"] += log_drops(pc.file, pc.tree.get("m_logPrefab"))
                out.append(("tree", d))
            elif pc.cls == "DropOnDestroyed":
                out.append(("destructible", drop_table(pc.tree["m_dropWhenDestroyed"], name_of)))
            elif pc.cls == "Destructible" and depth < 3:
                nxt = g.ref(pc.file, pc.tree.get("m_spawnWhenDestroyed"))
                if nxt:
                    out += [("mine" if k == "mine" else k, d) for k, d in drops_of(nxt, depth + 1)]
        return out

    # Lo que el juego pone sin pasar por la vegetación y no hay dato que diga
    # dónde: las bolsas de guck que cuelgan de los árboles del Pantano, el
    # cerebro de los gigantes de las Tierras Nubladas (tejido blando), el
    # mineral de llametal de los leviatanes de lava y los meteoritos de la
    # Tierra de Ceniza, y las colmenas silvestres de las Praderas (abeja reina).
    # Tabla a mano, como la de los jefes (ZoTaD vio los biomas incompletos,
    # 2026-09-24).
    # Un mismo nombre puede estar en más de un bundle; vale la copia que tiene
    # componentes (la otra es un cascarón y no suelta nada).
    faltan = {name: BIT_OF[bid] for name, bid in EXTRA_GATHER.items()}
    hallados = set()
    for key, o in g._objs.items():
        if o.type.name == "GameObject":
            n = o.peek_name()
            if n in faltan and g.root_name(key) == n and g.comps_in_tree(key, 1):
                veg[key] = veg.get(key, 0) | faltan[n]
                hallados.add(n)
    faltan = {n: m for n, m in faltan.items() if n not in hallados}
    if faltan:
        print("⚠ recolectables a mano que no aparecieron:", sorted(faltan))

    gatherables = []
    for go, mask in veg.items():
        prefab = g.prefab(go)
        por_tipo: dict[str, dict] = {}
        for kind, d in drops_of(go):
            bucket = por_tipo.setdefault(kind, {})
            for it in d["items"]:
                if it["item"] in items:
                    bucket.setdefault(it["item"], it)
        if prefab in EXTRA_GATHER and not any(por_tipo.values()):
            print(f"⚠ {prefab} (a mano) no suelta nada que conozcamos:", [k for k, _ in drops_of(go)])
        for kind, bucket in por_tipo.items():
            if bucket:
                gatherables.append({"id": prefab, "name": None, "kind": kind, "biomes": biomes_of(mask), "drops": {"items": list(bucket.values())}})

    # --- El bioma de cada ubicación (2026-09-24): la lista de ubicaciones del
    # juego trae el nombre del prefab y su bioma. Lo que está adentro (el
    # alquitrán del pozo, el cristal de la cueva, los cofres) toma el bioma de
    # la ubicación que lo contiene. Las salas de las mazmorras son prefabs
    # aparte: para esas vale la pista del nombre (`hint_biome`).
    loc_biome: dict[str, int] = {}
    for cls in ("ZoneSystem", "LocationList"):
        for c in g.components(cls):
            for l in c.tree.get("m_locations", []):
                if l.get("m_enable") and l.get("m_prefabName"):
                    loc_biome[l["m_prefabName"]] = loc_biome.get(l["m_prefabName"], 0) | l["m_biome"]

    def where(go, *names) -> int:
        root = g.root_name(go) or ""
        mask = loc_biome.get(root, 0)
        return mask or hint_biome(root, *names)

    # --- Recolectables de ubicaciones (fuera de toda vegetación), uno por prefab base
    en_vegetacion = {d["item"] for gt in gatherables for d in gt["drops"]["items"]}
    por_base: dict[str, dict] = {}
    for c in g.components("Pickable"):
        if c.go in veg:
            continue
        it = g.name_of_in(c.file)(c.tree["m_itemPrefab"])
        base = re.sub(r" \(\d+\)$", "", g.prefab(c.go) or "")
        if not it or it not in items or it in en_vegetacion or not base.startswith("Pickable_"):
            continue
        rec = por_base.setdefault(base, {"id": base, "name": None, "kind": "location", "mask": 0,
                                         "drops": {"items": [{"item": it, "min": c.tree["m_amount"], "max": c.tree["m_amount"], "weight": 1.0}]}})
        rec["mask"] |= where(c.go, base)
    for rec in por_base.values():
        rec["biomes"] = biomes_of(rec.pop("mask"))
        gatherables.append(rec)

    # --- Cofres de las ubicaciones: ámbar, rubíes, collares, moldes del Norte
    # profundo. Sin bioma, igual que los recolectables de ubicación.
    for c in g.components("Container"):
        dt = c.tree.get("m_defaultItems")
        if not dt or not dt.get("m_drops"):
            continue
        base = re.sub(r" \(\d+\)$", "", g.prefab(c.go) or "")
        # Un cofre que el jugador construye trae botín sólo cuando el juego lo
        # pone en una ubicación; listarlo como fuente haría creer que
        # construirlo da ámbar.
        if base in pieces:
            continue
        d = drop_table(dt, g.name_of_in(c.file))
        its = [x for x in d["items"] if x["item"] in items]
        if not its:
            continue
        mask = where(c.go, base)
        prev = next((x for x in gatherables if x["id"] == base and x["kind"] == "chest"), None)
        if prev:
            have = {x["item"] for x in prev["drops"]["items"]}
            prev["drops"]["items"] += [x for x in its if x["item"] not in have]
            prev["biomes"] = biomes_of(mask | sum(BIT_OF[b] for b in prev["biomes"]))
        else:
            gatherables.append({"id": base, "name": loc.t(c.tree.get("m_name")), "kind": "chest", "biomes": biomes_of(mask), "drops": {"items": its}})

    # --- Cultivos y colmena
    farms = []
    for c in g.components("Plant"):
        sapling = re.sub(r" \(\d+\)$", "", g.prefab(c.go) or "")
        for gp in c.tree.get("m_grownPrefabs", []):
            for pk in g.comps_on(g.ref(c.file, gp)):
                if pk.cls == "Pickable":
                    it = g.name_of_in(pk.file)(pk.tree["m_itemPrefab"])
                    if it in items and not any(f["id"] == sapling and f["item"] == it for f in farms):
                        farms.append({"id": sapling, "name": loc.t(c.tree.get("m_name")), "item": it, "biomes": biomes_of(c.tree["m_biome"])})
    for c in g.components("Beehive"):
        it = g.name_of_in(c.file)(c.tree["m_honeyItem"])
        hive = re.sub(r" \(\d+\)$", "", g.prefab(c.go) or "")
        if it in items and not any(f["id"] == hive for f in farms):
            farms.append({"id": hive, "name": loc.t(c.tree.get("m_name")), "item": it, "biomes": biomes_of(c.tree["m_biome"])})

    # --- Comerciantes
    traders = {}
    for c in g.components("Trader"):
        prefab = g.prefab(c.go)
        traders[prefab] = {"id": prefab, "name": loc.t(c.tree["m_name"]) or loc.t(f"npc_{prefab.lower()}"),
                           "items": [i for i in trader_items(c.tree, g.name_of_in(c.file)) if i["item"] in items]}

    # --- Peces: el pez es a la vez criatura y objeto, y su aparecedor dice el bioma.
    fishing = [{"id": pid, "name": items[pid]["name"], "kind": "fish", "biomes": sorted(spawn_biomes[pid], key=BIOME_ORDER.index),
                "drops": {"items": [{"item": pid, "min": 1, "max": 1, "weight": 1.0}]}}
               for pid in items if pid in spawn_biomes and items[pid]["itemType"] == 21]
    gatherables += fishing
    # Antes se descartaba lo recolectable en ubicaciones si también se cultiva
    # (no tenían bioma). Desde que la ubicación dice su bioma queda: el lino y
    # la cebada silvestres de las aldeas de fulings son de las Llanuras, y sin
    # ellos el hilo de lino y todo el metal negro salían del Norte profundo.

    # --- Cruces
    sources = build_sources(recipes, conversions, creatures, gatherables, traders, farms)
    used = build_used_in(recipes, conversions, pieces)
    for pid, it in items.items():
        it["sources"] = sources.get(pid, [])
        it["usedIn"] = used.get(pid, [])
    share_by_name(items)

    dump("items.json", items)
    dump("recipes.json", recipes)
    dump("pieces.json", pieces)
    dump("conversions.json", conversions)
    dump("stations.json", stations)
    dump("creatures.json", creatures)
    dump("gatherables.json", gatherables)
    dump("traders.json", traders)
    dump("farms.json", farms)
    dump("bosses.json", sorted(bosses.values(), key=lambda b: b["order"]))
    dump("environments.json", environments)
    dump("hugin.json", hugin)
    dump("piece_categories.json", piece_categories)
    dump("biomes.json", [{"id": bid, "bit": bit, "name": loc.t(tok)} for bit, bid, tok in BIOMES])
    n_ui, n_fonts, n_art = export_ui(g), export_fonts(g), export_art(g)
    counts = {"items": len(items), "recipes": len(recipes), "pieces": len(pieces), "conversions": len(conversions),
              "creatures": len(creatures), "gatherables": len(gatherables), "traders": len(traders), "farms": len(farms), "icons": len(icons.done), "ui": n_ui, "fonts": n_fonts, "art": n_art, "bosses": len(bosses)}
    # Lo que queda sin fuente se publica en meta.json: es la lista de trabajo
    # para completar a mano (o desde la wiki) en la próxima pasada.
    sin_fuente = sorted(pid for pid, it in items.items() if it["kind"] in ("food", "mead", "material") and not it["sources"])
    dump("meta.json", {"withoutSource": sin_fuente, "unity": g.unity_version, "extractedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "counts": counts})
    print(counts, f"{time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
