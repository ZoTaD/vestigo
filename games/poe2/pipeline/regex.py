"""Regex de la búsqueda del juego → games/poe2/data/regex/regex.json.

Ver docs/design/2026-09-25-poe2-regex.md. Para cada modificador de piedras guía,
tabletas, reliquias y equipo, el texto que muestra el juego en inglés y en
español, y el pedazo de regex más corto que encuentra esa línea y ninguna otra.

- Qué modificadores hay y sus números: RePoE (`repoe-mods.json`, en la caché de
  la enciclopedia).
- Los textos en español: las plantillas del juego (`poe_csd`); la cabecera, los
  nombres de las bases y las rarezas: `clientstrings` y `baseitemtypes`.

La búsqueda del juego no distingue mayúsculas, acepta regex y 250 caracteres
(0.5.0). Los modificadores de piedras guía se buscan con el rango de la tirada
pegado al número ("12(5-20)%"), así que un número puede venir seguido de su rango.

Se corre a mano después de cada parche (necesita el juego y oo2core.dll):
    OODLE_DLL=...\\oo2core.dll python games/poe2/pipeline/regex.py
"""
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, os.path.join(HERE, "..", "tools"))
from poe_bundles import Index  # noqa: E402
from poe_csd import Descriptions, clean  # noqa: E402
from poe_dat import translations  # noqa: E402

GAME = os.environ.get("POE2_BUNDLES", r"C:/Program Files (x86)/Steam/steamapps/common/Path of Exile 2/Bundles2")
CACHE = os.path.join(ROOT, "games", "poe2", ".cache")
OUT = os.path.join(ROOT, "games", "poe2", "data", "regex")
os.makedirs(OUT, exist_ok=True)

ix = Index(GAME)
PATHS = {k: tuple(v) for k, v in json.load(open(os.path.join(CACHE, "paths.json"))).items()}


def game_file(p):
    return ix.read(PATHS[p.lower()])


def table_tr(name):
    return translations(game_file(f"data/balance/{name}.datc64"), game_file(f"data/balance/spanish/{name}.datc64"))


print("plantillas del juego…")
first = ["stat_descriptions", "map_stat_descriptions", "sanctum_relic_stat_descriptions", "tablet_stat_descriptions"]
csd = [f"data/statdescriptions/{n}.csd" for n in first if f"data/statdescriptions/{n}.csd" in PATHS]
csd += sorted(k for k in PATHS if k.startswith("data/statdescriptions/") and k.endswith(".csd") and k not in csd)
C = Descriptions([game_file(k).decode("utf-16-le") for k in csd])
BT, CS = table_tr("baseitemtypes"), table_tr("clientstrings")
MODS = json.load(open(os.path.join(CACHE, "repoe-mods.json"), encoding="utf-8"))
BASES = json.load(open(os.path.join(CACHE, "repoe-base_items.json"), encoding="utf-8"))

GEAR = {"Body Armour", "Helmet", "Gloves", "Boots", "Shield", "Buckler", "Focus", "One Hand Mace", "Two Hand Mace", "Warstaff", "Spear",
        "Bow", "Crossbow", "Talisman", "Ring", "Amulet", "One Hand Sword", "Dagger", "Two Hand Sword", "One Hand Axe", "Two Hand Axe",
        "Flail", "Staff", "Belt", "Wand", "Sceptre", "Claw", "Quiver"}
POOLS = {
    "waystone": (lambda v: v["domain"] == "area" and v["generation_type"] in ("prefix", "suffix"), {"Map"}),
    "tablet": (lambda v: v["domain"] == "tablet", {"TowerAugmentation"}),
    "relic": (lambda v: v["domain"] == "sanctum_relic", {"Relic"}),
    "gear": (lambda v: v["domain"] == "item" and v["generation_type"] in ("prefix", "suffix"), GEAR),
}
# La cabecera de la piedra guía: la línea "Etiqueta: +N%". [inglés, clave de clientstrings]
HEADER = {
    "rarity": ["Item Rarity", "[ItemRarity|Item Rarity]"],
    "pack": ["Pack Size", "[Pack|Pack Size]"],
    "drop": ["Waystone Drop Chance", "Waystone Drop Chance"],
    "magic": ["Magic Monsters", "Magic Monsters"],
    "rare": ["Rare Monsters", "Rare Monsters"],
    "effect": ["Monster Effectiveness", "[MonsterEffectiveness|Monster Effectiveness]"],
    "mrarity": ["Monster Rarity", "[MonsterRarity|Monster Rarity]"],
}
# Lo que el juego escribe en cualquier objeto además de sus modificadores.
PROPS = ["Item Level", "Requires", "Level", "Quality", "Armour", "Evasion Rating", "Energy Shield", "Physical Damage",
         "Critical Hit Chance", "Attacks per Second", "Spirit", "Block chance", "Corrupted", "Unidentified", "Rarity", "Normal",
         "Magic", "Rare", "Unique", "Mirrored", "Charm Slots", "Reload Time", "Stack Size", "Sockets", "Area Level"]

