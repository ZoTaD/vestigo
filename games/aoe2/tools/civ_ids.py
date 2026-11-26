"""
Qué civ es cada `civilization_id` de la API de AoE2 (2026-11-20). Esos ids NO son el índice de `civilizations.json`
(parecen orden alfabético con las civs nuevas al final: 0 = Armenians, 1 = Aztecs, 63 = Danes). La verdad está en el
encabezado de cada grabación, que guarda la civ de cada jugador con el número interno del juego (el índice de
`civilizations.json`) junto a su perfil: este script baja grabaciones de RM 1v1 hasta cubrir todos los ids que aparecen
y escribe `games/aoe2/data/api_civs.json` = {id de la API: índice interno}.

    python games/aoe2/tools/civ_ids.py [--players 120]

Correrlo cuando sale una civ nueva (el colector avisa con `civ_<id>` en las estadísticas).
"""
import argparse
import json
import re
import struct
import sys
import urllib.request
import zlib
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
import daily  # noqa: E402

SALIDA = AQUI.parents[2] / "games" / "aoe2" / "data" / "api_civs.json"
_BLOQUE = re.compile(rb"(.{4})\x00\x00\x00\x00\x60\x0a\x00\x00\x00\x60\x0a\x00\x00\x60\x0a", re.S)


def header_civs(rec: bytes) -> dict[int, int]:
    """Perfil → civ (índice interno) de los jugadores del encabezado de una grabación."""
    (hlen,) = struct.unpack_from("<I", rec)
    h = zlib.decompressobj(-15).decompress(rec[8:hlen], 200_000)
    out = {}
    for m in _BLOQUE.finditer(h[:20_000]):
        (civ,) = struct.unpack("<I", m.group(1))
        i = m.end()
        try:
            for _ in range(2):  # el nombre, dos veces
                (n,) = struct.unpack_from("<H", h, i)
                i += 2 + n
                if h[i : i + 2] == b"\x60\x0a":
                    i += 2
            _tipo, perfil = struct.unpack_from("<II", h, i)
        except struct.error:
            continue
        if 0 < perfil < 2**31 and civ < 200:
            out[perfil] = civ
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--players", type=int, default=120)
    a = ap.parse_args()
    api = "https://aoe-api.worldsedgelink.com/community/leaderboard"
    get = lambda u: json.load(urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "vestigo-data"}), timeout=30))
    tabla: dict[int, int] = json.loads(SALIDA.read_text(encoding="utf-8")) if SALIDA.exists() else {}
    tabla = {int(k): v for k, v in tabla.items()}
    vistos: set[int] = set(tabla)
    for start in range(1, a.players * 10, 200):
        lb = get(f"{api}/getLeaderBoard2?title=age2&leaderboard_id=3&start={start}&count=20&sortBy=1")
        for g in lb["statGroups"]:
            pid = g["members"][0]["profile_id"]
            for m in get(f"{api}/getRecentMatchHistory?title=age2&profile_ids=%5B{pid}%5D")["matchHistoryStats"]:
                ids = {j["civilization_id"] for j in m["matchhistorymember"]}
                if m["matchtype_id"] != 6 or ids <= vistos:
                    continue
                rec = daily._grabacion(m["id"], pid)
                if not rec:
                    continue
                civ_de = header_civs(rec)
                for j in m["matchhistorymember"]:
                    if j["profile_id"] in civ_de:
                        tabla[j["civilization_id"]] = civ_de[j["profile_id"]]
                        vistos.add(j["civilization_id"])
                print(f"{len(tabla)} ids", flush=True)
    SALIDA.write_text(json.dumps(dict(sorted(tabla.items())), separators=(",", ":")) + "\n", encoding="utf-8")
    print(SALIDA, len(tabla))


if __name__ == "__main__":
    main()
