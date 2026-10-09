"""
Los sprites de UI a la caché (`games/rust/cache/sprites/`), 2026-10-08. Correr DESPUÉS de `extract_io.py`,
`extract_world.py` y `extract_farming.py`: junta de esos JSON las referencias que quedaron sin resolver (`"unresolved":
"CAB-…#id"`, que apuntan a los bundles de texturas) y las busca recorriendo los bundles de texturas de a uno.

Escribe:
  - `sprites/index.json`: todos los Sprite de cada bundle de texturas ({bundle: [[CAB, path_id, nombre, ancho, alto]]}),
    para saber qué hay sin volver a abrir el juego;
  - `sprites/png/<nombre>.png`: los Sprite pedidos por la caché (íconos de mapa de los monumentos, genes, razas de
    caballo, paneles de IO...) y los que coinciden con `WANTED` por nombre (íconos de mapa, de IO, de genes, de
    tarjetas...);
  - `sprites/refs.json`: {"CAB#id": "archivo.png"}, para enlazar los JSON de la caché con la imagen.

Memoria: cada `textures.N.bundle` de `Bundles/shared` pesa 5-8 GB y se abre solo, se suelta y se abre el siguiente
(~6-9 GB de RAM de pico). Uso, desde la raíz del repo (~10 min):
    python games/rust/tools/extract_sprites.py
"""
import gc
import json
import re
import sys
from pathlib import Path

import UnityPy

sys.path.insert(0, str(Path(__file__).resolve().parent))
from cache_dump import CACHE, rss_gb, write_json  # noqa: E402
from extract import BUNDLES  # noqa: E402

# Sprites que se guardan por nombre aunque nada de la caché los pida.
WANTED = re.compile(r"(?i)map[_ .-]?icon|mapicon|monument|^icon[_ .-]|io[_ .-]|electric|wire|power|fuse|keycard|"
                    r"accesscard|card[_ .-]|gene|plant|seed|crop|livestock|horse|chicken|cow|sheep|beehive|bee[_ .-]|honey|farm|"
                    r"radiation|recycl|vending|safezone|marker|clan|apartment|rent")
MAX_SIDE = 1024  # un sprite más grande que esto no es un ícono (fondos, atlas): no se guarda por nombre


def wanted_refs():
    refs = set()

    def walk(v):
        if isinstance(v, dict):
            u = v.get("unresolved")
            if isinstance(u, str) and u.startswith("CAB-"):
                cab, pid = u.split("#")
                refs.add((cab, int(pid)))
            for x in v.values():
                walk(x)
        elif isinstance(v, list):
            for x in v:
                walk(x)

    for sub in ("io", "world", "farming"):
        for f in (CACHE / sub).rglob("*.json"):
            walk(json.loads(f.read_text(encoding="utf-8")))
    return refs


def safe(name):
    return re.sub(r"[^A-Za-z0-9._-]+", "_", name).strip("_") or "sprite"


def scan(bundle, refs, out_dir, index, saved, taken):
    env = UnityPy.load(str(bundle))
    rows = []
    for o in env.objects:
        if o.type.name not in ("Sprite", "Texture2D"):
            continue
        cab, pid = o.assets_file.name, o.path_id
        asked = (cab, pid) in refs
        if o.type.name == "Texture2D" and not asked:
            continue
        try:
            name = o.peek_name() or str(pid)
        except Exception:  # noqa: BLE001
            name = str(pid)
        if o.type.name == "Sprite":
            rows.append([cab, pid, name])
        if not asked and not WANTED.search(name):
            continue
        try:
            obj = o.read()
            if o.type.name == "Texture2D" and max(obj.m_Width, obj.m_Height) > 2048:
                continue  # texturas del terreno (TerrainConfig): no son íconos y pesan decenas de MB
            im = obj.image
        except Exception as e:  # noqa: BLE001
            print(f"[sprites] no pude leer {name} ({cab}#{pid}): {e}", file=sys.stderr)
            continue
        if not asked and max(im.size) > MAX_SIDE:
            continue
        fname = safe(name)
        if fname.lower() in taken:
            fname = f"{fname}_{pid & 0xffffffff:x}"
        taken.add(fname.lower())
        im.save(out_dir / f"{fname}.png", optimize=True)
        saved[f"{cab}#{pid}"] = f"{fname}.png"
    index[bundle.relative_to(BUNDLES).as_posix()] = rows
    print(f"[sprites] {bundle.name}: {len(rows)} sprites, {len(saved)} guardados en total; RAM {rss_gb()} GB", flush=True)


def main():
    refs = wanted_refs()
    print(f"[sprites] {len(refs)} referencias pedidas por la caché", flush=True)
    out_dir = CACHE / "sprites" / "png"
    if out_dir.exists():
        for f in out_dir.glob("*.png"):
            f.unlink()
    out_dir.mkdir(parents=True, exist_ok=True)
    index, saved, taken = {}, {}, set()
    bundles = sorted((BUNDLES / "shared").glob("textures.*.bundle")) + sorted((BUNDLES / "textures").glob("*.bundle"))
    # Los íconos de mapa de los monumentos (`MonumentInfo.mapIcon`) viven en monuments.bundle.
    bundles += [BUNDLES / "maps" / "maps.bundle", BUNDLES / "shared" / "monuments.bundle"]
    for b in bundles:
        scan(b, refs, out_dir, index, saved, taken)
        gc.collect()
    write_json("sprites/index.json", index)
    write_json("sprites/refs.json", saved)
    lost = sorted(f"{c}#{p}" for c, p in refs if f"{c}#{p}" not in saved)
    write_json("sprites/not_found.json", lost)
    print(f"[sprites] listo: {len(saved)} imágenes; {len(lost)} referencias sin encontrar (ver not_found.json)")


if __name__ == "__main__":
    main()
