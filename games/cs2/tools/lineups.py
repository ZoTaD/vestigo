"""
Los lineups de granadas de CS2 (2026-11-04, pestaña Granadas, maqueta A "Radar" elegida por ZoTaD).

- Lineups: las guías de anotaciones de ReneRebsdorf/CS2-annotations (MIT), en el formato del juego: cada lineup es un
  nodo `main` (dónde pararse), uno `aim_target` (adónde apuntar, con el ángulo exacto y la explicación del tiro) y uno
  `destination` (dónde cae). Se fija el commit (`ANN_SHA`) para que una corrida dé siempre lo mismo.
- Radar: las imágenes y las medidas (`pos_x`, `pos_y`, `scale`) de pnxenopoulos/awpy-data (MIT), release `AWPY_TAG`.
- Lado: las guías no lo dicen. Sale del título ("T Spawn 3", "CT Spawn", "Retake") y, si no, de qué base queda más
  cerca caminando por el navmesh (awpy) desde donde se tira. `SIDE_FIX` corrige a mano los que eso confunde.

Escribe `games/cs2/data/lineups/<mapa>.json` (uno por mapa), `lineups/index.json` y los radares en
`site/public/cs2/radar/<mapa>[-lower].webp`. Los textos en español salen de `lineups_es.json` (a mano, junto a este
archivo); uno que falta se avisa y sale en inglés. No corre en la Action: necesita awpy (`pip install awpy pillow`).

    python games/cs2/tools/lineups.py
"""
from __future__ import annotations

import io
import json
import math
import re
import sys
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "games" / "cs2" / "data" / "lineups"
RADAR = ROOT / "site" / "public" / "cs2" / "radar"
ES = Path(__file__).with_name("lineups_es.json")

ANN_SHA = "f6b2b17dac00f8167e7226b7029f1f4c0f4ceabe"
ANN_URL = "https://raw.githubusercontent.com/ReneRebsdorf/CS2-annotations/{sha}/local/de_{map}/de_{map}.txt"
AWPY_TAG = "2000940"
AWPY_URL = "https://github.com/pnxenopoulos/awpy-data/releases/download/{tag}/{file}"

# Los mapas del Active Duty con guía (Cache no tiene). Nombre, y las dos bases en píxeles del radar (los contornos verdes).
MAPS: dict[str, dict] = {
    "mirage": {"name": "Mirage", "t": (900, 365), "ct": (325, 710)},
    "inferno": {"name": "Inferno", "t": (100, 690), "ct": (915, 360)},
    "ancient": {"name": "Ancient", "t": (500, 881), "ct": (518, 153)},
    "anubis": {"name": "Anubis", "t": (489, 928), "ct": (446, 230)},
    "dust2": {"name": "Dust II", "t": (387, 920), "ct": (615, 205)},
    "nuke": {"name": "Nuke", "t": (203, 564), "ct": (835, 475)},
}
# Lados que la regla confunde, revisados uno por uno el 2026-11-04 (los 8 primeros caracteres del id del nodo `main`).
# Casi todos son "humo a CT spawn": se tira desde el medio y cae cerca de la base CT, pero lo tira el T para entrar.
SIDE_FIX: dict[str, str] = {
    "f8e87c79": "t", "6df07a74": "t",  # Inferno: humo a CT spawn desde banana y desde B
    "9c850e87": "t", "fc9c4a1d": "t", "bbd71835": "t", "ba3d7e89": "t",  # Ancient: humo a CT spawn y a elbow
    "9dbe978c": "t",  # Anubis: humo a CT spawn con flash de entrada
    "4dbb4d07": "t",  # Dust II: humo a CT spawn
    "bfecc991": "t",  # Nuke: humo a la rampa derecha (entrada por rampa)
    "4169c6de": "t",  # Mirage: humo a CT spawn
}

TYPES = {"smoke": "smoke", "flash": "flash", "molotov": "molotov", "incendiary": "molotov", "he": "he", "decoy": "decoy"}
UA = {"User-Agent": "vestigo-lineups/1.0"}


def get(url: str) -> bytes:
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
        return r.read()


# --- El formato de anotaciones (KV3 de texto) -------------------------------------------------------------------------
NODE = re.compile(r"\n\tMapAnnotationNode\d+ = \s*\{(.*?)\n\t\}", re.S)


