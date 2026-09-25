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

Uso (cuando un parche traiga íconos nuevos):
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


def main():
    with open(MANIFEST, encoding="utf-8") as fh:
        manifest = json.load(fh)
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
    return 1 if failed or rejected else 0


if __name__ == "__main__":
    sys.exit(main())
