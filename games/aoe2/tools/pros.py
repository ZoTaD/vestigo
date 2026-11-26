"""
El país que representa cada jugador profesional de AoE2 (2026-11-26). La API da el país que el jugador puso en su
perfil, que suele ser donde vive (Nicov figura en Italia y representa a Argentina). Para los pros se usa el país con el
que compiten, de la lista comunitaria de jugadores de torneos (`aoc-reference-data`, `data/players.yaml`, que también
usan otros sitios de AoE2). Sólo pros: al resto se le respeta lo que puso.

Salida: `games/aoe2/data/pro_countries.json` = `{profile_id: código ISO de 2 letras}`.

    python games/aoe2/tools/pros.py  # baja la lista y rehace el JSON
"""
import json
import re
import sys
import urllib.request
from pathlib import Path

URL = "https://raw.githubusercontent.com/SiegeEngineers/aoc-reference-data/master/data/players.yaml"
SALIDA = Path(__file__).resolve().parents[1] / "data" / "pro_countries.json"


def paises(yaml_txt: str) -> dict[int, str]:
    """`{profile_id: país}` de la lista: cada jugador, su `country` y los ids de `platforms.rl` (los de World's Edge).
    Lector a mano (el archivo es una lista plana y estable; así no hace falta PyYAML)."""
    out: dict[int, str] = {}
    pais: str | None = None
    en_rl = False
    for linea in yaml_txt.splitlines():
        if linea.startswith("- name:"):
            pais, en_rl = None, False
            continue
        if m := re.match(r"^  country:\s*([A-Za-z]{2})\s*$", linea):
            pais = m.group(1).lower()
            continue
        if re.match(r"^    rl:\s*$", linea):
            en_rl = True
            continue
        if en_rl:
            if m := re.match(r"^      -\s*\"?(\d+)", linea):
                if pais:
                    out[int(m.group(1))] = pais
                continue
            en_rl = False
    return out


def main() -> None:
    txt = urllib.request.urlopen(URL, timeout=60).read().decode("utf-8")
    tabla = paises(txt)
    if len(tabla) < 300:
        sys.exit(f"la lista vino corta ({len(tabla)} ids): no se toca el JSON")
    SALIDA.write_text(json.dumps({str(k): v for k, v in sorted(tabla.items())}, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"{len(tabla)} perfiles de pros con país")


if __name__ == "__main__":
    main()
