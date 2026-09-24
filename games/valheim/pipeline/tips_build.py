"""
Ataques y consejos de cada criatura y jefe → `data/tips.json`.

Los ataques salen de la ficha de la wiki local (`damage 0star` y `abilities`
de `{{Infobox creature}}`, ver `wiki.py`): nombre, daño por tipo y enfriamiento.
Los consejos NO se copian de la wiki (es CC BY-SA y ZoTaD quiere texto propio):
están redactados a mano en `data/tips-src.json`, junto con la traducción de los
nombres de ataque y de los grupos ("Con tronco", "Mago de fuego"…).

Correr:  cd games/valheim && .venv/Scripts/python -m pipeline.tips_build

`tips-src.json`:
  attack_names   nombre en la wiki → "español" o {"en": …, "es": …} (para
                 prolijar el inglés: "Log swing V" → "Log swing (vertical)").
  groups         lo mismo para los grupos de ataques ("Unarmed", "Fire mage"…).
  creatures      nombre del sitio (name.en) → {"tips": {"en": […], "es": […]},
                 y opcionales "wiki" (título de la página si no coincide),
                 "group" (quedarse con un solo grupo: Zil y Thungr por separado),
                 "stars" (qué ficha de daño leer; Lord Reto sólo trae la de 2★),
                 "attack_names" (nombres propios: el "Attack" del jabalí es una cornada),
                 "skip_attacks" (lo que la ficha lista pero el juego no usa)}.

Una criatura sale en el JSON si tiene ataques o consejos. Las que no tienen
página en la wiki ni entrada en el fuente (el Norte profundo) quedan afuera.
"""
import json
import os
import re
import sys

from . import wiki

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(HERE, "data")
SITE = os.path.join(DATA, "site")
SRC = os.path.join(DATA, "tips-src.json")
OUT = os.path.join(DATA, "tips.json")

# Las llaves de daño del sitio.
TYPES = ["slash", "blunt", "pierce", "chop", "pickaxe", "fire", "frost", "lightning", "poison", "spirit"]
_T = "|".join(TYPES)
_NUM_TYPE = re.compile(r"(\d+(?:\.\d+)?)\s*(" + _T + r")\b", re.I)
_TYPE_NUM = re.compile(r"\b(" + _T + r")\s+(\d+(?:\.\d+)?)", re.I)

# Sufijo para la segunda parte de un ataque "impacto + área" ("130 Fire + 100 Fire").
AREA = {"en": " (area)", "es": " (área)"}


def key(name: str) -> str:
    """Para cruzar el nombre de `damage` con el de `abilities`: "Claws" = "Claw", "Pierce AOE" = "Pierce AoE"."""
    s = re.sub(r"[^a-z0-9 ]+", " ", name.lower())
    s = re.sub(r"\s+", " ", s).strip()
    return " ".join(w[:-1] if len(w) > 3 and w.endswith("s") else w for w in s.split())


def damage_of(text: str) -> dict:
    """ "40 Fire 20 Lightning, 50 Chop" → {"fire": 40, "lightning": 20, "chop": 50}. También "Fire 80"."""
    out = {}
    for n, t in _NUM_TYPE.findall(text):
        out[t.lower()] = out.get(t.lower(), 0) + float(n)
    if not out:
        for t, n in _TYPE_NUM.findall(text):
            out[t.lower()] = out.get(t.lower(), 0) + float(n)
    return {t: int(v) if float(v).is_integer() else v for t, v in sorted(out.items(), key=lambda kv: TYPES.index(kv[0]))}


def lines(field: str):
    """Las líneas de una lista de la ficha: (nivel, texto). Sin viñetas, nivel 0."""
    for raw in (field or "").split("\n"):
        raw = wiki.plain(raw).strip()
        if not raw:
            continue
        m = re.match(r"^(\*+)\s*(.*)$", raw)
        yield (len(m.group(1)), m.group(2).strip()) if m else (0, raw)


def parse_damage(field: str):
    """`damage Nstar` → [(grupo, nombre, texto del daño)]. Un "* Unarmed:" sin números abre un grupo."""
    out, group, depth = [], None, None
    for lvl, text in lines(field):
        name, sep, rest = text.partition(":")
        name = name.strip()
        has_dmg = bool(_NUM_TYPE.search(text) or _TYPE_NUM.search(text))
        if not has_dmg:
            # "* Unarmed:", "*Sledge", "* Fire mage:" → grupo; "Unknown", "0" → nada.
            if lvl and not re.search(r"\d", text):
                group, depth = name, lvl
            continue
        if group and depth is not None and lvl <= depth:
            group = None
        if not sep:  # "100 Frost" o "* 100 Slash": sin nombre, se completa con `abilities`.
            name, rest = "", text
        out.append((group, name, rest))
    return out


def parse_abilities(field: str):
    """`abilities` → [(grupo, nombre, enfriamiento en s o None)]."""
    out, group, depth = [], None, None
    items = list(lines(field))
    for i, (lvl, text) in enumerate(items):
        nxt = items[i + 1][0] if i + 1 < len(items) else 0
        # "* Unarmed:" o "*Sledge" seguido de "**…": es un grupo, no una habilidad.
        if text.endswith(":") or (lvl and nxt > lvl):
            group, depth = text.rstrip(":").strip(), lvl
            continue
        if group and depth is not None and lvl <= depth:
            group = None
        m = re.match(r"^([^()]+?)\s*(?:\(([^)]*)\))?$", text)
        if not m or len(m.group(1)) > 28 or " when " in text:
            continue  # "Regular Fuling shaman abilities when alone"
        cd = re.match(r"\s*(\d+(?:\.\d+)?)\s*s\b", m.group(2) or "")
        out.append((group, m.group(1).strip(), float(cd.group(1)) if cd else None))
    return out


