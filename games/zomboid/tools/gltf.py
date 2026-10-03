"""
Escritor de .glb (glTF 2.0 binario) para el modelo 3D del Planificador de Zomboid (2026-10-01), a partir de lo que
lee `xfile.py`. Sin dependencias (sólo `struct` y `json`): así se corre con el Python de siempre, sin Blender ni
Assimp, y la salida es la misma en cualquier máquina.

Convenciones (medidas en el spike de la Task 1; ver "Modelo 3D — lo medido" en el README):
- El .x es mano izquierda; glTF, mano derecha. Se espeja Z: las matrices con `S·M·S` (`S = diag(1, 1, −1, 1)`), las
  posiciones y normales con `z → −z` y el giro de las caras se da vuelta. Los 16 números de una matriz del .x (vector
  fila, traslación en 12–14) están en el mismo orden en memoria que la `matrix` de glTF (columna mayor).
- Las claves `R` del .x son `(w, x, y, z)` **conjugadas**: con el espejo, en glTF son `(x, y, −z, w)`.
- Los `FrameTransformMatrix` NO son la pose de unión (son un cuadro de alguna animación): la pose de unión sale del
  `offset` de cada `SkinWeights` (→ `inverseBindMatrices`), y el reposo de los nodos es el cuadro 0 del idle.
- Las UV van tal cual: el .x y glTF tienen el origen arriba a la izquierda.

Determinismo: sin fechas ni versiones en `asset`, mismo orden siempre, y el archivo se reescribe sólo si cambió
(bytes iguales → no se toca, así git no ve cambios).
"""
from __future__ import annotations

import json
import math
import os
import struct
import sys
from array import array

FLOAT, USHORT, UBYTE = 5126, 5123, 5121
ARRAY_BUFFER, ELEMENT_ARRAY_BUFFER = 34962, 34963
IDENTITY = [1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0]
# basicEffect.frag descarta el píxel si el alfa es < 0,01: así la máscara de la ropa agujerea la piel (respuesta 1).
ALPHA_CUTOFF = 0.01
# Un canal que no se aleja de su primer valor más que esto no se escribe: en el idle la escala es siempre 1 y casi
# todas las posiciones son fijas, y cada canal de menos son ~350 bytes.
STILL = 1e-6
_SIGNS = [1.0 if (k // 4 == 2) == (k % 4 == 2) else -1.0 for k in range(16)]  # S·M·S elemento a elemento


# ---------------------------------------------------------------------------------------------------- matemática
def to_rh_matrix(m: list[float]) -> list[float]:
    """S·M·S con S = diag(1, 1, −1, 1): cambia de signo los elementos con una sola coordenada Z (fila o columna 2)."""
    return [float(v) * s for v, s in zip(m, _SIGNS)]


def to_rh_quat(q_x: tuple[float, float, float, float]) -> tuple[float, float, float, float]:
    """Del `(w, x, y, z)` conjugado del .x al `(x, y, z, w)` de glTF, espejado en Z.
    Conjugar da `(w, −x, −y, −z)`; espejar una rotación en Z invierte las componentes x e y del eje: `(x, y, −z, w)`."""
    w, x, y, z = q_x
    return (x, y, -z, w)


def quat_matrix(q: tuple[float, float, float, float]) -> list[float]:
    """(x, y, z, w) → 16 números en columna mayor (como la `matrix` de glTF)."""
    x, y, z, w = q
    return [1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w), 0.0,
            2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w), 0.0,
            2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y), 0.0,
            0.0, 0.0, 0.0, 1.0]


