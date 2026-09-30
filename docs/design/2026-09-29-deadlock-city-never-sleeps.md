# Deadlock con la estética de City Never Sleeps (piezas 2 a 5)

Fecha: 2026-09-29 · Rama `feat/deadlock-cns` · Pedido de ZoTaD: "que se sienta
adentro del juego", bordes rectos tipo periódico, papel, hojas rotas, los
colores nuevos, la ficha y la tienda iguales a las del juego, y una tarjeta con
los objetos populares que muestra el juego. Referencia visual:
https://www.playdeadlock.com/cityneversleeps y la tienda nueva (6722).

La pieza 1 (datos e imágenes al día) está en
`docs/superpowers/specs/2026-09-29-deadlock-cns-puesta-al-dia-design.md`.

## Estética (pieza 5) — `site/src/styles/deadlock-cns.css`

Una hoja aparte, cargada última en `DeadlockArea.tsx`, para poder leer y
revertir el cambio entero. No toca `tokens.css` ni `codex.css` (compartidas y
modificadas también por la rama de D2R).

- **Paleta de la página oficial**: crema `#F7E9D5` sobre `#0d0c0b`, naranja
  `#DD6638` de acento, amarillo `#FFE14D`, cian `#60CDE3`, verde `#97DA79`
  (los colores de las tres líneas del mapa nuevo). Se redefinen los tokens de
  Deadlock y también las variables viejas del códex (`--gold`, `--ink`,
  `--vellum`, `--dl-amber`); los dorados escritos a mano en hojas viejas se
  pisan con un bloque generado al final de la hoja.
- **Periódico**: esquinas rectas (radio 2px), cajas de papel oscuro con sombra
  dura de viñeta (6px 6px 0), títulos de caja sobre el pincel negro de la
  votación (`ui/backer-box.webp`), la palabra clave del título sobre una placa
  naranja torcida con la trama de tinta del juego (`ui/cns/speckle.webp`).
- **Cabeceras**: la ciudad de noche de la página oficial (`ui/cns/city.webp`)
  detrás de cada `.sechead` y del Armador, cortada abajo por el borde de papel
  rasgado (`ui/cns/torn-edge.webp`).
- **Tier list**: cada letra en una placa del color de una línea (S naranja, A
  amarillo, B verde, C cian, D tostado) con canto rasgado (`rough-edge`) y
  trama de puntos; retratos recortados con las máscaras de fin de partida;
  tarjetas que se levantan y se tuercen al pasar el mouse; bloques que suben de
  a uno al cargar.
- **Grano de película** del juego sobre toda la sección, apenas animado.
- `prefers-reduced-motion` apaga grano animado, entradas y giros.
- Sin filos de color en tarjetas (regla de ZoTaD): el color va en placas,
  tintes y cifras.

## Ficha del objeto (pieza 2)

`DeadlockItemCard.tsx` + CSS citado de `citadel_tooltip_mod_details.vcss`
6722: papel pintado por familia con el borde rasgado del juego
(`tooltip_backer_*` con su `opacity-mask` horneada en `ui/cns/tooltip-*.webp`),
cabecera de pincelada sin color de fondo, nombre a 36px (el juego usa Oracle,
paga y fuera del bucket; va VN Reaver), componentes sobre offBlack.

**Línea de popularidad** ("Adquirido durante la fase media en el 30 % de las
partidas", texto de `citadel_main_spanish`) con la cara del héroe: sale cuando
la página tiene un héroe (`PopularHeroContext` en `deadlockPopularData.ts`; la
dan la tarjeta de build y la tarjeta de Populares).

## Tienda nueva (pieza 3) — `DeadlockShopTree.tsx`

La misma en Objetos (`DeadlockItemsShop`) y en el Armador, cada una con su
tarjeta. Barra lateral (todo / arma / espíritu / vitalidad, pestañas del
juego), tres columnas juntas con sus cabeceras "Stock up! / Big deal! / Feel
good!", pricetags nuevos por escalón, y **filtros** Físico, Espíritu, Defensa,
Movilidad, Interrupción, Misceláneo con sus sigilos, colores y subfiltros. Se
ven los objetos con cualquiera de los filtros elegidos.

`npm run build:shop-filters` (pipeline, `src/shopFilters.mjs`) calcula qué
objeto cae en cada filtro con la misma regla del juego (validada 173/173 contra
`abilities.vdata`) → `data/shop-filters.json`.

## Objetos populares (pieza 4) — `DeadlockPopularCard.tsx`

En `/deadlock/<héroe>`, con ancla "Populares": la pantalla Popular Items del
juego (cartel, tres columnas, escalones, tarjetas) con el % de partidas en que
se compra cada objeto en la fase elegida. Datos: `npm run build:popular` →
`data/popular/<id>.json` (campo `popular_items` de `/v1/assets/heroes`).

## Extra

- Caja **"En votación"** en el rail de la tier list con los stickers de los 6
  héroes nuevos y el link a la edición especial; se oculta sola el 21/10
  (`deadlockCandidates.ts`).

## Assets

- Del juego: `games/deadlock/tools/game_assets.py` (lista `STYLE`, `ui/cns/*`,
  reversos `shop/card_*`), siempre seguido de `bucket_assets.py`.
- De la página oficial: `games/deadlock/tools/cns_web_assets.py`.

## Pendiente para publicar

1. OK de ZoTaD sobre lo visual (se revisa en `localhost:5177`).
2. `publish-deadlock.yml`: sumar los pasos `build:popular` y
   `build:shop-filters` después de `catalog` (no se pudo editar el workflow
   desde la sesión).
3. Push a `main` (la pieza 1 ya está verificada en la misma rama) y una corrida
   del workflow.
