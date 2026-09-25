"""Árbol de pasivas de Path of Exile 2 → games/poe2/data/tree/ + public/poe2/tree-sprites/.

Ver docs/design/2026-09-25-poe2-arbol-de-pasivas.md. Dos fuentes:

- El export oficial de GGG (github.com/grindinggear/poe2-skilltree-export),
  fijado por commit: nodos con posición, conexiones, clases, ascendencias y las
  hojas de sprites (íconos, marcos, círculo central, arte de cada clase).
- El juego instalado: los nombres y los efectos en español, con las mismas tablas
  que la enciclopedia (`passiveskills`, `characters`, `ascendancy` y las plantillas
  de `passive_skill_stat_descriptions.csd`).

Escribe:
- `tree.json`: geometría, reglas y sprites (lo mismo en los dos idiomas).
- `tree.en.json`, `tree.es.json`: nombre y efectos de cada nodo, clases y ascendencias.
- `gems.json`: slug de la enciclopedia → id de metadata de la gema, para el `.build`.
- `meta.json`: la versión del árbol.

Se corre a mano después de cada parche que cambie el árbol (necesita el juego y oo2core.dll):
    OODLE_DLL=...\\oo2core.dll python games/poe2/pipeline/tree.py
Para otra versión del export, cambiar EXPORT_SHA y VERSION.
"""
import json, math, os, re, shutil, sys, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, os.path.join(HERE, "..", "tools"))
from poe_bundles import Index  # noqa: E402
from poe_dat import translations  # noqa: E402
from poe_csd import Descriptions, clean  # noqa: E402
import tree_portraits  # noqa: E402

VERSION = "0.5.5"
EXPORT_SHA = "bd87e6512c92b868542eddfb1ba4ea8b6dc2da36"
RAW = f"https://raw.githubusercontent.com/grindinggear/poe2-skilltree-export/{EXPORT_SHA}/"
GAME = os.environ.get("POE2_BUNDLES", r"C:/Program Files (x86)/Steam/steamapps/common/Path of Exile 2/Bundles2")
CACHE = os.path.join(ROOT, "games", "poe2", ".cache", "tree-" + EXPORT_SHA[:8])
OUT = os.path.join(ROOT, "games", "poe2", "data", "tree")
PUB = os.path.join(ROOT, "site", "public", "poe2", "tree-sprites")
UA = "vestigo.gg tree/1.0 (contact: grundynicolas021@gmail.com)"

# Las clases que se pueden jugar hoy: las que traen arte en el export.
PLAYABLE = ["Warrior", "Sorceress", "Ranger", "Huntress", "Mercenary", "Witch", "Monk", "Druid"]
SHEETS = ["skills", "skills-disabled", "frame", "group-background", "background", "mastery-effect-active", "mastery-effect-disabled"] + [f"background-{c.lower()}" for c in PLAYABLE]

os.makedirs(CACHE, exist_ok=True)
os.makedirs(OUT, exist_ok=True)
os.makedirs(PUB, exist_ok=True)


def fetch(rel):
    path = os.path.join(CACHE, rel.replace("/", "_"))
    if not os.path.exists(path):
        req = urllib.request.Request(RAW + rel, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=180) as r, open(path, "wb") as f:
            f.write(r.read())
    return path


print("export oficial…")
T = json.load(open(fetch("data.json"), encoding="utf-8"))

print("textos del juego…")
ix = Index(GAME)
PATHS = {k: tuple(v) for k, v in json.load(open(os.path.join(ROOT, "games", "poe2", ".cache", "paths.json"))).items()}


def game_file(p):
    rec = PATHS.get(p.lower())
    return ix.read(rec) if rec else None


def table_tr(name):
    return translations(game_file(f"data/balance/{name}.datc64"), game_file(f"data/balance/spanish/{name}.datc64"))


PS, CH, ASC = table_tr("passiveskills"), table_tr("characters"), table_tr("ascendancy")
UI = table_tr("clientstrings")
SKILLS = table_tr("activeskills")
CSD = Descriptions([game_file(f"data/statdescriptions/{n}.csd").decode("utf-16-le")
                    for n in ("passive_skill_stat_descriptions", "passive_skill_aura_stat_descriptions",
                              "passive_skill_variant_stat_descriptions", "stat_descriptions")])
GEM_ES = {g["en"]: g["es"] for g in json.load(open(os.path.join(ROOT, "games", "poe2", "data", "encyclopedia", "gems.json"), encoding="utf-8"))}