def _field(node: str, key: str) -> str | None:
    m = re.search(rf"\n\t\t{key} = (.+)", node)
    return m.group(1).strip() if m else None


def _text(node: str, block: str) -> str:
    m = re.search(rf"\n\t\t{block} = \s*\{{\s*Text = \"(.*?)\"", node, re.S)
    # Algunas guías escapan el salto dos veces (`\\n` en el archivo): los dos son un salto de línea.
    return re.sub(r"\\+n", "\n", m.group(1)).replace("\\", "").strip() if m else ""


def _vec(s: str | None) -> list[float]:
    return [float(x) for x in re.findall(r"-?\d+(?:\.\d+)?", s or "")]


def parse(txt: str) -> list[dict]:
    """Los nodos de granada, con lo que importa de cada uno."""
    out = []
    for n in NODE.findall(txt):
        if _field(n, "Type") != '"grenade"':
            continue
        out.append({
            "id": (_field(n, "Id") or "").strip('"'),
            "sub": (_field(n, "SubType") or "").strip('"'),
            "master": (_field(n, "MasterNodeId") or "").strip('"') or None,
            "pos": _vec(_field(n, "Position")),
            "ang": _vec(_field(n, "Angles")),
            "title": _text(n, "Title"),
            "desc": _text(n, "Desc"),
            "jump": _field(n, "JumpThrow") == "true",
            "type": (_field(n, "GrenadeType") or "").strip('"'),
        })
    return out


def group(nodes: list[dict]) -> list[dict]:
    """Un lineup por nodo `main` con su `aim_target` y su `destination`; los que no tienen destino no van (no se dibujan)."""
    by_master: dict[str, dict[str, dict]] = {}
    for n in nodes:
        if n["master"]:
            by_master.setdefault(n["master"], {})[n["sub"]] = n
    out = []
    for m in nodes:
        if m["sub"] != "main" or m["type"] not in TYPES:
            continue
        kids = by_master.get(m["id"], {})
        aim, dest = kids.get("aim_target"), kids.get("destination")
        if not aim or not dest:
            continue
        out.append({"main": m, "aim": aim, "dest": dest})
    return out


# --- Textos ------------------------------------------------------------------------------------------------------------
VERB = re.compile(r"^(?:retake\s+)?(?:smoke|molo(?:tov)?|incendiary|inc|flash|pop\s*flash|nade|he|decoy|spray)\b[\s/&,-]*", re.I)
SPAWN = re.compile(r"\b(CT|T) Spawn(?: (\d+))?\b", re.I)


def split_title(title: str) -> tuple[str, str | None]:
    """"Smoke red room\\nT Spawn 5" → ("Smoke red room", "T Spawn 5"): la segunda línea es una variante (desde qué spawn)."""
    lines = [x.strip() for x in title.split("\n") if x.strip()]
    if not lines:
        return "", None
    return lines[0], (" ".join(lines[1:]) or None)


GVERB = r"(?:retake\s+)?(?:smoke|molo(?:tov)?|incendiary|inc|(?:entry\s+|pop\s*)?flash|nade|he\s+grenade|decoy)"


def target_of(title: str) -> str:
    """El lugar adonde va: "Smoke red room" → "Red room"; "Window Smoke" → "Window"; "Smoke A Ramp deep from CT Spawn" →
    "A Ramp deep". Sin lugar ("Lamp flash", "Flash B") queda lo que haya."""
    # "T Spawn 3" es desde dónde se tira (una variante); "Smoke CT spawn" sin número es el destino y se queda.
    t = re.sub(r"(?:CT|T) Spawn \d+", "", title, flags=re.I)
    t = re.split(r"\s+(?:from|@)\s+|\s+-\s+|\s*[|(]", t, maxsplit=1, flags=re.I)[0]
    t = re.sub(r"\s(?:and|&|\+)\s+(?:entry\s+)?(?:flash|molo|smoke|boost).*$", "", t, flags=re.I)
    for _ in range(2):
        t = re.sub(rf"^{GVERB}(?![a-z])[\s/&,-]*", "", t.strip(), flags=re.I)
        t = re.sub(rf"(?:^|[\s/&,-]+){GVERB}$", "", t.strip(), flags=re.I)
    t = re.sub(r"^(?:to|into|on|at|in)\s+", "", t.strip(), flags=re.I)
    t = re.sub(r"\s+(?:#?\d+)$", "", t).strip(" -,/")
    return (t[:1].upper() + t[1:]) if t else ""


