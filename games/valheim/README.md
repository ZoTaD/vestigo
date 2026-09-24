# Valheim

Datos y gráficos de la sección `/valheim`, sacados del juego instalado.

## En cada parche

Se actualiza a mano: los parches de Valheim salen poco y no hace falta una
Action.

1. Actualizar el juego en Steam.
2. Si no existe el entorno:
   `python -m venv games/valheim/.venv` y
   `games/valheim/.venv/Scripts/python -m pip install UnityPy TypeTreeGeneratorAPI`.
3. `cd games/valheim && .venv/Scripts/python -m pipeline.extract` (~4 min).
4. `.venv/Scripts/python -m pipeline.site` (arma `data/site/`, lo que lee la
   web) y `.venv/Scripts/python -m pipeline.check_links` (tiene que dar 0).
5. Revisar `git diff --stat games/valheim/data`, los conteos de `data/meta.json`
   y su lista `withoutSource` (lo que quedó sin "de dónde sale").
6. Si un campo cambió de nombre: `.venv/Scripts/python -m pipeline.peek <Clase>`.
7. La Crónica (notas de parche): `.venv/Scripts/python -m pipeline.patches`
   baja los anuncios de Steam y arma `data/site/patches/`. Va después de
   `pipeline.site` porque enlaza los nombres con su índice.
8. El español de la edición nueva: `.venv/Scripts/python -m pipeline.patches --offline --todo <slug>`
   escribe las líneas que faltan en `data/patches-es/<slug>.todo.json`; se
   traducen (con los nombres oficiales del índice, así se enlazan), se guardan
   como `<slug>.json` y se vuelve a correr. Lo que se repite entre parches va
   en `common.json`. Las líneas "Weapon: Nord Sword" se traducen solas.
9. Pedir la indexación de la edición nueva (en/es) en Search Console.

Tests: `cd games/valheim && .venv/Scripts/python -m unittest discover -s pipeline/tests -t . -v`.

## Qué escribe

- `data/site/*.json`: una lista por pestaña con todo resuelto, las guías de
  biomas y jefes y el índice buscable. Es lo único que lee la web.
- `data/*.json`: objetos, recetas, piezas, conversiones, estaciones, criaturas,
  recolectables, cultivos, comerciantes y biomas, con nombres `{en, es}`.
- `../tft/ui/public/valheim/icons/*.webp`: íconos de objetos, piezas y estaciones.
- `../tft/ui/public/valheim/ui/*.webp`: paneles, botones y casillas de la interfaz.
- `../tft/ui/public/valheim/fonts/`: Averia Serif/Sans Libre (OFL). Norse, la
  de los títulos del juego, queda afuera hasta confirmar su licencia.
- `data/site/patches/*.json` y `../tft/ui/public/valheim/news/*.webp`: la
  Crónica, una edición por versión estable (sin "Public Test"), con la portada
  del anuncio cuando trae imagen.

Diseño: `docs/design/2026-09-24-valheim-enciclopedia.md`.