def untag(s):
    """Marcado de la interfaz del juego: "<underline>{Temper Weapon}" → "Temper Weapon"."""
    return re.sub(r"<[^>]+>\{([^{}]*)\}", r"\1", clean(s))


# Líneas que no salen de las plantillas de estadísticas sino de los textos de la
# interfaz (`clientstrings`): la habilidad que otorga un nodo y los puntos extra.
def ui_line(line):
    m = re.fullmatch(r"Grants Skill: (.+)", line)
    if m:
        return UI["Grants Skill: <underline>{{{0}}}"].replace("{{{0}}}", GEM_ES.get(m[1]) or SKILLS.get(m[1]) or PS.get(m[1], m[1])).replace("<underline>", "")
    m = re.fullmatch(r"Grants (\d+) Passive Skill Points?", line)
    if m:
        return UI["Grants {0} Passive Skill Point" + ("" if m[1] == "1" else "s")].replace("{0}", m[1])
    m = re.fullmatch(r"(\d+) Passive Skill Points become Weapon Set Skill Points", line)
    if m:
        return clean(UI["{0} Passive Skill Points become [WeaponSetPassiveSkillPoints|Weapon Set Skill Points]"]).replace("{0}", m[1])
    return None


missing = {"names": 0, "lines": 0}


def es_name(en):
    if not en:
        return ""
    if en not in PS:
        missing["names"] += 1
    return clean(PS.get(en, en))


def es_stat(line):
    # Una estadística puede ocupar varias líneas: primero entera, después por partes.
    line = untag(line)
    whole = CSD.translate(line) or ui_line(line)
    if whole:
        return whole
    out = []
    for part in line.split("\n"):
        t = CSD.translate(part) or ui_line(part)
        if t is None:
            missing["lines"] += 1
            t = part
        out.append(t)
    return "\n".join(out)


# ---------- nodos ----------
def kind(n):
    if n.get("classStartIndex") is not None:
        return "start"
    if n.get("isAscendancyStart"):
        return "asc-start"
    if n.get("isKeystone"):
        return "keystone"
    if n.get("isJewelSocket"):
        return "jewel"
    if n.get("isNotable"):
        return "notable"
    if n.get("isGenericAttribute"):
        return "attr"
    return "small"


raw = {k: n for k, n in T["nodes"].items() if k != "root"}
# Sin conexiones = los notables de Delirio, que no se toman en el árbol. Sin id =
# relleno de las ascendencias que todavía no salieron.
raw = {k: n for k, n in raw.items() if (n["in"] or n["out"]) and n.get("id")}
# Las "maestrías" no se toman en PoE2 (no tienen efecto): son el dibujo de fondo
# de su grupo, que se enciende cuando hay algo tomado en él.
masteries = [[round(n["x"], 1), round(n["y"], 1), n["group"], n["activeEffectImage"]]
             for n in raw.values() if n.get("isMastery") and n.get("activeEffectImage")]
raw = {k: n for k, n in raw.items() if not n.get("isMastery")}

nodes, texts = {}, {"en": {}, "es": {}}
for k, n in raw.items():
    o = {"x": round(n["x"], 1), "y": round(n["y"], 1), "k": kind(n), "g": n["group"], "o": n["orbit"], "gid": n.get("id")}
    if n.get("icon"):
        o["ic"] = n["icon"]
    if n.get("ascendancyId"):
        o["a"] = n["ascendancyId"]
    if n.get("grantedPassivePoints"):
        o["pp"] = n["grantedPassivePoints"]
    if n.get("classStartIndex") is not None:
        o["cs"] = n["classStartIndex"]
    if n.get("unlockConstraint"):
        uc = n["unlockConstraint"]
        o["uc"] = {"a": uc.get("ascendancy"), "n": [str(x) for x in uc.get("nodes", [])]}
    if n.get("multipleChoiceParent") is not None or n.get("isMultipleChoiceOption"):
        parents = [p for p in n["in"] + n["out"] if raw.get(p, {}).get("isMultipleChoice")]
        if parents:
            o["mc"] = parents[0]
    if n.get("hideConnection"):
        o["hc"] = 1
    nodes[k] = o
    name = clean(n.get("name") or "")
    stats = [untag(s) for s in n.get("stats", [])]
    texts["en"][k] = [name, stats]
    texts["es"][k] = [es_name(n.get("name")), [es_stat(s) for s in n.get("stats", [])]]

edges = []
for e in T["edges"]:
    a, b = str(e["from"]), str(e["to"])
    if a in nodes and b in nodes and ("a" in nodes[a]) == ("a" in nodes[b]):
        edges.append([a, b])

