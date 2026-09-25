"""Enciclopedia de Path of Exile 2 → games/poe2/data/encyclopedia/ + public/poe2/art/.

Junta tres fuentes (ver docs/design/2026-09-23-poe2-enciclopedia-y-parches.md):

- RePoE (repoe-fork.github.io/poe2): qué gemas, bases, únicos y monedas hay, con
  sus números. Sólo en inglés.
- El juego instalado: los dibujos (.dds → webp) y **los textos oficiales en
  español**: las tablas `data/balance/spanish/*.datc64` (nombres, descripciones)
  y las plantillas de `data/statdescriptions/*.csd` (cada línea de estadística).
- La economía (`games/poe2/data/economy/`): los modificadores de los únicos, que
  RePoE no trae, y el enlace a su precio.

Se corre a mano después de cada parche (necesita el juego y oo2core.dll):
    OODLE_DLL=...\\oo2core.dll python games/poe2/pipeline/encyclopedia.py [--art]
`--art` vuelve a escribir los dibujos aunque ya existan.
"""
import io, json, os, re, sys, unicodedata, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, os.path.join(HERE, "..", "tools"))
from poe_bundles import Index  # noqa: E402
from poe_dat import translations  # noqa: E402
from poe_csd import Descriptions, clean  # noqa: E402

GAME = os.environ.get("POE2_BUNDLES", r"C:/Program Files (x86)/Steam/steamapps/common/Path of Exile 2/Bundles2")
CACHE = os.path.join(ROOT, "games", "poe2", ".cache")
OUT = os.path.join(ROOT, "games", "poe2", "data", "encyclopedia")
ART = os.path.join(ROOT, "site", "public", "poe2", "art")
REPOE = "https://repoe-fork.github.io/poe2/"
UA = "vestigo.gg encyclopedia/1.0 (contact: grundynicolas021@gmail.com)"
FORCE_ART = "--art" in sys.argv
CELL = 54  # px por casilla del inventario: un único 2×4 queda en 108×216.

os.makedirs(CACHE, exist_ok=True)
os.makedirs(OUT, exist_ok=True)


def fetch(url, name):
    path = os.path.join(CACHE, name)
    if not os.path.exists(path):
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=120) as r, open(path, "wb") as f:
            f.write(r.read())
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def repoe(name):
    return fetch(REPOE + name + ".min.json", "repoe-" + name + ".json")


def slugify(s):
    # Como `slugify` del sitio: el apóstrofo se va sin dejar guion ("Alchemist's Boon" → alchemists-boon).
    s = unicodedata.normalize("NFKD", s.replace("'", "").replace("’", "")).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


# ---------- el juego ----------
print("índice del juego…")
ix = Index(GAME)
paths_file = os.path.join(CACHE, "paths.json")
if os.path.exists(paths_file):
    PATHS = {k: tuple(v) for k, v in json.load(open(paths_file)).items()}
else:
    print("  rutas (una vez, tarda)…")
    PATHS = {k: v for k, v in ix.paths().items() if k.startswith(("data/", "art/2d"))}
    json.dump(PATHS, open(paths_file, "w"))


def game_file(path):
    rec = PATHS.get(path.lower())
    return ix.read(rec) if rec else None


def table_tr(name):
    """Inglés → español de una tabla entera; {} si el juego no la trae."""
    en = game_file(f"data/balance/{name}.datc64")
    es = game_file(f"data/balance/spanish/{name}.datc64")
    if not en or not es:
        print(f"  sin tabla {name}")
        return {}
    try:
        return translations(en, es)
    except ValueError as e:
        print(f"  {name}: {e}")
        return {}


print("textos en español…")
TR = {n: table_tr(n) for n in [
    "baseitemtypes", "words", "activeskills", "gemtags", "itemclasses", "flavourtext",
    "gemeffects", "skillgeminfo", "currencyitems", "itemclasscategories", "currencyexchangecategories",
    "soulcorestatcategories", "supportgemfamily", "grantedeffectlabels",
]}
ALL_TR = {}
for d in TR.values():
    for k, v in d.items():
        ALL_TR.setdefault(k, v)

# Las generales primero y después las 580 y pico de cada habilidad
# (`specific_skill_stat_descriptions/*.csd`): ante dos plantillas con la misma
# forma gana la general.
_first = ["stat_descriptions", "gem_stat_descriptions", "active_skill_gem_stat_descriptions",
          "skill_stat_descriptions", "meta_gem_stat_descriptions"]
