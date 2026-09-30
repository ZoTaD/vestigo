"""
Diablo II: Resurrected → los datos de la calculadora de drops (2026-09-29).

Lee la instalación del juego (sólo lectura, CascLib) y escribe:

  games/d2r/data/drops/drops.json   lo que usa el motor del sitio (site/src/d2r/drops/):
                                    Treasure Classes (con las automáticas weapN/armoN ya
                                    armadas), bases, únicos y piezas con su rareza,
                                    itemratio, monstruos, áreas, jefes y superúnicos con
                                    su área, y las reglas de las Zonas de Terror
  games/d2r/data/drops/index.json   las fichas de jefes y superúnicos (id y nombre) para
                                    el sitemap y los títulos, sin cargar lo anterior

Diseño: docs/design/2026-09-29-d2r-calculadora-drops.md. Las reglas que aplica
el motor están ahí; acá sólo se traducen las tablas.

Uso (después de wiki.py, una vez por parche):
    python games/d2r/tools/drops.py
"""
import json, os, re, sys

sys.path.insert(0, os.path.dirname(__file__))
from casc import Casc, ROOT  # noqa: E402
from extract import table, strings  # noqa: E402
from wiki import slug, num  # noqa: E402

OUT = os.path.join(ROOT, "games", "d2r", "data", "drops")
WIKI = os.path.join(ROOT, "games", "d2r", "data", "wiki")
DIFF_SUFFIX = ["", "(N)", "(H)"]
# Las columnas de TC de monstats, en el orden de `DropMonster.tc` del sitio.
TC_KINDS = ["TreasureClass", "TreasureClassChamp", "TreasureClassUnique", "TreasureClassQuest",
            "TreasureClassDesecrated", "TreasureClassDesecratedChamp", "TreasureClassDesecratedUnique",
            "TreasureClassHerald"]

# En qué área aparece cada superúnico (índice de levels.txt). El juego lo define
# en los mapas (.ds1), no en tablas. Los que faltan no aparecen en ningún mapa
# (Winged Death, Axe Dweller, Hell's Belle…) o no sueltan nada (los Ancestros
# de la cima). Radament está en Cloacas Nivel 3; Kaa, en cualquiera de las siete
# tumbas (todas del mismo nivel).
SUPER_AREAS = {
    "Corpsefire": 8, "Bishibosh": 3, "Bonebreak": 18, "Coldcrow": 9, "Rakanishu": 4,
    "Treehead WoodFist": 5, "Griswold": 38, "The Countess": 25, "The Smith": 28,
    "Pitspawn Fouldog": 30, "Boneash": 33, "The Cow King": 39,
    "Radament": 49, "Leatherarm": 59, "Bloodwitch the Wild": 60, "Beetleburst": 43,
    "Coldworm the Burrower": 64, "Dark Elder": 44, "Fangskin": 61, "Fire Eye": 54,
    "The Summoner": 74, "Ancient Kaa the Soulless": 66,
    "Web Mage the Burning": 85, "Witch Doctor Endugu": 91, "Stormtree": 78,
    "Sarina the Battlemaid": 94, "Icehawk Riftwing": 92, "Ismail Vilehand": 83,
    "Geleb Flamefinger": 83, "Toorc Icefist": 83, "Bremm Sparkfist": 102,
    "Wyand Voidfinger": 102, "Maffer Dragonhand": 102,
    "The Feature Creep": 107, "Infector of Souls": 108, "Lord De Seis": 108,
    "Grand Vizier of Chaos": 108,
    "Siege Boss": 110, "Dac Farren": 110, "Megaflow Rectifier": 111, "Eyeback Unleashed": 111,
    "Sharp Tooth Sayer": 111, "Threash Socket": 112, "Frozenstein": 114, "Bonesaw Breaker": 115,
    "Snapchip Shatter": 119, "Pindleskin": 121, "Nihlathak Boss": 124,
    "Baal Subject 1": 131, "Baal Subject 2": 131, "Baal Subject 3": 131, "Baal Subject 4": 131,
    "Baal Subject 5": 131,
}
# Los jefes que no son superúnicos: id del sitio y área. El Clon de Diablo
# aparece en cualquier área, por eso no tiene una. Lilith y los Uber Duriel e
# Izual de Pandemonio no están: sólo sueltan su órgano (cuerno, ojo, cerebro),
# que la calculadora no lista, y su ficha quedaría vacía.
BOSSES = {
    "andariel": ("andariel", 37), "duriel": ("duriel", 73), "mephisto": ("mephisto", 102),
    "diablo": ("diablo", 108), "baalcrab": ("baal", 132), "izual": ("izual", 105),
    "bloodraven": ("blood-raven", 17), "diabloclone": ("diablo-clone", None),
    "colossal1": ("colossal-talic", 137), "colossal2": ("colossal-madawc", 137),
    "colossal3": ("colossal-korlic", 137),
}
# El Clon de Diablo sólo aparece en Infierno, aunque monstats le da TC en las
# tres dificultades: sin esto saldría en Normal y Pesadilla.
HELL_ONLY = {"diabloclone"}
# Lo mismo con las áreas del evento de Pandemonio (la Guarida de la Matrona, las
# Arenas Olvidadas, la Forja del Dolor y el Tristram de los Uber): el evento sólo
# existe en Infierno, pero levels.txt les da monstruos y niveles en las tres
# dificultades. Sin la marca `hell`, la calculadora las ofrecía en Normal y
# Pesadilla (y las fichas recomendaban la Guarida de la Matrona en Normal).
HELL_ONLY_AREAS = {133, 134, 135, 136}
# Nombres que el juego repite (el Clon se llama como el original) o que no
# trae (Nihlathak como superúnico).
NAMES = {
    "diabloclone": {"en": "Diablo Clone", "es": "Clon de Diablo"},
    "colossal1": {"en": "Talic, Colossal Ancient", "es": "Talic, Ancestro Colosal"},
    "colossal2": {"en": "Madawc, Colossal Ancient", "es": "Madawc, Ancestro Colosal"},
    "colossal3": {"en": "Korlic, Colossal Ancient", "es": "Korlic, Ancestro Colosal"},
    "Nihlathak Boss": {"en": "Nihlathak", "es": "Nihlathak"},
}
# ConditionCalc → la forma que evalúa el motor sin interpretar texto. Una
# condición nueva hace fallar el script a propósito: hay que sumarla acá y en
# `condOk` (site/src/d2r/drops/rules.ts).
CONDITIONS = {
    "cond('Difficulty',hell)": {"diff": 2},
    "cond('Difficulty',hell)*(cond('Desecrated')==0)": {"diff": 2, "desec": False},
    "cond('Difficulty',hell)*cond('Desecrated')": {"diff": 2, "desec": True},
    "cond('MonsterTestElite',herald)": {"herald": True},
    "(stat('heraldtier'.accr)>4)": {"tier": [5, 99]},
    "(stat('heraldtier'.accr)>2)*(stat('heraldtier'.accr)<5)": {"tier": [3, 4]},
    "cond('Desecrated')": {"desec": True},
    "cond('Desecrated')==0": {"desec": False},
}