def _quat_from_rotation(c0, c1, c2):
    """Columnas de una matriz de rotación → cuaternión (x, y, z, w) unitario (método de Shepperd, estable)."""
    m00, m10, m20 = c0
    m01, m11, m21 = c1
    m02, m12, m22 = c2
    tr = m00 + m11 + m22
    if tr > 0:
        s = math.sqrt(tr + 1.0) * 2
        q = ((m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, 0.25 * s)
    elif m00 > m11 and m00 > m22:
        s = math.sqrt(1.0 + m00 - m11 - m22) * 2
        q = (0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s)
    elif m11 > m22:
        s = math.sqrt(1.0 + m11 - m00 - m22) * 2
        q = ((m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s)
    else:
        s = math.sqrt(1.0 + m22 - m00 - m11) * 2
        q = ((m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s)
    return _unit(q)


def _unit(q):
    n = math.sqrt(sum(v * v for v in q)) or 1.0
    q = tuple(v / n for v in q)
    # Signo fijo (w ≥ 0) para que la misma rotación dé siempre los mismos números.
    return tuple(-v for v in q) if q[3] < 0 else q


def decompose(m: list[float]) -> tuple[tuple, tuple, tuple]:
    """Matriz en columna mayor → (T, R xyzw, S). glTF no anima nodos con `matrix`: cada hueso va con TRS."""
    t = (m[12], m[13], m[14])
    cols = [m[0:3], m[4:7], m[8:11]]
    s = [math.sqrt(sum(v * v for v in c)) or 1.0 for c in cols]
    det = (cols[0][0] * (cols[1][1] * cols[2][2] - cols[2][1] * cols[1][2])
           - cols[1][0] * (cols[0][1] * cols[2][2] - cols[2][1] * cols[0][2])
           + cols[2][0] * (cols[0][1] * cols[1][2] - cols[1][1] * cols[0][2]))
    if det < 0:  # un espejo adentro de la matriz: va a la escala en X
        s[0] = -s[0]
    r = _quat_from_rotation(*[[v / sc for v in c] for c, sc in zip(cols, s)])
    return t, r, tuple(s)


def compose(t: tuple, r: tuple, s: tuple) -> list[float]:
    """La inversa de `decompose`: T·R·S en columna mayor."""
    m = quat_matrix(r)
    for c in range(3):
        for k in range(3):
            m[c * 4 + k] *= s[c]
    m[12], m[13], m[14] = t
    return m


def _mul(a, b):
    """a·b, las dos en columna mayor."""
    return [sum(a[k * 4 + r] * b[c * 4 + k] for k in range(4)) for c in range(4) for r in range(4)]


# ---------------------------------------------------------------------------------------------------- la malla
def _f32(vals):
    """Redondea a float32 (lo que queda en el archivo), para que `min`/`max` coincidan exacto con los datos."""
    return list(array("f", vals))


def _geometry(mesh):
    """Vértices listos para glTF: se parten donde el mismo vértice tiene dos normales distintas (MeshNormals trae sus
    propias caras), los polígonos se abren en abanico y el giro se da vuelta por el espejo. Un vértice conserva su
    número la primera vez que aparece; las copias van al final (en el cuerpo no hay ninguna: 617 / 617 / 617)."""
    n = len(mesh.positions)
    corner_normals = None
    if mesh.normals and mesh.normal_faces:
        corner_normals = [[_normalize(mesh.normals[i]) for i in nf] for nf in mesh.normal_faces]
    else:
        corner_normals = _smooth_normals(mesh)
    src = list(range(n))                 # vértice original de cada vértice de salida
    normal = [None] * n
    slot = {}
    faces = []
    for face, nrm in zip(mesh.faces, corner_normals):
        out = []
        for v, nv in zip(face, nrm):
            key = (v, tuple(_f32(nv)))
            if key not in slot:
                if normal[v] is None:
                    normal[v] = key[1]
                    slot[key] = v
                else:
                    slot[key] = len(src)
                    src.append(v)
                    normal.append(key[1])
            out.append(slot[key])
        faces.append(out)
    normal = [nv if nv is not None else (0.0, 1.0, 0.0) for nv in normal]  # vértices sueltos: da igual
    tris = []
    for f in faces:
        for k in range(1, len(f) - 1):
            tris.extend((f[0], f[k + 1], f[k]))  # el espejo da vuelta el sentido de las caras
    return src, normal, tris


def _normalize(v):
    x, y, z = v
    d = math.sqrt(x * x + y * y + z * z)
    return (x / d, y / d, z / d) if d > 0 else (0.0, 1.0, 0.0)


def _smooth_normals(mesh):
    """Si un .x no trae MeshNormals: normales suaves por vértice (suma de las de sus caras, pesadas por área)."""
    acc = [[0.0, 0.0, 0.0] for _ in mesh.positions]
    for face in mesh.faces:
        p0 = mesh.positions[face[0]]
        for k in range(1, len(face) - 1):
            p1, p2 = mesh.positions[face[k]], mesh.positions[face[k + 1]]
            a = [p1[i] - p0[i] for i in range(3)]
            b = [p2[i] - p0[i] for i in range(3)]
            # .x es mano izquierda con caras en sentido horario: la normal de afuera es a × b.
            c = (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])
            for v in (face[0], face[k], face[k + 1]):
                for i in range(3):
                    acc[v][i] += c[i]
    return [[_normalize(acc[v]) for v in face] for face in mesh.faces]


def _skin_weights(mesh, joint_of, fallback):
    """Hasta 4 pesos por vértice (el juego trae 3), los más pesados, normalizados a suma 1."""
    per = [[] for _ in mesh.positions]
    for order, s in enumerate(mesh.skins):
        for v, w in zip(s.indices, s.weights):
            if w > 0:
                per[v].append((-w, order, joint_of[s.bone]))
    joints, weights = [], []
    for lst in per:
        lst = sorted(lst)[:4]
        total = -sum(w for w, _, _ in lst)
        if total <= 0:  # sin peso: queda pegado a la raíz del esqueleto
            lst, total = [(-1.0, 0, fallback)], 1.0
        js = [j for _, _, j in lst] + [0] * (4 - len(lst))
        ws = [-w / total for w, _, _ in lst] + [0.0] * (4 - len(lst))
        joints.append(js)
        weights.append(ws)
    return joints, weights


# ---------------------------------------------------------------------------------------------------- el archivo
class _Glb:
    def __init__(self):
        self.bin = bytearray()
        self.views, self.accessors = [], []

    def view(self, data, target=None):
        self.bin += b"\0" * (-len(self.bin) % 4)  # cada vista arranca alineada a 4 bytes
        v = {"buffer": 0, "byteOffset": len(self.bin), "byteLength": len(data)}
        if target:
            v["target"] = target
        self.bin += data
        self.views.append(v)
        return len(self.views) - 1

    def accessor(self, rows, ctype, typ, target=None, minmax=False):
        flat = [v for r in rows for v in r]
        fmt = {FLOAT: "f", USHORT: "H", UBYTE: "B"}[ctype]
        data = array(fmt, flat)
        if data.itemsize != struct.calcsize(fmt):
            raise RuntimeError("array con tamaño raro")
        if sys.byteorder != "little":
            data.byteswap()
        a = {"bufferView": self.view(data.tobytes(), target), "componentType": ctype, "count": len(rows),
             "type": typ}
        if minmax:  # glTF los exige en POSITION y en los tiempos de las animaciones
            cols = list(zip(*[_f32(r) for r in rows]))
            a["min"] = [min(c) for c in cols]
            a["max"] = [max(c) for c in cols]
        self.accessors.append(a)
        return len(self.accessors) - 1


def _num(v):
    """Números del JSON (TRS de los nodos) con 7 cifras: lo que guarda un float32, sin la cola de 17 dígitos."""
    v = float(f"{v:.7g}")
    return 0.0 if v == 0 else v


def _ancestry(frames, name):
    """Camino de Frames desde el primer nivel hasta `name` (incluido), o None."""
    for f in frames:
        if f.name == name:
            return [f]
        sub = _ancestry(f.children, name)
        if sub:
            return [f] + sub
    return None


def _subtree(f):
    out = [f]
    for c in f.children:
        out.extend(_subtree(c))
    return out


def _needed(f, names):
    """¿El Frame `f` o alguno que cuelga de él está en `names`?"""
    return f.name in names or any(_needed(c, names) for c in f.children)


def _frame_of(frames, mesh, parents=()):
    for f in frames:
        if any(m is mesh for m in f.meshes):
            return list(parents) + [f]
        found = _frame_of(f.children, mesh, list(parents) + [f])
        if found:
            return found
    return None


def _key_series(key, keep_t):
    """Una clave del .x → {ruta glTF: [valores]} ya en la mano derecha."""
    if key.kind == 0:
        return {"rotation": [to_rh_quat(v) for v in key.values]}
    if key.kind == 1:
        return {"scale": [tuple(v) for v in key.values]}
    if key.kind == 2:
        return {"translation": [(v[0], v[1], -v[2]) for v in key.values]} if keep_t else {}
    if key.kind == 4:
        trs = [decompose(to_rh_matrix(v)) for v in key.values]
        out = {"rotation": [r for _, r, _ in trs], "scale": [s for _, _, s in trs]}
        if keep_t:
            out["translation"] = [t for t, _, _ in trs]
        return out
    raise ValueError(f"AnimationKey de tipo {key.kind}: no se conoce")


def write_glb(path: str, *, frames, mesh, skin_root: str | None, animation, speed: float = 1.0,
              static_bone: str | None = None, rotations_only: bool = False) -> dict:
    """Escribe un .glb y devuelve {"vertices", "triangles", "bytes", "joints", "channels"}.

    - Con `skin_root` (el cuerpo y las piezas con piel): los nodos son los Frames desde el primer nivel hasta
      `skin_root` y lo que cuelga de él; las articulaciones (`joints`) son `skin_root` y sus descendientes, en el
      orden del .x. Cada malla lleva SUS `inverseBindMatrices` (del `offset` de sus `SkinWeights`): el sitio cambia
      los huesos de una pieza por los del cuerpo con el mismo nombre. Un hueso sin `SkinWeights` lleva la identidad
      (no mueve ningún vértice).
      Con animación (el cuerpo) va el esqueleto entero, porque de ahí sacan sus huesos las piezas. Sin animación (una
      pieza) van sólo los huesos que pesa y los que están en el camino hasta `skin_root`: varias piezas traen
      Frames que el cuerpo no tiene (`Bip01_HeadNub`, `Bip01_L_Finger0Nub`…) y el sitio no tendría con qué
      cambiarlos; además, cada hueso de menos son ~170 bytes (`Kate_Jacket` pasaba de 25 KB).
    - `animation`: el reposo de cada nodo es su primer cuadro y se escriben sólo los canales que cambian; tiempo =
      ticks / AnimTicksPerSecond / `speed`, interpolación LINEAR.
    - `rotations_only` (la mujer con `Bob_Idle`, que es del hombre): de la animación van las rotaciones y la
      traslación de `skin_root` y sus ancestros; el largo de cada hueso queda el del propio archivo, porque con las
      traslaciones del hombre los brazos de la mujer se estiran 1,3 cm.
    - `static_bone` (pieza fija, sin piel): un solo nodo con la malla, en el espacio del hueso; el sitio lo cuelga
      del hueso con ese nombre (queda también en `extras.bone`).
    - El material no trae imagen (la textura la pone el sitio por atuendo) ni `baseColorTexture`: un `texture` sin
      `source` hace fallar a GLTFLoader de three. Va con `alphaMode` MASK y `alphaCutoff` 0,01, como el juego.
    """
    g = _Glb()
    nodes, scene, skins, anims = [], [], [], []
    channels = 0
    joints: list = []

    # ---- esqueleto
    by_name = {}
    if skin_root:
        chain = _ancestry(frames, skin_root)
        if not chain:
            raise ValueError(f"no hay un Frame {skin_root!r}")
        joints = _subtree(chain[-1])
        if animation is None and mesh is not None and mesh.skins:
            weighted = {sk.bone for sk in mesh.skins if any(w > 0 for w in sk.weights)}
            joints = [f for f in joints if _needed(f, weighted)]
        written = chain[:-1] + joints
        keep_t = {f.name for f in chain}  # la raíz y lo de arriba: la altura de la cadera
        tracks = animation.tracks if animation else {}
        for f in written:
            t, r, s = decompose(to_rh_matrix(f.matrix))
            for key in tracks.get(f.name, ()):
                if not key.values:
                    continue
                first = _key_series(key, not rotations_only or f.name in keep_t)
                t = first.get("translation", [t])[0]
                r = first.get("rotation", [r])[0]
                s = first.get("scale", [s])[0]
            node = {"name": f.name}
            if any(abs(v) > 0 for v in t):
                node["translation"] = [_num(v) for v in t]
            if abs(r[3] - 1) > 1e-9 or any(r[:3]):
                node["rotation"] = [_num(v) for v in _unit(r)]
            if any(abs(v - 1) > 1e-6 for v in s):
                node["scale"] = [_num(v) for v in s]
            if f.name in by_name:  # un segundo Frame con el mismo nombre daría hijos y articulaciones equivocados
                raise ValueError(f"dos Frames se llaman {f.name!r}")
            by_name[f.name] = len(nodes)
            nodes.append(node)
        for f in written:
            kids = [by_name[c.name] for c in f.children if c.name in by_name]
            if kids:
                nodes[by_name[f.name]]["children"] = kids
        scene.append(by_name[chain[0].name])

        # ---- animación: sólo los canales que se mueven
        if animation:
            samplers, chans, time_cache, targets = [], [], {}, set()
            for f in written:
                for key in tracks.get(f.name, ()):
                    if not key.values:
                        continue
                    series = _key_series(key, not rotations_only or f.name in keep_t)
                    for p in ("rotation", "translation", "scale"):
                        vals = series.get(p)
                        if not vals:
                            continue
                        if p == "rotation":  # mismo hemisferio que la clave anterior: interpola por el camino corto
                            vals = [tuple(v) for v in vals]
                            for k in range(1, len(vals)):
                                if sum(a * b for a, b in zip(vals[k], vals[k - 1])) < 0:
                                    vals[k] = tuple(-v for v in vals[k])
                        if max(abs(a - b) for v in vals for a, b in zip(v, vals[0])) < STILL:
                            continue
                        times = tuple(key.times)
                        if any(b <= a for a, b in zip(times, times[1:])):
                            raise ValueError(f"{f.name}: los tiempos de la animación no crecen ({p})")
                        if (f.name, p) in targets:  # claves de dos tipos que mueven lo mismo (p. ej. tipo 0 y tipo 4)
                            raise ValueError(f"{f.name}: dos canales de animación sobre {p}")
                        targets.add((f.name, p))
                        if times not in time_cache:
                            secs = [(t / animation.ticks_per_second / speed,) for t in times]
                            time_cache[times] = g.accessor(secs, FLOAT, "SCALAR", minmax=True)
                        out = g.accessor(vals, FLOAT, "VEC4" if p == "rotation" else "VEC3")
                        samplers.append({"input": time_cache[times], "output": out, "interpolation": "LINEAR"})
                        chans.append({"sampler": len(samplers) - 1, "target": {"node": by_name[f.name], "path": p}})
            if chans:
                anims.append({"name": "Idle", "channels": chans, "samplers": samplers})
                channels = len(chans)

    # ---- la malla
    vertices = triangles = 0
    if mesh is not None:
        src, normal, tris = _geometry(mesh)
        if len(src) > 65535:
            raise ValueError(f"{mesh.name}: {len(src)} vértices no entran en índices de 16 bits")
        vertices, triangles = len(src), len(tris) // 3
        pos = [(mesh.positions[v][0], mesh.positions[v][1], -mesh.positions[v][2]) for v in src]
        attrs = {"POSITION": g.accessor(pos, FLOAT, "VEC3", ARRAY_BUFFER, minmax=True),
                 "NORMAL": g.accessor([(x, y, -z) for x, y, z in normal], FLOAT, "VEC3", ARRAY_BUFFER)}
        if mesh.uvs:
            attrs["TEXCOORD_0"] = g.accessor([mesh.uvs[v] for v in src], FLOAT, "VEC2", ARRAY_BUFFER)
        skinned = bool(skin_root and mesh.skins)
        if skinned:
            joint_of = {f.name: k for k, f in enumerate(joints)}
            missing = [s.bone for s in mesh.skins if s.bone not in joint_of and any(w > 0 for w in s.weights)]
            if missing:
                raise ValueError(f"{mesh.name}: los huesos {missing} no cuelgan de {skin_root}")
            if len(joints) > 255:
                raise ValueError(f"{mesh.name}: {len(joints)} articulaciones no entran en JOINTS_0 de un byte")
            js, ws = _skin_weights(mesh, joint_of, 0)
            attrs["JOINTS_0"] = g.accessor([js[v] for v in src], UBYTE, "VEC4", ARRAY_BUFFER)
            attrs["WEIGHTS_0"] = g.accessor([ws[v] for v in src], FLOAT, "VEC4", ARRAY_BUFFER)
        prim = {"attributes": attrs, "indices": g.accessor([(i,) for i in tris], USHORT, "SCALAR",
                                                           ELEMENT_ARRAY_BUFFER), "material": 0}
        material = {"name": mesh.name, "pbrMetallicRoughness": {"metallicFactor": 0.0, "roughnessFactor": 1.0},
                    "alphaMode": "MASK", "alphaCutoff": ALPHA_CUTOFF}
        node = {"name": mesh.name, "mesh": 0}
        if skinned:
            offsets = {}
            for s in mesh.skins:
                offsets.setdefault(s.bone, to_rh_matrix(s.offset))
            ibm = g.accessor([offsets.get(f.name, IDENTITY) for f in joints], FLOAT, "MAT4")
            skins.append({"inverseBindMatrices": ibm, "joints": [by_name[f.name] for f in joints],
                          "skeleton": by_name[skin_root]})
            node["skin"] = 0
        else:
            # Malla sin piel: queda donde la pone su Frame (en las piezas fijas, la identidad: el espacio del hueso).
            where = _frame_of(frames, mesh) or []
            world = IDENTITY
            for f in where:
                world = _mul(world, to_rh_matrix(f.matrix))
            if max(abs(a - b) for a, b in zip(world, IDENTITY)) > 1e-6:
                t, r, s = decompose(world)
                node.update(translation=[_num(v) for v in t], rotation=[_num(v) for v in r],
                            scale=[_num(v) for v in s])
            if static_bone:
                node["extras"] = {"bone": static_bone}
        nodes.append(node)
        scene.append(len(nodes) - 1)
        meshes = [{"name": mesh.name, "primitives": [prim]}]
    else:
        meshes, material = [], None

    # ---- JSON + BIN
    doc = {"asset": {"version": "2.0", "generator": "vestigo zomboid"}, "scene": 0,
           "scenes": [{"nodes": scene}], "nodes": nodes}
    if meshes:
        doc["meshes"] = meshes
        doc["materials"] = [material]
    if skins:
        doc["skins"] = skins
    if anims:
        doc["animations"] = anims
    if g.accessors:
        doc["accessors"] = g.accessors
        doc["bufferViews"] = g.views
    g.bin += b"\0" * (-len(g.bin) % 4)
    if g.bin:
        doc["buffers"] = [{"byteLength": len(g.bin)}]
    js = json.dumps(doc, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    js += b" " * (-len(js) % 4)  # el chunk JSON se rellena con espacios
    out = struct.pack("<4sII", b"glTF", 2, 12 + 8 + len(js) + (8 + len(g.bin) if g.bin else 0))
    out += struct.pack("<I4s", len(js), b"JSON") + js
    if g.bin:
        out += struct.pack("<I4s", len(g.bin), b"BIN\0") + bytes(g.bin)

    old = None
    if os.path.isfile(path):
        with open(path, "rb") as h:
            old = h.read()
    if old != out:
        with open(path, "wb") as h:
            h.write(out)
    return {"vertices": vertices, "triangles": triangles, "bytes": len(out), "joints": len(joints),
            "channels": channels}
