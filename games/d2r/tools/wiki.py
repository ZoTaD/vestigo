"""
Diablo II: Resurrected → la wiki del sitio (2026-09-29).

Lee la instalación del juego (sólo lectura, CascLib) y escribe:

  games/d2r/data/wiki/engine.json     lo que necesita el motor de textos del sitio
                                      (`site/src/d2r/stats.ts`): cómo se escribe cada
                                      stat, qué stats pone cada propiedad, nombres de
                                      habilidades, clases y monstruos, en inglés y es-MX
  games/d2r/data/wiki/bases.json      armas, armaduras y demás bases
  games/d2r/data/wiki/runes.json      las runas con lo que dan en arma, casco y escudo
  games/d2r/data/wiki/runewords.json  las palabras rúnicas completas del juego
  games/d2r/data/wiki/uniques.json    los únicos que pueden caer
  games/d2r/data/wiki/sets.json       los conjuntos y sus piezas, con las bonificaciones
  site/public/d2r/items/…             el ícono de inventario de cada ítem (WebP)

Las propiedades de los ítems viajan crudas ([código, parámetro, mín, máx]) y el
texto lo arma el sitio con el mismo motor que usa el planificador: así una
ficha y el planificador no pueden decir cosas distintas.

Uso (después de extract.py, una vez por parche):
    python games/d2r/tools/wiki.py
"""
import json, os, re, sys, unicodedata

sys.path.insert(0, os.path.dirname(__file__))
from casc import Casc, ROOT  # noqa: E402
import sprite  # noqa: E402
from extract import CLASS_KEYS, table, strings, UI  # noqa: E402

OUT = os.path.join(ROOT, "games", "d2r", "data", "wiki")
ICONS = os.path.join(ROOT, "site", "public", "d2r", "items")
SKILLS = os.path.join(ROOT, "site", "public", "d2r", "skills")
# El prefijo de cada clase en sus archivos (íconos, árboles, nombres de pestaña) y su carpeta.
CLASS_FILES = [("am", "amazon"), ("so", "sorceress"), ("ne", "necromancer"), ("pa", "paladin"),
               ("ba", "barbarian"), ("dr", "druid"), ("as", "assassin"), ("wa", "warlock")]

# Las propiedades cuyo parámetro es una habilidad (por número o por nombre).
SKILL_PROPS = {"skill", "oskill", "hit-skill", "gethit-skill", "att-skill", "kill-skill", "death-skill",
               "levelup-skill", "charged", "aura", "skill-rand"}
# Las clases en el orden del juego (charstats sin la fila "Expansion"): el índice
# es el que usan `item_addclassskills` y las pestañas de habilidades (clase×3 + pestaña).
CLASS_CODES = ["ama", "sor", "nec", "pal", "bar", "dru", "ass", "war"]
CLASS_IDS = ["amazon", "sorceress", "necromancer", "paladin", "barbarian", "druid", "assassin", "warlock"]
# Textos especiales que el motor usa además de los de cada stat.
EXTRA_STRINGS = [
    "strModEnhancedDamage", "strModMinDamage", "strModMinDamageRange", "ModStr1g", "ModStr1f",
    "strModFireDamage", "strModFireDamageRange", "strModColdDamage", "strModColdDamageRange",
    "strModLightningDamage", "strModLightningDamageRange", "strModMagicDamage", "strModMagicDamageRange",
    "strModPoisonDamage", "strModPoisonDamageRange", "strModAllResistances",
    "increaseswithplaylevelX", "ModStre9s", "strItemModEtherealSocketed", "Socketable", "ModStre9u",
    "ItemStats1h", "ItemStats1l", "ItemStats1m", "ItemStats1n", "ItemStats1p", "ItemStats1f", "ItemStats1e",
    "ItemStats1d", "strItemStatThrowDamageRange", "ItemStats1o", "strethereal", "ChronicleRandomClassSkillLevel",
    # La Crónica, para el Grial: sus listas, sus filtros y la recompensa de completar cada lista.
    "Chronicle", "ChronicleFilterSelect", "ChronicleFilterRemaining", "ChronicleFilterDiscovered", "ChronicleRewardsTitle",
    "ChronicleRewardsUniqueTitle", "ChronicleRewardsUniqueItemType", "ChronicleRewardsUniqueDescription",
    "ChronicleRewardsSetTitle", "ChronicleRewardsSetItemType", "ChronicleRewardsSetDescription",
    "ChronicleRewardsRunewordTitle", "ChronicleRewardsRunewordItemType", "ChronicleRewardsRunewordDescription",
]
# Cómo se llama cada tipo de ítem que nombran las palabras rúnicas: la categoría
# del juego cuando existe (clave de texto), o un nombre nuestro cuando el juego no
# tiene uno para ese grupo ("armas a distancia").
TYPE_NAMES = {
    "weap": "weap", "tors": "r_arm", "helm": "helms", "swor": "sword", "axe": "axes", "pole": "poles", "spea": "spear",
    "scep": "scept", "mace": "maces", "wand": "wands", "staf": "stave", "knif": "daggs", "shld": "shlds", "circ": "circl",
    "glov": "glove", "boot": "boots", "belt": "belts", "amul": "amule", "ring": "rings", "jewl": "jewel", "bow": "bows",
    "xbow": "xbows", "jave": "javel", "tkni": "throw", "taxe": "throw",
}
TYPE_CUSTOM = {
    "mele": {"en": "Melee weapons", "es": "Armas cuerpo a cuerpo"},
    "miss": {"en": "Missile weapons", "es": "Armas a distancia"},
    "pala": {"en": "Paladin shields", "es": "Escudos de Paladín"},
    "ashd": {"en": "Auric shields", "es": "Escudos áuricos"},
    "head": {"en": "Shrunken heads", "es": "Cabezas reducidas"},
    "grim": {"en": "Grimoires", "es": "Grimorios"},
    "hamm": {"en": "Hammers", "es": "Martillos"},
    "club": {"en": "Clubs", "es": "Garrotes"},
    "h2h": {"en": "Claws", "es": "Garras"},
    "orb": {"en": "Orbs", "es": "Orbes"},
    "phlm": {"en": "Barbarian helms", "es": "Yelmos de Bárbaro"},
    "pelt": {"en": "Druid pelts", "es": "Pieles de Druida"},
}

