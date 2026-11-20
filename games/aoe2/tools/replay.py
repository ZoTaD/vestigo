"""
Lector mínimo de grabaciones de AoE2: DE (`.aoe2record`, 2026-11-20): sólo las acciones de encolar, investigar y
construir de cada jugador, con su tiempo de juego. Sigue el formato que documenta `mgz` (happyleavesaoc/aoc-mgz, MIT):
largo del encabezado comprimido, metadatos del registro y operaciones (1 acción, 2 sincronización, 3 vista, 4 chat,
6 resumen final). El encabezado (el mapa, ~5 MB) no se lee: no hace falta para las aperturas.

El mismo lector está en TypeScript en `site/src/aoe2/api/replay.ts` (para la función que da la apertura de una partida
al pedirla); los dos se prueban con las mismas grabaciones.
"""
import struct
from dataclasses import dataclass

#: Acciones que interesan (números de `mgz.fast.enums.Action`).
RESEARCH, BUILD, DE_QUEUE = 101, 102, 129
POSTGAME = 6
_JUGADORES, _VALORES = 8, 11


@dataclass(frozen=True)
class Accion:
    t: float  # segundos de juego
    kind: str  # "queue" | "research" | "build"
    id: int  # unidad, tecnología o edificio
    player: int


def _meta(d: bytes, i: int) -> int:
    (primero,) = struct.unpack_from("<I", d, i)
    i += 4
    if primero != 500:
        i += 4
    i += 20
    a, b, _ = struct.unpack_from("<III", d, i)
    i += 12
    if a != 0:
        i -= 12
    if b == 2:
        i -= 8
    return i


def _sync(d: bytes, i: int) -> tuple[int, int]:
    incremento, marca = struct.unpack_from("<II", d, i)
    i += 8
    if marca:
        return incremento, i - 4
    _, es_de = struct.unpack_from("<4xI4xI", d, i)
    if not es_de:
        return incremento, i + 24
    return incremento, i + 4 * _JUGADORES * _VALORES + 4


def _accion(tipo: int, b: bytes) -> tuple[str, int, int] | None:
    """(clase, id, jugador) de una acción del formato nuevo (`len == largo + 3`), o None."""
    if len(b) < 3:
        return None
    jugador, largo = struct.unpack_from("<bh", b)
    if len(b) != largo + 3:
        return None
    p = b[3:]
    try:
        if tipo == DE_QUEUE:
            _, _, unidad, _ = struct.unpack_from("<h4xhhh", p)
            return "queue", unidad, jugador
        if tipo == RESEARCH:
            _, _, tec = struct.unpack_from("<Ihh", p)
            return "research", tec, jugador
        if tipo == BUILD:
            _, _, _, edificio = struct.unpack_from("<h2xffI", p)
            return "build", edificio, jugador
    except struct.error:
        return None
    return None


def read_actions(data: bytes, hasta: float = 25 * 60) -> list[Accion]:
    """Las acciones de los primeros `hasta` segundos de juego."""
    (hlen,) = struct.unpack_from("<I", data)
    d = data
    i = _meta(d, hlen)
    ms = 0
    out: list[Accion] = []
    try:
        while i + 4 <= len(d):
            (op,) = struct.unpack_from("<I", d, i)
            i += 4
            if op == 1:
                (largo,) = struct.unpack_from("<I", d, i)
                tipo = d[i + 4]
                cuerpo = d[i + 5 : i + 4 + largo]
                i += 4 + largo + 4
                a = _accion(tipo, cuerpo)
                if a:
                    out.append(Accion(ms / 1000, a[0], a[1], a[2]))
            elif op == 2:
                inc, i = _sync(d, i)
                ms += inc
                if ms > hasta * 1000:
                    break
            elif op == 3:
                i += 12
            elif op == 4:
                _, largo = struct.unpack_from("<II", d, i)
                i += 8 + largo
            else:
                break  # 6 = resumen final; cualquier otra cosa, se corta acá
    except (struct.error, IndexError):
        pass
    return out
