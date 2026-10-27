"""
Baja el export oficial de Warframe (Public Export) y la tabla de drops a `games/warframe/raw/`.

    python games/warframe/tools/fetch.py          # baja todo
    python games/warframe/tools/fetch.py --check  # dice si el índice cambió (no baja los exports)

Lo bajado es dato no confiable: se guarda y se lee como JSON/texto, nunca se ejecuta.
"""
import json
import lzma
import struct
import sys
import urllib.request
from pathlib import Path

AQUI = Path(__file__).resolve().parent
JUEGO = AQUI.parent
RAW = JUEGO / "raw"
META = JUEGO / "data" / "meta.json"
IDIOMAS = ("en", "es")
URL_INDICE = "https://origin.warframe.com/PublicExport/index_{lang}.txt.lzma"
URL_EXPORT = "http://content.warframe.com/PublicExport/Manifest/{linea}"
URL_DROPS = "https://www.warframe.com/droptables"


def unlzma(raw: bytes) -> bytes:
    """LZMA "alone" sin marca de fin: lc/lp/pb salen del byte 0, el diccionario de los bytes 1-4, datos desde el 13."""
    p = raw[0]
    lc = p % 9
    p //= 9
    lp = p % 5
    pb = p // 5
    dic = struct.unpack("<I", raw[1:5])[0]
    d = lzma.LZMADecompressor(
        lzma.FORMAT_RAW,
        filters=[{"id": lzma.FILTER_LZMA1, "lc": lc, "lp": lp, "pb": pb, "dict_size": dic}],
    )
    try:
        return d.decompress(raw[13:])
    except lzma.LZMAError:
        # Sin marca de fin el descompresor se queja al final del flujo; lo ya decodificado no se pierde.
        return b""


def get(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "vestigo-fetch"})
    with urllib.request.urlopen(req, timeout=120) as r:  # sigue los redirects (la tabla de drops va a un CDN)
        return r.read()


def indices(guardar: bool) -> dict:
    """{idioma: [líneas `Nombre!hash`]}; con `guardar` deja los `.lzma` en raw/."""
    out = {}
    for lang in IDIOMAS:
        crudo = get(URL_INDICE.format(lang=lang))
        if guardar:
            (RAW / f"index_{lang}.txt.lzma").write_bytes(crudo)
        out[lang] = unlzma(crudo).decode("utf-8").split()
    return out


def cambio(idx: dict) -> bool:
    previo = json.loads(META.read_text(encoding="utf-8")).get("index") if META.exists() else None
    return previo != idx


def main() -> int:
    if "--check" in sys.argv:
        print("cambió" if cambio(indices(False)) else "igual")
        return 0
    RAW.mkdir(exist_ok=True)
    idx = indices(True)
    for lang, lineas in idx.items():
        for linea in lineas:
            nombre = linea.split("!")[0]
            if lang == "es" and nombre == "ExportManifest.json":
                continue  # el manifiesto de íconos es uno solo (el de en)
            datos = get(URL_EXPORT.format(linea=linea))
            (RAW / nombre).write_bytes(datos)
            print(nombre, len(datos))
    (RAW / "index.json").write_text(json.dumps(idx, ensure_ascii=False, indent=1), encoding="utf-8")
    drops = get(URL_DROPS)
    (RAW / "drops.html").write_bytes(drops)
    print("drops.html", len(drops))
    return 0


if __name__ == "__main__":
    sys.exit(main())