# Stats que no nombra ninguna propiedad pero cuyo orden (descpriority) usa el motor
# para las líneas especiales: daño mejorado, rangos de daño, engarces.
EXTRA_STATS = ["mindamage", "maxdamage", "item_maxdamage_percent", "item_mindamage_percent", "item_numsockets",
               "poisonlength", "coldlength", "item_indesctructible", "secondary_mindamage", "item_throw_mindamage"]


def slug(name):
    s = unicodedata.normalize("NFD", name).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"['.]", "", s)
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def num(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def hd_map(c, name):
    """data/hd/items/<name>.json → {clave: asset} (el asset "normal")."""
    out = {}
    for e in json.loads(c.read(f"data:data/hd/items/{name}.json").decode("utf-8-sig")):
        for k, v in e.items():
            out[k] = v["asset"] if "asset" in v else v.get("normal")
    return out


def hd_key(index):
    """"Fechmar's Axe" → "fechmars_axe": así nombra el juego a sus únicos y sets en data/hd/items."""
    s = unicodedata.normalize("NFD", index).encode("ascii", "ignore").decode().lower()
    s = s.replace("'", "").replace("-", " ")
    return re.sub(r"[^a-z0-9]+", "_", s).strip("_")


class Icons:
    """Los íconos de inventario HD: busca el sprite de un asset y lo guarda una sola vez."""

    def __init__(self, c):
        self.c = c
        self.done = {}
        self.paths = {}
        for name, _ in c.files("*"):
            n = name.replace("\\", "/")
            if n.startswith("data:data/hd/global/ui/items/") and n.endswith(".sprite") and not n.endswith(".lowend.sprite"):
                rest = n[len("data:data/hd/global/ui/items/"):-len(".sprite")]
                # "weapon/axe/the_gnasher" → se busca por "axe/the_gnasher".
                self.paths.setdefault(rest.split("/", 1)[1] if "/" in rest else rest, rest)
                self.paths.setdefault(rest, rest)

    def get(self, asset):
        if not asset:
            return None
        if asset in self.done:
            return self.done[asset]
        rest = self.paths.get(asset)
        if not rest:
            self.done[asset] = None
            return None
        im = sprite.frames(self.c.read(f"{UI}items/{rest}.sprite"))[0]
        path = os.path.join(ICONS, asset + ".webp")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        im.convert("RGBA").save(path, "WEBP", quality=84, method=5)
        self.done[asset] = asset
        return asset


def props_of(row, keys):
    """Las propiedades de una fila como [código, parámetro, mín, máx] (sin las vacías ni las desactivadas con *)."""
    out = []
    for code_k, par_k, min_k, max_k in keys:
        code = (row.get(code_k) or "").strip()
        if not code or code.startswith("*"):
            continue
        par = (row.get(par_k) or "").strip()
        out.append([code, int(par) if par.lstrip("-").isdigit() else par, num(row.get(min_k)) or 0, num(row.get(max_k)) or 0])
    return out


# El token de cada clase en las animaciones (plrtype.txt) y los tipos de arma
# (wclass) que tiene cada una. Las tablas iguales se agrupan al escribirlas.
ANIM_TOKENS = ["AM", "SO", "NE", "PA", "BA", "DZ", "AI", "WK"]
WCLASSES = ["HTH", "1HS", "1HT", "2HS", "2HT", "STF", "BOW", "XBW", "HT1", "HT2", "1JS", "1JT", "1SS", "1ST"]


def animdata(c):
    """animdata.d2: 256 cubetas con registros de 160 bytes (nombre, cuadros por dirección, velocidad, eventos)."""
    import math, struct
    raw = c.read("data:data/global/animdata.d2")
    recs, off = {}, 0
    for _ in range(256):
        n = struct.unpack_from("<I", raw, off)[0]
        off += 4
        for _ in range(n):
            name = raw[off:off + 8].split(b"\0")[0].decode()
            recs[name] = struct.unpack_from("<II", raw, off + 8)
            off += 160
    return recs


def breakpoints(recs):
    """
    Las tablas de FCR, FHR y FBR de cada clase, con la fórmula del juego:
      cuadros = ⌈256·largo / ⌊velocidad·(base + E)/100⌋⌉ − 1,  E = ⌊120·x/(120+x)⌋
    base 100 y E ≤ 75 para lanzar; base 50 sin tope para recuperarse y bloquear.
    Da exactamente las tablas clásicas conocidas de las siete clases de siempre
    (verificado el 2026-09-29), así que la del Conjurador sale de la misma cuenta.
    """
    import math

    def table(length, speed, base, cap):
        out, last = [], None
        for x in range(0, 701):
            e = math.floor(120 * x / (120 + x))
            if cap:
                e = min(e, cap)
            f = math.ceil(256 * length / math.floor(speed * (base + e) / 100)) - 1
            if f != last:
                out.append([x, f])
                last = f
        return out

    out = {}
    for ci, tok in enumerate(ANIM_TOKENS):
        per = {}
        for kind, mode, base, cap in (("fcr", "SC", 100, 75), ("fhr", "GH", 50, None), ("fbr", "BL", 50, None)):
            groups = []
            for w in WCLASSES:
                r = recs.get(f"{tok}{mode}{w}")
                if not r:
                    continue
                t = table(r[0], r[1], base, cap)
                hit = next((g for g in groups if g["table"] == t), None)
                if hit:
                    hit["w"].append(w)
                else:
                    groups.append({"w": [w], "table": t})
            per[kind] = groups
        out[CLASS_IDS[ci]] = per
    return out


def main():
    os.makedirs(OUT, exist_ok=True)
    with Casc() as c:
        S = strings(c)
        T = {n: table(c, n + ".txt") for n in [
            "itemstatcost", "properties", "skills", "skilldesc", "charstats", "monstats", "itemtypes",
            "weapons", "armor", "misc", "gems", "runes", "uniqueitems", "setitems", "sets", "cubemain"]}
        runes_lod = {r["Name"] for r in table(c, "base/runes.txt") if r.get("complete") == "1"}
        icons = Icons(c)
        hd_items, hd_uniques, hd_sets = hd_map(c, "items"), hd_map(c, "uniques"), hd_map(c, "sets")

        L = lambda key: S.get(key) or {"en": key, "es": key}

        # ── Bases ────────────────────────────────────────────────────────────
        types = {t["Code"]: t for t in T["itemtypes"] if t.get("Code")}

        def chain(*codes):
            """El tipo y todos sus padres ("swor" → "blde" → "mele" → "weap")."""
            out, stack = [], [c_ for c_ in codes if c_]
            while stack:
                t = stack.pop()
                if t in out:
                    continue
                out.append(t)
                tt = types.get(t)
                if tt:
                    stack += [e for e in (tt.get("Equiv1"), tt.get("Equiv2")) if e]
            return out

        def category(ch):
            for t in ch:
                ui = (types.get(t) or {}).get("UICategory")
                if ui:
                    return ui
            return None
        bases = []
        by_code = {}
        for kind, rows in (("weapon", T["weapons"]), ("armor", T["armor"]), ("misc", T["misc"])):
            for r in rows:
                code = r.get("code")
                if not code or not r.get("name"):
                    continue
                tier = "n" if code == r.get("normcode") else "x" if code == r.get("ubercode") else "e" if code == r.get("ultracode") else None
                b = {
                    "code": code, "kind": kind, "name": L(r.get("namestr") or code), "type": r.get("type"), "type2": r.get("type2") or None,
                    "tier": tier, "family": [r.get("normcode") or None, r.get("ubercode") or None, r.get("ultracode") or None] if tier else None,
                    "lvl": num(r.get("level")) or 0, "req": {"lvl": num(r.get("levelreq")) or 0, "str": num(r.get("reqstr")) or 0, "dex": num(r.get("reqdex")) or 0},
                    "sockets": num(r.get("gemsockets")) or 0, "size": [num(r.get("invwidth")) or 1, num(r.get("invheight")) or 1],
                    "spawnable": r.get("spawnable") == "1", "img": icons.get(hd_items.get(code)),
                    # Dónde van las runas y gemas engarzadas: 0 arma, 1 casco o armadura, 2 escudo.
                    "gat": num(r.get("gemapplytype")) or 0,
                }
                b["chain"] = chain(r.get("type"), r.get("type2"))
                b["cat"] = category(b["chain"])
                if kind == "armor":
                    b["def"] = [num(r.get("minac")) or 0, num(r.get("maxac")) or 0]
                    if num(r.get("block")):
                        b["block"] = num(r.get("block"))
                    if num(r.get("mindam")):
                        b["dmg"] = {"one": [num(r["mindam"]), num(r.get("maxdam")) or 0]}
                if kind == "weapon":
                    d = {}
                    if num(r.get("mindam")):
                        d["one"] = [num(r["mindam"]), num(r.get("maxdam")) or 0]
                    if num(r.get("2handmindam")):
                        d["two"] = [num(r["2handmindam"]), num(r.get("2handmaxdam")) or 0]
                    if num(r.get("minmisdam")):
                        d["throw"] = [num(r["minmisdam"]), num(r.get("maxmisdam")) or 0]
                    b["dmg"] = d
                    b["speed"] = num(r.get("speed")) or 0
                    # El tipo de animación del arma (decide qué tabla de breakpoints usa).
                    b["wclass"] = (r.get("wclass") or "hth").upper()
                    b["hands"] = 2 if r.get("2handed") == "1" and r.get("1or2handed") != "1" else 1
                    if r.get("1or2handed") == "1":
                        b["hands"] = 12
                if num(r.get("durability")) and r.get("nodurability") != "1":
                    b["dur"] = num(r.get("durability"))
                bases.append(b)
                by_code[code] = b

        # Los tipos de ítem (para "en qué bases entra una palabra rúnica"), con su cadena de equivalencias.
        types_out = {}
        for code, t in types.items():
            name = TYPE_CUSTOM.get(code) or (S.get(TYPE_NAMES[code]) if code in TYPE_NAMES else None)                 or S.get(t.get("UICategory") or "") or {"en": t.get("ItemType") or code, "es": t.get("ItemType") or code}
            types_out[code] = {
                "name": name,
                "equiv": [e for e in (t.get("Equiv1"), t.get("Equiv2")) if e],
                "sockets": [num(t.get("MaxSockets1")) or 0, num(t.get("MaxSockets2")) or 0, num(t.get("MaxSockets3")) or 0],
                "class": t.get("Class") or None,
            }

        # Las categorías de ítems del juego (las del filtro de botín), con su nombre.
        cats_out = {}
        for r in table(c, "itemuicategories.txt"):
            if r.get("Name") and r["Name"] != "Null" and r["Name"] in S:
                cats_out[r["Name"]] = {"name": S[r["Name"]], "parent": r.get("ParentCategory") or None}

        # ── Runas y gemas ───────────────────────────────────────────────────
        gem_rows = {g["code"]: g for g in T["gems"] if g.get("code")}
        slot_keys = lambda slot: [(f"{slot}Mod{i}Code", f"{slot}Mod{i}Param", f"{slot}Mod{i}Min", f"{slot}Mod{i}Max") for i in range(1, 4)]
        misc = {m["code"]: m for m in T["misc"] if m.get("code")}
        runes = []
        for r in sorted((m for m in T["misc"] if m.get("type") == "rune"), key=lambda m: m["code"]):
            g = gem_rows.get(r["code"], {})
            rid = r["name"].split()[0].lower()
            runes.append({
                "id": rid, "code": r["code"], "name": L(r["code"]), "lvl": num(r.get("levelreq")) or 0,
                "img": icons.get(hd_items.get(r["code"])),
                "mods": {slot: props_of(g, slot_keys(slot)) for slot in ("weapon", "helm", "shield")},
            })
        rune_code = {r["code"]: r for r in runes}

        # ── Palabras rúnicas ────────────────────────────────────────────────
        runewords = []
        for r in T["runes"]:
            if r.get("complete") != "1":
                continue
            rs = [r[f"Rune{i}"] for i in range(1, 7) if r.get(f"Rune{i}")]
            name = S.get(r["Name"]) or {"en": r["*Rune Name"], "es": r["*Rune Name"]}
            runewords.append({
                "id": slug(name["en"]), "key": r["Name"], "name": name, "runes": rs,
                "types": [r[f"itype{i}"] for i in range(1, 7) if r.get(f"itype{i}")],
                "exclude": [r[f"etype{i}"] for i in range(1, 4) if r.get(f"etype{i}")],
                "props": props_of(r, [(f"T1Code{i}", f"T1Param{i}", f"T1Min{i}", f"T1Max{i}") for i in range(1, 8)]),
                "lvl": max(rune_code[x]["lvl"] for x in rs if x in rune_code),
                "ladder": num(r.get("firstLadderSeason")) or None, "ladderEnd": num(r.get("lastLadderSeason")) or None,
                "patch": r.get("*Patch Release") or None,
                "rotw": r["Name"] not in runes_lod,
            })
            rw = runewords[-1]
            fits = [b for b in bases if b["kind"] != "misc" and b["spawnable"] and b["sockets"] >= len(rs)
                    and any(t in b["chain"] for t in rw["types"]) and not any(t in b["chain"] for t in rw["exclude"])]
            # Dónde puede ir (arma, casco/armadura, escudo): cambia lo que suma cada runa.
            rw["slots"] = sorted({b["gat"] for b in fits})
            rw["bases"] = len(fits)

        # ── Únicos ──────────────────────────────────────────────────────────
        # Las 8 Facetas de arcoíris se llaman igual en el juego: se distinguen por
        # su elemento y por cuándo lanzan la habilidad (al morir o al subir de nivel).
        facet_el = {"ltng": ("Lightning", "rayo"), "cold": ("Cold", "frío"), "fire": ("Fire", "fuego"), "pois": ("Poison", "veneno")}
        facet_when = {"death-skill": ("Die", "al morir"), "levelup-skill": ("Level-up", "al subir de nivel")}
        uniques = []
        seen = set()
        for r in T["uniqueitems"]:
            if r.get("spawnable") != "1" or not r.get("code"):
                continue
            name = S.get(r["index"]) or {"en": r["index"], "es": r["index"]}
            props = props_of(r, [(f"prop{i}", f"par{i}", f"min{i}", f"max{i}") for i in range(1, 13)])
            if r["index"] == "Rainbow Facet":
                codes = {p_[0] for p_ in props}
                el = next(v for k, v in facet_el.items() if f"dmg-{k}" in codes)
                when = next(v for k, v in facet_when.items() if k in codes)
                name = {"en": f"{name['en']} ({el[0]}, {when[0]})", "es": f"{name['es']} ({el[1]}, {when[1]})"}
            sid = slug(name["en"])
            k = 2
            while sid in seen:
                sid = f"{slug(name['en'])}-{k}"
                k += 1
            seen.add(sid)
            base = by_code.get(r["code"])
            u = {
                "id": sid, "key": r["index"], "name": name, "base": r["code"],
                "lvl": num(r.get("lvl")) or 0, "req": num(r.get("lvl req")) or 0,
                "props": props,
                "img": icons.get(hd_uniques.get(hd_key(r["index"]))) or (base or {}).get("img"),
                "ladder": num(r.get("firstLadderSeason")) or None,
            }
            # "Sólo uno": el juego no deja llevar dos del mismo grupo (el Annihilus, la Antorcha, la Fortuna de Gheed y
            # los seis Talismanes de Ruptura elaborados, que comparten uno). Sólo lo llevan los que lo tienen.
            if num(r.get("carry1")):
                u["carry"] = num(r.get("carry1"))
            uniques.append(u)

        # ── Conjuntos ───────────────────────────────────────────────────────
        set_items = {}
        for r in T["setitems"]:
            # Sólo las piezas que caen: el conjunto "Warlord's Glory" está en la tabla
            # con `spawnable` vacío (y fuera de la Crónica), pero nadie puede encontrarlo.
            if not r.get("index") or not r.get("item") or r.get("spawnable") != "1":
                continue
            name = S.get(r["index"]) or {"en": r["index"], "es": r["index"]}
            base = by_code.get(r["item"])
            bonus = []
            for i in range(1, 6):
                # Las bonificaciones de la pieza con 2, 3… piezas puestas del conjunto ("add func" define cuáles).
                ps = props_of(r, [(f"aprop{i}{ab}", f"apar{i}{ab}", f"amin{i}{ab}", f"amax{i}{ab}") for ab in "ab"])
                if ps:
                    bonus.append({"n": i + 1, "props": ps})
            set_items.setdefault(r["set"], []).append({
                "id": slug(name["en"]), "key": r["index"], "name": name, "base": r["item"],
                "lvl": num(r.get("lvl")) or 0, "req": num(r.get("lvl req")) or 0, "addFunc": num(r.get("add func")) or 0,
                "props": props_of(r, [(f"prop{i}", f"par{i}", f"min{i}", f"max{i}") for i in range(1, 10)]),
                "bonus": bonus,
                "img": icons.get(hd_sets.get(hd_key(r["index"]))) or (base or {}).get("img"),
            })
        sets = []
        for r in T["sets"]:
            if not r.get("index") or not r.get("name") or r["index"] not in set_items:
                continue
            name = S.get(r["name"]) or {"en": r["index"], "es": r["index"]}
            partial = []
            for n in range(2, 6):
                ps = props_of(r, [(f"PCode{n}{ab}", f"PParam{n}{ab}", f"PMin{n}{ab}", f"PMax{n}{ab}") for ab in "ab"])
                if ps:
                    partial.append({"n": n, "props": ps})
            sets.append({
                "id": slug(name["en"]), "key": r["index"], "name": name,
                "items": set_items[r["index"]], "partial": partial,
                "full": props_of(r, [(f"FCode{i}", f"FParam{i}", f"FMin{i}", f"FMax{i}") for i in range(1, 9)]),
            })

        # ── Motor de textos ─────────────────────────────────────────────────
        used = set()
        for coll in (runewords, uniques):
            for x in coll:
                used.update(p[0] for p in x["props"])
        for s_ in sets:
            used.update(p[0] for p in s_["full"])
            for b in s_["partial"]:
                used.update(p[0] for p in b["props"])
            for it in s_["items"]:
                used.update(p[0] for p in it["props"])
                for b in it["bonus"]:
                    used.update(p[0] for p in b["props"])
        for r in runes:
            for ps in r["mods"].values():
                used.update(p[0] for p in ps)

        prop_rows = {p["code"]: p for p in T["properties"]}
        props_out, stat_names = {}, set()
        for code in sorted(used):
            p = prop_rows.get(code)
            if not p:
                continue
            fs = []
            for k in range(1, 8):
                f = num(p.get(f"func{k}"))
                if not f:
                    continue
                st = p.get(f"stat{k}") or None
                fs.append({"f": f, "s": st, "v": num(p.get(f"val{k}"))})
                if st:
                    stat_names.add(st)
            props_out[code] = fs

        stat_names.update(EXTRA_STATS)
        isc = {s_["Stat"]: s_ for s_ in T["itemstatcost"]}
        stats_out = {}
        str_keys = set(EXTRA_STRINGS)
        for st in sorted(stat_names):
            s_ = isc.get(st)
            if not s_:
                continue
            e = {"id": num(s_.get("*ID")), "p": num(s_.get("descpriority")) or 0, "f": num(s_.get("descfunc")) or 0, "v": num(s_.get("descval")) or 0}
            for k, col in (("pos", "descstrpos"), ("neg", "descstrneg"), ("s2", "descstr2"),
                           ("gpos", "dgrpstrpos"), ("gneg", "dgrpstrneg"), ("gs2", "dgrpstr2")):
                if s_.get(col):
                    e[k] = s_[col]
                    str_keys.add(s_[col])
            for k, col in (("g", "dgrp"), ("gf", "dgrpfunc"), ("gv", "dgrpval")):
                if num(s_.get(col)):
                    e[k] = num(s_.get(col))
            stats_out[st] = e

        # Habilidades: las que nombran los ítems, las de cada clase (para el planificador) y sus nombres.
        sk_by_name = {s_["skill"].lower(): s_ for s_ in T["skills"] if s_.get("skill")}
        sk_by_id = {num(s_["*Id"]): s_ for s_ in T["skills"] if s_.get("*Id")}
        sdesc = {d["skilldesc"]: d for d in T["skilldesc"] if d.get("skilldesc")}

        def skill_id(par):
            if isinstance(par, int):
                return par
            s_ = sk_by_name.get(str(par).lower())
            return num(s_["*Id"]) if s_ else None

        def fix_skill_pars(props):
            for p in props:
                if p[0] in SKILL_PROPS and p[1] != "":
                    sid = skill_id(p[1])
                    if sid is not None:
                        p[1] = sid

        for coll in (runewords, uniques):
            for x in coll:
                fix_skill_pars(x["props"])
        for s_ in sets:
            fix_skill_pars(s_["full"])
            for b in s_["partial"]:
                fix_skill_pars(b["props"])
            for it in s_["items"]:
                fix_skill_pars(it["props"])
                for b in it["bonus"]:
                    fix_skill_pars(b["props"])
        for r in runes:
            for ps in r["mods"].values():
                fix_skill_pars(ps)

        skills_out = {}
        for sid, s_ in sk_by_id.items():
            d = sdesc.get(s_.get("skilldesc"))
            if not d or not d.get("str name"):
                continue
            cls = s_.get("charclass") or None
            skills_out[sid] = {"name": L(d["str name"]), "cls": CLASS_CODES.index(cls) if cls in CLASS_CODES else None}

        cs = [r for r in T["charstats"] if r.get("class") and r["class"] != "Expansion"]
        classes_out = []
        for i, r in enumerate(cs):
            classes_out.append({
                "id": CLASS_IDS[i], "code": CLASS_CODES[i],
                "all": r["StrAllSkills"], "only": r["StrClassOnly"],
                "tabs": [r["StrSkillTab1"], r["StrSkillTab2"], r["StrSkillTab3"]],
                "base": {k: num(r.get(k)) for k in ("str", "dex", "int", "vit", "stamina", "hpadd", "LifePerLevel", "ManaPerLevel", "LifePerVitality", "ManaPerMagic", "StaminaPerLevel", "StaminaPerVitality")},
            })
            str_keys.update([r["StrAllSkills"], r["StrClassOnly"], r["StrSkillTab1"], r["StrSkillTab2"], r["StrSkillTab3"]])

        # Monstruos que nombra "reanimar como".
        mon_ids = {p[1] for coll in (runewords, uniques) for x in coll for p in x["props"] if p[0] == "reanimate"}
        mons = {num(m["*hcIdx"]): m for m in T["monstats"] if m.get("*hcIdx")}
        monsters_out = {mid: L(mons[mid]["NameStr"]) for mid in mon_ids if isinstance(mid, int) and mid in mons}

        # ── Clases: el árbol de habilidades de cada una ─────────────────────
        # Cada habilidad con su página (pestaña), fila y columna del árbol, su
        # ícono, el nivel requerido y las habilidades que pide antes. Los íconos
        # van uno por habilidad y los árboles (las flechas del juego) uno por pestaña.
        sk_rows = {s_["skill"]: s_ for s_ in T["skills"] if s_.get("skill")}
        classes_tree = []
        for ci, (pre, folder) in enumerate(CLASS_FILES):
            icon_frames = sprite.frames(c.read(f"{UI}spells/{folder}/{pre}skillicon.sprite"))
            trees = sprite.frames(c.read(f"{UI}spells/skill_trees/{pre}skilltree.sprite"))
            for ti, fr in enumerate(trees):
                path = os.path.join(ROOT, "site", "public", "d2r", "game", "tree", f"{CLASS_IDS[ci]}-{ti + 1}.webp")
                os.makedirs(os.path.dirname(path), exist_ok=True)
                fr.convert("RGBA").resize((448, 585)).save(path, "WEBP", quality=80, method=5)
            skills = []
            for s_ in T["skills"]:
                if s_.get("charclass") != CLASS_CODES[ci]:
                    continue
                d = sdesc.get(s_.get("skilldesc"))
                if not d or not num(d.get("SkillPage")):
                    continue
                sid = num(s_["*Id"])
                icon = num(d.get("IconCel")) or 0
                if icon < len(icon_frames):
                    path = os.path.join(SKILLS, CLASS_IDS[ci], f"{sid}.webp")
                    os.makedirs(os.path.dirname(path), exist_ok=True)
                    icon_frames[icon].convert("RGBA").resize((88, 88)).save(path, "WEBP", quality=84, method=5)
                reqs = [num(sk_rows[r]["*Id"]) for r in (s_.get("reqskill1"), s_.get("reqskill2"), s_.get("reqskill3")) if r and r in sk_rows]
                skills.append({
                    "id": sid, "slug": slug(L(d["str name"])["en"]), "name": L(d["str name"]),
                    "short": L(d["str short"]) if d.get("str short") else None,
                    "long": L(d["str long"]) if d.get("str long") else None,
                    "page": num(d["SkillPage"]), "row": num(d.get("SkillRow")) or 1, "col": num(d.get("SkillColumn")) or 1,
                    "lvl": num(s_.get("reqlevel")) or 1, "max": num(s_.get("maxlvl")) or 20, "reqs": reqs,
                })
            # Los nombres de las pestañas: SkillCategory<Xx><n>. En las siete clases de
            # siempre van en el orden inverso al de las páginas (la página 1 de la
            # Hechicera es Fuego = So3); el Conjurador, que es nuevo, va en el mismo orden.
            tabs = [S.get(f"SkillCategory{pre.capitalize()}{p if pre == 'wa' else 4 - p}") for p in (1, 2, 3)]
            classes_tree.append({"id": CLASS_IDS[ci], "code": CLASS_CODES[ci], "name": S[CLASS_KEYS[CLASS_IDS[ci]]],
                                 "tabs": [t_ or {"en": "", "es": ""} for t_ in tabs], "skills": skills})

        bps = breakpoints(animdata(c))

        # ── Cubo horádrico ──────────────────────────────────────────────────
        # Cada receta con sus entradas y su salida ya resueltas a nombres del
        # juego (ítem, tipo de ítem o único), sus calidades en código (las
        # traduce el sitio), los mods de los objetos creados y un grupo.
        unique_names = {u_["index"] for u_ in T["uniqueitems"] if u_.get("index")}
        set_names = {x["index"] for x in T["setitems"] if x.get("index")}

        def cube_token(tok):
            parts = [p_.strip() for p_ in tok.split(",")]
            code, quals = parts[0], parts[1:]
            qty = next((int(q[4:]) for q in quals if q.startswith("qty=")), 1)
            quals = [q for q in quals if not q.startswith("qty=")]
            out = {"code": code, "qty": qty, "quals": quals}
            if code in ("useitem", "usetype"):
                out["kind"] = code
            elif code in by_code:
                b_ = by_code[code]
                out.update(kind="item", name=b_["name"], img=b_.get("img"))
            elif code in types:
                out.update(kind="type", name=types_out[code]["name"])
            elif code in unique_names or code in set_names:
                out.update(kind="unique", name=S.get(code) or {"en": code, "es": code})
            else:
                out["kind"] = "special"
            return out

        cube = []
        for i, r in enumerate(T["cubemain"]):
            if r.get("enabled") != "1":
                continue
            ins = [cube_token(r[f"input {k}"]) for k in range(1, 8) if r.get(f"input {k}")]
            out = cube_token(r["output"]) if r.get("output") else None
            if not out:
                continue
            desc = r.get("description") or ""
            oq = out["quals"]
            if out["code"].startswith("r") and out["code"][1:].isdigit():
                group = "runes"
            elif out["kind"] == "item" and (by_code.get(out["code"]) or {}).get("cat") == "gems":
                group = "gems"
            elif "crf" in oq or "Crafted" in desc:
                group = "crafted"
            elif any(q.startswith("sock") for q in oq):
                group = "sockets"
            elif "exc" in oq or "eli" in oq:
                group = "upgrade"
            elif "rep" in oq or "rch" in oq:
                group = "repair"
            elif out["kind"] == "special" or out["code"] in ("hst", "qf2"):
                group = "portals"
            elif out["code"] in ("rvs", "rvl") or out["code"].endswith("pot"):
                group = "potions"
            elif "mag" in oq or "rar" in oq or "uns" in oq:
                group = "reroll"
            else:
                group = "misc"
            fam = re.search(r"(Blood|Caster|Hit Power|Safety)", desc)
            cube.append({
                "id": i, "group": group, "in": ins, "out": out, "desc": desc,
                "family": fam.group(1).lower().replace(" ", "") if fam and group == "crafted" else None,
                "mods": props_of(r, [(f"mod {k}", f"mod {k} param", f"mod {k} min", f"mod {k} max") for k in range(1, 6)]),
                "hell": r.get("min diff") == "2",
            })

        # ── Zonas de Terror ─────────────────────────────────────────────────
        # Las 34 zonas que pueden aterrorizarse, con sus niveles del mapa, su
        # waypoint y las inmunidades de sus monstruos en Infierno (resistencia ≥ 100),
        # más el rango de nivel de cada dificultad y los Heraldos de Infierno.
        dz = json.loads(c.read("data:data/hd/global/excel/desecratedzones.json").decode("utf-8-sig"))["desecrated_zones"][0]
        lv_rows = {num(r["Id"]): r for r in table(c, "levels.txt") if r.get("Id")}
        mon_by_id = {m["Id"]: m for m in T["monstats"] if m.get("Id")}
        ELEM = [("physical", "ResDm(H)"), ("magic", "ResMa(H)"), ("fire", "ResFi(H)"), ("light", "ResLi(H)"), ("cold", "ResCo(H)"), ("poison", "ResPo(H)")]
        zones_out = []
        for z in dz["zones"]:
            levels, mons = [], {}
            for lvl in z["levels"]:
                r = lv_rows.get(lvl["level_id"])
                if not r:
                    continue
                levels.append({"id": lvl["level_id"], "name": L(r["LevelName"])})
                for k in range(1, 26):
                    mid = r.get(f"nmon{k}")
                    m = mon_by_id.get(mid) if mid else None
                    if m and m.get("NameStr") and mid not in mons:
                        imm = [e for e, col in ELEM if (num(m.get(col)) or 0) >= 100]
                        mons[mid] = {"name": L(m["NameStr"]), "imm": imm}
            wp = next((l_.get("waypoint_level_id") for l_ in z["levels"] if l_.get("waypoint_level_id")), None)
            zones_out.append({
                "id": slug(z["id"].split("-", 1)[-1].split("_", 1)[-1]), "key": z["id"],
                "act": int(re.search(r"Act(\d)", z["id"]).group(1)),
                "levels": levels, "waypoint": L(lv_rows[wp]["LevelName"]) if wp in lv_rows else None,
                "monsters": sorted(mons.values(), key=lambda m: m["name"]["en"]),
                "immune": {e: sum(1 for m in mons.values() if e in m["imm"]) for e, _ in ELEM},
            })
        rotw = dz["game_difficulties"]["rotw"]
        zones_meta = {
            "duration": dz.get("zone_duration_minutes"),
            "diff": {d: {"min": rotw[d]["defaults"]["bound_incl_min"], "max": rotw[d]["defaults"]["bound_incl_max"],
                         "boost": rotw[d]["defaults"].get("boost_level"), "xp": rotw[d]["defaults"].get("boost_experience_percent")}
                     for d in ("normal", "nightmare", "hell")},
            "heralds": [{"tier": i + 1, "health": h.get("herald_health_boost_percent"), "damage": h.get("herald_damage_boost_percent"),
                         "minions": h.get("max_minions"), "tc": h.get("herald_treasure_class_level_boost", 0)}
                        for i, h in enumerate(rotw["hell"]["defaults"].get("herald_tiers", []))],
        }

        engine = {
            "stats": stats_out, "props": props_out,
            "skills": skills_out, "classes": classes_out, "monsters": monsters_out,
            "str": {k: S[k] for k in sorted(str_keys) if k in S},
        }

    def write(name, data):
        with open(os.path.join(OUT, name + ".json"), "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, separators=(",", ":"))

    # De lo "varios" sólo quedan las bases que usan los únicos, los conjuntos y el
    # planificador (joyería, talismanes, joyas, runas y gemas): pociones, llaves y
    # pergaminos no le sirven a la wiki y pesaban la mitad del archivo.
    used_bases = {u["base"] for u in uniques} | {it["base"] for s_ in sets for it in s_["items"]}
    keep_cats = {"amule", "rings", "charm", "jewel", "runes", "gems"}
    bases = [b for b in bases if b["kind"] != "misc" or b["cat"] in keep_cats or b["code"] in used_bases]
    for b in bases:
        if b["kind"] == "misc":
            b.pop("chain", None)
    index = (
        [{"sec": "runes", "id": r["id"], "en": r["name"]["en"], "es": r["name"]["es"], "img": r["img"]} for r in runes]
        + [{"sec": "runewords", "id": r["id"], "en": r["name"]["en"], "es": r["name"]["es"]} for r in runewords]
        + [{"sec": "uniques", "id": u["id"], "en": u["name"]["en"], "es": u["name"]["es"], "img": u["img"]} for u in uniques]
        + [{"sec": "sets", "id": s_["id"], "en": s_["name"]["en"], "es": s_["name"]["es"]} for s_ in sets]
        + [{"sec": "classes", "id": c_["id"], "en": c_["name"]["en"], "es": c_["name"]["es"]} for c_ in classes_tree]
    )

    write("classes", classes_tree)
    write("breakpoints", bps)
    write("cube", cube)
    write("zones", {"meta": zones_meta, "zones": zones_out})
    write("engine", engine)
    write("bases", bases)
    write("index", index)
    write("types", types_out)
    write("categories", cats_out)
    write("runes", runes)
    write("runewords", runewords)
    write("uniques", uniques)
    write("sets", sets)
    size = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
    n_icons = sum(len(fs) for _, _, fs in os.walk(ICONS))
    print(f"wiki: {len(bases)} bases · {len(runes)} runas · {len(runewords)} palabras rúnicas · {len(uniques)} únicos · "
          f"{len(sets)} conjuntos ({sum(len(s_['items']) for s_ in sets)} piezas) · {len(stats_out)} stats · {len(props_out)} propiedades · "
          f"{size / 1e3:.0f} KB de datos · {n_icons} íconos")
    missing = [u["key"] for u in uniques if not u["img"]] + [it["key"] for s_ in sets for it in s_["items"] if not it["img"]]
    if missing:
        print("sin ícono:", missing[:20], len(missing))


if __name__ == "__main__":
    main()
