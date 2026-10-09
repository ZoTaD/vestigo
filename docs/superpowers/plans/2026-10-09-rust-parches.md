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
