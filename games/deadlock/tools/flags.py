"""
Las banderas de país que muestran la escalera y el perfil de Deadlock →
site/public/flags/<tamaño>/<código>.png

Se pedían a flagcdn.com en cada visita: un servidor más al que conectarse (y
nombrar en la política de privacidad) para imágenes de 1 KB que no cambian. Este
script baja todas las de país (códigos de dos letras, los que da Steam) en los
dos tamaños que usa el sitio: 32x24 y 64x48 para pantallas de densidad 2.

Las banderas de flagcdn (flagpedia.net) son de dominio público.

Uso (una vez; sólo hace falta repetirlo si aparece un país nuevo):
    python games/deadlock/tools/flags.py
"""
import json
import os
import sys
import time
import urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
OUT = os.path.join(ROOT, "site", "public", "flags")
SIZES = ["32x24", "64x48"]
UA = "vestigo.gg flags/1.0 (+https://vestigo.gg)"


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def main():
    codes = json.loads(fetch("https://flagcdn.com/en/codes.json"))
    # Sólo países: flagcdn también trae subdivisiones ("us-ca", "gb-eng") que
    # Steam no usa.
    countries = sorted(c for c in codes if len(c) == 2 and c.isalpha())
    made = failed = 0
    for size in SIZES:
        os.makedirs(os.path.join(OUT, size), exist_ok=True)
        for c in countries:
            dst = os.path.join(OUT, size, f"{c}.png")
            if os.path.exists(dst):
                continue
            try:
                body = fetch(f"https://flagcdn.com/{size}/{c}.png")
            except Exception as e:  # noqa: BLE001 — una que falla no frena al resto
                print(f"  falló {size}/{c}: {e}")
                failed += 1
                continue
            if not body.startswith(b"\x89PNG"):
                print(f"  no es un PNG: {size}/{c}")
                failed += 1
                continue
            with open(dst, "wb") as fh:
                fh.write(body)
            made += 1
            time.sleep(0.05)
    print(f"países {len(countries)} · bajadas {made} · fallaron {failed}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
