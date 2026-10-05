# Rust

Datos e íconos de la sección `/rust` (en inglés `/en/rust`, en español `/es/rust`; nunca `/rust` a secas: esa carpeta
es la de los assets y Netlify la manda con 301 a `/en/rust`), sacados del juego instalado.

## Dependencias

- Python 3 (se probó con 3.14), **UnityPy 1.25.4** (`pip install UnityPy==1.25.4`) y **Pillow**.
- **ffmpeg** en el PATH, sólo para `ui.py` (el fondo de la portada).
- El juego instalado, sólo para leer (`RUST_DIR` si no está en la carpeta de Steam por defecto).

## En cada actualización (primer jueves del mes)

1. Actualizá el juego en Steam.
2. `python games/rust/tools/extract.py` (objetos, recetas, reciclaje, íconos).
3. `python games/rust/tools/skins.py` (las skins del juego con su ícono; ~3 min, después de `extract.py` porque usa sus
   íconos para las skins que son un objeto propio).
4. `python games/rust/tools/world.py` (botín de las cajas y tiendas de los monumentos; ~1 min).
5. `python games/rust/tools/raid.py` (vida, protección y daño para la calculadora de raideo; ~30 s).
6. `python games/rust/tools/site_data.py` (los archivos que baja la pestaña Objetos; un segundo).
7. Los tests (ver abajo). Si un número de los tests del juego cambió, revisá en el juego que el cambio sea real antes
   de tocar el test.
8. Commiteá `games/rust/data`, `site/public/rust/items` y `site/public/rust/skins`.

## Tests

La suite normal no lee el juego (datos sintéticos y los JSON ya generados en `games/rust/data`); corre en segundos y se
puede lanzar siempre, sin la variable:

    python -m unittest discover -s games/rust/tools/tests -v

Los tests que leen los archivos del juego se saltean salvo con `RUST_GAME=1` (y el juego instalado). Cada uno carga
varios GB de bundles con UnityPy, así que se corren **de a un archivo por vez**, nunca dos procesos a la vez:

    RUST_GAME=1 python -m unittest games/rust/tools/tests/test_extract.py -v
    RUST_GAME=1 python -m unittest games/rust/tools/tests/test_skins.py -v
    RUST_GAME=1 python -m unittest games/rust/tools/tests/test_world.py -v

(En PowerShell: `$env:RUST_GAME = "1"; python -m unittest ...`.) Cada módulo carga el juego una sola vez y lo suelta al
terminar.
