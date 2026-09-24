# Valheim: enciclopedia en inglés y español

**Fecha:** 2026-09-24 · Pedido de ZoTaD después de cerrar Deadlock (Street Brawl y
baneos). Aprobado el mismo día.

## Qué es y por qué

Una sección `/valheim` con todo lo que se fabrica, se come, se construye y se
consigue en el juego, separado por pestañas, con los nombres oficiales en inglés
y en español y "de dónde sale" cada cosa.

El diferencial, medido en el relevamiento de sitios de Valheim del mismo día:

- En inglés physgun.com ya tiene casi todo con datos 1.0. En español no hay
  ninguna base seria, y los medios traducen cada uno a su manera ("Oro de
  sangre", "Sangre dorada"). El juego trae la tabla oficial: Bloodgold es
  **Oro sanguino**, la base de hidromiel es **Malta**.
- El Fandom está atrasado para 1.0 y la wiki al día (Weird Gloop) es no
  comercial. Sacar los datos del juego evita las dos cosas.

La despensa (repo `ZoTaD/VikingsProyect`) no se toca: sigue siendo la página del
stock del server. De ahí sólo se reusa la idea de las recetas.

## Decisiones

| Tema | Decisión |
|---|---|
| Fuente de datos | Los archivos del juego instalado, leídos con UnityPy (+ TypeTreeGeneratorAPI) desde un entorno aislado en `games/valheim/.venv`. No se modifica la instalación. |
| Actualización | **A mano, una corrida por parche** (pedido de ZoTaD: los parches de Valheim salen poco). Sin GitHub Action. |
| Idiomas | Inglés y español, de la tabla oficial del juego (`localization*` en `resources.assets`, 36 idiomas). |
| Dirección visual | **Mezcla** de las dos maquetas: la tabla ordenable y los filtros de la B para las pestañas, la ficha de cada objeto con el marco de madera de la A. |
| Barra de Vestigo | No se toca; sólo toma los colores del juego, como en PoE2. |
| Fuentes | Averia Serif/Sans Libre (OFL, del juego y de Google Fonts). **Norse** trae "Copyright 2011 Joel Carrouche, all rights reserved": sólo se usa si se confirma que la licencia lo permite; si no, un reemplazo libre. |

## Qué hay en el juego (medido el 2026-09-24, Unity 6000.0.75f1, 1.0)

- Casi todo vive en `valheim_Data/StreamingAssets/SoftRef/Bundles/`: 799
  bundles, el grande `c4210710` (756 MB, 114 mil GameObjects) con objetos,
  piezas y criaturas; los scripts en `86c3d76e`; los íconos (1.513) en
  `6a33a62`; la interfaz (paneles de madera, botones, pestañas, casillas) en
  `9fe0899c`. Audio (`61c598bb`) y videos (`f9285044`) no hacen falta.
- Todos los bundles menos esos dos cargan en ~25 s y se recorren en ~32 s.
- Componentes que se leen: `ItemDrop` (1.710), `Recipe` (481), `Piece`,
  `CraftingStation`, `CookingStation`, `Fermenter` (20 hidromieles), `Smelter`
  (23: horno, fundición, alto horno, molino, rueca, refinería…), `CharacterDrop`
  (botín con probabilidad y cantidad), `Pickable`, `DropOnDestroyed`,
  `MineRock5`, `Trader` (6), `ObjectDB`, `SpawnSystemList` (criaturas por
  bioma) y `ZoneSystem` (vegetación por bioma).
- Los biomas son una máscara de bits: 1 Praderas, 2 Pantano, 4 Montaña, 8 Bosque
  negro, 16 Llanuras, 32 Tierra de Ceniza, 64 **Norte profundo**, 256 Océano,
  512 Tierras Nubladas.

Pendiente de resolver en el extractor:

- Algunos aparecedores tienen todos los bits (Carbonizados, Elaking, Jotun en
  todos los biomas): son eventos o apariciones especiales y hay que filtrarlos.
- La vegetación de Tierra de Ceniza, Tierras Nubladas y Norte profundo casi no
  está en la lista principal de `ZoneSystem`: rastrear dónde se define. Lo que
  no esté en el juego se completa desde la wiki, marcado como tal.

## Las tres partes

### 1. Extractor (`games/valheim/pipeline/`)

Python, se corre a mano:

```
cd games/valheim && .venv/Scripts/python -m pipeline.extract
```

Escribe:

- `games/valheim/data/*.json`: `items`, `recipes`, `pieces`, `conversions`,
  `creatures`, `sources` (recolectables, minerales, destructibles),
  `traders`, `biomes`, cada nombre y descripción como `{ en, es }`.
- `games/tft/ui/public/valheim/icons/*.webp` y `public/valheim/ui/*.webp`.
- Un `meta.json` con la versión del juego y la fecha de la corrida.

Caché de bundles leídos en `games/valheim/.cache/` (ignorado por git).

### 2. La sección (`/es/valheim`, `/en/valheim`)

Pestañas: **Comidas · Hidromieles · Armas · Armaduras · Herramientas y
munición · Construcción · Materiales · Criaturas**.

- Cada pestaña: tabla ordenable con las columnas propias de su tipo (vida,
  aguante, eitr y duración en comidas; daño por tipo en armas; armadura en
  armaduras; confort en construcción), filtros por bioma (los nueve), por
  estación y por nombre.
- Cada objeto: su ficha en `/valheim/<pestaña>/<slug>` con el marco de madera
  del juego:
  - receta con ingredientes enlazados y el costo de cada mejora de calidad;
  - **De dónde sale**: qué criatura lo suelta y con qué probabilidad, dónde se
    recolecta o se mina y en qué bioma, en qué estación se hace o se convierte,
    quién lo vende y a cuánto;
  - **Se usa en**: las recetas que lo piden.
- Hidromieles: la cadena entera, ingredientes → Malta en el Caldero de aguamiel
  → Fermentador (40 min) → ×6.
- Slugs desde el nombre en inglés, como en Deadlock y PoE2.
- Prerender, sitemap y metadatos por ficha, como PoE2.
- En la portada, Valheim pasa de "Pronto" a activo.

### 3. Estilo

Las fuentes del juego, los paneles de madera (`woodpanel_*`) como
`border-image`, las casillas de inventario (`item_bkg`), las pestañas del juego
(`button_tab*`) en la sub-navegación y los colores de las barras de comida.
Sin filos de color en tarjetas ni filas (regla de ZoTaD).

## Orden de entrega

1. Extractor y datos.
2. **Comidas e Hidromieles con su ficha**, en localhost para que ZoTaD las
   revise.
3. El resto de las pestañas.
4. SEO, portada y publicación.

## Maquetas

`scratchpad/valheim/maquetas` de la sesión ec37d55a (servidor
`valheim-maquetas`, puerto 5192): `a-mesa.html` (panel de crafteo del juego) y
`b-codice.html` (tablas y filtros). ZoTaD eligió la mezcla.
