"""
Los íconos de Deadlock que todavía se pedían al bucket de deadlock-api →
site/public/deadlock/game/<misma ruta>, y su entrada en manifest.json.

`game_assets.py` saca del juego instalado todo lo que vive en `images/`. Los
datos también nombran íconos de `icons/` (enfriamiento, daño, condiciones,
etiquetas de build): 43 SVG que se seguían pidiendo a
assets-bucket.deadlock-api.com, que ya se cayó una vez (2026-09-19). Este script
los baja de ese mismo bucket una sola vez y los deja en el sitio; el plugin
`localDeadlockAssets` de vite.config.ts reemplaza la URL al compilar, igual que
con las imágenes.

**Los videos de habilidades (`videos/`) quedan en el bucket a propósito**: son
~200 clips de 3 a 8 MB (medio giga en el repo), y la ficha de héroe ya los baja
sólo cuando la habilidad entra en pantalla.

Los SVG se revisan antes de guardarlos: se sirven desde nuestro dominio, así
que uno con scripts o manejadores de eventos no se acepta.

**El arte de un héroe nuevo también sale de acá** (Baba, 2026-10-08): retrato,
ícono, fondo e íconos de habilidades (`images/heroes/` e `images/abilities/`)
que los datos nombran y todavía no tienen copia, más las caras de ánimo, el
retrato vertical y el arma. Es el mismo arte que saca `game_assets.py`, bajado
del bucket y pasado a WebP con los mismos anchos, sin tener que extraer el pak
del juego entero por un héroe. Después rehace `data/game-art.json` (fondos,
caras y armas) y las versiones chicas de lo bajado.

Uso (cuando un parche traiga íconos o un héroe nuevo), **siempre después de
game_assets.py**, que reescribe manifest.json desde cero y borraría estas
entradas (pasó con City Never Sleeps, 2026-09-29):
    python games/deadlock/tools/bucket_assets.py
"""
import glob
import json
import os
import re
import sys
import time
import urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
DATA = os.path.join(ROOT, "games", "deadlock", "data")
OUT = os.path.join(ROOT, "site", "public", "deadlock", "game")
MANIFEST = os.path.join(OUT, "manifest.json")
BUCKET = "https://assets-bucket.deadlock-api.com/assets-api-res/"
URL = re.compile(r'https://assets-bucket\.deadlock-api\.com/assets-api-res/[^"\s\\]+')
UA = "vestigo.gg deadlock-assets/1.0 (+https://vestigo.gg)"
# Lo que se baja. Los videos no (ver arriba); lo demás del bucket ya lo cubre game_assets.py.
WANTED = (".svg",)
UNSAFE_SVG = re.compile(r"<script|<foreignObject|javascript:|\son[a-z]+\s*=", re.I)


def used_urls():
    urls = set()
    for f in glob.glob(os.path.join(DATA, "**", "*.json"), recursive=True):
        with open(f, encoding="utf-8") as fh:
            urls.update(URL.findall(fh.read()))
    return urls


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


# El arte de héroe que se baja como imagen (no SVG). Lo demás de `images/` (la
# tienda, los filtros) queda para game_assets.py.
HERO_ART = ("images/heroes/", "images/abilities/")
RASTER = (".webp", ".png", ".jpg", ".jpeg")
# El arte extra por héroe que los datos no nombran y la UI arma desde el código
# del retrato: (sufijo, carpeta, ancho máximo). Los mismos de game_assets.py.
HERO_EXTRAS = [("_card_critical", "", 280), ("_card_gloat", "", 280), ("_vertical", "", 280), ("_gun", "guns/", 600)]
CARD = re.compile(r"images/heroes/([a-z_]+)_card\.webp$")


def bajar_raster(rel, dst, max_w):
    """Baja una imagen del bucket y la deja en WebP, con el ancho de game_assets.py."""
    import tempfile
    from game_assets import save_webp

    body = fetch(BUCKET + rel)
    fd, tmp = tempfile.mkstemp(suffix=os.path.splitext(rel)[1])
    try:
        with os.fdopen(fd, "wb") as fh:
            fh.write(body)
        return save_webp(tmp, dst, max_w)
    finally:
        os.remove(tmp)


