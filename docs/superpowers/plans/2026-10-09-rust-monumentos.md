# Rust — Monumentos (plan, 2026-10-09)

Diseño: `docs/superpowers/specs/2026-10-09-rust-etapa-2-design.md`, punto 4. TDD; commit al final con todo verde.

## Fuente

Caché del cliente (`games/rust/cache/world/`, `io/configs.json`, `video_frames/`). Del decompilado (2024-08) sólo los
nombres de los enum (`MonumentType`, `RadiationTier`, `MonumentTier` = banderas 1/2/4 para los tiers 0/1/2). El botín
por monumento, los NPC y el alquiler de las tiendas son del servidor: no se muestran (falta el OK para bajar el servidor
dedicado).

## Tareas

1. `games/rust/tools/monuments.py` + `tests/test_monuments.py`: los monumentos que el jugador ve en el mapa
   (`shouldDisplayOnMap`, dentro de `autospawn/monument/`), juntando variantes por nombre; por cada uno tipo, tiers,
   tamaño mínimo de mapa, zona segura, tamaño, lectores de tarjeta por color, ranuras de fusible, recicladoras por
   color, radiación máxima, qué prende la red eléctrica en cada etapa (por `ElectricGenerator.requiredPowergridStage`,
   sumando las piezas de la escena de props con una tabla carpeta → monumento) y su tienda de NPC (`shops.json`). La
   red de Power Trip (`PowergridStageConfig`: 1/4/10/18 fusibles; cajas de 15 y 5 ranuras; Heavy Fuse). El complejo
   de apartamentos (cuartos con precio y alquiler mínimo por defecto, valor en chatarra de cada recurso para pagar,
   14 tiendas alquilables). Fotos: un cuadro de los videos del menú, 640 × 360.
2. Ruta `monuments` (`/en/rust/monuments`, `/es/rust/monumentos`) con ficha por monumento.
3. Pestaña: lista en casilleros (foto o ícono de tipo, nombre, chips de tarjetas/radiación/zona segura), sección de la
   red de Power Trip y ficha (datos, puzzle, red, tienda con sus precios, apartamentos).
4. SEO, prerender, sitemap, perf; las notas de Parches enlazan los monumentos por nombre.
