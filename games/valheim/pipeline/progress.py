"""
Las tareas de Mi partida (2026-10-30): por bioma, en orden, lo que marca el avance de una partida, armado de los datos
publicados (no se escriben a mano). Cada tarea lleva su ficha y lo que el personaje guarda cuando ya la hizo, para que
"Leer mi personaje" la tilde sola:

- estación: el nombre traducible en sus estaciones conocidas (`m_knownStations`);
- equipo, materiales, hidromiel y ofrenda: el nombre en sus materiales conocidos (`m_knownMaterial`: todo lo que
  alguna vez tuvo en el inventario);
- jefe: el trofeo del jefe en sus trofeos (`m_trophies`, por prefab).
"""
from .biomes import BIOME_ORDER

# La hidromiel de resistencia que pide cada bioma (frío en la montaña, veneno en el pantano).
MEAD_FOR = {"MeadPoisonResist": "swamp", "MeadFrostResist": "mountain"}
ARMOR_SLOTS = ("helmet", "chest", "legs")


def _ref(r: dict) -> dict:
    return {k: r[k] for k in ("slug", "tab", "name", "icon")}


def build(tabs: dict, boss_rows: list, tokens: dict) -> list:
    tok_of = {}
    for tok, prefab in tokens.items():
        tok_of.setdefault(prefab, tok)
    by_slug = {(r["tab"], r["slug"]): r for rows in tabs.values() for r in rows}
    out = []
    for biome in BIOME_ORDER:
        if biome == "ocean":
            continue
        tasks = []

        def add(kind: str, row: dict, check: str, key: str | None) -> None:
            if key and not any(t["id"] == f"{kind}:{row['id']}" for t in tasks):
                tasks.append({"id": f"{kind}:{row['id']}", "kind": kind, "ref": _ref(row), "check": check, "key": key})

        # Las estaciones de fabricación que llegan en este bioma.
        for p in tabs["building"]:
            if p.get("tier") == biome and p.get("crafts") and not p.get("extends"):
                add("station", p, "station", tok_of.get(p["id"]))
        # El equipo: la pieza de más armadura de cada parte, de las que se fabrican con lo del bioma.
        for slot in ARMOR_SLOTS:
            cands = [a for a in tabs["armor"] if a.get("tier") == biome and a.get("slot") == slot and a.get("recipe") and a.get("armor")]
            if cands:
                best = max(cands, key=lambda a: (a["armor"], a["name"]["en"]))
                add("gear", best, "material", tok_of.get(best["id"]))
        # Las hidromieles que el bioma pide.
        for m in tabs["meads"]:
            if MEAD_FOR.get(m["id"]) == biome:
                add("mead", m, "material", tok_of.get(m["id"]))
        # Los materiales que más recetas abren de este bioma (tres, sin trofeos).
        mats = [m for m in tabs["materials"] if m.get("tier") == biome and m.get("matKind") != "trophy" and m.get("usedIn")]
        for m in sorted(mats, key=lambda m: (-len(m["usedIn"]), m["name"]["en"]))[:3]:
            add("material", m, "material", tok_of.get(m["id"]))
        # El jefe: la ofrenda y la victoria (el trofeo).
        boss = next((b for b in boss_rows if b.get("biome") == biome), None)
        if boss:
            item = boss["summon"]["item"]
            if item:
                row = by_slug.get((item["tab"], item["slug"]))
                if row:
                    add("offering", row, "material", tok_of.get(row["id"]))
            trophy = next((d for d in boss["drops"] if d["icon"] and d["icon"].startswith("trophy")), None)
            trow = by_slug.get((trophy["tab"], trophy["slug"])) if trophy else None
            tasks.append({"id": f"boss:{boss['id']}", "kind": "boss", "ref": _ref(boss), "check": "trophy",
                          "key": trow["id"] if trow else None})
        out.append({"biome": biome, "boss": _ref(boss) if boss else None, "tasks": tasks})
    return out
