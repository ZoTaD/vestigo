"""
Lector propio del `.dat` de Age of Empires II: DE (`resources/_common/dat/empires2_x2_p1.dat`, versión "VER 8.9"),
2026-11-21. Lee en orden todo el archivo hasta las tecnologías y se queda con lo que usa la enciclopedia: civs con sus
unidades (vida, ataque, armaduras, costo, edificio…), tecnologías (costo, tiempo, edificio, efecto) y efectos.

El formato es el de genie (zlib sin cabecera); el orden y el tamaño de cada campo siguen la documentación pública del
formato (proyecto genieutils). Sólo lee VER 8.8 y 8.9: con otra versión falla en voz alta.
"""
from __future__ import annotations

import struct
import zlib
from dataclasses import dataclass, field
from pathlib import Path

TILE_TYPES = 19
TERRAINS = 200
TERRAIN_UNITS = 30


class Lector:
    def __init__(self, data: bytes):
        self.b = memoryview(data)
        self.o = 0

    def fmt(self, f: str) -> tuple:
        s = struct.Struct("<" + f)
        v = s.unpack_from(self.b, self.o)
        self.o += s.size
        return v

    def u8(self) -> int:
        return self.fmt("B")[0]

    def i16(self) -> int:
        return self.fmt("h")[0]

    def i32(self) -> int:
        return self.fmt("i")[0]

    def f32(self) -> float:
        return self.fmt("f")[0]

    def saltar(self, n: int) -> None:
        self.o += n

    def texto(self) -> str:
        marca, n = self.fmt("HH")
        if marca != 0x0A60:
            raise ValueError(f"texto sin marca en {self.o - 4}")
        t = bytes(self.b[self.o:self.o + n]).decode("utf-8", "replace")
        self.o += n
        return t


@dataclass
class Unidad:
    id: int
    tipo: int
    nombre: str
    clase: int
    vida: int
    vision: float
    name_id: int
    help_id: int
    icono: int
    habilitada: bool
    velocidad: float | None = None
    armadura_base: int = 0
    ataques: dict[int, int] = field(default_factory=dict)
    armaduras: dict[int, int] = field(default_factory=dict)
    alcance: float = 0.0
    alcance_min: float = 0.0
    recarga: float = 0.0
    precision: int = 0
    proyectil: int = -1
    proyectiles: float = 0.0
    ataque_visible: int = 0
    armadura_visible: int = 0
    perforante_visible: int = 0
    alcance_visible: float = 0.0
    costo: dict[int, int] = field(default_factory=dict)
    tiempo: int = 0
    edificio: int = -1
    guarnicion: int = 0
    tech_id: int = -1  # edificios: la tecnología que se dispara al construirlo


@dataclass
class Tecnologia:
    id: int
    nombre: str
    requisitos: list[int]
    requisitos_n: int
    costo: dict[int, int]
    civ: int
    name_id: int
    help_id: int
    efecto: int
    icono: int
    edificio: int
    tiempo: int


@dataclass
class Civ:
    nombre: str
    tech_tree: int
    bono_equipo: int
    unidades: dict[int, Unidad]


@dataclass
class Dat:
    version: str
    efectos: list[tuple[str, list[tuple[int, int, int, int, float]]]]
    civs: list[Civ]
    techs: list[Tecnologia]


def _costos(pares) -> dict[int, int]:
    return {t: a for t, a, f in pares if t >= 0 and a > 0 and f}


def _unidad(r: Lector) -> Unidad:
    f = r.fmt("bhiihhhhhbhfbfffhhhhbbhbhbbhhhhffbbhbhfbbbbbfbiibbbbbbbbbhbbfffii")
    # Posiciones dentro del bloque fijo: tipo 0, id 1, nombre 2, clase 4, vida 10, visión 11, guarnición 12, ícono 22,
    # habilitada 25, ayuda 46.
    tipo, uid, name_id, clase, vida, vision = f[0], f[1], f[2], f[4], f[10], f[11]
    icono, habilitada, help_id = f[22], f[25], f[46]
    r.saltar(7 * 3)  # almacenes de recursos
    n = r.u8()
    r.saltar(5 * n)  # gráficos de daño
    r.fmt("hhiiiibb")
    nombre = r.texto()
    r.fmt("hh")  # copia y base
    u = Unidad(uid, tipo, nombre, clase, vida, vision, name_id, help_id, icono, bool(habilitada))
    u.guarnicion = f[12]
    if tipo == 90:
        return u
    if tipo >= 20:
        u.velocidad = r.f32()
    if tipo >= 30:
        r.saltar(41)  # DeadFish
    if tipo >= 40:
        r.fmt("hff")
        r.saltar(2 * r.i16())  # lugares de descarga
        r.fmt("bhhiib")
        for _ in range(r.i16()):  # tareas (VER 8.8+)
            r.fmt("hhbhhhhhhhhfffbfbbhhbbbhhhhhhiih")
    if tipo >= 50:
        u.armadura_base = r.i16()
        u.ataques = {c: a for c, a in (r.fmt("hh") for _ in range(r.i16()))}
        u.armaduras = {c: a for c, a in (r.fmt("hh") for _ in range(r.i16()))}
        r.i16()  # bonus por terreno
        r.f32()
        u.alcance = r.f32()
        r.f32()  # radio de área
        u.recarga = r.f32()
        u.proyectil = r.i16()
        u.precision = r.i16()
        r.fmt("bhfffb")
        u.alcance_min = r.f32()
        r.f32()
        r.i16()
        u.armadura_visible = r.i16()
        u.ataque_visible = r.i16()
        u.alcance_visible = r.f32()
        r.f32()  # recarga visible
        r.f32()  # daño de área
        r.fmt("ffhfh")  # VER 8.4+
    if tipo == 60:
        r.saltar(9)
    if tipo >= 70:
        u.costo = _costos(r.fmt("hhh") for _ in range(3))
        lugares = [r.fmt("hhbi") for _ in range(r.i16())]
        if lugares:
            u.tiempo, u.edificio = lugares[0][0], lugares[0][1]
        resto = r.fmt("ffbbihhhhffhhhibfhiihffffbfffiibh")
        u.proyectiles = resto[24]
        u.perforante_visible = resto[-1]
    if tipo == 80:
        b1 = r.fmt("hhhhhhbhbhhhhb")
        u.tech_id = b1[12]
        r.saltar(10 * 4)
        r.fmt("hhhhiibffhbbbbbb")
    return u


