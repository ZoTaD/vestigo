"""Extrae piezas de interfaz de PoE2 a PNG, recortadas según art/uiimages1.txt.

Antes, una vez: generar paths.json (todas las rutas) y uiimages.json (el catálogo):
    python -c "import json; from poe_bundles import Index; ix=Index(GAME); json.dump(ix.paths(), open('paths.json','w'))"
    y convertir art/uiimages1.txt (UTF-16) a uiimages.json con [nombre, dds, x1, y1, x2, y2].
Uso: OODLE_DLL=... python extract_ui.py <carpeta_salida> [Nombre/Del/Catalogo ...]
Las texturas que usa el sitio (public/poe2/ui/*.webp) salieron de acá:
PanelTitleBar, Background1, ItemsHeaderCurrency/Unique L/M/R, ItemsSeparatorCurrency/Unique (4K).
"""
import io, json, os, re, sys
from PIL import Image
from poe_bundles import Index

GAME = r"C:/Program Files (x86)/Steam/steamapps/common/Path of Exile 2/Bundles2"
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, sys.argv[1] if len(sys.argv) > 1 else "candidates")
os.makedirs(OUT, exist_ok=True)

rows = {r[0].replace("Art/2DArt/UIImages/", ""): r for r in json.load(open(os.path.join(HERE, "uiimages.json")))}
paths = json.load(open(os.path.join(HERE, "paths.json")))
ix = Index(GAME)

WANT = sys.argv[2:] or [
    "Common/4K/PanelTitleBar", "Common/4K/PanelFrameTop", "Common/4K/PanelFrameBottom",
    "Common/4K/Background1", "Common/4K/Background2", "Common/4K/PanelFiller", "Common/4K/PanelBottom",
    "Common/4K/WindowTitlebarCenterpiece", "Common/4K/FloatingTitleBar", "Common/4K/PanelTitleBarOverhang",
    "InGame/4K/ItemsHeaderCurrencyLeft", "InGame/4K/ItemsHeaderCurrencyMiddle", "InGame/4K/ItemsHeaderCurrencyRight",
    "InGame/4K/ItemsHeaderUniqueLeft", "InGame/4K/ItemsHeaderUniqueMiddle", "InGame/4K/ItemsHeaderUniqueRight",
    "InGame/4K/ItemsHeaderGemLeft", "InGame/4K/ItemsHeaderGemMiddle", "InGame/4K/ItemsHeaderGemRight",
    "InGame/4K/ItemsSeparatorCurrency", "InGame/4K/ItemsSeparatorUnique", "InGame/4K/ItemsSeparatorGem",
    "InGame/StashTabWindow/4k/StashTabBG", "InGame/StashTabWindow/4k/StashTabLabelTexture",
    "InGame/StashTabWindow/4k/StashTabLabelCenter", "InGame/StashTabWindow/4k/StashTabLabelEndLeft",
    "InGame/StashTabWindow/4k/StashNumberBacking", "InGame/StashTabWindow/4k/FolderStashTabHeader",
]


def get(name):
    r = rows[name]
    dds = r[1].lower()
    b = ix.read(paths[dds])
    im = Image.open(io.BytesIO(b))
    im.load()
    x1, y1, x2, y2 = r[2:]
    return im.convert("RGBA").crop((x1, y1, x2 + 1, y2 + 1))


for name in WANT:
    try:
        im = get(name)
        fn = re.sub(r"[/]", "_", name) + ".png"
        im.save(os.path.join(OUT, fn))
        print("ok", name, im.size)
    except Exception as e:
        print("FALLA", name, e)
