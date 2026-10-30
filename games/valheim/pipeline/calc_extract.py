"""
Lo que necesitan las calculadoras y no saca `extract.py` (2026-10-30), en `data/calc.json`:

- el grupo de confort de cada pieza (`Piece.m_comfortGroup`): de cada grupo cuenta sólo la mejor;
- el modificador exacto de daño de cada criatura (`m_damageModifiers`: débil, muy débil, levemente débil…), que
  `extract.py` agrupa en débil/resistente/inmune;
- las habilidades del jugador (`Skills.m_skills`): cuánto suben por acción (`m_increseStep`) y su ícono.

Aparte de `extract.py` para no regenerar todo: `.venv/Scripts/python -m pipeline.calc_extract` (~3 min) y después
`pipeline.site`, que lo suma a `building.json`, `creatures.json`, `bosses.json` y `skills.json`.
"""
import os, sys, time
from .extract import DATA, PUBLIC, Icons, dump
from .records import MODIFIER
from .unity import Game

# `Piece.ComfortGroup`, en el orden del enum del juego.
COMFORT_GROUPS = ["None", "Fire", "Bed", "Banner", "Chair", "Table", "Carpet", "Display", "Decor", "Garland", "Lantern", "Leisure"]
# `HitData.DamageModifier`: lo que `records.MODIFIER` no nombra (4 = ignorar, el daño no cuenta).
MODS = {**MODIFIER, 4: "ignore"}


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    t0 = time.time()
    g = Game()
    g.index({"Piece", "Humanoid", "Character", "Skills"})
    icons = Icons(g, os.path.join(PUBLIC, "icons"))

    comfort = {}
    for pc in g.components("Piece"):
        prefab = g.prefab(pc.go)
        if prefab and pc.tree.get("m_comfort"):
            group = pc.tree.get("m_comfortGroup", 0)
            comfort[prefab] = COMFORT_GROUPS[group] if 0 < group < len(COMFORT_GROUPS) else None

    mods = {}
    for cls in ("Humanoid", "Character"):
        for c in g.components(cls):
            prefab = g.prefab(c.go)
            if not prefab or prefab in mods:
                continue
            m = {k[2:]: MODS[v] for k, v in (c.tree.get("m_damageModifiers") or {}).items()
                 if v in MODS and k[2:] not in ("chop", "pickaxe", "nonPlayer")}
            mods[prefab] = m

    skills_comp = max(g.components("Skills"), key=lambda c: len(c.tree.get("m_skills") or []))
    skills = [{"id": s["m_skill"], "step": s["m_increseStep"], "icon": icons.save(skills_comp.file, s.get("m_icon"))}
              for s in skills_comp.tree["m_skills"]]
    deathFactor = skills_comp.tree.get("m_DeathLowerFactor")

    dump("calc.json", {"comfortGroups": comfort, "creatureMods": mods, "skills": skills, "deathLowerFactor": deathFactor})
    print(f"{len(comfort)} piezas con confort, {len(mods)} criaturas, {len(skills)} habilidades, {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
