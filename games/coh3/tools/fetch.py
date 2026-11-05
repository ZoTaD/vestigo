"""
Baja lo crudo de Company of Heroes 3 de coh3-data (MIT) a `games/coh3/raw/<tag>/` (2026-11-04).

    GITHUB_TOKEN=$(gh auth token) python games/coh3/tools/fetch.py   # el tag más nuevo y los 8 anteriores con cambios
    python games/coh3/tools/fetch.py v2.5.3-3                       # desde un tag puntual

Los archivos grandes (sbps, ebps, weapon, upgrade, abilities) se bajan partidos por raza (`data/chunked/...`): así
nunca hay que tener en memoria el ebps entero (93 MB) y se omite `hoff` (las misiones de campaña). Para los parches,
del tag anterior sólo hacen falta sbps, ebps, weapon y los textos. "Anterior con cambios" = el primer tag más viejo
cuyos sbps/ebps/weapon tienen otro hash en GitHub (los tags de sólo textos o de mapas no cuentan).
Escribe `raw/tags.json` = [{tag, date}], del actual al más viejo con cambios (hasta `HISTORIA` + 1 tags). Lo bajado es dato no confiable: se lee como JSON, nunca se ejecuta.
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))  # `python -I` no suma la carpeta del script

from coh3 import API_COMMIT, API_DIR, API_TAGS, RAW, UA, URL

RAZAS = ("american", "british", "british_africa", "german", "afrika_korps", "common")
# (carpeta en coh3-data, ¿por raza en `races/`?)
PARTIDOS = {"sbps": "chunked/sbps/races", "ebps": "chunked/ebps/races", "weapon": "chunked/weapon",
            "upgrade": "chunked/upgrade", "abilities": "chunked/abilities/races"}
SUELTOS = ("battlegroup.json", "locstring.json", "locales/en-locstring.json", "locales/es-locstring.json",
           "mp-maps.json", "daily_challenges_store_release.json", "weekly_challenges_store_release.json",
           "fs-perks.json", "fs-technologies.json")
# Cuántos parches con cambios de stats se guardan para la pestaña Parches (cada uno = un par de tags seguidos).
HISTORIA = 8
# Lo que hace falta del tag anterior para el diff de parches.
PARA_PARCHES = ("sbps", "ebps", "weapon")


def get(url: str) -> bytes:
    headers = {"User-Agent": UA}
    # La API de GitHub deja 60 pedidos por hora sin token; con GITHUB_TOKEN (ej. `gh auth token`), 5.000.
    if url.startswith("https://api.github.com/") and os.environ.get("GITHUB_TOKEN"):
        headers["Authorization"] = "Bearer " + os.environ["GITHUB_TOKEN"]
    for intento in range(3):
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=300) as r:
                return r.read()
        except Exception:
            if intento == 2:
                raise
            time.sleep(2 ** intento)
    raise RuntimeError("inalcanzable")


def bajar(tag: str, path: str, forzar: bool = False) -> None:
    destino = RAW / tag / path
    if destino.exists() and not forzar:
        return
    datos = get(URL.format(tag=tag, path=path))
    json.loads(datos)  # una página de error no pisa lo bueno
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_bytes(datos)
    print(f"{tag}/{path}: {len(datos) // 1024} KB")
    time.sleep(0.2)


def bajar_tag(tag: str, solo: tuple[str, ...] | None = None) -> None:
    for nombre, carpeta in PARTIDOS.items():
        if solo and nombre not in solo:
            continue
        for raza in RAZAS:
            bajar(tag, f"{carpeta}/{raza}.json")
    for path in SUELTOS:
        if solo and not path.endswith("locstring.json"):
            continue
        bajar(tag, path)


def huella(tag: str) -> tuple | None:
    """Los sha de git de sbps/ebps/weapon por raza en un tag (3 pedidos a la API de GitHub). None si el tag no viene
    partido por raza (los muy viejos)."""
    out = []
    for nombre in PARA_PARCHES:
        try:
            lista = json.loads(get(API_DIR.format(path=PARTIDOS[nombre], tag=tag)))
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            raise
        out += sorted((nombre, x["name"], x["sha"]) for x in lista if x["name"].removesuffix(".json") in RAZAS)
    return tuple(out)


def fecha(tag: str) -> str | None:
    """La fecha (ISO, UTC) del commit del tag en coh3-data."""
    try:
        c = json.loads(get(API_COMMIT.format(tag=tag)))
        return c["commit"]["committer"]["date"]
    except Exception:
        return None


def main(args: list[str]) -> None:
    tags = [t["name"] for t in json.loads(get(API_TAGS))]
    actual = args[0] if args else tags[0]
    if actual not in tags:
        raise SystemExit(f"tag desconocido: {actual}")
    bajar_tag(actual)
    # Los tags con cambios de stats, del actual hacia atrás: HISTORIA parches = HISTORIA + 1 tags.
    con_cambios = [actual]
    ultima = huella(actual)
    for t in tags[tags.index(actual) + 1:]:
        if len(con_cambios) > HISTORIA:
            break
        h = huella(t)
        if h is None:
            print(f"{t}: sin datos partidos por raza, se corta acá")
            break
        if h != ultima:
            con_cambios.append(t)
            ultima = h
        else:
            print(f"{t}: mismos stats que {con_cambios[-1]}")
    for t in con_cambios[1:]:
        bajar_tag(t, PARA_PARCHES)
    info = [{"tag": t, "date": fecha(t)} for t in con_cambios]
    (RAW / "tags.json").write_text(json.dumps(info, indent=1), encoding="utf-8")
    print("tags con cambios: " + ", ".join(con_cambios))


if __name__ == "__main__":
    main(sys.argv[1:])
