"""
Lector de archivos .x de DirectX en texto (los de Project Zomboid), para el modelo 3D del Planificador (2026-10-01).

Por qué uno propio: los 1.174 .x de personajes y ropa (`models_X/Skinned` y `models_X/Static`) y las animaciones de
`anims_X` son texto (`xof 0303txt`), y con un lector de ~300 líneas no hace falta Assimp, Blender ni nada instalado
para pasarlos a glTF (eso lo hace `gltf.py`). Lee sólo lo que usamos: Frame (con su FrameTransformMatrix), Mesh
(posiciones, caras, MeshNormals, MeshTextureCoords, MeshMaterialList, SkinWeights), AnimationSet y
AnimTicksPerSecond. Las plantillas (`template`) se saltean; lo que no conoce adentro de una Mesh
(`VertexDuplicationIndices`, `DeclData`, `XSkinMeshHeader`…) también, y lo que no conoce afuera queda anotado en
`XFile.skipped` para que un parche que traiga algo nuevo se note.

Los números se guardan tal cual el .x (mano izquierda, matrices de vector fila con la traslación en 12–14,
cuaterniones `(w, x, y, z)` conjugados): la conversión a la mano derecha de glTF es de `gltf.py`.

Ante algo que no entiende levanta `XError("<archivo>:<línea>: …")`, para ir derecho al lugar.
"""
from __future__ import annotations

import os
import re
from dataclasses import dataclass, field


class XError(Exception):
    pass


@dataclass
class XFrame:
    name: str
    matrix: list[float]          # 16 números tal cual el .x (vector fila; traslación en 12–14)
    children: list["XFrame"]
    meshes: list["XMesh"]


@dataclass
class XSkin:
    bone: str
    indices: list[int]           # vértices de la malla
    weights: list[float]
    offset: list[float]          # 16 números: la matriz inversa de reposo del hueso


@dataclass
class XMesh:
    name: str
    positions: list[tuple[float, float, float]]
    faces: list[tuple[int, ...]]             # 3 o 4 índices (los cuadriláteros se parten en gltf.py)
    normals: list[tuple[float, float, float]]
    normal_faces: list[tuple[int, ...]]      # índices de normales por cara (MeshNormals tiene los suyos)
    uvs: list[tuple[float, float]]           # uno por vértice (MeshTextureCoords)
    material_faces: list[int]
    skins: list[XSkin]


@dataclass
class XKey:
    kind: int                    # 0 rotación (w, x, y, z), 1 escala, 2 posición, 4 matriz
    times: list[int]
    values: list[tuple[float, ...]]


@dataclass
class XAnimation:
    name: str
    ticks_per_second: int
    tracks: dict[str, list[XKey]]            # por nombre de hueso


@dataclass
class XFile:
    root: list[XFrame]
    animations: list[XAnimation]
    skipped: list[str] = field(default_factory=list)  # tipos de objeto de primer nivel que no conoce


IDENTITY = [1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0]
# 4.800 es el valor por omisión de DirectX cuando el archivo no trae AnimTicksPerSecond.
DEFAULT_TICKS = 4800

# Los comentarios del formato (`//` y `#` hasta el fin del renglón) cuentan como separador: ningún .x del juego los
# trae, pero el formato los permite.
# Una "corrida" de números es todo un bloque de datos seguido (`617; 0.06;0.77;0.01;, …`): agarrarla de una vez y
# separarla después es mucho más rápido que ir número por número con el bucle del lector (son 120 MB de .x).
_TOKEN = re.compile(r"""
    (?P<num>(?:[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?[;,\s]*)+)
  | (?P<str>"[^"]*")
  | (?P<guid><[^>]*>)
  | (?P<open>\{)
  | (?P<close>\})
  | (?P<word>[A-Za-z_][\w\-.]*)
  | (?P<sep>(?:[;,\s]+|(?://|\#)[^\n]*)+)
  | (?P<bad>.)
""", re.X | re.S)
_NUMBER = re.compile(r"[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?")

# Lo que se lee afuera de todo (el resto va a `skipped`). Material y Header se reconocen pero no se usan: la textura la
# elige el sitio por atuendo, no la del .x.
_TOP_KNOWN = {"Frame", "Mesh", "AnimationSet", "AnimTicksPerSecond", "Material", "Header"}


class _Obj:
    """Un objeto del .x sin interpretar: tipo, nombre, datos (números y strings), hijos y referencias `{Nombre}`."""
    __slots__ = ("kind", "name", "pos", "data", "kids", "refs")

    def __init__(self, kind, name, pos):
        self.kind, self.name, self.pos = kind, name, pos
        self.data, self.kids, self.refs = [], [], []

    def find(self, kind):
        return [k for k in self.kids if k.kind == kind]