_csd = [f"data/statdescriptions/{n}.csd" for n in _first]
_csd += sorted(k for k in PATHS if k.startswith("data/statdescriptions/") and k.endswith(".csd") and k not in _csd)
CSD = Descriptions([b.decode("utf-16-le") for b in (game_file(k) for k in _csd) if b])
print(f"  {len(_csd)} archivos de plantillas")
missing = {"lines": 0, "all": 0}
# Nombres de habilidad inglés → español, del más largo al más corto (se llena con las gemas).
GEM_NAMES = {}


def es_text(en, table=None):
    """El texto oficial en español, o None."""
    if not en:
        return None
    src = TR.get(table, {}) if table else ALL_TR
    v = src.get(en) or ALL_TR.get(en)
    return clean(v) if v else None


def es_line(en_line):
    """Una línea de estadística en inglés → español (plantilla oficial)."""
    if not en_line or not en_line.strip():
        return None
    missing["all"] += 1
    # Primero la línea entera (hay plantillas de varios renglones); si no está,
    # renglón por renglón (el juego a veces junta dos líneas en una).
    whole = CSD.translate(en_line)
    if whole is not None:
        return whole
    # Líneas que nombran una habilidad ("+1 to Level of all Earthquake Skills"):
    # el nombre va como un número centinela, se traduce la plantilla y después
    # se pone el nombre oficial en español en su lugar.
    for name in GEM_NAMES:
        if name in en_line:
            t = CSD.translate(en_line.replace(name, "987654"))
            if t and "987654" in t:
                return t.replace("987654", GEM_NAMES[name])
    out = []
    for part in clean(en_line).split("\n"):
        t = CSD.translate(part)
        if t is None:
            missing["lines"] += 1
            return None
        out.append(t)
    return "\n".join(out)


def pair(en_line):
    en = clean(en_line)
    return {"en": en, "es": es_line(en_line) or en}


# ---------- dibujos ----------
written = {"n": 0, "bytes": 0}


def art(dds, _rel, box):
    """Guarda el .dds del juego como webp en public/poe2/art/ y devuelve la URL.

    El nombre sale de la ruta del .dds, no de la ficha: las 1.600 bases usan
    ~500 dibujos (las "Runeforged" repiten el de su base), y así cada uno se
    guarda una sola vez.
    """
    if not dds:
        return None
    rel = re.sub(r"^art/", "", re.sub(r"\.dds$", "", dds.lower())).replace(" ", "_")
    url = f"/poe2/art/{rel}.webp"
    dest = os.path.join(ART, *rel.split("/")) + ".webp"
    if os.path.exists(dest) and not FORCE_ART:
        written["bytes"] += os.path.getsize(dest)
        return url
    b = game_file(dds)
    if not b:
        return None
    from PIL import Image
    try:
        im = Image.open(io.BytesIO(b))
        im.load()
    except Exception as e:  # un formato que Pillow no abre: se sigue sin dibujo
        print(f"  no abre {dds}: {e}")
        return None
    im = im.convert("RGBA")
    im.thumbnail(box, Image.LANCZOS)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    im.save(dest, "webp", quality=82, method=6)
    written["n"] += 1
    written["bytes"] += os.path.getsize(dest)
    return url


# ---------- lo que está en el juego ----------
# El buscador de comercio lista lo que de verdad existe (RePoE trae también
# bases de PoE1 que siguen en los archivos). Es el mismo pedido que hace la
# economía; sólo se usa para filtrar.
trade = fetch("https://www.pathofexile.com/api/trade2/data/items", "trade-items-en.json")["result"]
TRADE = {c["id"]: {e.get("type") for e in c["entries"]} for c in trade}
TRADE_NAMES = {c["id"]: {e.get("name") for e in c["entries"] if e.get("name")} for c in trade}

base_items = repoe("base_items")
skill_gems = repoe("skill_gems")
skills = repoe("skills")
uniques = repoe("uniques")
item_classes = repoe("item_classes")
gem_tags = repoe("gem_tags")
flavour = repoe("flavour")
augments = repoe("augments")
mods = repoe("mods")


def class_name(cls):
    en = item_classes.get(cls, {}).get("name") or cls
    return {"en": en, "es": es_text(en, "itemclasses") or en}