def condition(raw):
    key = re.sub(r"\s+", "", (raw or "").strip().strip('"'))
    if not key:
        return None
    if key not in CONDITIONS:
        raise SystemExit(f"ConditionCalc desconocida: {raw!r} (sumarla a CONDITIONS y al motor)")
    return CONDITIONS[key]


def ladder(row):
    """[primera, última] temporada en que es exclusivo de Clasificación, o None."""
    first, last = num(row.get("firstLadderSeason")) or 0, num(row.get("lastLadderSeason")) or 0
    return [first, last] if first else None


def entry(raw):
    """'"gld,mul=2048"' → ('gld', None); '"x,cu=512"' → ('x', [512, 0, 0, 0])."""
    parts = [p.strip() for p in raw.strip().strip('"').split(",")]
    mods = {}
    for p in parts[1:]:
        k, _, v = p.partition("=")
        mods[k.strip()] = num(v) or 0
    q = [mods.get("cu", 0), mods.get("cs", 0), mods.get("cr", 0), mods.get("cm", 0)]
    return parts[0], (q if any(q) else None)


def type_chain(types, code):
    """El tipo y todos sus equivalentes hacia arriba (scha → char → misc)."""
    seen, stack = [], [code]
    while stack:
        t = stack.pop()
        if not t or t in seen or t not in types:
            continue
        seen.append(t)
        stack += [types[t].get("Equiv1"), types[t].get("Equiv2")]
    return seen