def technique(jump: bool, desc: str) -> list[str]:
    d = desc.lower()
    out = []
    if re.search(r"\brun|running|\bw\b", d):
        out.append("run")
    elif re.search(r"walk|shift", d):
        out.append("walk")
    if re.search(r"crouch|duck|ctrl", d):
        out.append("crouch")
    if jump or re.search(r"jump", d):
        out.append("jump")
    if re.search(r"both|left\s*\+\s*right|middle click|lmb\s*\+\s*rmb|right\s*\+\s*left", d):
        out.append("both")
    elif re.search(r"right[- ]?click|\brmb\b|underhand", d):
        out.append("right")
    else:
        out.append("left")
    if not any(x in out for x in ("run", "walk")):
        out.insert(0, "stand")
    return out


# --- Lado --------------------------------------------------------------------------------------------------------------
def side_from_title(title: str) -> str | None:
    t = title.lower()
    m = SPAWN.search(title)
    if m:
        return m.group(1).lower()
    if "retake" in t:
        return "ct"
    return None


class Walker:
    """La distancia caminando entre dos puntos del mapa por el navmesh de awpy (None si no hay camino)."""

    def __init__(self, nav):
        self.nav = nav
        df = nav.areas
        self.center = {int(a): (float(x), float(y), float(z)) for a, x, y, z in zip(df["area_id"], df["centroid_x"], df["centroid_y"], df["centroid_z"])}

    def area(self, p: tuple[float, float, float]) -> int | None:
        try:
            a = self.nav.find_area(p)
        except Exception:  # noqa: BLE001 - un punto fuera del navmesh
            a = None
        if a is not None:
            return int(a)
        # Parado contra una pared o sobre una caja: el área más cercana (la altura pesa el doble, para no saltar de piso).
        return min(self.center, key=lambda k: math.dist((p[0], p[1], p[2] * 2), (self.center[k][0], self.center[k][1], self.center[k][2] * 2)))

    def dist(self, a: tuple[float, float, float], b: tuple[float, float, float]) -> float | None:
        aa, bb = self.area(a), self.area(b)
        if aa is None or bb is None:
            return None
        try:
            path = self.nav.find_path(aa, bb, weight="distance")
        except Exception:  # noqa: BLE001 - sin camino
            return None
        pts = [self.center[int(i)] for i in path if int(i) in self.center]
        return sum(math.dist(pts[i], pts[i + 1]) for i in range(len(pts) - 1)) if len(pts) > 1 else 0.0


# --- Radar -------------------------------------------------------------------------------------------------------------
def to_px(md: dict, x: float, y: float) -> tuple[float, float]:
    return (x - md["pos_x"]) / md["scale"], (md["pos_y"] - y) / md["scale"]


def to_world(md: dict, px: float, py: float) -> tuple[float, float]:
    return md["pos_x"] + px * md["scale"], md["pos_y"] - py * md["scale"]


def lower_split(md: dict) -> float | None:
    """La altura bajo la cual un punto va en el radar de abajo (Nuke, Vertigo), o None si el mapa tiene un piso."""
    vs = md.get("verticalsections") or {}
    lo = vs.get("lower")
    return float(lo["AltitudeMax"]) if lo else None


# --- Destinos ------------------------------------------------------------------------------------------------------------
def cluster(points: list[tuple[float, float, int]], radius: float) -> list[list[int]]:
    """Agrupa destinos que caen a menos de `radius` píxeles (y en el mismo piso): un pin por grupo."""
    groups: list[list[int]] = []
    centers: list[tuple[float, float, int]] = []
    for i, (x, y, f) in enumerate(points):
        best = None
        for g, (cx, cy, cf) in enumerate(centers):
            if cf == f and math.hypot(cx - x, cy - y) <= radius and (best is None or math.hypot(cx - x, cy - y) < best[1]):
                best = (g, math.hypot(cx - x, cy - y))
        if best is None:
            groups.append([i])
            centers.append((x, y, f))
        else:
            g = best[0]
            groups[g].append(i)
            n = len(groups[g])
            cx, cy, cf = centers[g]
            centers[g] = (cx + (x - cx) / n, cy + (y - cy) / n, cf)
    return groups


