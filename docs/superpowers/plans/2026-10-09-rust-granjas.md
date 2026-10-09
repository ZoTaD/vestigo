# Rust — Granjas + Genética (plan, 2026-10-09)

Diseño: `docs/superpowers/specs/2026-10-09-rust-etapa-2-design.md`, punto 2. Worktree `vestigo-rust-granjas`, rama
`feat/rust-granjas`. TDD en cada tarea; commit al final con todo verde.

## Fuentes

- Caché del cliente (`games/rust/cache/farming/`, build 25797961): `PlantProperties` (14 plantas, 8 etapas),
  `GrowableGeneProperties` (pesos), `PlanterBox`, `ItemModCompostable`, `Composter`, `Sprinkler`, `CeilingLight`,
  `ChickenCoop`/`FarmableAnimal`, `Beehive`, `Cow`/`Sheep`, `HorseBreed`; textos en `localization/`.
- Lo que es código (decompilado público github.com/MillionthOdin16/RustChangelog, rama `release`, commit `8d288b3`
  del 2024-08-03): `GrowableGenetics.cs` (orden del enum X/W/G/Y/H y la regla de la cruza), `GrowableGene.cs`
  (letras y cuáles son buenos), `GrowableEntity.cs` (+25 % de velocidad por G, +25 % de rendimiento por Y, +10 % de
  agua por W, +0,2 suelo/+0,05 temperatura por H, clones = base + Y/2), `ConVar/Server.cs` (`planttick` 60 s,
  radios de luz 3 m y calor 4 m, saturación óptima 0,6), `Composter.cs` (1 objeto por ranura cada 300 s). Van a mano en
  `games/rust/tools/farming_overrides.py`, con la fuente. Los pesos del cliente (1/1/0,6/0,6/0,6) cierran con ese orden.

## La regla de la cruza (del decompilado)

Por cada uno de los 6 casilleros: se suman los pesos de cruza (`CrossBreedingWeight`) de las vecinas de la misma
planta, en la misma jardinera, vivas y a ≤ 1,5 m, agrupados por gen. Gana el gen con más suma; **el empate lo gana el
primero que llegó a esa suma recorriendo la lista de vecinas** (`>` estricto), y el orden de esa lista es el de la
consulta física (no se puede saber): la calculadora reparte el empate en partes iguales y lo muestra como
probabilidad. El gen ganador reemplaza al de la planta central sólo si su suma es **mayor** que el peso de cruza del
gen que ya tenía (un rojo pesa 1, un verde 0,6). La central no se suma a sí misma.

## Tareas

1. `farming.py` + `farming_overrides.py` + `tests/test_farming.py`: lee la caché, escribe
   `games/rust/data/farming.json` y `games/rust/data/site/farming-slugs-es.json`; íconos de razas de caballo a
   `site/public/rust/farming/`. Tests de forma sin caché (sobre el JSON versionado) y contra la caché con `RUST_CACHE=1`
   (14 plantas, pesos, 10 razas, cada compostable resuelto a un objeto).
2. Motor `site/src/rust/farming/genetics.ts` (puro): parseo de genes, cruza con probabilidades, tiempos y rendimiento
   por genes, buscador (qué cruzar para llegar a un objetivo). Tests con cruzas conocidas.
3. Ruta: pestaña `farming` (`/en/rust/farming`, `/es/rust/granjas`), ficha por planta y `genetics` → `genetica`.
4. Pestaña: lista de plantas + secciones (jardineras, compost, aspersor, luces/calefactor, gallinero, colmena,
   ganado, caballos); ficha de planta; calculadora con el estado en el link (`#c=…&n=…`).
5. SEO: copia en/es (títulos con "Rust farming", "Rust genetics calculator"), prerender, sitemap, JSON-LD.
6. Navegación de Rust y Portada (herramienta nueva), servidor local, capturas en EN/ES.
7. Build + perf con las páginas nuevas; números al final de este plan.

## Resultado (2026-10-09)

- Datos: `games/rust/data/farming.json` (32 KB): 14 plantas, 5 genes, 6 jardineras, 94 compostables, gallinas,
  colmena, vacas/ovejas y 10 razas de caballo; 13 retratos webp de 64 px en `site/public/rust/farming/`.
- Decisiones:
  - El orden de las vecinas en un empate no se puede saber: todos los órdenes valen lo mismo y el empate sale como
    probabilidad. Como el mismo orden vale para los 6 casilleros, se recorren los órdenes distintos del multiconjunto
    de vecinas y se cuenta el resultado entero (dos G contra dos Y da GGGGGG o YYYYYY, nunca mezclado).
  - Las sumas van en float 32 como en el juego: cinco verdes (3,0) empatan con tres rojos (3,0), y gana el grupo que
    completa antes (3/8 los verdes).
  - Tiempos y cosecha con calidad perfecta (luz, agua, suelo y temperatura al máximo); se dice en la ficha.
  - El buscador prueba hasta 8 vecinas con repetición y corta en el primer tamaño con resultado seguro (10 esquejes:
    ~0,5 s).
  - El estado de la calculadora va en la query (`?p=&c=&n=&t=&h=`), como la de raideo (`?o=`), no en el `#hash`.
  - El decompilado es de 2024-08: Livestock (vacas/ovejas) es posterior y su genética no está; sólo se muestran sus
    datos del cliente y una frase.
- Build (`npm run build`, NODE_OPTIONS 6 GB): 99 s el comando, `vite build` 1 min 25 s, 24.328 páginas (+32), pico de
  RAM del árbol de node ~2,8 GB (con el servidor de desarrollo prendido).
- Perf (`npm run perf --only rust`, Chrome del sistema): `/en/rust/farming` 147 pedidos, 118 imágenes, 918 nodos;
  `/en/rust/farming/hemp` 33/4/183; `/en/rust/farming/genetics` 30/1/160; `/es/rust/granjas/genetica` 30/1/161. Todo
  dentro del presupuesto.
