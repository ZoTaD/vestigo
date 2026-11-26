"""
Las partidas que el colector de AoE2 ya contó, por día (2026-11-26). Con esto cada corrida **suma** a los días guardados
en vez de reemplazarlos: un historial trae las últimas ~60 partidas de un jugador (un mes o más), así que corridas
distintas, con jugadores distintos, se completan entre sí.

No va al repo (serían megas que cambian todos los días): vive en la caché de GitHub Actions (`games/aoe2/.cache/`, en
`.gitignore`). Si la caché se pierde, los días ya guardados quedan como están (congelados) y los nuevos empiezan de cero;
nada se cuenta dos veces.

Formato: JSON comprimido `{día: [id, delta, delta, …]}` (ids ordenados; cada uno guardado como diferencia con el
anterior, que es chico).
"""
import gzip
import json
from pathlib import Path

import grabaciones as grab


def leer(ruta: Path) -> dict[str, set[int]] | None:
    """Lo guardado, o None si no hay archivo (o está roto): eso es "no sé qué se contó"."""
    try:
        crudo = json.loads(gzip.decompress(ruta.read_bytes()).decode("utf-8"))
    except Exception:
        return None
    out: dict[str, set[int]] = {}
    for dia, deltas in crudo.items():
        ids, x = [], 0
        for d in deltas:
            x += d
            ids.append(x)
        out[dia] = set(ids)
    return out


def escribir(ruta: Path, vistas: dict[str, set[int]], desde: str) -> None:
    """Guarda los días desde `desde` (lo más viejo se olvida: esos días ya no se tocan)."""
    crudo = {}
    for dia in sorted(vistas):
        if dia < desde:
            continue
        ids = sorted(vistas[dia])
        crudo[dia] = [ids[0]] + [b - a for a, b in zip(ids, ids[1:])] if ids else []
    ruta.parent.mkdir(parents=True, exist_ok=True)
    ruta.write_bytes(gzip.compress(json.dumps(crudo, separators=(",", ":")).encode("utf-8"), 9))


def sumar_dia(base: dict, nuevo: dict) -> dict:
    """Un día guardado más lo que trajo esta corrida (contadores `[partidas, victorias]` y `games`)."""
    out = json.loads(json.dumps(base))
    out["games"] = base.get("games", 0) + nuevo.get("games", 0)
    out["patch"] = nuevo.get("patch") or base.get("patch")
    for k in ("civ", "map", "vs", "dur", "open", "n", "rec", "units", "apm", "age"):
        destino = out.setdefault(k, {})
        for clave, (a, b) in (nuevo.get(k) or {}).items():
            x = destino.setdefault(clave, [0, 0])
            x[0] += a
            x[1] += b
    top = out.setdefault("top", {})
    for marca, filas in (nuevo.get("top") or {}).items():
        for f in filas:
            top[marca] = grab.sumar_top(top.get(marca, []), f, marca)
    return out
