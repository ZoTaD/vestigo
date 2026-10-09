# Rust — Parches (plan, 2026-10-09)

Diseño: `docs/superpowers/specs/2026-10-09-rust-etapa-2-design.md`, punto 3. Patrón: la Crónica de Valheim
(`games/valheim/pipeline/patches.py`, `site/src/ValheimPatches.tsx`). TDD; commit al final con todo verde.

## Fuente

- Anuncios de Steam de la app 252490 (`ISteamNews/GetNewsForApp`, público, sin clave). Facepunch publica ahí un
  anuncio por actualización mensual (primer jueves) con el texto del devblog y, al pie, el enlace a la lista completa
  de cambios en rust.facepunch.com/news/<slug>. Los hotfixes **no** salen en Steam (van sólo a rust.facepunch.com/changes):
  quedan afuera y se anota.
- Afuera: "Community Update" (es un resumen de creaciones de la comunidad, no un parche), votaciones de los Steam
  Awards y anuncios de DLC.
- Desde 2024-01 (lo que trae la API con `count=60`).

## Tareas

1. `games/rust/tools/patches.py` + `tests/test_patches.py`: baja (o lee la caché `--offline`), filtra, parsea el
   BBCode (`[h1]`/`[h2]`/`[h3]`, `[p]`, `[list]`, `[img src=…]`, `[url="…"]`), enlaza nombres de objetos (inglés y
   español, de `items.json`), baja la portada (primera imagen, webp 640 px) a `site/public/rust/patches/`, y escribe
   `games/rust/data/patches/index.json` + `<slug>.json`. Español a mano: `games/rust/data/patches-es/<slug>.json`
   ("línea en inglés → línea en español"); una edición sale en español sólo si están todas sus líneas.
2. Ruta `patches` (`/en/rust/patches`, `/es/rust/parches`) con una ficha por edición (`/en/rust/patches/livestock`).
3. Pestaña: lista (portada, nombre, fecha, cuántas secciones) y edición (secciones, enlaces a fichas, enlace a la
   lista completa de cambios y al anuncio), aviso "en inglés" si falta la traducción.
4. SEO: "Rust <Update> update patch notes" / "Notas del parche <Update> de Rust", `lastmod` con la fecha de cada
   edición, JSON-LD `Article`.
5. Traducir a mano la edición más nueva.
6. Build + perf; números al final.

## Resultado (2026-10-09)

- 41 ediciones (2024-01-04 → 2026-10-01), 760 KB de JSON (~18 KB cada una) y 41 portadas webp (1,2 MB). La más nueva
  (Livestock, 141 renglones) va traducida a mano en `games/rust/data/patches-es/livestock.json`; las demás salen en
  inglés con aviso hasta que se traduzcan (`python games/rust/tools/patches.py --offline --todo <slug>`).
- Decisiones:
  - Script manual y no workflow: el único workflow que publica es el de Deadlock, y los anuncios de Rust salen una vez
    por mes (el primer jueves, con el wipe). Se corre después del parche, junto con los demás extractores.
  - Hotfixes: no están en Steam; quedan afuera (se podrían sumar desde rust.facepunch.com/changes en otro paso).
  - Las imágenes internas del anuncio no se muestran (vienen de files.facepunch.com, otro origen para la CSP); sólo la
    portada, bajada al sitio. Los videos de YouTube tampoco.
  - Objetos nombrados: los de dos palabras o más sin mirar mayúsculas, los de una con mayúscula y ≥ 5 letras (para no
    enlazar "Rope" o "Milk" sueltos en una frase). Los monumentos todavía no tienen ficha: se enlazan cuando exista la
    pestaña.
  - Slug = el título del anuncio (`livestock`, `upgrade-hard-raid-harder`); si se repite, la más vieja lleva el año
    (`seasons-beatings-2024`). Es el mismo en los dos idiomas: es el nombre propio de la actualización.
- Build: 119 s el comando, `vite build` 1 min 42 s, 24.412 páginas (+84).
- Perf: `/en/rust/patches` 70 pedidos, 42 imágenes, 424 nodos; `/es/rust/parches/livestock` 30/2/292. Dentro del
  presupuesto.