def uniq_slug(seen, s):
    base, k = s, 2
    while s in seen:
        s = f"{base}-{k}"
        k += 1
    seen.add(s)
    return s


def mod_lines(mod_ids):
    """Los implícitos de una base: el mod con su rango, escrito por el juego."""
    out = []
    for mid in mod_ids:
        m = mods.get(mid)
        if not m or not m.get("stats"):
            continue
        ids = [s["id"] for s in m["stats"]]
        lo = [s["min"] for s in m["stats"]]
        hi = [s["max"] for s in m["stats"]]
        line = {}
        for lang in ("English", "Spanish"):
            a = CSD.render(ids, lo, lang)
            b = CSD.render(ids, hi, lang)
            if a is None:
                break
            if b and a != b:
                # Mismo texto con los números distintos: se escriben como rango.
                na, nb = re.findall(r"-?\d+(?:\.\d+)?", a), re.findall(r"-?\d+(?:\.\d+)?", b)
                if len(na) == len(nb):
                    it = iter(zip(na, nb))
                    a = re.sub(r"-?\d+(?:\.\d+)?", lambda _m: (lambda x: x[0] if x[0] == x[1] else f"({x[0]}-{x[1]})")(next(it)), a)
            line["en" if lang == "English" else "es"] = a
        if "en" in line:
            line.setdefault("es", line["en"])
            out.append(line)
    return out


index = []

# ---------- gemas ----------
print("gemas…")
GEM_TRADE = TRADE.get("gem", set())
gems, seen = [], set()
tag_names = {k: {"en": clean(v), "es": clean(es_text(v, "gemtags") or v)} for k, v in gem_tags.items() if v}
gem_slug_by_id = {}


def level_lines(stat_set):
    """Las líneas de un conjunto de estadísticas, con los números por nivel (1 a 20).

    En vez de repetir la línea veinte veces se guarda la plantilla con los
    números que cambian como {0}, {1}… y la lista de esos números por nivel.
    """
    static = [pair(t) for t in (stat_set.get("static", {}).get("stat_text") or {}).values() if t and t.strip()]
    per = stat_set.get("per_level") or {}
    levels = [str(i) for i in range(1, 21) if str(i) in per]
    keys = []
    for lv in levels:
        for k in (per[lv].get("stat_text") or {}):
            if k not in keys:
                keys.append(k)
    out = []
    for k in keys:
        texts_en = [clean((per[lv].get("stat_text") or {}).get(k, "")) for lv in levels]
        texts_es = [es_line(t) or t if t else "" for t in texts_en]
        entry = {}
        for lang, texts in (("en", texts_en), ("es", texts_es)):
            present = [t for t in texts if t]
            if not present:
                break
            nums = [re.findall(r"-?\d+(?:\.\d+)?", t) for t in texts]
            ref = present[0]
            ref_nums = re.findall(r"-?\d+(?:\.\d+)?", ref)
            shape = re.sub(r"-?\d+(?:\.\d+)?", "#", ref)
            same = all((re.sub(r"-?\d+(?:\.\d+)?", "#", t) == shape) for t in present)
            if not same:
                # La línea cambia de forma entre niveles: se guarda entera por nivel.
                entry[lang] = {"t": None, "v": texts}
                continue
            vary = [i for i in range(len(ref_nums)) if len({(n[i] if len(n) > i else None) for n, t in zip(nums, texts) if t}) > 1]
            cnt = iter(range(99))
            pos = iter(range(99))

            def rep(m):
                i = next(pos)
                return "{%d}" % next(cnt) if i in vary else m.group(0)

            tmpl = re.sub(r"-?\d+(?:\.\d+)?", rep, ref)
            vals = [[n[i] for i in vary] if t else None for n, t in zip(nums, texts)]
            entry[lang] = {"t": tmpl, "v": vals if vary else None}
        if "en" in entry:
            entry.setdefault("es", entry["en"])
            out.append(entry)
    return static, out, len(levels)


# Una ficha por nombre: el juego trae variantes internas con el mismo nombre
# (la "Herald of Ash" que da un único, la "Blink" de arena) que para el que
# busca son la misma gema y para Google serían páginas duplicadas. Se queda la
# normal: la que se talla (crafting_level > 0) y no viene de un único.
def _gem_rank(kv):
    gid, g = kv
    return (g["base_item"]["display_name"], "Unique" in gid, not g.get("crafting_level"), gid)


