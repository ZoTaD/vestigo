# Rust

Datos e íconos de la sección `/rust` (en inglés `/en/rust`, en español `/es/rust`; nunca `/rust` a secas: esa carpeta
es la de los assets y Netlify la manda con 301 a `/en/rust`), sacados del juego instalado.

## Dependencias

- Python 3 (se probó con 3.14), **UnityPy 1.25.4** (`pip install UnityPy==1.25.4`) y **Pillow**.
- **ffmpeg** en el PATH, sólo para `ui.py` (el fondo de la portada).
- El juego instalado, sólo para leer (`RUST_DIR` si no está en la carpeta de Steam por defecto).

## En cada actualización (primer jueves del mes)

**Memoria:** `extract.py`, `world.py`, `skins.py` y `raid.py` cargan varios GB de bundles cada uno. Corré **uno por vez**,
nunca en paralelo ni con otro proceso del juego abierto, y mirá antes la RAM libre (hacen falta ≥ 20 GB):

    powershell -c "(Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory/1MB"

1. Actualizá el juego en Steam.
2. `python games/rust/tools/extract.py` (objetos, recetas, reciclaje, íconos).
3. `python games/rust/tools/skins.py` (las skins del juego con su ícono; ~3 min, después de `extract.py` porque usa sus
   íconos para las skins que son un objeto propio).
4. `python games/rust/tools/world.py` (botín de las cajas y tiendas de los monumentos, más `mixing.json` y `deployables.json`; ~1 min).
5. `python games/rust/tools/raid.py` (vida, protección y daño para la calculadora de raideo; ~30 s).
6. `python games/rust/tools/site_data.py` (los archivos que baja la pestaña Objetos; un segundo).
6b. `python games/rust/tools/farming.py` (Granjas: lee la caché cruda `games/rust/cache/`, no el juego; un segundo).
6c. `python games/rust/tools/monuments.py` (Monumentos: de la caché cruda; antes de `patches.py`, que enlaza sus nombres).
6d. `python games/rust/tools/convars.py` (Servidor: clona el decompilado público en `games/rust/.cache/`; sólo cuando
    cambie esa fuente).
6e. `python games/rust/tools/patches.py` (Parches: baja los anuncios de Steam; después `--offline --todo <slug>` deja los
    renglones a traducir en `data/patches-es/<slug>.todo.json`, se traducen, se guardan como `<slug>.json` y se corre de nuevo).
7. `python games/rust/tools/ui.py` (el fondo de la portada y su vista previa): sólo cuando cambia el fondo, no en cada
   parche.
8. Los tests (ver abajo). Si un número de los tests del juego cambió, revisá en el juego que el cambio sea real antes
   de tocar el test.
9. La verificación final, desde `site/`: `npx vitest run test/rust` y
   `NODE_OPTIONS=--max-old-space-size=6144 npm run build`.
10. Commiteá `games/rust/data`, `site/public/rust/items`, `site/public/rust/skins`, `site/public/rust/patches`, `site/public/rust/monuments` y `site/public/rust/farming`.

## Tests

La suite normal no lee el juego (datos sintéticos y los JSON ya generados en `games/rust/data`); corre en segundos y se
puede lanzar siempre, sin la variable:

    python -m unittest discover -s games/rust/tools/tests -v

Los tests que leen los archivos del juego se saltean salvo con `RUST_GAME=1` (y el juego instalado). Cada uno carga
varios GB de bundles con UnityPy, así que se corren **de a un archivo por vez**, nunca dos procesos a la vez:

    RUST_GAME=1 python -m unittest games/rust/tools/tests/test_extract.py -v
    RUST_GAME=1 python -m unittest games/rust/tools/tests/test_skins.py -v
    RUST_GAME=1 python -m unittest games/rust/tools/tests/test_world.py -v
    RUST_GAME=1 python -m unittest games/rust/tools/tests/test_raid.py -v

(En PowerShell: `$env:RUST_GAME = "1"; python -m unittest ...`.) Cada módulo carga el juego una sola vez y lo suelta al
terminar.

## Caché cruda para las pestañas que faltan (2026-10-08)

`extract_io.py`, `extract_world.py`, `extract_farming.py`, `extract_sprites.py` (después de los tres anteriores) y
`extract_media.py` vuelcan del juego, sin tocar el sitio, lo que hace falta para Monumentos, Electricidad y Granjas a
`games/rust/cache/` (no versionada salvo su `README.md`, que explica qué hay y de dónde sale). Usan la base común de
`cache_dump.py`. Misma regla de memoria: uno por vez (~12-14 GB de RAM de pico cada uno).