def leer(ruta: Path | str) -> Dat:
    r = Lector(zlib.decompress(Path(ruta).read_bytes(), -15))
    version = bytes(r.b[:8]).split(b"\0")[0].decode()
    r.o = 8
    if version not in ("VER 8.8", "VER 8.9"):
        raise ValueError(f"versión del .dat no soportada: {version}")
    # Restricciones de terreno.
    n, usados = r.fmt("hh")
    r.saltar(8 * n)
    r.saltar(n * usados * (4 + 16))
    # Colores de jugador.
    r.saltar(36 * r.i16())
    # Sonidos.
    for _ in range(r.i16()):
        _id, _demora, items, _cache, _total = r.fmt("hhhih")
        for _ in range(items):
            r.texto()
            r.fmt("ihhh")
    # Gráficos.
    n = r.i16()
    punteros = r.fmt(f"{n}i")
    for p in punteros:
        if not p:
            continue
        r.texto(), r.texto(), r.texto()
        (_slp, _l, _c, _capa, _col, _tr, _x1, _y1, _x2, _y2, deltas, _s, _ws, sonidos, _fr, angulos, *_resto) = r.fmt("ibbbhbhhhhhhibhhfffbhbb")
        r.saltar(16 * deltas)
        if sonidos:
            r.saltar(24 * angulos)
    # Bloque de terreno.
    r.fmt("IIiiii")
    r.saltar(6 * TILE_TYPES + 2)
    for _ in range(TERRAINS):
        r.fmt("bbbbi")
        r.texto(), r.texto()
        r.fmt("iiiIIii")
        r.texto()
        r.fmt("BBBBBBBBhhffhhfbb")
        r.saltar(6 * TILE_TYPES)
        r.fmt("hhh")
        r.saltar(TERRAIN_UNITS * (2 + 2 + 2 + 1))
        r.fmt("hh")
    r.fmt("6f14h2I3b")
    # Mapas aleatorios.
    cuantos = r.fmt("Ii")[0]
    for _ in range(2 * cuantos):
        r.fmt("iiiiiiiiii")
        for tam in (44, 24, 44, 24):  # tierras, terrenos, unidades, elevaciones
            k, _p = r.fmt("Ii")
            r.saltar(tam * k)
    # Efectos.
    efectos = []
    for _ in range(r.i32()):
        nombre = r.texto()
        cmds = [r.fmt("Bhhhf") for _ in range(r.i16())]
        efectos.append((nombre, cmds))
    # Cabeceras de unidad (tareas compartidas).
    for _ in range(r.i32()):
        if r.u8():
            for _ in range(r.i16()):
                r.fmt("hhbhhhhhhhhfffbfbbhhbbbhhhhhhiih")
    # Civs.
    civs = []
    for _ in range(r.i16()):
        r.u8()
        nombre = r.texto()
        nrec, tt, bono = r.fmt("hhh")
        r.saltar(4 * nrec)
        r.u8()
        nu = r.i16()
        punteros = r.fmt(f"{nu}i")
        unidades = {}
        for p in punteros:
            if p:
                u = _unidad(r)
                unidades[u.id] = u
        civs.append(Civ(nombre, tt, bono, unidades))
    # Tecnologías.
    techs = []
    for i in range(r.i16()):
        req = list(r.fmt("6h"))
        costo = _costos(r.fmt("hhB") for _ in range(3))
        nreq, civ, _full, name_id, _desc, efecto, _tipo, icono, help_id, _tt = r.fmt("hhhiihhhii")
        nombre = r.texto()
        r.u8()
        lugares = [r.fmt("hhBi") for _ in range(r.i16())]
        edificio, tiempo = (lugares[0][0], lugares[0][1]) if lugares else (-1, 0)
        techs.append(Tecnologia(i, nombre, [x for x in req if x >= 0], nreq, costo, civ, name_id, help_id, efecto, icono, edificio, tiempo))
    return Dat(version, efectos, civs, techs)