_seen_gem_names = set()
for gid, g in sorted(skill_gems.items(), key=_gem_rank):
    en = g["base_item"]["display_name"]
    if en not in GEM_TRADE or en.startswith("[") or en in _seen_gem_names:
        continue
    _seen_gem_names.add(en)
    slug = uniq_slug(seen, slugify(en))
    gem_slug_by_id[g["base_item"]["id"]] = slug
    kind = "support" if g["gem_type"] == "support" else ("spirit" if g["gem_type"] == "spirit" else "active")
    sk = skills.get((g.get("grants_skills") or [None])[0]) or {}
    act = sk.get("active_skill") or {}
    desc_en = clean(act.get("description") or g.get("support_text") or "").strip()
    desc_es = es_text(act.get("description"), "activeskills") or es_text(g.get("support_text")) or None
    # Una habilidad puede tener variantes ("Fire-Infused" en Cometa): cada una
    # va aparte con su etiqueta, como en el tooltip del juego.
    sets, nlev = [], 0
    for ss in sk.get("stat_sets") or []:
        st, pl, n = level_lines(ss)
        lab = (ss.get("label") or [None, None])[1]
        sets.append({"label": {"en": lab, "es": clean(es_text(lab, "grantedeffectlabels") or lab)} if lab else None,
                     "static": st, "levels": pl})
        nlev = max(nlev, n)
    tags = [tag_names[t] for t in g.get("tags", []) if t in tag_names and t not in ("support", "grants_active_skill")]
    color = {"r": "str", "g": "dex", "b": "int"}.get(g.get("color"), "none")
    icon = art(g.get("icon_dds_file"), f"gems/{slug}", (64, 64))
    row = {
        "slug": slug, "en": en, "es": es_text(en, "baseitemtypes") or en, "icon": icon,
        "kind": kind, "color": color, "tags": tags,
        "desc": {"en": desc_en, "es": clean(desc_es).strip() if desc_es else desc_en},
        "sets": sets, "nlev": nlev,
        "cast": sk.get("cast_time"), "lineage": bool(g.get("is_lineage")),
        "types": [t for t in act.get("types", []) if t in ("Attack", "Spell", "Minion", "Aura", "Curse", "Warcry", "Totem", "Trap", "Mark", "Herald", "Meta", "Persistent", "Channel", "Projectile", "Area", "Melee", "Buff", "Duration")],
        "supports": g.get("recommended_supports") or [],
    }
    gems.append(row)
for row in gems:
    if row["es"] != row["en"]:
        GEM_NAMES[row["en"]] = row["es"]
GEM_NAMES = dict(sorted(GEM_NAMES.items(), key=lambda kv: -len(kv[0])))
for row in gems:
    row["supports"] = [gem_slug_by_id[s] for s in row["supports"] if s in gem_slug_by_id][:8]
    index.append({"id": f"gems/{row['slug']}", "cat": "gems", "en": row["en"], "es": row["es"], "icon": row["icon"],
                  "sub": row["kind"]})
print(f"  {len(gems)} gemas")