class _Reader:
    def __init__(self, path, text):
        self.path, self.text = path, text

    def error(self, pos, msg):
        line = self.text.count("\n", 0, pos) + 1
        return XError(f"{os.path.basename(self.path)}:{line}: {msg}")

    def parse(self):
        text = self.text
        if not text.startswith("xof "):
            raise self.error(0, "no es un archivo .x")
        if text[8:11] != "txt":
            raise self.error(0, f"formato {text[8:12]!r}: sólo se leen .x en texto")
        pos = text.find("\n")
        pos = len(text) if pos < 0 else pos + 1
        root = _Obj("root", None, 0)
        stack = [root]
        n = len(text)
        match = _TOKEN.match
        while pos < n:
            m = match(text, pos)
            kind = m.lastgroup
            start, pos = pos, m.end()
            cur = stack[-1]
            if kind == "sep":
                continue
            if kind == "num":
                cur.data.extend(float(v) for v in _NUMBER.findall(m.group()))
            elif kind == "str":
                cur.data.append(m.group()[1:-1])
            elif kind == "guid":
                continue  # el GUID de un objeto no se usa
            elif kind == "close":
                if len(stack) == 1:
                    raise self.error(start, "'}' de más")
                stack.pop()
            elif kind == "open":
                # `{ Nombre }` o `{ Nombre <guid> }` o `{ <guid> }`: una referencia a otro objeto.
                ref, pos = self._reference(pos, start)
                if ref:
                    cur.refs.append(ref)
            elif kind == "word":
                word = m.group()
                if word == "template":
                    pos = self._skip_template(pos, start)
                    continue
                # `Tipo [Nombre] [<guid>] {`
                name = None
                pos = self._skip_sep(pos)
                # Al final del archivo `match` da None: es un "se esperaba '{'" con su línea, no un AttributeError.
                m2 = match(text, pos)
                if m2 and m2.lastgroup == "word":
                    name, pos = m2.group(), m2.end()
                    pos = self._skip_sep(pos)
                    m2 = match(text, pos)
                if m2 and m2.lastgroup == "guid":
                    pos = self._skip_sep(m2.end())
                    m2 = match(text, pos)
                if not m2 or m2.lastgroup != "open":
                    raise self.error(start, f"se esperaba '{{' después de {word!r}")
                pos = m2.end()
                obj = _Obj(word, name, start)
                cur.kids.append(obj)
                stack.append(obj)
            else:
                raise self.error(start, f"no se entiende {m.group()!r}")
        if len(stack) != 1:
            raise self.error(stack[-1].pos, f"{stack[-1].kind} sin cerrar")
        return root

    def _skip_sep(self, pos):
        m = _TOKEN.match(self.text, pos)
        while m and m.lastgroup == "sep":
            pos = m.end()
            m = _TOKEN.match(self.text, pos)
        return pos

    def _reference(self, pos, start):
        ref = None
        while True:
            pos = self._skip_sep(pos)
            m = _TOKEN.match(self.text, pos)
            if m is None:
                raise self.error(start, "referencia sin cerrar")
            pos = m.end()
            if m.lastgroup == "close":
                return ref, pos
            if m.lastgroup == "word" and ref is None:
                ref = m.group()
            elif m.lastgroup != "guid":
                raise self.error(start, f"referencia rara: {m.group()!r}")

    def _skip_template(self, pos, start):
        # Las plantillas traen `[...]` y tipos que no son datos: se saltean enteras hasta su `}`.
        i = self.text.find("{", pos)
        j = self.text.find("}", i + 1) if i >= 0 else -1
        if j < 0:
            raise self.error(start, "template sin cerrar")
        return j + 1


def _ints(r, o, vals):
    out = []
    for v in vals:
        if v != int(v) or v < 0:
            raise r.error(o.pos, f"{o.kind}: se esperaba un entero y hay {v}")
        out.append(int(v))
    return out


def _take(r, o, d, i, count):
    if i + count > len(d):
        raise r.error(o.pos, f"{o.kind}: faltan datos ({len(d) - i} de {count})")
    chunk = d[i:i + count]
    for v in chunk:
        if isinstance(v, str):
            raise r.error(o.pos, f"{o.kind}: se esperaba un número y hay {v!r}")
    return chunk, i + count


def _count(r, o, d, i):
    (v,), i = _take(r, o, d, i, 1)
    return _ints(r, o, [v])[0], i


def _faces(r, o, d, i, limit=None):
    """`n; c;a,b,c;, …` → lista de tuplas, validando que cada índice exista."""
    n, i = _count(r, o, d, i)
    faces = []
    for _ in range(n):
        c, i = _count(r, o, d, i)
        idx, i = _take(r, o, d, i, c)
        idx = tuple(_ints(r, o, idx))
        if limit is not None and any(v >= limit for v in idx):
            raise r.error(o.pos, f"{o.kind}: índice fuera de rango (hay {limit})")
        faces.append(idx)
    return faces, i


def _vectors(r, o, d, i, size):
    n, i = _count(r, o, d, i)
    flat, i = _take(r, o, d, i, n * size)
    return [tuple(flat[k:k + size]) for k in range(0, n * size, size)], i


def _matrix(r, o, d, i=0):
    vals, i = _take(r, o, d, i, 16)
    return list(vals), i


