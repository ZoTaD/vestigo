"""
El relieve del mapa de Deadlock, dibujado desde arriba con la geometría del
nivel → site/public/deadlock/game/map/relief.webp.

El minimapa del juego es una silueta plana: no trae puentes, techos ni árboles.
Esto exporta las mallas del nivel, las mira desde arriba quedándose con la
altura más alta de cada punto, y las sombrea. Es el fondo de la pestaña Mapa.

Uso (una vez por parche que cambie el mapa, en la PC que tiene el juego):
    python games/deadlock/tools/map_relief.py --vrf <Source2Viewer-CLI.exe> [--cache <carpeta>]

Pesa: la exportación son ~2,7 GB en disco y unos minutos; el dibujado, unos
24 millones de triángulos leídos de a un archivo (poca RAM). Hace falta haber
corrido antes `map_data.py` con la misma `--cache` (usa su minimapa extraído).
Necesita `numpy` y `Pillow`.
"""
import argparse, glob, json, os, struct, subprocess, sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
OUT = os.path.join(ROOT, "site", "public", "deadlock", "game", "map", "relief.webp")
MAP_VPK = r"C:/Program Files (x86)/Steam/steamapps/common/Deadlock/game/citadel/maps/dl_midtown.vpk"
BOUND = 10752.0
RES = 2048
# Lo que está más alto que esto es decorado (rascacielos, nubes): no entra al dibujo.
Z_MAX = 3300.0
UNITS_PER_METER = 39.37

COMPONENT = {5120: "i1", 5121: "u1", 5122: "i2", 5123: "u2", 5125: "u4", 5126: "f4"}
WIDTH = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


# ── Leer un .glb ────────────────────────────────────────────────────────────

def read_glb(path):
    with open(path, "rb") as f:
        f.read(12)
        length, _ = struct.unpack("<II", f.read(8))
        gltf = json.loads(f.read(length))
        length, _ = struct.unpack("<II", f.read(8))
        return gltf, f.read(length)


def accessor(gltf, blob, i):
    a = gltf["accessors"][i]
    view = gltf["bufferViews"][a["bufferView"]]
    n = WIDTH[a["type"]]
    dt = np.dtype("<" + COMPONENT[a["componentType"]])
    offset = view.get("byteOffset", 0) + a.get("byteOffset", 0)
    stride = view.get("byteStride", 0)
    if stride and stride != dt.itemsize * n:
        raw = np.frombuffer(blob, dtype="u1", count=stride * a["count"], offset=offset).reshape(a["count"], stride)
        return raw[:, : dt.itemsize * n].copy().view(dt).reshape(a["count"], n)
    return np.frombuffer(blob, dtype=dt, count=a["count"] * n, offset=offset).reshape(a["count"], n)


def node_matrix(node):
    if "matrix" in node:
        return np.array(node["matrix"], dtype="f8").reshape(4, 4).T
    m = np.eye(4)
    if "scale" in node:
        m = np.diag(list(node["scale"]) + [1.0]) @ m
    if "rotation" in node:
        x, y, z, w = node["rotation"]
        m = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w), 0],
                      [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w), 0],
                      [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y), 0],
                      [0, 0, 0, 1]]) @ m
    if "translation" in node:
        t = np.eye(4)
        t[:3, 3] = node["translation"]
        m = t @ m
    return m


