"""
Baja lo crudo de CS2 a `games/cs2/raw/` (2026-11-03).

    python games/cs2/tools/fetch.py              # catálogo y precios
    python games/cs2/tools/fetch.py --catalog    # sólo el catálogo de ByMykel/CSGO-API (MIT)
    python games/cs2/tools/fetch.py --prices     # sólo los precios de Skinport

Skinport pide `Accept-Encoding: br` y deja 8 pedidos cada 5 minutos: acá se hace **uno** por corrida (trae todo).
Lo bajado es dato no confiable: se guarda y se lee como JSON, nunca se ejecuta.
"""
import json
import sys
import urllib.request

import brotli

from cs2 import RAW

URL_CATALOGO = "https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/{name}.json"
CATALOGO = ("skins", "skins_not_grouped", "crates", "collections")
URL_SKINPORT = "https://api.skinport.com/v1/items?app_id=730&currency=USD&tradable=0"


def get(url: str, headers: dict | None = None) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "vestigo-fetch", **(headers or {})})
    with urllib.request.urlopen(req, timeout=180) as r:
        datos = r.read()
        if r.headers.get("Content-Encoding") == "br":
            datos = brotli.decompress(datos)
        return datos


def guardar(nombre: str, datos: bytes, minimo: int) -> None:
    """Corta si no es una lista JSON con al menos `minimo` elementos (una respuesta de error no pisa lo bueno)."""
    lista = json.loads(datos)
    if not isinstance(lista, list) or len(lista) < minimo:
        raise SystemExit(f"{nombre}: respuesta inesperada ({type(lista).__name__}, {len(lista)} elementos)")
    RAW.mkdir(parents=True, exist_ok=True)
    (RAW / f"{nombre}.json").write_bytes(datos)
    print(f"{nombre}: {len(lista)} elementos, {len(datos) // 1024} KB")


def main(args: list[str]) -> None:
    todo = not ({"--catalog", "--prices"} & set(args))
    if todo or "--catalog" in args:
        for nombre in CATALOGO:
            guardar(nombre, get(URL_CATALOGO.format(name=nombre)), 100)
    if todo or "--prices" in args:
        guardar("skinport", get(URL_SKINPORT, {"Accept-Encoding": "br"}), 10000)


if __name__ == "__main__":
    main(sys.argv[1:])
