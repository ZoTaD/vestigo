"""
Los mapas de multijugador de CoH2 y CoH1 (2026-11-06), de los archivos del juego instalado: nombre en inglés y
español, jugadores, tamaño, puntos (sólo CoH2 los trae en el `.info`) y el minimapa en webp. Corre a mano en la PC con
los juegos instalados (nunca en Actions); el JSON y las imágenes se commitean.

    python games/coh/tools/maps.py --game coh2|coh1 [--root "C:/Program Files (x86)/Steam/steamapps/common"]

El `id` de cada mapa es el `mapname` que manda la API de Relic, en minúsculas: el nombre del `.info` del escenario
(`crossroads`, `4p_rails and metal`). Si falta el texto en inglés (CoH1 instalado en español), `name.en` queda vacío y
el sitio muestra el nombre embellecido.
"""
import argparse
import io
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from sga import Sga  # noqa: E402
from ucs import load_ucs, loc  # noqa: E402

RAIZ = Path(__file__).resolve().parents[3]
STEAM = "C:/Program Files (x86)/Steam/steamapps/common"
LADO = 512

JUEGOS = {
    "coh2": {
        "dir": "Company of Heroes 2",
        "archivos": ["CoH2/Archives/MPScenarios.sga", "CoH2/Archives/MPXP1Scenarios.sga", "CoH2/Archives/DLC1Scenarios.sga",
                     "CoH2/Archives/DLC2Scenarios.sga", "CoH2/Archives/DLC3Scenarios.sga"],
        "textos": {"en": ["CoH2/Locale/English/RelicCoH2.English.ucs"], "es": ["CoH2/Locale/Spanish/RelicCoH2.Spanish.ucs"]},
    },
    "coh1": {
        "dir": "Company of Heroes Relaunch",
        "archivos": ["WW2/Archives/WW2Data.sga", "DLC1/Archives/DLC1Data.sga", "DLC2/Archives/DLC2Data.sga", "DLC3/Archives/DLC3Data.sga"],
        "textos": {"en": ["CoH/Engine/Locale/English/RelicCOH.English.ucs"], "es": ["CoH/Engine/Locale/Spanish/RelicCOH.Spanish.ucs"]},
    },
}


def parse_info(texto: str) -> dict:
    """El `HeaderInfo` de un escenario (Lua): nombre (`$id`), jugadores, tamaño y puntos con su tipo."""
    nombre = re.search(r'scenarioname\s*=\s*"([^"]*)"', texto)
    jugadores = re.search(r"maxplayers\s*=\s*(\d+)", texto)
    tam = re.search(r"mapsize\s*=\s*\{\s*([-\d.]+)\s*,\s*([-\d.]+)", texto)
    puntos = []
    for bloque in re.finditer(r"\{([^{}]*ebp_name[^{}]*)\}", texto):
        b = bloque.group(1)
        x, y, k = re.search(r"\bx\s*=\s*([-\d.]+)", b), re.search(r"\by\s*=\s*([-\d.]+)", b), re.search(r'ebp_name\s*=\s*"([^"]*)"', b)
        if x and y and k:
            puntos.append({"x": round(float(x.group(1)), 2), "y": round(float(y.group(1)), 2), "kind": k.group(1)})
    return {
        "name": nombre.group(1) if nombre else "",
        "players": int(jugadores.group(1)) if jugadores else 0,
        "size": [int(float(tam.group(1))), int(float(tam.group(2)))] if tam else None,
        "points": puntos,
    }


def limpio(nombre: str | None) -> str:
    """Sin la cantidad de jugadores que traen los nombres ("Angoville (2)", "(2-4) Langres"): ya va en `players`."""
    return re.sub(r"^\(\d(?:\s*-\s*\d)?\)\s*|\s*\(\d(?:\s*-\s*\d)?\)$", "", (nombre or "").strip())


def textos(base: Path, rutas: list[str]) -> dict[int, str]:
    out: dict[int, str] = {}
    for r in rutas:
        f = base / r
        if f.exists():
            out.update(load_ucs(f))
    return out


def main(argv: list[str]) -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--game", required=True, choices=sorted(JUEGOS))
    ap.add_argument("--root", default=STEAM)
    a = ap.parse_args(argv)
    conf = JUEGOS[a.game]
    base = Path(a.root) / conf["dir"]
    ucs = {lang: textos(base, rutas) for lang, rutas in conf["textos"].items()}
    if not ucs["en"]:
        print("  sin textos en inglés: el nombre en inglés queda vacío (el sitio lo embellece)")
    salida_img = RAIZ / "site" / "public" / a.game / "m"
    salida_img.mkdir(parents=True, exist_ok=True)
    mapas: dict[str, dict] = {}
    for archivo in conf["archivos"]:
        if not (base / archivo).exists():
            continue
        s = Sga(base / archivo)
        for ruta in s.entries:
            if not ruta.startswith("scenarios/mp/") or not ruta.endswith(".info"):
                continue
            mid = ruta.rsplit("/", 1)[1][:-5].lower()
            if mid in mapas:
                continue
            info = parse_info(s.read(ruta).decode("latin-1"))
            mm = ruta[:-5] + "_mm.tga"
            minimapa = None
            if mm in s.entries:
                img = Image.open(io.BytesIO(s.read(mm))).convert("RGB")
                img.thumbnail((LADO, LADO), Image.LANCZOS)
                archivo_img = re.sub(r"[^a-z0-9_-]+", "-", mid).strip("-")
                img.save(salida_img / f"{archivo_img}.webp", quality=80)
                minimapa = f"m/{archivo_img}"
            mapas[mid] = {
                "id": mid,
                "name": {"en": limpio(loc(info["name"], ucs["en"])), "es": limpio(loc(info["name"], ucs["es"]))},
                "players": info["players"],
                "size": info["size"],
                "points": info["points"],
                "minimap": minimapa,
            }
    datos = {"generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "list": sorted(mapas.values(), key=lambda m: m["id"])}
    destino = RAIZ / "games" / a.game / "data" / "maps.json"
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(json.dumps(datos, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    con_img = sum(1 for m in mapas.values() if m["minimap"])
    print(f"{a.game}: {len(mapas)} mapas, {con_img} con minimapa")


if __name__ == "__main__":
    main(sys.argv[1:])
