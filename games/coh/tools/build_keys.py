"""
Arma `rgd_keys.txt` (2026-11-06): de todos los hashes de clave que aparecen en los `.rgd` de los juegos instalados, los
que se pueden nombrar con alguna palabra candidata. Corre a mano; el resultado se commitea.

    python games/coh/tools/build_keys.py --words <lista.json|.txt> [--words ...] [--root <steamapps/common>]

Candidatas: listas de palabras (JSON con una lista, o texto con una por línea o `0xHASH=nombre`, como el `RGD_DIC.TXT`
de rgd-suite, MIT), los nombres de los archivos de atributos y los textos que hay adentro de los propios `.rgd`.
"""
import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from rgd import KEYS_FILE, Keys, parse  # noqa: E402
from rhash import lookup2  # noqa: E402
from sga import Sga  # noqa: E402

STEAM = "C:/Program Files (x86)/Steam/steamapps/common"
ATRIBUTOS = [
    "Company of Heroes 2/CoH2/Archives/AttribArchive.sga",
    "Company of Heroes Relaunch/WW2/Archives/AttribArchive.sga",
]
SUFIJOS = ("", "_ext", "_table", "_list", "_info", "_type", "_upgrade", "_ability")


def leer_palabras(p: Path) -> set[str]:
    texto = p.read_text(encoding="utf-8", errors="ignore")
    if p.suffix == ".json":
        return set(json.loads(texto))
    out = set()
    for linea in texto.splitlines():
        m = re.match(r"\s*#?\s*0x[0-9A-Fa-f]{8}\s*=\s*(.+?)\s*$", linea)
        if m:
            out.add(m.group(1))
        elif linea.strip() and not linea.startswith("#"):
            out.add(linea.strip())
    return out


def textos(o, out: set) -> None:
    if isinstance(o, dict):
        for v in o.values():
            textos(v, out)
    elif isinstance(o, list):
        for v in o:
            textos(v, out)
    elif isinstance(o, str) and len(o) < 120:
        out.add(o)
        out.update(re.split(r"[\\/.]", o))


def main(argv: list[str]) -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--words", action="append", default=[])
    ap.add_argument("--root", default=STEAM)
    a = ap.parse_args(argv)
    candidatas: set[str] = set()
    for w in a.words:
        candidatas |= leer_palabras(Path(w))
    vacias = Keys(path=None)
    hashes: dict[int, int] = {}
    for rel in ATRIBUTOS:
        s = Sga(Path(a.root) / rel)
        for ruta in s.entries:
            if not ruta.endswith(".rgd"):
                continue
            for parte in ruta[:-4].split("/"):
                candidatas.add(parte)
            unk: dict = {}
            try:
                datos = parse(s.read(ruta), vacias, unk)
            except ValueError:  # sin chunk de datos (unos pocos archivos vacíos)
                continue
            for h, n in unk.items():
                hashes[h] = hashes.get(h, 0) + n
            textos(datos, candidatas)
    for c in list(candidatas):
        for suf in SUFIJOS[1:]:
            candidatas.add(c + suf)
    nombres: dict[int, str] = {}
    for c in candidatas:
        h = lookup2(c.encode("latin-1", "ignore"))
        if h in hashes and h not in nombres:
            nombres[h] = c
    KEYS_FILE.write_text("\n".join(f"0x{h:08x}={n}" for h, n in sorted(nombres.items(), key=lambda x: x[1])) + "\n", encoding="utf-8")
    total = sum(hashes.values())
    con = sum(n for h, n in hashes.items() if h in nombres)
    print(f"{len(nombres)} de {len(hashes)} claves con nombre; {con / total:.1%} de las apariciones")


if __name__ == "__main__":
    main(sys.argv[1:])