def hero_art(manifest):
    """El arte de los héroes que todavía no está en el sitio. Devuelve (bajadas, fallas)."""
    from game_assets import MAX_W

    bajadas, fallas = [], []
    for u in sorted(used_urls()):
        rel = u[len(BUCKET):]
        if rel in manifest or not rel.startswith(HERO_ART) or not rel.lower().endswith(RASTER):
            continue
        dst = os.path.join(OUT, *(rel.rsplit(".", 1)[0] + ".webp").split("/"))
        if os.path.exists(dst):
            # Ya la había sacado game_assets.py del juego (los verticales de la
            # votación de City Never Sleeps): esa manda, sólo faltaba anotarla.
            manifest[rel] = os.path.relpath(dst, OUT).replace(os.sep, "/")
            continue
        try:
            hecho = bajar_raster(rel, dst, next((w for rx, w in MAX_W if rx.search(rel)), None))
        except Exception as e:  # noqa: BLE001
            fallas.append(f"{rel}: {e}")
            continue
        manifest[rel] = os.path.relpath(hecho, OUT).replace(os.sep, "/")
        bajadas.append(hecho)
        time.sleep(0.1)

    # Las caras de ánimo, el vertical y el arma de cada héroe con retrato local.
    codigos = sorted({m[1] for rel in manifest if (m := CARD.search(rel))})
    for code in codigos:
        for suf, carpeta, w in HERO_EXTRAS:
            rel = f"images/heroes/{carpeta}{code}{suf}.webp"
            dst = os.path.join(OUT, *rel.split("/"))
            if os.path.exists(dst):
                continue
            try:
                bajadas.append(bajar_raster(rel, dst, w))
            except Exception as e:  # noqa: BLE001 — un héroe viejo puede no tener arma, y está bien
                if "404" not in str(e):
                    fallas.append(f"{rel}: {e}")
            time.sleep(0.1)
    return bajadas, fallas


def game_art(manifest):
    """Rehace data/game-art.json con la misma regla que game_assets.py."""
    heroes_dir = os.path.join(OUT, "images", "heroes")
    guns = sorted(f[: -len("_gun.webp")] for f in os.listdir(os.path.join(heroes_dir, "guns")) if f.endswith("_gun.webp"))
    backgrounds = {}
    kit_dir = os.path.join(DATA, "hero-kit")
    for f in sorted(os.listdir(kit_dir)):
        if f.endswith(".json"):
            with open(os.path.join(kit_dir, f), encoding="utf-8") as fh:
                art = json.load(fh).get("art") or {}
            rel = (art.get("background") or "")[len(BUCKET):]
            if rel in manifest:
                backgrounds[f[:-5]] = "/deadlock/game/" + manifest[rel]
    moods = sorted(
        f[: -len("_card_critical.webp")]
        for f in os.listdir(heroes_dir)
        if f.endswith("_card_critical.webp") and os.path.exists(os.path.join(heroes_dir, f.replace("_critical", "_gloat")))
    )
    with open(os.path.join(DATA, "game-art.json"), "w", encoding="utf-8") as fh:
        json.dump({"guns": guns, "backgrounds": backgrounds, "moods": moods}, fh)


def main():
    with open(MANIFEST, encoding="utf-8") as fh:
        manifest = json.load(fh)
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    arte, fallas_arte = hero_art(manifest)
    game_art(manifest)
    if arte:
        import thumbs

        thumbs.build(only=arte)
    print(f"arte de héroes: {len(arte)} imágenes bajadas · fallaron {len(fallas_arte)}")
    for f in fallas_arte:
        print("  falló:", f)
    todo = sorted(u for u in used_urls() if u[len(BUCKET):] not in manifest and u.lower().endswith(WANTED))
    done, rejected, failed = 0, [], []
    for u in todo:
        rel = u[len(BUCKET):]
        try:
            body = fetch(u)
        except Exception as e:  # noqa: BLE001 — un ícono que falla no frena al resto
            failed.append(f"{rel}: {e}")
            continue
        text = body.decode("utf-8", errors="replace")
        if "<svg" not in text or UNSAFE_SVG.search(text):
            rejected.append(rel)
            continue
        dst = os.path.join(OUT, *rel.split("/"))
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        with open(dst, "wb") as fh:
            fh.write(body)
        manifest[rel] = rel
        done += 1
        time.sleep(0.1)  # sin apuro: son pocos y el bucket es de otros
    with open(MANIFEST, "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=0, sort_keys=True)
    print(f"bajados {done} de {len(todo)} · rechazados {len(rejected)} · fallaron {len(failed)}")
    for r in rejected:
        print("  rechazado (no es un SVG limpio):", r)
    for f in failed:
        print("  falló:", f)
    return 1 if failed or rejected or fallas_arte else 0


if __name__ == "__main__":
    sys.exit(main())