def bilingual(name: str, table: dict, missing: set, what: str) -> dict:
    v = table.get(name)
    if v is None:
        missing.add(f"{what}: {name}")
        return {"en": name, "es": name}
    if isinstance(v, str):
        return {"en": name, "es": v}
    return {"en": v.get("en", name), "es": v["es"]}


def attacks_for(fields: dict, src: dict, cfg: dict, missing: set) -> list:
    stars = cfg.get("stars")
    dmg_field = fields.get(f"damage {stars}star") if stars is not None else None
    if dmg_field is None:
        dmg_field = fields.get("damage 0star") or fields.get("damage 2star") or ""
    dmg = parse_damage(dmg_field)
    abil = parse_abilities(fields.get("abilities", ""))
    # Los nombres propios de la criatura ("Attack" del jabalí es una cornada) pisan a los generales.
    names = {**src.get("attack_names", {}), **cfg.get("attack_names", {})}
    groups = src.get("groups", {})
    only = cfg.get("group")
    skip = {key(n) for n in cfg.get("skip_attacks", [])}

    # Sin nombre en `damage` (Babosa de hielo, Nervioso invocado): se toman de `abilities` por orden.
    unnamed = [i for i, d in enumerate(dmg) if not d[1]]
    for j, i in enumerate(unnamed):
        if j < len(abil):
            g, n, _ = abil[j]
            dmg[i] = (dmg[i][0] or g, n, dmg[i][2])

    cds = {(key(g or ""), key(n)): cd for g, n, cd in abil}
    out, seen = [], set()

    def add(group, name, damage, cd, area=False):
        if only and (group or "") != only:
            return
        if not name or key(name) in skip:
            return
        entry = {"name": bilingual(name, names, missing, "ataque")}
        if area:
            entry["name"] = {k: entry["name"][k] + AREA[k] for k in AREA}
        if group and not only:
            entry["group"] = bilingual(group, groups, missing, "grupo")
        entry["damage"] = damage
        if cd is not None and not area:
            entry["cooldown"] = int(cd) if float(cd).is_integer() else cd
        out.append(entry)

    for group, name, rest in dmg:
        parts = [p for p in rest.split("+")]
        # "Shield" (la protección del chamán) y "Health" (la cura) no son daño.
        if re.search(r"\b(shield|health)\b", rest, re.I) and not damage_of(rest):
            continue
        cd = cds.get((key(group or ""), key(name)))
        if cd is None:
            cd = next((c for (g, n), c in cds.items() if n == key(name)), None)
        first = damage_of(parts[0])
        if not first:
            continue
        add(group, name, first, cd)
        seen.add((key(group or ""), key(name)))
        for extra in parts[1:]:
            d = damage_of(extra)
            if d:
                add(group, name, d, None, area=True)

    # Habilidades sin daño (invocar raíces, teletransporte, curar…), después de los golpes.
    dmg_names = {n for _, n in seen}
    for g, n, cd in abil:
        if (key(g or ""), key(n)) in seen or (not g and key(n) in dmg_names):
            continue
        add(g, n, {}, cd)
        seen.add((key(g or ""), key(n)))
    return out


def clean_tips(tips: dict, who: str, problems: list) -> dict:
    out = {"en": list(tips.get("en", [])), "es": list(tips.get("es", []))}
    if len(out["en"]) != len(out["es"]):
        problems.append(f"{who}: {len(out['en'])} consejos en inglés y {len(out['es'])} en español")
    for lang in ("en", "es"):
        for t in out[lang]:
            if len(t.split()) > 30:
                problems.append(f"{who} [{lang}]: consejo largo ({len(t.split())} palabras)")
            if re.search(r"wiki|fandom|https?://", t, re.I):
                problems.append(f"{who} [{lang}]: menciona la wiki o un enlace")
    return out


def site_names() -> list[str]:
    names = []
    for f in ("bosses", "creatures"):
        with open(os.path.join(SITE, f + ".json"), encoding="utf-8") as fh:
            for c in json.load(fh):
                if c["name"]["en"] not in names:
                    names.append(c["name"]["en"])
    return names


def build() -> dict:
    with open(SRC, encoding="utf-8") as fh:
        src = json.load(fh)
    cfgs = src.get("creatures", {})
    missing, problems, out = set(), [], {}
    names = site_names()
    for name in cfgs:
        if name not in names:
            problems.append(f"{name}: está en el fuente pero no en el sitio")
    for name in names:
        cfg = cfgs.get(name, {})
        box = wiki.lookup(cfg.get("wiki", name))
        attacks = []
        if box and "creature" in box[1] and not cfg.get("no_attacks"):
            attacks = attacks_for(box[2], src, cfg, missing)
        tips = clean_tips(cfg.get("tips", {}), name, problems)
        if attacks or tips["en"]:
            out[name] = {"attacks": attacks, "tips": tips}
    for m in sorted(missing):
        problems.append("falta traducir " + m)
    return out, problems


def main():
    out, problems = build()
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=1)
        fh.write("\n")
    with_attacks = sum(1 for v in out.values() if v["attacks"])
    with_tips = sum(1 for v in out.values() if v["tips"]["en"])
    print(f"tips.json: {len(out)} criaturas, {with_attacks} con ataques, {with_tips} con consejos")
    for p in problems:
        print("  ! " + p)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