# ---------- bases ----------
print("bases…")
EQUIP = {
    "weapon": ["One Hand Mace", "Two Hand Mace", "Warstaff", "Spear", "Bow", "Crossbow", "Talisman", "Sceptre", "Wand",
               "Staff", "Flail", "One Hand Sword", "Two Hand Sword", "One Hand Axe", "Two Hand Axe", "Dagger", "Claw"],
    "armour": ["Body Armour", "Helmet", "Gloves", "Boots", "Shield", "Buckler", "Focus", "Quiver"],
    "jewellery": ["Ring", "Amulet", "Belt", "Jewel"],
    "flask": ["LifeFlask", "ManaFlask", "UtilityFlask"],
}
GROUP_OF = {c: g for g, cs in EQUIP.items() for c in cs}
exists = set().union(*(TRADE.get(k, set()) for k in ("weapon", "armour", "accessory", "jewel", "flask")))
bases, seen = [], set()
base_by_name = {}
PROPS = [("armour", "Armour"), ("evasion", "Evasion Rating"), ("energy_shield", "Energy Shield"), ("block", "Block chance")]
for bid, b in sorted(base_items.items(), key=lambda kv: (kv[1]["item_class"], kv[1].get("drop_level", 0))):
    cls = b["item_class"]
    if cls not in GROUP_OF or b["name"] not in exists or b.get("release_state") != "released":
        continue
    # El juego lista algunas bases dos veces (mismo nombre, otro id interno): una sola ficha.
    if b["name"] in base_by_name:
        continue
    slug = uniq_slug(seen, slugify(b["name"]))
    pr = b.get("properties") or {}
    props = {}
    for k in ("armour", "evasion", "energy_shield"):
        if isinstance(pr.get(k), dict):
            props[k] = [pr[k]["min"], pr[k]["max"]]
    for k in ("block", "physical_damage_min", "physical_damage_max", "attack_time", "critical_strike_chance",
              "range", "reload_time", "spirit", "charges_max", "charges_per_use", "life_per_use", "mana_per_use", "duration"):
        if pr.get(k) is not None and not isinstance(pr.get(k), dict):
            props[k] = pr[k]
    w, h = b.get("inventory_width", 1), b.get("inventory_height", 1)
    icon = art((b.get("visual_identity") or {}).get("dds_file"), f"bases/{slug}", (CELL * w, CELL * h))
    row = {
        "slug": slug, "en": b["name"], "es": es_text(b["name"], "baseitemtypes") or b["name"], "icon": icon,
        "group": GROUP_OF[cls], "cls": class_name(cls), "w": w, "h": h, "drop": b.get("drop_level", 0),
        "req": {k: v for k, v in (b.get("requirements") or {}).items() if v},
        "props": props, "implicits": mod_lines(b.get("implicits") or []),
    }
    bases.append(row)
    base_by_name[b["name"]] = row
    index.append({"id": f"bases/{slug}", "cat": "bases", "en": row["en"], "es": row["es"], "icon": icon, "sub": cls})
print(f"  {len(bases)} bases")

# ---------- únicos ----------
print("únicos…")
eco_dir = os.path.join(ROOT, "games", "poe2", "data", "economy")
eco_idx = json.load(open(os.path.join(eco_dir, "leagues.json"), encoding="utf-8"))["leagues"]
eco_rows = {}
# La liga por defecto primero; las demás completan los únicos que ahí no se venden.
for lg in eco_idx:
    try:
        eco = json.load(open(os.path.join(eco_dir, lg["slug"] + ".json"), encoding="utf-8"))
    except FileNotFoundError:
        continue
    for tab in eco["uniques"]:
        for r in tab["rows"]:
            cur = eco_rows.get(r["en"])
            better = cur is None or (cur.get("corrupted") and not r.get("corrupted"))
            if better:
                eco_rows[r["en"]] = {**r, "league": lg["slug"]}
UNIQ_TRADE = set().union(*TRADE_NAMES.values())
uniq_out, seen = [], set()
for key, u in sorted(uniques.items(), key=lambda kv: kv[1]["name"]):
    en = u["name"]
    if en not in UNIQ_TRADE and en not in eco_rows:
        continue
    # Variantes del mismo único (otra base, otro dibujo): una sola ficha, la primera.
    if any(r["en"] == en for r in uniq_out):
        continue
    slug = uniq_slug(seen, slugify(en))
    e = eco_rows.get(en)
    w, h = u.get("inventory_width", 1), u.get("inventory_height", 1)
    icon = art((u.get("visual_identity") or {}).get("dds_file"), f"uniques/{slug}", (CELL * w, CELL * h))
    vid = (u.get("visual_identity") or {}).get("id", "")
    fl_en = flavour.get(vid) or flavour.get(vid.replace("Four", "", 1))
    base_en = e["baseEn"] if e else None
    row = {
        "slug": slug, "en": en, "es": es_text(en, "words") or (e["es"] if e else en), "icon": icon,
        "cls": class_name(u["item_class"]), "w": w, "h": h,
        "base": {"en": base_en, "es": es_text(base_en, "baseitemtypes") or (e["base"] if e else base_en)} if base_en else None,
        "baseSlug": base_by_name[base_en]["slug"] if base_en in base_by_name else None,
        "lvl": e["lvl"] if e else 0,
        "imps": [{"en": m, "es": es_line(m) or (e["imps"][i] if i < len(e["imps"]) else m)} for i, m in enumerate(e["impsEn"])] if e else [],
        "mods": [{"en": m, "es": es_line(m) or (e["mods"][i] if i < len(e["mods"]) else m)} for i, m in enumerate(e["modsEn"])] if e else [],
        "flavour": {"en": clean(fl_en), "es": clean(es_text(fl_en, "flavourtext") or fl_en)} if fl_en else None,
        "price": {"league": e["league"], "v": e["v"], "id": e["id"]} if e else None,
    }
    uniq_out.append(row)
    index.append({"id": f"uniques/{slug}", "cat": "uniques", "en": row["en"], "es": row["es"], "icon": icon, "sub": u["item_class"]})