def triangles(path):
    """Los triángulos de un .glb, ya en su lugar del mundo: (n, 3 vértices, xyz)."""
    gltf, blob = read_glb(path)
    out = []

    def walk(i, parent):
        node = gltf["nodes"][i]
        m = parent @ node_matrix(node)
        if "mesh" in node:
            for prim in gltf["meshes"][node["mesh"]]["primitives"]:
                if prim.get("mode", 4) != 4 or "POSITION" not in prim["attributes"]:
                    continue
                pos = accessor(gltf, blob, prim["attributes"]["POSITION"]).astype("f8")
                pos = pos @ m[:3, :3].T + m[:3, 3]
                idx = accessor(gltf, blob, prim["indices"]).reshape(-1).astype("i8") if "indices" in prim else np.arange(len(pos))
                out.append(pos[idx[: len(idx) // 3 * 3]].reshape(-1, 3, 3))
        for child in node.get("children", []):
            walk(child, m)

    for root in gltf["scenes"][gltf.get("scene", 0)]["nodes"]:
        walk(root, np.eye(4))
    return np.concatenate(out) if out else np.zeros((0, 3, 3))


# ── Mirar el nivel desde arriba ─────────────────────────────────────────────

def heightmap(files):
    """La altura más alta de cada píxel, muestreando cada triángulo según su tamaño."""
    height = np.full((RES, RES), -1e9, dtype="f4")
    rng = np.random.default_rng(1)
    for n, path in enumerate(files):
        # glTF viene en metros y con Y hacia arriba.
        t = triangles(path) * UNITS_PER_METER
        if not len(t):
            continue
        gx, gy, gz = t[:, :, 0], -t[:, :, 2], t[:, :, 1]
        px = (gx + BOUND) / (2 * BOUND) * RES
        py = (BOUND - gy) / (2 * BOUND) * RES
        area = 0.5 * np.abs((px[:, 1] - px[:, 0]) * (py[:, 2] - py[:, 0]) - (px[:, 2] - px[:, 0]) * (py[:, 1] - py[:, 0]))
        count = np.clip(np.ceil(area * 2.5), 1, 60000).astype("i8")
        for start in range(0, len(t), 200000):
            c = count[start:start + 200000]
            rep = np.repeat(np.arange(start, start + len(c)), c)
            u, v = rng.random(len(rep)), rng.random(len(rep))
            flip = u + v > 1
            u[flip], v[flip] = 1 - u[flip], 1 - v[flip]
            w = 1 - u - v
            sx = px[rep, 0] * w + px[rep, 1] * u + px[rep, 2] * v
            sy = py[rep, 0] * w + py[rep, 1] * u + py[rep, 2] * v
            sz = gz[rep, 0] * w + gz[rep, 1] * u + gz[rep, 2] * v
            ix, iy = sx.astype("i8"), sy.astype("i8")
            ok = (ix >= 0) & (ix < RES) & (iy >= 0) & (iy < RES) & (sz <= Z_MAX)
            np.maximum.at(height, (iy[ok], ix[ok]), sz[ok].astype("f4"))
        if n % 200 == 0:
            print(f"  {n}/{len(files)}", flush=True)
    # La geometría exportada sale girada un cuarto de vuelta respecto del
    # minimapa. Comprobado el 2026-10-12 con la altura de 771 entidades: con
    # este giro quedan 22 "flotando"; con cualquier otra orientación, más de 85.
    return np.rot90(height, 1).copy()


def shade(height, minimap_png):
    """Del mapa de alturas a la imagen: sombreado y tinte por altura, recortado a la silueta jugable."""
    valid = height > -1e8
    ground = np.array(Image.open(minimap_png).convert("RGBA").resize((RES, RES), Image.LANCZOS))[:, :, 3] > 100
    # Lo jugable es el suelo del minimapa con sus edificios: lo transparente que NO se alcanza desde el borde.
    flood = Image.new("L", (RES + 2, RES + 2), 255)
    flood.paste(Image.fromarray((~ground).astype("uint8") * 255), (1, 1))
    ImageDraw.floodfill(flood, (0, 0), 128)
    inside = np.array(flood)[1:-1, 1:-1] != 128
    inside = np.array(Image.fromarray(inside.astype("uint8") * 255).filter(ImageFilter.MaxFilter(9))) > 0

    # Donde no cayó ninguna muestra: si el minimapa dice edificio, es un techo
    # más alto que el tope; si dice suelo, es un hueco y se rellena con el
    # vecino más bajo.
    lo, hi = np.percentile(height[valid & inside], [2, 99.5])
    z = np.where(valid, np.clip(height, lo, hi), np.where(ground, np.nan, hi))
    shifts = [(dy, dx) for dy in (-1, 0, 1) for dx in (-1, 0, 1)]
    with np.errstate(all="ignore"):
        for _ in range(40):
            gap = np.isnan(z)
            if not gap.any():
                break
            z = np.where(gap, np.nanmin(np.stack([np.roll(np.roll(z, dy, 0), dx, 1) for dy, dx in shifts]), axis=0), z)
    z = np.where(np.isnan(z), lo, z)
    z = sum(np.roll(np.roll(z, dy, 0), dx, 1) for dy, dx in shifts) / 9.0

    # Luz del noroeste.
    gy, gx = np.gradient(z)
    cell = 2 * BOUND / RES
    sx, sy = gx / cell, gy / cell
    light = np.array([-0.6, -0.6, 0.55])
    light /= np.linalg.norm(light)
    lit = np.clip(0.35 + 0.75 * (-sx * light[0] - sy * light[1] + light[2]) / np.sqrt(sx ** 2 + sy ** 2 + 1), 0, 1.15)

    t = ((z - lo) / (hi - lo))[:, :, None]
    low, mid, top = np.array([236, 224, 196.0]), np.array([186, 160, 118.0]), np.array([92, 78, 60.0])
    color = np.where(t < 0.45, low + (mid - low) * (t / 0.45), mid + (top - mid) * ((t - 0.45) / 0.55))
    color = np.clip(color * lit[:, :, None], 0, 255)
    alpha = np.array(Image.fromarray(inside.astype("uint8") * 255).filter(ImageFilter.GaussianBlur(1.2)))
    return Image.fromarray(np.dstack([color, alpha]).astype("uint8"), "RGBA")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--vrf", required=True, help="ruta a Source2Viewer-CLI.exe")
    ap.add_argument("--cache", default=os.path.join(ROOT, ".cache", "deadlock-map"))
    args = ap.parse_args()

    world = os.path.join(args.cache, "world")
    nodes = os.path.join(world, "maps", "dl_midtown", "worldnodes")
    if not os.path.isdir(nodes):
        print("Exportando la geometría del nivel (unos minutos, ~2,7 GB)…")
        subprocess.run([args.vrf, "-i", MAP_VPK, "-o", world, "-d", "-f", "maps/dl_midtown/worldnodes/",
                        "-e", "vmdl_c", "--gltf_export_format", "glb", "--threads", "3"],
                       check=True, stdout=subprocess.DEVNULL)

    cached = os.path.join(args.cache, "height.npy")
    if os.path.exists(cached):
        height = np.load(cached)
    else:
        files = sorted(glob.glob(os.path.join(nodes, "*.glb")))
        print(f"Dibujando {len(files)} mallas desde arriba…")
        height = heightmap(files)
        np.save(cached, height)

    minimap = os.path.join(args.cache, "panorama", "images", "minimap", "base", "minimap_midtown_mid_psd.png")
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    shade(height, minimap).save(OUT, quality=80, method=6)
    print(f"-> {os.path.relpath(OUT, ROOT)} ({os.path.getsize(OUT) / 1024:.0f} KB)")


if __name__ == "__main__":
    sys.exit(main())
