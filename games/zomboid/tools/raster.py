"""
Rasterizador chico en numpy para los afiches del sobreviviente (2026-10-01): la imagen fija de cada profesión que va
en el prerender y queda si el navegador no tiene WebGL.

Por qué uno propio y no Blender: con numpy alcanza (unos miles de triángulos por afiche), corre con el Python de
siempre y da los mismos bytes en cualquier máquina. Y lee los MISMOS .glb que baja el sitio, con la semántica de
glTF (TRS de los nodos, piel lineal, piezas fijas colgadas de su hueso), así el afiche es lo que muestra three.js en
el primer cuadro del idle y de paso prueba los .glb por un camino que no es el de `gltf.py`.

- Piel: cada vértice se mueve con `Σ peso × mundo del hueso × inversa de reposo` (lo mismo que hace three). Los
  huesos de una pieza se cambian por los del cuerpo con el mismo nombre, como en el sitio. El reposo de los nodos ya
  es el primer cuadro del idle (`gltf.py`), así que no hace falta muestrear la animación.
- Proyección ortográfica de frente con una leve vuelta (el modelo gira `yaw` en Y), z-buffer, caras de atrás afuera
  (como el `FrontSide` de three), textura al más cercano (pixelado como el juego), alfa < 0,01 descartado (el
  `alphaCutoff` del juego), luz `0.55 + 0.45 × max(0, n·l)`.
- Se dibuja al doble de tamaño y se promedia de a 2×2 (alfa premultiplicado): bordes suaves sin borronear la textura.
"""
from __future__ import annotations

import json
import struct

import numpy as np

_CT = {5126: np.float32, 5123: np.uint16, 5121: np.uint8, 5125: np.uint32}
_NC = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}
ALPHA_CUTOFF = 0.01
AMBIENT, DIFFUSE = 0.55, 0.45


class Glb:
    """Un .glb leído: el JSON y los accessors como arreglos de numpy."""

    def __init__(self, path: str):
        with open(path, "rb") as h:
            data = h.read()
        magic, _, _ = struct.unpack_from("<4sII", data, 0)
        if magic != b"glTF":
            raise ValueError(f"{path}: no es un .glb")
        jlen, = struct.unpack_from("<I", data, 12)
        self.js = json.loads(data[20:20 + jlen])
        rest = 20 + jlen
        self.bin = b""
        if rest < len(data):
            blen, = struct.unpack_from("<I", data, rest)
            self.bin = data[rest + 8:rest + 8 + blen]
        self.path = path

    def accessor(self, i: int) -> np.ndarray:
        a = self.js["accessors"][i]
        v = self.js["bufferViews"][a["bufferView"]]
        n = _NC[a["type"]]
        arr = np.frombuffer(self.bin, _CT[a["componentType"]], a["count"] * n,
                            v.get("byteOffset", 0) + a.get("byteOffset", 0))
        return arr.reshape(a["count"], n) if n > 1 else arr

    def worlds(self) -> dict:
        """{nombre de nodo: matriz 4×4 de mundo} en el reposo (TRS de cada nodo)."""
        nodes = self.js.get("nodes", [])
        kids = {c for n in nodes for c in n.get("children", [])}
        out: dict = {}
        by_index: dict = {}

        def rec(i, parent):
            m = parent @ _local(nodes[i])
            by_index[i] = m
            out.setdefault(nodes[i].get("name", str(i)), m)
            for c in nodes[i].get("children", []):
                rec(c, m)

        for i in range(len(nodes)):
            if i not in kids:
                rec(i, np.eye(4))
        self._by_index = by_index
        return out


