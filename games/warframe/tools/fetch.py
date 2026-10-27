"""
Baja el export oficial de Warframe (Public Export) y la tabla de drops a `games/warframe/raw/`.

    python games/warframe/tools/fetch.py          # baja todo
    python games/warframe/tools/fetch.py --check  # dice si el índice cambió (no baja los exports)

Lo bajado es dato no confiable: se guarda y se lee como JSON/texto, nunca se ejecuta.
"""
import hashlib
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
URL_EXPORT = "https://content.warframe.com/PublicExport/Manifest/{linea}"
URL_DROPS = "https://www.warframe.com/droptables"


def unlzma(raw: bytes) -> bytes:
    """LZMA "alone" sin marca de fin: lc/lp/pb salen del byte 0, el diccionario de los bytes 1-4, datos desde el 13."""
    if len(raw) <= 13:
        raise ValueError("LZMA inválido: demasiado corto")
    p = raw[0]
    lc = p % 9
    p //= 9
    lp = p % 5
    pb = p // 5
    dic = struct.unpack("<I", raw[1:5])[0]
    try:
        d = lzma.LZMADecompressor(
            lzma.FORMAT_RAW,
            filters=[{"id": lzma.FILTER_LZMA1, "lc": lc, "lp": lp, "pb": pb, "dict_size": dic}],
        )
        salida = d.decompress(raw[13:])
    except lzma.LZMAError as e:
        raise ValueError(f"LZMA inválido: {e}") from e
    # Sin marca de fin el flujo termina sin error y lo decodificado queda en `salida`.
    if not salida:
        raise ValueError("LZMA inválido: no se decodificó nada")
    return salida


def get(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "vestigo-fetch"})
    with urllib.request.urlopen(req, timeout=120) as r:  # sigue los redirects (la tabla de drops va a un CDN)
        return r.read()


def validar(nombre: str, datos: bytes) -> None:
    """Corta con el nombre del archivo si la descarga viene vacía o no es lo esperado."""
    if not datos:
        raise ValueError(f"{nombre}: descarga vacía")
    if nombre.endswith(".json"):
        try:
            json.loads(datos.decode("utf-8"), strict=False)
        except ValueError as e:
            raise ValueError(f"{nombre}: JSON inválido ({e})") from e
    elif nombre == "drops.html" and b'id="missionRewards"' not in datos:
        raise ValueError("drops.html: no trae id=\"missionRewards\"")


def indices(guardar: bool) -> dict:
    """{idioma: [líneas `Nombre!hash`]}; con `guardar` deja los `.lzma` en raw/."""
    out = {}
    for lang in IDIOMAS:
        crudo = get(URL_INDICE.format(lang=lang))
        if guardar:
            (RAW / f"index_{lang}.txt.lzma").write_bytes(crudo)
        out[lang] = unlzma(crudo).decode("utf-8").split()
        if not out[lang]:
            raise ValueError(f"el índice {lang} quedó vacío")
    return out


def hash_drops(datos: bytes) -> str:
    return hashlib.sha256(datos).hexdigest()


def cambio(idx: dict, drops: bytes) -> bool:
    """True si cambió el índice del export o la tabla de drops (que no está en el índice)."""
    meta = json.loads(META.read_text(encoding="utf-8")) if META.exists() else {}
    return meta.get("index") != idx or meta.get("dropsHash") != hash_drops(drops)


def main() -> int:
    if "--check" in sys.argv:
        print("cambió" if cambio(indices(False), get(URL_DROPS)) else "igual")
        return 0
    RAW.mkdir(exist_ok=True)
    idx = indices(True)
    for lang, lineas in idx.items():
        for linea in lineas:
            nombre = linea.split("!")[0]
            if lang == "es" and nombre == "ExportManifest.json":
                continue  # el manifiesto de íconos es uno solo (el de en)
            datos = get(URL_EXPORT.format(linea=linea))
            validar(nombre, datos)
            (RAW / nombre).write_bytes(datos)
            print(nombre, len(datos))
    (RAW / "index.json").write_text(json.dumps(idx, ensure_ascii=False, indent=1), encoding="utf-8")
    drops = get(URL_DROPS)
    validar("drops.html", drops)
    (RAW / "drops.html").write_bytes(drops)
    print("drops.html", len(drops))
    return 0


if __name__ == "__main__":
    sys.exit(main())