def _mesh(r, o):
    d = o.data
    positions, i = _vectors(r, o, d, 0, 3)
    faces, i = _faces(r, o, d, i, len(positions))
    normals, normal_faces, uvs, material_faces, skins = [], [], [], [], []
    for k in o.kids:
        if k.kind == "MeshNormals":
            normals, j = _vectors(r, k, k.data, 0, 3)
            normal_faces, j = _faces(r, k, k.data, j, len(normals))
            if len(normal_faces) != len(faces) or any(len(a) != len(b) for a, b in zip(normal_faces, faces)):
                raise r.error(k.pos, "MeshNormals: sus caras no coinciden con las de la malla")
        elif k.kind == "MeshTextureCoords":
            uvs, _ = _vectors(r, k, k.data, 0, 2)
            if len(uvs) != len(positions):
                raise r.error(k.pos, f"MeshTextureCoords: {len(uvs)} UV para {len(positions)} vértices")
        elif k.kind == "MeshMaterialList":
            _, j = _count(r, k, k.data, 0)
            nf, j = _count(r, k, k.data, j)
            vals, _ = _take(r, k, k.data, j, nf)
            material_faces = _ints(r, k, vals)
        elif k.kind == "SkinWeights":
            dd = k.data
            if not dd or not isinstance(dd[0], str):
                raise r.error(k.pos, "SkinWeights sin nombre de hueso")
            nw, j = _count(r, k, dd, 1)
            idx, j = _take(r, k, dd, j, nw)
            w, j = _take(r, k, dd, j, nw)
            off, _ = _matrix(r, k, dd, j)
            idx = _ints(r, k, idx)
            if any(v >= len(positions) for v in idx):
                raise r.error(k.pos, f"SkinWeights {dd[0]}: vértice fuera de rango")
            skins.append(XSkin(dd[0], idx, list(w), off))
        # VertexDuplicationIndices, DeclData, XSkinMeshHeader, MeshVertexColors…: no se usan.
    return XMesh(o.name or "", positions, faces, normals, normal_faces, uvs, material_faces, skins)


def _frame(r, o):
    ftm = o.find("FrameTransformMatrix")
    matrix = _matrix(r, ftm[0], ftm[0].data)[0] if ftm else list(IDENTITY)
    return XFrame(o.name or "", matrix, [_frame(r, k) for k in o.find("Frame")], [_mesh(r, k) for k in o.find("Mesh")])


def _animation_set(r, o, tps):
    tracks: dict[str, list[XKey]] = {}
    for an in o.find("Animation"):
        if not an.refs:
            raise r.error(an.pos, "Animation sin `{ hueso }`")
        keys = tracks.setdefault(an.refs[0], [])
        for k in an.find("AnimationKey"):
            d = k.data
            kind, i = _count(r, k, d, 0)
            nk, i = _count(r, k, d, i)
            times, values = [], []
            for _ in range(nk):
                t, i = _count(r, k, d, i)
                c, i = _count(r, k, d, i)
                v, i = _take(r, k, d, i, c)
                times.append(t)
                values.append(tuple(v))
            keys.append(XKey(kind, times, values))
    return XAnimation(o.name or "", tps, tracks)


def read_x(path: str) -> XFile:
    # latin-1: nunca falla al decodificar y los nombres del juego son ASCII.
    with open(path, encoding="latin-1") as h:
        text = h.read()
    r = _Reader(path, text)
    root = r.parse()
    tps = DEFAULT_TICKS
    for o in root.find("AnimTicksPerSecond"):
        (v,), _ = _take(r, o, o.data, 0, 1)
        tps = _ints(r, o, [v])[0]
    frames, animations, skipped = [], [], []
    for o in root.kids:
        if o.kind == "Frame":
            frames.append(_frame(r, o))
        elif o.kind == "Mesh":
            # Una malla suelta (fuera de todo Frame) queda en un Frame identidad sin nombre, para no perderla.
            frames.append(XFrame("", list(IDENTITY), [], [_mesh(r, o)]))
        elif o.kind == "AnimationSet":
            animations.append(_animation_set(r, o, tps))
        elif o.kind not in _TOP_KNOWN and o.kind not in skipped:
            skipped.append(o.kind)
    return XFile(frames, animations, skipped)


def walk_frames(x: XFile):
    """Todos los Frame, en orden (padre antes que hijos)."""
    stack = list(reversed(x.root))
    while stack:
        f = stack.pop()
        yield f
        stack.extend(reversed(f.children))


def find_frame(x: XFile, name: str) -> XFrame | None:
    for f in walk_frames(x):
        if f.name == name:
            return f
    return None


def main_mesh(x: XFile) -> XMesh | None:
    """La malla que usa el juego: la primera con huesos y, si ninguna tiene, la primera
    (`ProcessedAiScene.findMesh` sin nombre). `Bob_Trousers.x` trae `Bob_Trousers` y `Bob_LongShorts`."""
    meshes = [m for f in walk_frames(x) for m in f.meshes]
    for m in meshes:
        if m.skins:
            return m
    return meshes[0] if meshes else None
