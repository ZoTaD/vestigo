"""
Imágenes, textos y archivos sueltos del cliente a la caché (`games/rust/cache/`), 2026-10-08. Ver `cache_dump.py`.

Escribe:
  - `video_frames/<video>/<video>_NNN.webp`: un cuadro cada `FRAME_EVERY` segundos de cada video del menú
    (`RustClient_Data/StreamingAssets/MenuVideo`; de los que están en webm y mp4 se usa el webm, que a veces es 1440p),
    a resolución nativa. Los videos no se copian: pesan ~350 MB;
  - `localization/{en,es-es}/engine.json` y `engine-generated.json` (todos los textos del juego, de `content.bundle`)
    y `localization/editor/phrasecontexts.json`;
  - `items/<shortname>.webp` y `.json`: los íconos de `Bundles/items` a resolución original (512 px) y la ficha que el
    juego deja al lado de cada uno;
  - `streaming/`: los JSON sueltos de `StreamingAssets` (nombres de los animales de corral por idioma) y las licencias.

Necesita ffmpeg en el PATH. Uso, desde la raíz del repo (~40 min, casi todo en los 1.784 íconos; abre content.bundle,
~6 GB de RAM; uno por vez). Se puede correr un paso suelto:
    python games/rust/tools/extract_media.py [streaming] [items] [localization] [frames]
"""
import shutil
import subprocess
import sys
from pathlib import Path

import UnityPy
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from cache_dump import CACHE  # noqa: E402
from extract import BUNDLES, RUST_DIR  # noqa: E402

STREAMING = RUST_DIR / "RustClient_Data" / "StreamingAssets"
FRAME_EVERY = 4  # segundos
LANGS = ("en", "es-es")


def frames():
    if shutil.which("ffmpeg") is None:
        raise SystemExit("Falta ffmpeg en el PATH.")
    videos = {}
    for ext in ("mp4", "webm"):  # el webm pisa al mp4 del mismo nombre
        for v in sorted((STREAMING / "MenuVideo" / ext).glob(f"*.{ext}")):
            videos[v.stem] = v
    for name, v in sorted(videos.items()):
        out = CACHE / "video_frames" / name
        if out.exists():
            shutil.rmtree(out)
        out.mkdir(parents=True)
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-ss", "1", "-i", str(v), "-vf", f"fps=1/{FRAME_EVERY}",
                        "-c:v", "libwebp", "-quality", "88", str(out / f"{name}_%03d.webp")], check=True)
        print(f"[media] {name}: {len(list(out.glob('*.webp')))} cuadros", flush=True)


def localization():
    env = UnityPy.load(str(BUNDLES / "shared" / "content.bundle"))
    wanted = [f"assets/localization/{lang}/{f}" for lang in LANGS for f in ("engine.json", "engine-generated.json")]
    wanted.append("assets/localization/editor/phrasecontexts.json")
    container = dict(env.container.items())  # el ContainerHelper de UnityPy 1.25 no tiene .get
    for path in wanted:
        ptr = container.get(path)
        if ptr is None:
            print(f"[media] falta {path}", file=sys.stderr)
            continue
        data = ptr.read().m_Script
        dst = CACHE / "localization" / Path(path).relative_to("assets/localization")
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_bytes(data.encode("utf-8", "surrogateescape") if isinstance(data, str) else data)
        print(f"[media] {dst.relative_to(CACHE)}: {dst.stat().st_size // 1024} KB", flush=True)


def items():
    out = CACHE / "items"
    out.mkdir(parents=True, exist_ok=True)
    n = 0
    for f in sorted((BUNDLES / "items").iterdir()):
        if f.suffix == ".json":
            shutil.copy2(f, out / f.name)
        elif f.suffix == ".png":
            Image.open(f).save(out / f"{f.stem}.webp", "WEBP", quality=90, method=4)
            n += 1
    print(f"[media] {n} íconos de objetos", flush=True)


def streaming():
    out = CACHE / "streaming"
    out.mkdir(parents=True, exist_ok=True)
    for f in STREAMING.glob("*.json"):
        shutil.copy2(f, out / f.name)
    if (out / "Licenses").exists():
        shutil.rmtree(out / "Licenses")
    shutil.copytree(STREAMING / "Licenses", out / "Licenses")
    print("[media] StreamingAssets copiados", flush=True)


def main():
    steps = sys.argv[1:] or ["streaming", "items", "localization", "frames"]
    for s in steps:
        globals()[s]()


if __name__ == "__main__":
    main()