groups = {k: [round(g["x"], 1), round(g["y"], 1)] for k, g in T["groups"].items()
          if any(n["g"] == int(k) for n in nodes.values())}

# ---------- clases ----------
classes, cls_tx = [], {"en": {}, "es": {}}
for ci, c in enumerate(T["classes"]):
    if c["name"] not in PLAYABLE:
        continue
    start = next(k for k, n in nodes.items() if n["k"] == "start" and ci in n["cs"])
    ascs = []
    for ai, a in enumerate(c.get("ascendancies", [])):
        ns = [n for n in nodes.values() if n.get("a") == a["id"]]
        entry = {"id": a["id"], "art": ai + 1}
        if a.get("name") and ns:
            cx = sum(n["x"] for n in ns) / len(ns)
            cy = sum(n["y"] for n in ns) / len(ns)
            r = max(math.hypot(n["x"] - cx, n["y"] - cy) for n in ns) + 260
            entry["c"] = [round(cx), round(cy), round(r)]
            cls_tx["en"][a["id"]] = a["name"]
            cls_tx["es"][a["id"]] = ASC.get(a["name"], a["name"])
        ascs.append(entry)
    classes.append({"en": c["name"], "start": start, "asc": ascs, "attr": [c["base_str"], c["base_dex"], c["base_int"]]})
    cls_tx["en"][c["name"]] = c["name"]
    cls_tx["es"][c["name"]] = CH.get(c["name"], c["name"])

# ---------- sprites ----------
sprites = {}
for s in SHEETS:
    j = json.load(open(fetch(f"assets/{s}.json"), encoding="utf-8"))
    img = fetch(f"assets/{j['meta']['image']}")
    shutil.copyfile(img, os.path.join(PUB, j["meta"]["image"]))
    frames = {k: [f["frame"]["x"], f["frame"]["y"], f["frame"]["w"], f["frame"]["h"]] for k, f in j["frames"].items()}
    if s.startswith(("background-", "mastery-effect-")):
        frames = {k.split(":", 1)[1]: v for k, v in frames.items()}  # "Class0"… o la ruta del dibujo
    sprites[s] = {"file": j["meta"]["image"], "w": j["meta"]["size"]["w"], "h": j["meta"]["size"]["h"],
                  "scale": float(j["meta"].get("scale", 1)), "frames": frames}
# Sólo los íconos que usan los nodos que quedan.
used = {n.get("ic") for n in nodes.values()}
for s in ("skills", "skills-disabled"):
    sprites[s]["frames"] = {k: v for k, v in sprites[s]["frames"].items() if k.split(":", 1)[1] in used}
# Los retratos chicos de clase y ascendencia, en una hoja aparte (ver tree_portraits.py).
sprites["portraits"] = tree_portraits.build(sprites, PUB, [c["en"] for c in classes])

tree = {"version": VERSION, "export": EXPORT_SHA, "bounds": [T["min_x"], T["min_y"], T["max_x"], T["max_y"]],
        "classes": classes, "groups": groups, "masteries": masteries, "nodes": nodes, "edges": edges, "sprites": sprites}


def dump(name, obj):
    with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
    print(f"  {name}: {os.path.getsize(os.path.join(OUT, name)) // 1024} KB")


dump("tree.json", tree)
# La versión sola, para la página (que no carga el árbol entero en el HTML).
dump("meta.json", {"version": VERSION, "export": EXPORT_SHA})
for lang in ("en", "es"):
    dump(f"tree.{lang}.json", {"nodes": texts[lang], "names": cls_tx[lang]})

# ---------- gemas: slug → id de metadata ----------
repoe = json.load(open(os.path.join(ROOT, "games", "poe2", ".cache", "repoe-skill_gems.json"), encoding="utf-8"))
by_name = {}
for mid, g in repoe.items():
    dn = (g.get("base_item") or {}).get("display_name")
    if dn and (g.get("base_item") or {}).get("release_state") == "released":
        by_name.setdefault(dn, mid)
enc = json.load(open(os.path.join(ROOT, "games", "poe2", "data", "encyclopedia", "gems.json"), encoding="utf-8"))
gems = {g["slug"]: by_name[g["en"]] for g in enc if g["en"] in by_name}
dump("gems.json", gems)

print(f"nodos {len(nodes)}, aristas {len(edges)}, clases {len(classes)}, gemas {len(gems)}/{len(enc)}")
print(f"sin traducir: {missing['names']} nombres, {missing['lines']} líneas")