print(f"  {len(uniq_out)} únicos ({sum(1 for r in uniq_out if r['mods'])} con modificadores)")

# ---------- monedas ----------
print("monedas…")
CUR_TRADE = TRADE.get("currency", set())
aug_by_id = augments
currency, seen = [], set()
for bid, b in sorted(base_items.items(), key=lambda kv: kv[1]["name"]):
    if b["name"] not in CUR_TRADE or b.get("release_state") != "released" or b["name"].startswith("["):
        continue
    if any(r["en"] == b["name"] for r in currency):
        continue
    slug = uniq_slug(seen, slugify(b["name"]))
    pr = b.get("properties") or {}
    desc = clean(pr.get("description") or "")
    dirs = clean(pr.get("directions") or "")
    aug = aug_by_id.get(bid)
    effects = []
    if aug:
        for cat, c in (aug.get("categories") or {}).items():
            lines = [pair(t) for t in c.get("stat_text", [])]
            effects.append({"on": class_name_en if (class_name_en := None) else {"en": cat, "es": es_text(cat) or cat}, "lines": lines})
    icon = art((b.get("visual_identity") or {}).get("dds_file"), f"currency/{slug}", (CELL * b.get("inventory_width", 1), CELL * b.get("inventory_height", 1)))
    row = {
        "slug": slug, "en": b["name"], "es": es_text(b["name"], "baseitemtypes") or b["name"], "icon": icon,
        "cls": class_name(b["item_class"]),
        "desc": {"en": desc, "es": clean(es_text(pr.get("description")) or desc)} if desc else None,
        "dirs": {"en": dirs, "es": clean(es_text(pr.get("directions")) or dirs)} if dirs else None,
        "stack": pr.get("stack_size"), "lvl": aug.get("required_level") if aug else None,
        "effects": effects,
    }
    currency.append(row)
    index.append({"id": f"currency/{slug}", "cat": "currency", "en": row["en"], "es": row["es"], "icon": icon, "sub": b["item_class"]})
print(f"  {len(currency)} monedas")


def disambiguate(rows, cat):
    """Dos fichas distintas con el mismo nombre en español llevan el inglés al lado.

    La traducción oficial tiene huecos: "Cannibalism I" y "Cannibalism II" son
    las dos "Canibalismo I", y varias bases "Runeforged" quedan con el nombre de
    la base común (su buscador de comercio en español tiene el mismo problema).
    No se inventa una traducción: se agrega el nombre inglés, que no es ambiguo.
    """
    by = {}
    for r in rows:
        by.setdefault(r["es"], []).append(r)
    for es, group in by.items():
        if len(group) > 1 and len({r["en"] for r in group}) > 1:
            for r in group:
                if r["es"] != r["en"]:
                    r["es"] = f"{es} ({r['en']})"
    names = {f"{cat}/{r['slug']}": r["es"] for r in rows}
    for e in index:
        if e["id"] in names:
            e["es"] = names[e["id"]]


for _rows, _cat in ((gems, "gems"), (bases, "bases"), (uniq_out, "uniques"), (currency, "currency")):
    disambiguate(_rows, _cat)


def dump(name, data):
    path = os.path.join(OUT, name)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    return os.path.getsize(path)


sizes = {
    "gems": dump("gems.json", gems), "bases": dump("bases.json", bases),
    "uniques": dump("uniques.json", uniq_out), "currency": dump("currency.json", currency),
    "index": dump("index.json", index),
}
print("JSON:", {k: f"{v / 1024:.0f} KB" for k, v in sizes.items()})
print(f"dibujos: {written['n']} nuevos · {written['bytes'] / 1024 / 1024:.1f} MB en total")
print(f"líneas sin plantilla en español: {missing['lines']}/{missing['all']}")
