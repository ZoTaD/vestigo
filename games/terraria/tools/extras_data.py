"""Arma los datos de las pestañas Pesca y Parches (games/terraria/data/fishing.json y patches/).

Uso: python games/terraria/tools/extras_data.py ["C:/.../Terraria"]   (después de site_data.py: usa sus slugs)

- Pesca: cañas y cebos con su poder, las cajas y los peces de misión del Pescador.
- Parches: el `changelog.txt` que trae el juego, partido por versión.

Las funciones `build_*` y `parse_changelog` son puras y son lo que prueban los tests.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from world_data import item_refs

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "cache"
DATA = ROOT / "data"
GAME = Path(sys.argv[1] if len(sys.argv) > 1 else r"C:\Program Files (x86)\Steam\steamapps\common\Terraria")

def build_fishing(items: list[dict], quest: list[int], slugs: dict[int, list]) -> dict:
    have = [it for it in items if it["id"] in slugs]
    refs: dict[str, list] = {}

    def keep(rows: list[list]) -> list[list]:
        for r in rows:
            refs[str(r[0])] = slugs[r[0]]
        return rows

    poles = keep(sorted(([it["id"], it["fishingPole"]] for it in have if it.get("fishingPole")), key=lambda r: (r[1], r[0])))
    baits = keep(sorted(([it["id"], it["bait"]] for it in have if it.get("bait")), key=lambda r: (-r[1], r[0])))
    crates = [it for it in have if it["internal"].endswith(("Crate", "CrateHard")) and it.get("createTile", -1) >= 0]
    return {
        "poles": poles,
        "baits": baits,
        "crates": keep([[it["id"]] for it in crates if not it["internal"].endswith("Hard")]),
        "cratesHard": keep([[it["id"]] for it in crates if it["internal"].endswith("Hard")]),
        "quest": keep([[i] for i in quest if i in slugs]),
        "refs": refs,
    }


def parse_changelog(text: str) -> list[dict]:
    """El changelog del juego, de la versión más nueva a la más vieja: `{v, sections: [{t, lines: [[nivel, texto]]}]}`.
    Una línea que empieza con guion (o asterisco) es un punto, y su sangría dice el nivel; una línea suelta seguida de
    puntos es el título de su sección; cualquier otra línea suelta es un párrafo."""
    versions: list[dict] = []
    cur: dict | None = None
    lines = text.replace("\r\n", "\n").split("\n")
    for n, raw in enumerate(lines):
        head = re.match(r"^Version\s+([\d.]+\w*)\s+Changes", raw.strip())
        if head:
            cur = {"v": head.group(1), "sections": [{"t": "", "lines": []}]}
            versions.append(cur)
            continue
        if cur is None or not raw.strip() or set(raw.strip()) <= {"-", "=", "_"}:
            continue
        bullet = re.match(r"^(\s*)[-*•]\s+(.*)$", raw)
        if bullet:
            depth = 0 if len(bullet.group(1).replace("\t", "    ")) < 2 else 1 if len(bullet.group(1).replace("\t", "    ")) < 6 else 2
            cur["sections"][-1]["lines"].append([depth, bullet.group(2).strip()])
            continue
        following = next((x for x in lines[n + 1:] if x.strip()), "")
        if re.match(r"^\s*[-*•]\s+", following):
            cur["sections"].append({"t": re.sub(r"^[IVX]+\.\s*", "", raw.strip()).rstrip(":"), "lines": []})
        else:
            cur["sections"][-1]["lines"].append([0, raw.strip()])
    for v in versions:
        v["sections"] = [s for s in v["sections"] if s["lines"]]
        # Los parches viejos sangran todos sus puntos: el nivel más chico de cada sección pasa a ser el cero.
        for sec in v["sections"]:
            low = min(d for d, _ in sec["lines"])
            sec["lines"] = [[d - low, t] for d, t in sec["lines"]]
    return [v for v in versions if v["sections"]]


def build_patches(text: str) -> dict[str, object]:
    out: dict[str, object] = {}
    index = []
    for v in parse_changelog(text):
        slug = v["v"].replace(".", "-")
        count = sum(len(s["lines"]) for s in v["sections"])
        index.append({"v": v["v"], "slug": slug, "n": count, "titles": [s["t"] for s in v["sections"] if s["t"]][:4]})
        out[f"patches/{slug}.json"] = v
    out["patches/index.json"] = index
    return out


def main() -> None:
    items = json.loads((CACHE / "items.json").read_text(encoding="utf-8-sig"))
    quest = json.loads((CACHE / "fishing.json").read_text(encoding="utf-8-sig"))["quest"]
    slugs = item_refs()
    out: dict[str, object] = {"fishing.json": build_fishing(items, quest, slugs)}
    out.update(build_patches((GAME / "changelog.txt").read_text(encoding="utf-8-sig", errors="replace")))
    (DATA / "patches").mkdir(parents=True, exist_ok=True)
    wanted = {DATA / n for n in out}
    for old in (DATA / "patches").glob("*.json"):
        if old not in wanted:
            old.unlink()
    for name, content in out.items():
        (DATA / name).write_text(json.dumps(content, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    f = out["fishing.json"]
    print(len(out["patches/index.json"]), "versiones;", len(f["poles"]), "cañas,", len(f["baits"]), "cebos,", len(f["crates"]) + len(f["cratesHard"]), "cajas,", len(f["quest"]), "peces de misión")


if __name__ == "__main__":
    main()