NUM = re.compile(r"[+-]?\(-?[\d.]+[-–]-?[\d.]+\)|[+-]?\d+(?:\.\d+)?")
BONUS = re.compile(r"_final_from_map$")
MIN = 4  # un pedazo suelto más corto choca con los nombres al azar de los objetos raros


def tr_ui(key):
    return clean(CS.get(key, key))


def tpl(s):
    return re.sub(r"\s+", " ", NUM.sub("#", s)).strip()


def first_range(line):
    m = NUM.search(line)
    if not m:
        return None
    v = [float(x) for x in re.findall(r"-?[\d.]+", m.group(0))]
    return (min(v), max(v))


def es_line(line, mod):
    t = C.translate(line)
    if t:
        return t
    # Algunas líneas salen de la estadística con un número que el inglés no
    # muestra ("to a Map" = a 1 mapa): se escriben desde la plantilla.
    if len(mod["stats"]) == 1:
        s = mod["stats"][0]
        en = C.render([s["id"]], [s["min"]])
        es = C.render([s["id"]], [s["min"]], "Spanish")
        if en and es:
            en_l, es_l = clean(en).split("\n"), clean(es).split("\n")
            for a, b in zip(en_l, es_l):
                if tpl(a).lower() == tpl(line).lower():
                    return b
    return None


# ---------- modificadores ----------
pools = {}
missing = {}
for pool, (keep, _) in POOLS.items():
    lines = {}
    for mid, v in MODS.items():
        if not keep(v) or not v.get("text"):
            continue
        hidden = set()
        if pool == "waystone":
            # las bonificaciones se suman en la cabecera, no aparecen como línea
            for s in v["stats"]:
                if BONUS.search(s["id"]):
                    r = C.render([s["id"]], [s["max"]])
                    if r:
                        hidden |= {clean(x).strip() for x in r.split("\n")}
        for l in (x.strip() for x in clean(v["text"]).split("\n")):
            if not l or l in hidden or not any(ch.isalpha() for ch in l):
                continue
            es = es_line(l, v)
            key = tpl(l).lower()
            d = lines.setdefault(key, {"en": tpl(l), "es": tpl(es) if es else None, "vals": [], "tags": set()})
            r = first_range(l)
            if r:
                d["vals"].append(r)
            if pool == "gear":
                d["tags"] |= set(v.get("implicit_tags", []))
            if pool == "tablet":
                d["tags"] |= {w["tag"].replace("tower_augment_", "") for w in v["spawn_weights"] if w["weight"] > 0 and w["tag"].startswith("tower_augment_")}
    items = []
    for d in lines.values():
        rng = None
        if d["vals"]:
            lo, hi = min(a for a, _ in d["vals"]), max(b for _, b in d["vals"])
            rng = [lo, hi]
        items.append({"en": d["en"], "es": d["es"] or d["en"], "range": rng, "tags": sorted(d["tags"])})
    missing[pool] = sum(1 for d in lines.values() if not d["es"])
    items.sort(key=lambda x: x["en"].lower())
    pools[pool] = items
    print(f"  {pool}: {len(items)} líneas, {missing[pool]} sin español")

# ---------- el pedazo de regex ----------
OK = re.compile(r"[a-z0-9 %+\-',:]")


def to_rx(sub):
    """Plantilla → regex del juego: '#' es un número con signo opcional (y su rango, si
    hay algo después); una letra con tilde o una ñ, cualquier letra."""
    out = []
    for k, ch in enumerate(sub):
        if ch == "#":
            # "\S*": el rango de la tirada va pegado al número, sin espacios
            out.append(r".?\d+" + (r"\S*" if k < len(sub) - 1 else ""))
        elif OK.fullmatch(ch):
            out.append(re.escape(ch).replace("\\ ", " ").replace("\\-", "-").replace("\\'", "'").replace("\\,", ",").replace("\\:", ":").replace("\\%", "%"))
        else:
            out.append(".")
    return "".join(out)


def samples(line):
    """La línea como la escribe el juego: con un número suelto y con número y rango."""
    return [line.replace("#", "+15"), line.replace("#", "+15(10-20)")]


def unique(rx, line, others):
    r = re.compile(rx)
    return any(r.search(s) for s in samples(line)) and not any(r.search(s) for o in others for s in samples(o))


def token(line, others):
    """El regex más corto que encuentra `line` y ninguna de `others` (todas en minúscula)."""
    best = None
    L = line
    # 1) un pedazo sin números, con ancla si hace falta
    for n in range(MIN - 1, len(L) + 1):
        if best and len(best[0]) <= n:
            break
        for i in range(0, len(L) - n + 1):
            s = L[i:i + n]
            if "#" in s or s != s.strip():
                continue
            core = to_rx(s)
            for pre, post in (("", ""), ("^", ""), ("", "$")):
                if pre and i != 0 or post and i + n != len(L):
                    continue
                cand = pre + core + post
                if len(cand) < MIN or (best and len(cand) >= len(best[0])):
                    continue
                if unique(cand, L, others):
                    best = (cand, i, i + n)
    if best:
        return best
    # 2) con el número y anclas, para líneas contenidas enteras en otras
    for i in range(len(L)):
        for j in range(i + 1, len(L) + 1):
            s = L[i:j]
            if s != s.strip():
                continue
            core = to_rx(s)
            for pre, post in (("^", ""), ("", "$"), ("^", "$"), ("", "")):
                if pre and i != 0 or post and j != len(L):
                    continue
                cand = pre + core + post
                if best and len(cand) >= len(best[0]):
                    continue
                if unique(cand, L, others):
                    best = (cand, i, j)
    return best