def terror(c):
    """Las áreas que se pueden aterrorizar (las del calendario y las manuales de RotW) y sus reglas."""
    d = json.loads(c.read("data:data/hd/global/excel/desecratedzones.json").decode("utf-8-sig"))["desecrated_zones"][0]
    levels = {l["level_id"] for z in d["zones"] for l in z["levels"]}
    levels |= {l["level_id"] for g in d.get("manual_zones", []) for z in g["zones"] for l in z["levels"]}
    rotw = d["game_difficulties"]["rotw"]
    dfl = {k: rotw[k]["defaults"] for k in ("normal", "nightmare", "hell")}
    boosts = {v["boost_level"] for v in dfl.values()}
    if len(boosts) != 1:
        raise SystemExit(f"boost_level distinto por dificultad: {boosts} (el motor usa uno solo)")
    tiers = dfl["hell"].get("herald_tiers", [])
    return levels, {
        "b": [[dfl[k]["bound_incl_min"], dfl[k]["bound_incl_max"]] for k in ("normal", "nightmare", "hell")],
        "boost": boosts.pop(),
        "heraldTc": [t.get("herald_treasure_class_level_boost") or 0 for t in tiers],
        "maxTier": rotw["hell"].get("max_herald_tiers") or 0,
    }


def main():
    c = Casc()
    S = strings(c)
    T = {n: table(c, n + ".txt") for n in ["treasureclassex", "weapons", "armor", "misc", "itemtypes", "uniqueitems",
                                           "setitems", "itemratio", "monstats", "superuniques", "levels"]}
    types = {r["Code"]: r for r in T["itemtypes"] if r.get("Code")}
    loc = lambda key, fallback: S.get(key) or {"en": fallback, "es": fallback}
    wiki_bases = {b["code"]: b for b in json.load(open(os.path.join(WIKI, "bases.json"), encoding="utf-8"))}

    # ── Bases ────────────────────────────────────────────────────────────
    bases = {}
    for kind, rows in (("w", T["weapons"]), ("a", T["armor"]), ("m", T["misc"])):
        for r in rows:
            code = r.get("code")
            if not code or code in bases:
                continue
            chain = type_chain(types, r.get("type"))
            if kind == "m":
                # Fuera de armas y armaduras: anillos, amuletos y joyas son como
                # mínimo mágicos; los talismanes, mágicos o únicos; el resto
                # (runas, gemas, pociones, oro, llaves…) sale siempre normal.
                qf = 2 if {"ring", "amul", "jewl"} & set(chain) else 3 if "char" in chain else 1
            else:
                qf = 0
            wb = wiki_bases.get(code) or {}
            bases[code] = {
                "q": num(r.get("level")) or 0, "t": r.get("type"),
                "u": 1 if r.get("normcode") and code != r.get("normcode") else 0,
                "cl": 1 if any(types[t].get("Class") for t in chain) else 0,
                "qf": qf, "k": kind,
                "n": wb.get("name") or loc(code, r.get("name") or code), "img": wb.get("img"),
                # Sólo para armar las TCs automáticas (no se escriben): si cae al azar, el tipo y
                # su cadena, y el peso, que es la Rarity del TIPO en itemtypes y no la "rarity" de la base.
                "_spawn": r.get("spawnable") == "1", "_chain": chain,
                "_weight": (num(types[r["type"]].get("Rarity")) or 0) if r.get("type") in types else 0,
            }

    # ── Treasure Classes ─────────────────────────────────────────────────
    tcs = {}
    for r in T["treasureclassex"]:
        name = r.get("Treasure Class")
        if not name:
            continue
        e = []
        for i in range(1, 11):
            raw, prob = r.get(f"Item{i}"), num(r.get(f"Prob{i}")) or 0
            if not raw or prob <= 0:
                continue
            target, q = entry(raw)
            e.append([target, prob] + ([q] if q else []))
        tc = {"p": num(r.get("Picks")) or 1, "e": e}
        if num(r.get("group")):
            tc["g"] = num(r["group"])
        if num(r.get("level")):
            tc["l"] = num(r["level"])
        q = [num(r.get(k)) or 0 for k in ("Unique", "Set", "Rare", "Magic")]
        if any(q):
            tc["q"] = q
        if num(r.get("NoDrop")):
            tc["nd"] = num(r["NoDrop"])
        cond = condition(r.get("ConditionCalc"))
        if cond:
            tc["c"] = cond
        lad = ladder(r)
        if lad:
            tc["lad"] = lad
        tcs[name] = tc
    # Las TCs automáticas. El juego arma una familia por cada tipo de ítem con
    # TreasureClass=1 en itemtypes (armo, weap, mele, bow y abow), de 3 en 3
    # niveles de calidad: "armo60" son las armaduras de nivel 58 a 60 que caen.
    # La tabla no las trae, pero los monstruos las nombran, así que se arman
    # sólo las familias que alguna TC nombra (nadie usa "abow"). Cada base pesa
    # la Rarity de su tipo (3 casi siempre, 1 en las de una clase), no la
    # "rarity" de la base: con esa, el Shako sería 6% de armo60 y no el 17% que es.
    named = {t for tc in tcs.values() for t, *_ in tc["e"]}
    flagged = [t for t, r in types.items() if r.get("TreasureClass") == "1"]
    for fam in sorted(f for f in flagged if any(re.fullmatch(re.escape(f) + r"\d+", t) for t in named)):
        pool = [(code, b) for code, b in bases.items() if b["_spawn"] and fam in b["_chain"]]
        top = max(b["q"] for _, b in pool)
        for n in range(3, top + 3, 3):
            # Una banda sin ninguna base (no hay arco de nivel 13 a 15) queda vacía y no suelta
            # nada, pero los monstruos la nombran: tiene que existir para que la entrada pese.
            if f"{fam}{n}" not in tcs:
                tcs[f"{fam}{n}"] = {"p": 1, "e": [[code, b["_weight"]] for code, b in pool if n - 3 < b["q"] <= n]}

    uniq_keys = {r["index"] for r in T["uniqueitems"] if r.get("index")}
    set_keys = {r["index"] for r in T["setitems"] if r.get("index")}
    missing = sorted({t for tc in tcs.values() for t, *_ in tc["e"]
                      if t not in tcs and t not in bases and t != "gld" and t not in uniq_keys and t not in set_keys})
    if missing:
        raise SystemExit(f"Entradas de TC sin resolver: {missing[:20]}")

    # ── Únicos y piezas ──────────────────────────────────────────────────
    wiki_u = json.load(open(os.path.join(WIKI, "uniques.json"), encoding="utf-8"))
    pool_rows = [r for r in T["uniqueitems"] if r.get("spawnable") == "1" and r.get("code")]
    if len(pool_rows) != len(wiki_u) or any(w["key"] != r["index"] for w, r in zip(wiki_u, pool_rows)):
        raise SystemExit("uniques.json no sigue a uniqueitems.txt: correr wiki.py primero")
    uniques = []
    for w, r in zip(wiki_u, pool_rows):
        u = {"id": w["id"], "key": r["index"], "code": r["code"], "lvl": num(r.get("lvl")) or 0,
             "rar": num(r.get("rarity")) or 0, "n": w["name"], "img": w.get("img")}
        lad, cond = ladder(r), condition(r.get("DropConditionCalc"))
        if lad:
            u["lad"] = lad
        if cond:
            u["c"] = cond
        uniques.append(u)
    # Los que sólo salen por nombre desde un TC (los de los Ancestros Colosales):
    # no entran al sorteo de su base.
    forced = {t for tc in tcs.values() for t, *_ in tc["e"] if t in uniq_keys}
    have = {u["key"] for u in uniques}
    for r in T["uniqueitems"]:
        if r.get("index") in forced and r["index"] not in have and r.get("code"):
            name = loc(r["index"], r["index"])
            uniques.append({"id": slug(name["en"]), "key": r["index"], "code": r["code"], "lvl": num(r.get("lvl")) or 0,
                            "rar": 0, "f": 1, "n": name, "img": bases.get(r["code"], {}).get("img")})
            have.add(r["index"])

    wiki_s = json.load(open(os.path.join(WIKI, "sets.json"), encoding="utf-8"))
    # Cada pieza con el id de su conjunto: su ficha de la wiki es la del conjunto.
    set_items = {i["key"]: (i, s_["id"]) for s_ in wiki_s for i in s_["items"]}
    sets = []
    for r in T["setitems"]:
        hit = set_items.get(r.get("index"))
        if r.get("spawnable") != "1" or not r.get("item") or not hit:
            continue
        w, set_id = hit
        x = {"id": w["id"], "set": set_id, "key": r["index"], "code": r["item"], "lvl": num(r.get("lvl")) or 0,
             "rar": num(r.get("rarity")) or 0, "n": w["name"], "img": w.get("img")}
        lad = ladder(r)
        if lad:
            x["lad"] = lad
        sets.append(x)

    # ── itemratio (la fila de la expansión) ──────────────────────────────
    ratio = []
    for r in T["itemratio"]:
        if r.get("Version") != "1":
            continue
        g = lambda k: [num(r.get(k)) or 0, num(r.get(k + "Divisor")) or 1, num(r.get(k + "Min")) or 0]
        ratio.append({"u": num(r.get("Uber")) or 0, "cl": num(r.get("Class Specific")) or 0,
                      "U": g("Unique"), "S": g("Set"), "R": g("Rare"), "M": g("Magic")})

    # ── Áreas, jefes y superúnicos, monstruos ────────────────────────────
    ms = {r["Id"]: r for r in T["monstats"] if r.get("Id")}
    tz_levels, tz = terror(c)
    areas, used = [], set()
    for r in T["levels"]:
        lid = num(r.get("Id"))
        lv = [num(r.get(k)) or 0 for k in ("MonLvlEx", "MonLvlEx(N)", "MonLvlEx(H)")]
        if not lid or not any(lv):
            continue
        lists = {k: [r[f"{k}{i}"] for i in range(1, 26)
                     if r.get(f"{k}{i}") and ms.get(r[f"{k}{i}"], {}).get("enabled") == "1"] for k in ("mon", "nmon", "umon")}
        a = {"id": lid, "n": loc(r.get("LevelName"), r["Name"]), "act": (num(r.get("Act")) or 0) + 1, "lv": lv, **lists}
        if lid in tz_levels:
            a["tz"] = 1
        if lid in HELL_ONLY_AREAS:
            a["hell"] = 1
        areas.append(a)
        for k in lists:
            used.update(lists[k])

    su = {r["Superunique"]: r for r in T["superuniques"] if r.get("Superunique")}
    sources = []
    for key, area in SUPER_AREAS.items():
        r = su[key]
        mon = r["Class"]
        name = NAMES.get(key) or loc(r.get("Name"), key)
        sources.append({"id": slug(name["en"]), "kind": "boss" if ms[mon].get("boss") == "1" else "super", "n": name,
                        "mon": mon, "area": area,
                        "tc": [r.get("TC", ""), r.get("TC(N)", ""), r.get("TC(H)", "")],
                        "tcd": [r.get("TC Desecrated", ""), r.get("TC(N) Desecrated", ""), r.get("TC(H) Desecrated", "")]})
        used.add(mon)
    for mon, (sid, area) in BOSSES.items():
        src = {"id": sid, "kind": "boss", "n": NAMES.get(mon) or loc(ms[mon].get("NameStr"), mon),
               "mon": mon, "area": area}
        if mon in HELL_ONLY:
            # Un TC propio vacío en Normal y Pesadilla: ahí el jefe no suelta nada.
            src["tc"] = ["", "", ms[mon].get("TreasureClass(H)", "")]
        sources.append(src)
        used.add(mon)
    ids = [s_["id"] for s_ in sources]
    if len(set(ids)) != len(ids):
        raise SystemExit(f"ids de jefes repetidos: {sorted(i for i in ids if ids.count(i) > 1)}")
    area_ids = {a["id"] for a in areas}
    bad = [s_["id"] for s_ in sources if s_["area"] is not None and s_["area"] not in area_ids]
    if bad:
        raise SystemExit(f"áreas inexistentes: {bad}")
    # Un parche que renumere levels.txt dejaría la marca de Infierno en otras áreas: mejor cortar acá.
    if HELL_ONLY_AREAS - area_ids:
        raise SystemExit(f"áreas de sólo Infierno inexistentes: {sorted(HELL_ONLY_AREAS - area_ids)}")

    monsters = {}
    for mid in sorted(used):
        r = ms[mid]
        m = {"n": loc(r.get("NameStr"), mid), "lv": [num(r.get("Level" + d)) or 0 for d in DIFF_SUFFIX],
             "rar": num(r.get("Rarity")) or 0, "tc": [[r.get(k + d, "") for k in TC_KINDS] for d in DIFF_SUFFIX]}
        if r.get("boss") == "1":
            m["boss"] = 1
        monsters[mid] = m

    # ── Escribir ─────────────────────────────────────────────────────────
    os.makedirs(OUT, exist_ok=True)
    data = {"tcs": tcs, "bases": {k: {kk: vv for kk, vv in v.items() if not kk.startswith("_")} for k, v in bases.items()},
            "uniques": uniques, "sets": sets, "ratio": ratio, "monsters": monsters, "areas": areas,
            "sources": sources, "tz": tz}
    path = os.path.join(OUT, "drops.json")
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(OUT, "index.json"), "w", encoding="utf-8", newline="\n") as f:
        json.dump([{"sec": "drops", "id": s_["id"], "en": s_["n"]["en"], "es": s_["n"]["es"]} for s_ in sources],
                  f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(f"drops: {len(tcs)} TCs · {len(bases)} bases · {len(uniques)} únicos · {len(sets)} piezas · "
          f"{len(monsters)} monstruos · {len(areas)} áreas · {len(sources)} jefes y superúnicos · "
          f"{os.path.getsize(path) // 1024} KB")


if __name__ == "__main__":
    main()
