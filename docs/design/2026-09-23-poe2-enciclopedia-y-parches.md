# PoE2: Enciclopedia y Diario de parches

Fecha: 2026-09-23 · Estado: ZoTaD pidió las dos cosas ("comenzá a hacer todo") y
se fue; las decisiones de abajo las tomé yo siguiendo lo que ya había elegido para
la Economía (maqueta B, estilo del juego, barra de Vestigo intacta). Revisarlas
con él a la vuelta.

## Qué es

Las dos pestañas "Pronto" de la sub-navegación de PoE2:

- **Enciclopedia**: todas las gemas, únicos, bases y monedas del juego, con el
  dibujo del juego, el tooltip del juego y los textos **oficiales en español**.
- **Parches**: un diario, una edición por parche, con las notas oficiales en los
  dos idiomas. Cada gema/único/moneda que se nombra lleva su dibujo y su tooltip.

## Fuentes

| Qué | De dónde | Notas |
|---|---|---|
| Gemas, bases, únicos, niveles | RePoE (`repoe-fork.github.io/poe2/*.min.json`) | Sólo inglés. Es lo que publica la comunidad a partir de los archivos del juego. |
| Textos en español | **El juego instalado**: `data/balance/spanish/*.datc64` y los `.csd` de `data/statdescriptions` (traen todos los idiomas). | Se leen con `games/poe2/tools/poe_bundles.py`. Nada de `/api/` de pathofexile.com (robots.txt lo excluye). |
| Dibujos | El juego instalado (`.dds` → webp) | Sin depender de terceros. Tamaños chicos: ver "Peso". |
| Modificadores de únicos | La economía (poe.ninja ya los trae, en inglés) + traducción con los `.csd` | RePoE no trae los mods de los únicos. |
| Notas de parche | Foro oficial: 2212 (inglés) y 2243 (es.pathofexile.com) | robots.txt permite `view-thread`. Una petición por segundo, User-Agent con contacto. |

## Peso

Todo el arte va en webp, redimensionado: ícono de gema 64 px, celda de inventario
a 40 px (un único 2×4 queda en 80×160). Objetivo: < 10 MB en total. Los datos se
cargan por categoría (`import.meta.glob`), nunca en el bundle principal.

## Rutas

- `/es/poe2/encyclopedia` · portada: las cuatro categorías y un buscador global.
- `/es/poe2/encyclopedia/<cat>` · lista (`gems`, `uniques`, `bases`, `currency`).
- `/es/poe2/encyclopedia/<cat>/<slug>` · ficha.
- `/es/poe2/patches` · la última edición, con la hemeroteca.
- `/es/poe2/patches/<version>` · una edición (`0-5-5c`).

En `Route`, `p2Section` suma `encyclopedia` y `patches`; `detail` lleva el resto
de la ruta (`gems/untether`, `0-5-5c`).

## Datos

`games/poe2/data/encyclopedia/`

- `index.json`: `[{ id, cat, en, es, icon, cls }]` — todo lo buscable, liviano.
  Lo usa el buscador y el diario de parches para reconocer nombres.
- `gems.json`, `uniques.json`, `bases.json`, `currency.json`: el detalle.

`games/poe2/data/patches/`

- `index.json`: ediciones, la más nueva primero.
- `<slug>.json`: `{ version, slug, date, kind, title{en,es}, url{en,es}, banner?,
  en: Section[], es: Section[] | null, hotfixes: [...] }`, con
  `Section = { title, lines: Line[] }` y `Line = { text, dir?, refs?, kids? }`.
  `dir` = `up | down | fix | new | mid`; `refs` = ids de la enciclopedia nombrados
  en la línea.

## Pipeline

- `games/poe2/pipeline/encyclopedia.py` (Python: necesita el juego instalado y
  `OODLE_DLL`). Se corre a mano después de cada parche, como `game_assets.py` de
  Deadlock. Escribe los JSON y `public/poe2/art/**.webp`.
- `games/poe2/pipeline/patches.mjs` (Node, sin dependencias): lee el foro,
  escribe las ediciones nuevas. Las viejas quedan congeladas.

## Sitio

- `Poe2Encyclopedia.tsx` (portada, lista, ficha) y `Poe2Patches.tsx`.
- Estilos bajo `.p2` en `styles/poe2.css`; tooltip del juego reutilizado de la
  Economía (cabecera por rareza: gema, único, moneda, normal).
- Español primero; si falta un texto en español se muestra el inglés.
