"""Retratos chicos de clase y ascendencia para el árbol de pasivas (2026-09-25).

Los retratos del elegidor de clase (96 px) y de las ascendencias (44 px) salían
de las hojas `background-<clase>.webp` del export: una por clase, de 3000 px y
~500 KB cada una. Para mostrar ocho retratos chicos se bajaban 3,6 MB. Esta hoja
junta todos los cuadros `ClassN` de todas las clases a 192 px (el doble del
retrato más grande, para pantallas de densidad 2) en un solo archivo.

La usa `tree.py` al final de los sprites. Suelto (`python tree_portraits.py`)
rehace la hoja desde las que ya están en `public/` y la agrega a `tree.json`
sin volver a correr el pipeline entero.
"""
import json
import os

from PIL import Image

SIZE = 192
FILE = "portraits.webp"


def build(sprites, pub, classes):
    """Arma `portraits.webp` en `pub` y devuelve su entrada para `sprites`.

    `classes` son los nombres en inglés en el orden del árbol; cada fila de la
    hoja es una clase y cada columna un cuadro (0 = la clase, 1… = ascendencias).
    """
    rows = []
    for cls in classes:
        sh = sprites[f"background-{cls.lower()}"]
        keys = sorted((k for k in sh["frames"] if k.startswith("Class")), key=lambda k: int(k[5:]))
        rows.append((cls, sh, keys))
    cols = max(len(keys) for _, _, keys in rows)
    sheet = Image.new("RGBA", (cols * SIZE, len(rows) * SIZE))
    frames = {}
    for r, (cls, sh, keys) in enumerate(rows):
        with Image.open(os.path.join(pub, sh["file"])) as src:
            for c, k in enumerate(keys):
                x, y, w, h = sh["frames"][k]
                cut = src.crop((x, y, x + w, y + h)).resize((SIZE, SIZE), Image.LANCZOS)
                sheet.paste(cut, (c * SIZE, r * SIZE))
                frames[f"{cls}:{k}"] = [c * SIZE, r * SIZE, SIZE, SIZE]
    sheet.save(os.path.join(pub, FILE), "WEBP", quality=82, method=6)
    return {"file": FILE, "w": sheet.width, "h": sheet.height, "scale": 1.0, "frames": frames}


if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    root = os.path.normpath(os.path.join(here, "..", "..", ".."))
    pub = os.path.join(root, "games", "tft", "ui", "public", "poe2", "tree-sprites")
    path = os.path.join(root, "games", "poe2", "data", "tree", "tree.json")
    with open(path, encoding="utf-8") as f:
        tree = json.load(f)
    tree["sprites"]["portraits"] = build(tree["sprites"], pub, [c["en"] for c in tree["classes"]])
    with open(path, "w", encoding="utf-8") as f:
        json.dump(tree, f, ensure_ascii=False, separators=(",", ":"))
    print(f"  {FILE}: {os.path.getsize(os.path.join(pub, FILE)) // 1024} KB, "
          f"{len(tree['sprites']['portraits']['frames'])} cuadros")