def token_gap(line, others, limit):
    """Principio y final de la línea con ".*" en el medio, si sale más corto."""
    best = None
    L = line
    for k1 in range(1, min(18, len(L))):
        for k2 in range(1, min(16, len(L) - k1)):
            a, b = L[:k1], L[-k2:]
            if a != a.strip() or b != b.strip():
                continue
            cand = "^" + to_rx(a) + ".*" + to_rx(b) + "$"
            if len(cand) >= limit or (best and len(cand) >= len(best[0])):
                continue
            if unique(cand, L, others):
                best = (cand, 0, len(L))
    return best


def token_mid(line, others, limit):
    """Anclado a una punta con un pedazo del medio: "^vel.*enfr", "enfr.*%$"."""
    best = None
    L = line
    for k in range(1, 7):
        for i in range(k, len(L)):
            for n in range(3, 10):
                mid = L[i:i + n]
                if len(mid) < n or mid != mid.strip():
                    continue
                inside = i + n <= len(L) - k
                for cand in ("^" + to_rx(L[:k]) + ".*" + to_rx(mid),
                             to_rx(mid) + ".*" + to_rx(L[-k:]) + "$" if inside else None,
                             "^" + to_rx(L[:k]) + ".*" + to_rx(mid) + ".*" + to_rx(L[-min(k, 2):]) + "$" if inside else None):
                    if not cand or len(cand) >= limit or (best and len(cand) >= len(best[0])):
                        continue
                    if unique(cand, L, others):
                        best = (cand, 0, len(L))
    return best


def noise(pool, lang):
    out = set()
    for b in BASES.values():
        if b.get("release_state") == "released" and b["item_class"] in POOLS[pool][1]:
            out.add((b["name"] if lang == "en" else BT.get(b["name"], b["name"])).lower())
    for p in PROPS:
        out.add((p if lang == "en" else tr_ui(p)).lower())
    if pool == "waystone":
        for en, key in HEADER.values():
            out.add((en if lang == "en" else tr_ui(key)).lower() + ": #%")
    return sorted(out)


print("pedazos de regex…")
for pool, items in pools.items():
    for lang in ("en", "es"):
        texts = sorted({it[lang].lower() for it in items})
        extra = noise(pool, lang)
        memo = {}
        for it in items:
            t = it[lang].lower()
            if t not in memo:
                others = [o for o in texts if o != t] + extra
                b = token(t, others)
                if b and len(b[0]) > 10:
                    b = token_gap(t, others, len(b[0])) or b
                if b and len(b[0]) > 16:
                    b = token_mid(t, others, len(b[0])) or b
                memo[t] = b
            b = memo[t]
            if not b:
                raise SystemExit(f"sin regex: {pool} {lang} {t}")
            it.setdefault("tok", {})[lang] = b[0]
            it.setdefault("at", {})[lang] = [b[1], b[2]]
    print(f"  {pool}: largo medio {sum(len(it['tok']['es']) for it in items) / len(items):.1f} (es), "
          f"{sum(len(it['tok']['en']) for it in items) / len(items):.1f} (en)")

# ---------- cabecera, nombre y rareza ----------
header = {}
for key, (en, ck) in HEADER.items():
    header[key] = {"en": en, "es": tr_ui(ck)}
for lang in ("en", "es"):
    labels = [h[lang].lower() for h in header.values()]
    lines = [it[lang].lower() for it in pools["waystone"]]
    for key, h in header.items():
        # el final de la etiqueta con sus dos puntos: "…raros:" no aparece en ningún modificador
        label = h[lang].lower() + ":"
        others = [l + ":" for l in labels if l + ":" != label] + lines + [p + ":" for p in noise("waystone", lang) if "#" not in p]
        best = None
        for i in range(len(label) - 5, -1, -1):
            cand = to_rx(label[i:])
            if label[i] != " " and not any(re.search(cand, o) for o in others):
                best = cand
                break
        h["tok_" + lang] = best

rar = {k: {"en": k, "es": tr_ui(k)} for k in ("Normal", "Magic", "Rare", "Unique")}
data = {
    "pools": pools,
    "header": header,
    "rarity": {"label": {"en": "Rarity", "es": tr_ui("Rarity")}, "values": rar},
    "tier": {"en": "Waystone (Tier #)", "es": BT.get("Waystone (Tier 1)", "").replace("1", "#")},
    "corrupted": {"en": "Corrupted", "es": tr_ui("Corrupted")},
}
with open(os.path.join(OUT, "regex.json"), "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
print(f"regex.json: {os.path.getsize(os.path.join(OUT, 'regex.json')) // 1024} KB")
print("cabecera:", {k: (h["tok_es"], h["tok_en"]) for k, h in header.items()})
print("grado:", data["tier"])
