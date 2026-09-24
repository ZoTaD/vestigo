# Valheim

Datos y gráficos de la sección `/valheim`, sacados del juego instalado.

## En cada parche

Se actualiza a mano: los parches de Valheim salen poco y no hace falta una
Action.

1. Actualizar el juego en Steam.
2. Si no existe el entorno:
   `python -m venv games/valheim/.venv` y
   `games/valheim/.venv/Scripts/python -m pip install UnityPy TypeTreeGeneratorAPI`.
3. `cd games/valheim && .venv/Scripts/python -m pipeline.extract` (~3-4 min).
4. Revisar `git diff --stat games/valheim/data`, los conteos de `data/meta.json`
   y su lista `withoutSource` (lo que quedó sin "de dónde sale").
5. Si un campo cambió de nombre: `.venv/Scripts/python -m pipeline.peek <Clase>`.

Tests: `cd games/valheim && .venv/Scripts/python -m unittest discover -s pipeline/tests -t . -v`.

## Qué escribe

- `data/*.json`: objetos, recetas, piezas, conversiones, estaciones, criaturas,
  recolectables, cultivos, comerciantes y biomas, con nombres `{en, es}`.
- `../tft/ui/public/valheim/icons/*.webp`: íconos de objetos, piezas y estaciones.
- `../tft/ui/public/valheim/ui/*.webp`: paneles, botones y casillas de la interfaz.
- `../tft/ui/public/valheim/fonts/`: Averia Serif/Sans Libre (OFL). Norse, la
  de los títulos del juego, queda afuera hasta confirmar su licencia.

Diseño: `docs/design/2026-09-24-valheim-enciclopedia.md`.
