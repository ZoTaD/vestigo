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

## Resultado (2026-10-09)

- 36 monumentos (las variantes juntas: 2 puertos, 4 laboratorios submarinos, 4 bases militares, 2 poblados), 17 con
  algo de la red eléctrica; 15 fotos de 640 × 360 (344 KB). `monuments.json` 44 KB con las tiendas de NPC adentro.
- Red de Power Trip: etapa 1 (1 fusible) Ferry Terminal, Harbor, Junkyard, Oxum's y el supermercado; etapa 2 (4)
  Airfield, Power Plant, Radtown, Sewer Branch, Train Yard y la potabilizadora; etapa 3 (10) Airfield, las dos
  plataformas, Launch Site, Missile Silo y The Dome; etapa 4 (18) Airfield. Cajas de 15 y 5 ranuras.
- Decisiones:
  - Qué prende cada etapa sale del nombre del generador: "controlroomloot" = sala de botín, "lootfridge" = heladera;
    lo demás se dice "los sistemas del monumento" (no se sabe más del cliente).
  - El "recorrido" del puzzle (en qué orden van tarjetas y fusibles) no se puede armar con certeza desde las escenas:
    se muestran las cantidades por color. Queda para una pasada a mano.
  - Apartamentos: precio de entrada y alquiler mínimo del prefab (25/150/350 y 10/50/100 de chatarra), marcados
    como valores por defecto que el servidor puede cambiar. Las tiendas alquilables: sólo cuántas hay (14); el
    alquiler es del servidor.
  - Sin foto, el casillero muestra el tipo del monumento; no se dibujaron íconos propios.
  - Las notas de Parches enlazan los monumentos por nombre ("m:<id>"; si un nombre es de objeto y de monumento, gana
    el monumento).
- Build: 100 s, `vite build` 1 min 27 s, 24.486 páginas (+74). Perf: `/en/rust/monuments` 48/17/446,
  `/en/rust/monuments/bandit-camp` 68/37/400, `/es/rust/monumentos/complejo-de-apartamentos` 50/19/231.