def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def build(map_key: str, txt: str, md: dict, walker: Walker | None, es: dict[str, str], missing: set[str]) -> dict:
    info = MAPS[map_key]
    split = lower_split(md)
    floor = lambda z: 1 if split is not None and z < split else 0  # noqa: E731
    # Las bases en coordenadas del juego, para medir la distancia caminando.
    bases = {}
    for side in ("t", "ct"):
        wx, wy = to_world(md, *info[side])
        bases[side] = (wx, wy)
    rows = []
    for g in group(parse(txt)):
        m, aim, dest = g["main"], g["aim"], g["dest"]
        title, variant = split_title(m["title"] or aim["title"])
        if not title:
            continue
        side = SIDE_FIX.get(m["id"][:8]) or side_from_title(m["title"])
        if side is None and walker is not None:
            # Se tira desde cerca de tu base hacia la del otro: pesan las dos puntas. Un T parado en el medio que humea
            # CT spawn tiene la caída lejos de la base T, y eso lo vuelca a T aunque esté a la misma distancia de las dos.
            src = {s: walker.dist(tuple(m["pos"]), (bx, by, m["pos"][2])) for s, (bx, by) in bases.items()}
            dst = {s: walker.dist(tuple(dest["pos"]), (bx, by, dest["pos"][2])) for s, (bx, by) in bases.items()}
            if None not in src.values():
                score = src["t"] - src["ct"]
                if None not in dst.values():
                    score += dst["ct"] - dst["t"]
                side = "t" if score < 0 else "ct"
        if side is None:
            fx, fy = to_px(md, m["pos"][0], m["pos"][1])
            side = "t" if math.dist((fx, fy), info["t"]) < math.dist((fx, fy), info["ct"]) else "ct"
        fx, fy = to_px(md, m["pos"][0], m["pos"][1])
        tx, ty = to_px(md, dest["pos"][0], dest["pos"][1])
        desc = aim["desc"] or m["desc"]
        # Algunas guías ponen de texto un setpos copiado de otro spawn: el lugar bueno es el del nodo, así que el texto va afuera.
        if re.match(r"^\s*setpos", desc or "", re.I):
            desc = ""
        for s in (title, desc):
            if s and s not in es:
                missing.add(s)
        pitch, yaw = (aim["ang"] + [0, 0])[:2]
        x, y, z = m["pos"]
        rows.append({
            "id": m["id"][:8],
            "type": TYPES[m["type"]],
            "side": side,
            "title": [title, es.get(title)],
            "variant": variant,
            "desc": [desc, es.get(desc)] if desc else None,
            "tech": technique(m["jump"], desc),
            "from": [round(fx, 1), round(fy, 1), floor(z)],
            "to": [round(tx, 1), round(ty, 1), floor(dest["pos"][2])],
            # A la altura de los ojos (pies + 64), como lo imprime `getpos` y lo comparte la comunidad.
            "setpos": f"setpos {x:.2f} {y:.2f} {z + 64:.2f};setang {pitch:.2f} {yaw:.2f} 0",
            "_target": target_of(title),
        })
    # Los destinos: un pin por grupo de caídas cercanas, con el nombre más repetido de sus títulos.
    groups = cluster([(r["to"][0], r["to"][1], r["to"][2]) for r in rows], radius=22)
    # Dos grupos con el mismo nombre a menos de 90 píxeles son el mismo lugar ("Jungle" de un lado y del otro del pasillo).
    def gname(idxs: list[int]) -> str:
        names = [rows[i]["_target"] for i in idxs if rows[i]["_target"]]
        return max(set(names), key=lambda n: (names.count(n), -len(n))).lower() if names else ""

    def gcenter(idxs: list[int]) -> tuple[float, float, int]:
        return (sum(rows[i]["to"][0] for i in idxs) / len(idxs), sum(rows[i]["to"][1] for i in idxs) / len(idxs), rows[idxs[0]]["to"][2])

    merged = True
    while merged:
        merged = False
        for a in range(len(groups)):
            for b in range(a + 1, len(groups)):
                ca, cb = gcenter(groups[a]), gcenter(groups[b])
                if gname(groups[a]) and gname(groups[a]) == gname(groups[b]) and ca[2] == cb[2] and math.hypot(ca[0] - cb[0], ca[1] - cb[1]) < 90:
                    groups[a] += groups.pop(b)
                    merged = True
                    break
            if merged:
                break
    dests = []
    for gi, idxs in enumerate(groups):
        names = [rows[i]["_target"] for i in idxs if rows[i]["_target"]]
        # El nombre más repetido; sin ninguno (un "Flash B"), el título del primero.
        name = max(set(names), key=lambda n: (names.count(n), -len(n))) if names else rows[idxs[0]]["title"][0]
        xs = [rows[i]["to"][0] for i in idxs]
        ys = [rows[i]["to"][1] for i in idxs]
        dests.append({"id": slug(name) or str(gi), "name": [name, es.get(name)], "x": round(sum(xs) / len(xs), 1), "y": round(sum(ys) / len(ys), 1), "floor": rows[idxs[0]]["to"][2]})
        if name not in es:
            missing.add(name)
        for i in idxs:
            rows[i]["dest"] = gi
    # Ids de destino únicos (dos grupos con el mismo nombre en distintos lugares).
    seen: dict[str, int] = {}
    for d in dests:
        n = seen.get(d["id"], 0)
        seen[d["id"]] = n + 1
        if n:
            d["id"] = f"{d['id']}-{n + 1}"
    for r in rows:
        r.pop("_target")
    # Ids de lineup únicos y estables (el del nodo, recortado).
    ids = [r["id"] for r in rows]
    assert len(ids) == len(set(ids)), f"{map_key}: ids repetidos"
    return {
        "map": map_key,
        "name": info["name"],
        "floors": 2 if split is not None else 1,
        "dests": dests,
        "lineups": rows,
    }


