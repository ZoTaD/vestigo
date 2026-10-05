# Rust

Datos e íconos de la sección `/rust` (en inglés `/en/rust`, en español `/es/rust`; nunca `/rust` a secas: esa carpeta
es la de los assets y Netlify la manda con 301 a `/en/rust`), sacados del juego instalado.

## Dependencias

- Python 3 (se probó con 3.14), **UnityPy 1.25.4** (`pip install UnityPy==1.25.4`) y **Pillow**.
- **ffmpeg** en el PATH, sólo para `ui.py` (el fondo de la portada).
- El juego instalado, sólo para leer (`RUST_DIR` si no está en la carpeta de Steam por defecto).

## En cada actualización (primer jueves del mes)

1. Actualizá el juego en Steam.
2. `python games/rust/tools/extract.py`.
3. `python -m unittest discover -s games/rust/tools/tests -v`. Si un número de los tests cambió, revisá en el juego
   que el cambio sea real antes de tocar el test.
4. Commiteá `games/rust/data` y `site/public/rust/items`.
