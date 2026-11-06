"""
Los textos de Company of Heroes 1 y 2 (2026-11-06): archivos `.ucs` en UTF-16 LE con BOM, una línea por texto,
`id<TAB>texto`. Los datos del juego los nombran como `"$<id>"`.
"""
from pathlib import Path


def load_ucs(path: Path) -> dict[int, str]:
    out: dict[int, str] = {}
    for linea in Path(path).read_bytes().decode("utf-16").splitlines():
        k, sep, v = linea.partition("\t")
        if sep and k.strip().isdigit():
            out[int(k)] = v.strip()
    return out


def loc(ref: str, ucs: dict[int, str]) -> str | None:
    """`"$11106520"` → su texto; cualquier otra cosa, o un id que no está, → None."""
    if not ref or not ref.startswith("$") or not ref[1:].isdigit():
        return None
    return ucs.get(int(ref[1:]))