def radar_images(zf: zipfile.ZipFile, map_key: str, floors: int) -> None:
    from PIL import Image

    RADAR.mkdir(parents=True, exist_ok=True)
    names = {n.rsplit("/", 1)[-1]: n for n in zf.namelist()}
    for f in range(floors):
        src = f"de_{map_key}{'_lower' if f else ''}.png"
        im = Image.open(io.BytesIO(zf.read(names[src]))).convert("RGBA")
        out = RADAR / f"{map_key}{'-lower' if f else ''}.webp"
        im.save(out, "WEBP", quality=82, method=4)
        print(out.relative_to(ROOT), f"{out.stat().st_size // 1024} KB")


def main() -> None:
    try:
        from awpy._awpy import NavMesh  # type: ignore
    except Exception:  # noqa: BLE001
        NavMesh = None
        print("sin awpy: el lado sale de la distancia en línea recta", file=sys.stderr)
    import awpy.data as ad  # type: ignore

    es = json.loads(ES.read_text(encoding="utf-8")) if ES.exists() else {}
    md_all = json.loads(get(AWPY_URL.format(tag=AWPY_TAG, file="map_data.json")))
    zf = zipfile.ZipFile(io.BytesIO(get(AWPY_URL.format(tag=AWPY_TAG, file="images.zip"))))
    OUT.mkdir(parents=True, exist_ok=True)
    missing: set[str] = set()
    index = []
    for key in MAPS:
        txt = get(ANN_URL.format(sha=ANN_SHA, map=key)).decode("utf-8")
        md = md_all[f"de_{key}"]
        walker = None
        if NavMesh is not None:
            try:
                walker = Walker(NavMesh(str(ad.nav_path(f"de_{key}"))))
            except Exception as e:  # noqa: BLE001
                print(f"{key}: sin navmesh ({e})", file=sys.stderr)
        data = build(key, txt, md, walker, es, missing)
        (OUT / f"{key}.json").write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        radar_images(zf, key, data["floors"])
        counts = {t: sum(1 for r in data["lineups"] if r["type"] == t) for t in ("smoke", "molotov", "flash", "he")}
        index.append({"map": key, "name": data["name"], "count": len(data["lineups"]), "counts": counts})
        print(f"{key}: {len(data['lineups'])} lineups, {len(data['dests'])} destinos, T {sum(r['side'] == 't' for r in data['lineups'])} / CT {sum(r['side'] == 'ct' for r in data['lineups'])}")
    (OUT / "index.json").write_text(json.dumps({"source": ANN_SHA[:7], "radar": AWPY_TAG, "maps": index}, ensure_ascii=False, indent=1), encoding="utf-8")
    pend = Path(__file__).with_name("lineups_es.missing.json")
    if missing:
        print(f"{len(missing)} textos sin español (salen en inglés), en {pend.name}", file=sys.stderr)
        pend.write_text(json.dumps(sorted(missing), ensure_ascii=False, indent=1), encoding="utf-8")
    else:
        pend.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