def _quat(q) -> np.ndarray:
    x, y, z, w = (float(v) for v in q)
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                     [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


def _local(n: dict) -> np.ndarray:
    m = np.eye(4)
    if "matrix" in n:
        return np.asarray(n["matrix"], dtype=np.float64).reshape(4, 4).T
    m[:3, :3] = _quat(n.get("rotation", (0, 0, 0, 1))) * np.asarray(n.get("scale", (1, 1, 1)), dtype=np.float64)
    m[:3, 3] = n.get("translation", (0, 0, 0))
    return m


def posed(glb: Glb, skeleton: dict) -> list:
    """Las mallas de `glb` en el mundo, con los huesos de `skeleton` ({nombre: mundo 4×4}, el del cuerpo).
    Devuelve [(posiciones N×3, normales N×3, uv N×2, triángulos M×3)]."""
    own = glb.worlds()
    out = []
    for i, n in enumerate(glb.js.get("nodes", [])):
        if "mesh" not in n:
            continue
        for p in glb.js["meshes"][n["mesh"]]["primitives"]:
            a = p["attributes"]
            pos = glb.accessor(a["POSITION"]).astype(np.float64)
            nrm = glb.accessor(a["NORMAL"]).astype(np.float64)
            uv = glb.accessor(a["TEXCOORD_0"]).astype(np.float64)
            tris = glb.accessor(p["indices"]).astype(np.int64).reshape(-1, 3)
            P = np.c_[pos, np.ones(len(pos))]
            if "skin" in n:
                sk = glb.js["skins"][n["skin"]]
                ibm = glb.accessor(sk["inverseBindMatrices"]).astype(np.float64).reshape(-1, 4, 4).transpose(0, 2, 1)
                names = [glb.js["nodes"][j]["name"] for j in sk["joints"]]
                mats = np.array([skeleton.get(nm, own[nm]) @ ibm[k] for k, nm in enumerate(names)])
                J = glb.accessor(a["JOINTS_0"]).astype(np.int64)
                W = glb.accessor(a["WEIGHTS_0"]).astype(np.float64)
                M = np.einsum("vk,vkab->vab", W, mats[J])
            else:
                bone = (n.get("extras") or {}).get("bone")
                world = (skeleton[bone] if bone else np.eye(4)) @ _local(n)
                M = np.broadcast_to(world, (len(P), 4, 4))
            wp = np.einsum("vab,vb->va", M, P)[:, :3]
            wn = np.einsum("vab,vb->va", M[:, :3, :3], nrm)
            wn /= np.linalg.norm(wn, axis=1, keepdims=True) + 1e-12
            out.append((wp, wn, uv, tris))
    return out


def frame_box(meshes: list, yaw_deg: float) -> tuple:
    """La caja (x0, x1, y0, y1) de las mallas ya giradas: con ella se encuadra (la del cuerpo, igual para todos)."""
    R = _yaw(yaw_deg)
    pts = np.concatenate([m[0] for m in meshes]) @ R.T
    return float(pts[:, 0].min()), float(pts[:, 0].max()), float(pts[:, 1].min()), float(pts[:, 1].max())


def _yaw(deg: float) -> np.ndarray:
    c, s = np.cos(np.radians(deg)), np.sin(np.radians(deg))
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])


