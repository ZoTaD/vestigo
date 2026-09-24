"""
Las fotos de la wiki, bajadas por una persona desde el navegador.

El CDN de imágenes de Fandom (static.wikia.nocookie.net) contesta a los scripts
con el desafío de Cloudflare (2026-09-24), y eso no se esquiva: las fotos las
baja el navegador de ZoTaD, de una sola vez.

  1. .venv/Scripts/python -m pipeline.wiki_manual --pagina
     escribe Desktop/valheim-wiki/fotos-valheim.html con todas las fotos.
  2. Abrirla en Chrome, esperar que carguen y guardarla con Ctrl+S como
     "Página web completa" (en Descargas, con el nombre que propone).
  3. .venv/Scripts/python -m pipeline.wiki_manual --importar [ruta del .html guardado]
     (sin ruta busca el último fotos-valheim*.html de Descargas) copia cada foto
     a Desktop/valheim-wiki/images/<archivo de la wiki>.
  4. pipeline.wiki_images (las toma de ahí, con su crédito) y pipeline.site.

Chrome, al guardar la página completa, reescribe cada `src` a su copia local y
conserva el `data-file` de cada imagen: así se sabe qué archivo es cada una
aunque todas se llamen "640" en el CDN.
"""
import glob
import html
import json
import os
import re
import shutil
import sys
from urllib.parse import unquote

from . import wiki
from .wiki_images import LOCAL_IMAGES, OUT_JSON, image_info

PAGE = os.path.join(wiki.WIKI, "fotos-valheim.html")


def files_wanted() -> list[str]:
    with open(OUT_JSON, encoding="utf-8") as f:
        data = json.load(f)
    return sorted({e["file"] for g in ("creatures", "bosses", "places") for e in data.get(g, {}).values() if e.get("file")})


def write_page() -> None:
    files = files_wanted()
    info = image_info(files)
    cards = "\n".join(
        f'<figure><img data-file="{html.escape(f, quote=True)}" src="{html.escape(info[f]["thumb"], quote=True)}" '
        f'alt="" referrerpolicy="no-referrer"><figcaption>{html.escape(f)}</figcaption></figure>'
        for f in files if f in info)
    body = f"""<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Fotos de Valheim para Vestigo</title>
<style>body{{font:14px system-ui;background:#1b140e;color:#eee;margin:20px}}main{{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px}}
figure{{margin:0}}img{{width:100%;height:120px;object-fit:contain;background:#000}}figcaption{{font-size:11px;color:#aaa;word-break:break-all}}
.ok{{color:#9c6}}</style></head><body>
<h1>{len(info)} fotos de la Valheim Wiki (CC BY-SA 3.0)</h1>
<p>Esperá a que carguen todas (<span id="n">0</span> de {len(info)}) y guardá con <b>Ctrl+S</b> → <b>Página web completa</b>.
Después: <code>.venv/Scripts/python -m pipeline.wiki_manual --importar</code></p>
<main>{cards}</main>
<script>const imgs=[...document.images];const tick=()=>{{const n=imgs.filter(i=>i.complete&&i.naturalWidth).length;document.getElementById('n').textContent=n;
if(n===imgs.length)document.getElementById('n').className='ok';}};imgs.forEach(i=>i.addEventListener('load',tick));tick();</script>
</body></html>"""
    with open(PAGE, "w", encoding="utf-8") as f:
        f.write(body)
    print(f"{len(info)} fotos en {PAGE}")


def import_saved(path: str | None) -> None:
    if not path:
        found = sorted([f for pat in ("fotos-valheim*.htm*", "Fotos de Valheim*.htm*") for f in glob.glob(os.path.join(os.path.expanduser("~"), "Downloads", pat))], key=os.path.getmtime)
        if not found:
            raise SystemExit("no encontré fotos-valheim*.html en Descargas: pasá la ruta")
        path = found[-1]
    base = os.path.dirname(path)
    with open(path, encoding="utf-8", errors="replace") as f:
        text = f.read()
    os.makedirs(LOCAL_IMAGES, exist_ok=True)
    ok, missing = 0, []
    for tag in re.findall(r"<img\b[^>]*>", text):
        fm = re.search(r'data-file="([^"]+)"', tag)
        sm = re.search(r'src="([^"]+)"', tag)
        if not fm or not sm:
            continue
        name, src = html.unescape(fm.group(1)), unquote(html.unescape(sm.group(1)))
        local = os.path.normpath(os.path.join(base, src.replace("./", "", 1)))
        if src.startswith("http") or not os.path.exists(local) or os.path.getsize(local) < 200:
            missing.append(name)
            continue
        shutil.copyfile(local, os.path.join(LOCAL_IMAGES, name))
        ok += 1
    print(f"{ok} fotos copiadas a {LOCAL_IMAGES}")
    if missing:
        print(f"{len(missing)} sin copia local (no cargaron antes de guardar): " + ", ".join(missing[:20]))


if __name__ == "__main__":
    if "--pagina" in sys.argv:
        write_page()
    elif "--importar" in sys.argv:
        i = sys.argv.index("--importar")
        import_saved(sys.argv[i + 1] if len(sys.argv) > i + 1 else None)
    else:
        print(__doc__)