def render(layers: list, box: tuple, size=(360, 480), yaw_deg=-20.0, margin=0.08,
           light=(-0.35, 0.45, 0.82), supersample=2) -> np.ndarray:
    """Dibuja `layers` ([(mallas de `posed`, textura RGBA uint8 H×W×4)]) y devuelve RGBA uint8 (alto × ancho × 4),
    con fondo transparente. `box` es la caja del cuerpo de `frame_box`: el encuadre no depende de la ropa, así
    todos los afiches de un sexo quedan a la misma escala y en el mismo lugar. `margin`: aire alrededor, en
    fracción del alto (arriba más, por los sombreros)."""
    W, H = size[0] * supersample, size[1] * supersample
    x0, x1, y0, y1 = box
    h = (y1 - y0) * (1 + 2.5 * margin)
    w = (x1 - x0) * (1 + 2 * margin)
    scale = min(W / w, H / h)
    cx = (x0 + x1) / 2
    top = y1 + (y1 - y0) * 1.5 * margin  # más aire arriba que abajo: gorras y sombreros
    R = _yaw(yaw_deg)
    L = np.asarray(light, dtype=np.float64)
    L /= np.linalg.norm(L)
    color = np.zeros((H, W, 3))
    alpha = np.zeros((H, W))
    zbuf = np.full((H, W), -np.inf)
    for meshes, tex in layers:
        t = tex.astype(np.float64) / 255.0
        th, tw = t.shape[:2]
        for pos, nrm, uv, tris in meshes:
            p = pos @ R.T
            n = nrm @ R.T
            sx = W / 2 + (p[:, 0] - cx) * scale
            sy = (top - p[:, 1]) * scale
            sz = p[:, 2]
            for a, b, c in tris:
                xa, ya, xb, yb, xc, yc = sx[a], sy[a], sx[b], sy[b], sx[c], sy[c]
                area = (xb - xa) * (yc - ya) - (xc - xa) * (yb - ya)
                if area >= -1e-12:  # en pantalla Y va para abajo: las caras de frente quedan con área < 0
                    continue
                minx, maxx = max(int(min(xa, xb, xc)), 0), min(int(max(xa, xb, xc)) + 1, W - 1)
                miny, maxy = max(int(min(ya, yb, yc)), 0), min(int(max(ya, yb, yc)) + 1, H - 1)
                if minx > maxx or miny > maxy:
                    continue
                X, Y = np.meshgrid(np.arange(minx, maxx + 1) + 0.5, np.arange(miny, maxy + 1) + 0.5)
                w0 = ((xb - X) * (yc - Y) - (xc - X) * (yb - Y)) / area
                w1 = ((xc - X) * (ya - Y) - (xa - X) * (yc - Y)) / area
                w2 = 1 - w0 - w1
                inside = (w0 >= 0) & (w1 >= 0) & (w2 >= 0)
                if not inside.any():
                    continue
                z = w0 * sz[a] + w1 * sz[b] + w2 * sz[c]
                sub = zbuf[miny:maxy + 1, minx:maxx + 1]
                ok = inside & (z > sub)
                if not ok.any():
                    continue
                u = w0 * uv[a, 0] + w1 * uv[b, 0] + w2 * uv[c, 0]
                v = w0 * uv[a, 1] + w1 * uv[b, 1] + w2 * uv[c, 1]
                tx = np.clip(np.floor((u % 1.0) * tw), 0, tw - 1).astype(np.int64)
                ty = np.clip(np.floor((v % 1.0) * th), 0, th - 1).astype(np.int64)
                col = t[ty, tx]
                ok &= col[..., 3] >= ALPHA_CUTOFF
                if not ok.any():
                    continue
                nn = w0[..., None] * n[a] + w1[..., None] * n[b] + w2[..., None] * n[c]
                nn /= np.linalg.norm(nn, axis=-1, keepdims=True) + 1e-12
                shade = AMBIENT + DIFFUSE * np.clip(nn @ L, 0, 1)
                sub[ok] = z[ok]
                color[miny:maxy + 1, minx:maxx + 1][ok] = col[..., :3][ok] * shade[ok][:, None]
                alpha[miny:maxy + 1, minx:maxx + 1][ok] = 1.0
    # 2×2 → 1 con alfa premultiplicado (el color ya está multiplicado por el alfa, que es 0 o 1)
    k = supersample
    pre = (color * alpha[..., None]).reshape(size[1], k, size[0], k, 3).mean(axis=(1, 3))
    a = alpha.reshape(size[1], k, size[0], k).mean(axis=(1, 3))
    rgb = np.where(a[..., None] > 0, pre / np.maximum(a[..., None], 1e-12), 0)
    out = np.dstack([np.clip(rgb, 0, 1), a])
    return np.round(out * 255).astype(np.uint8)
