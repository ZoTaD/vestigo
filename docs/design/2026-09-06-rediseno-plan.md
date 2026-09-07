# Rediseño completo de Vestigo: plan de ejecución

- **Fecha:** 2026-09-06
- **Diseño de base:** `2026-09-06-como-presentamos-los-datos-diseno.md` (el
  qué y el porqué). Este archivo es el cómo, en fases que se publican una por
  una, cada una con tests en verde y verificación en el navegador.
- **Pedido de ZoTaD:** rediseño completo de portada, Deadlock y TFT, **una
  misma estética** para todo el sitio, **respetando los colores de cada juego**
  para que cada uno tenga personalidad.

---

## 1. Decisiones de diseño que fijan todo lo demás

### Una sola voz tipográfica

Hoy hay tres: la portada (Big Shoulders Display + Barlow, papel claro), TFT
(Cinzel + Cormorant Garamond, manuscrito) y Deadlock (Cinzel + Barlow). Ésa es
la razón por la que el sitio no se siente como uno.

Se unifica en **la voz de la portada**, que es la última identidad que se
diseñó a propósito para Vestigo y la única que no imita a un juego:

| Rol | Familia | Dónde |
|---|---|---|
| Titulares y cifras grandes | **Big Shoulders Display** 700–900 | Títulos de sección, KPIs, tiers |
| Texto y controles | **Barlow** 400–700 | Bajadas, tablas, botones, chips |
| Cifras en columnas angostas | **Barlow Condensed** 500–700 | Tablas densas, tarjetas de héroe |

Cinzel, Cormorant Garamond y Marcellus SC se retiran. Se hace por variables
(`--font-display`, `--font-text`, `--font-data`) reemplazando los literales en
las hojas actuales, así el cambio es un solo commit y reversible.

### Un solo sistema de superficies, tres paletas

Todo componente se escribe contra las mismas variables. Cada lugar sólo
re-declara los colores:

| Variable | Portada | TFT | Deadlock |
|---|---|---|---|
| `--bg` | papel #f2efe6 | medianoche #080d1a | negro cálido #10130d |
| `--surface` / `--surface-2` | #ffffff / #e7e2d4 | #0e1528 / #131c33 | #171b12 / #1f2418 |
| `--text` / `--text-dim` | #14140f / #6b6a5e | #e9e0cb / #9c957f | #ffefd7 / #9c9581 |
| `--accent` | oro oscuro #8a6a24 | oro #c9a24a | latón #c6a269 |
| `--accent-lit` | #b08a35 | #f0d391 | #e2c391 |
| `--accent-2` (acento raro) | — | #6f8ff5 (azul celestial) | ámbar #d4860b |
| `--good` / `--bad` | verde / rojo apagados | idem | verde almas #70f8c1 / rojo #a8442f |
| `--line` | #d8d3c4 | rgba(201,162,74,.22) | rgba(198,162,105,.22) |

Las tres paletas ya existen en el código con otros nombres (`--h-*`, `--ink`,
`--vellum`, `--gold`); los nombres viejos se conservan como alias durante la
transición para no romper las 8.600 líneas del códex.

### Una sola cáscara

- **Barra superior**: marca · Inicio · TFT · Deadlock · (buscador de jugador)
  · idioma. En móvil: marca, juego activo, buscador, menú.
- **Sub-navegación de juego**: chips en una fila scrolleable con degradado en
  el borde, 44 px de alto.
- **Cabecera de sección**: una línea (título + control principal a la derecha)
  + una línea de metadatos con "cómo se mide" plegable.
- **Rejilla de página**: `.page` (máx. 1400 px) con `.page-main` y `.page-rail`
  (rail de 300 px, fijo al scrollear, que baja arriba en móvil).
- **Pie**: enlaces en una línea, fuentes y aviso legal en texto chico.

### Primitivas

`.box` (caja con título de una palabra y bajada opcional) · `.kpis`/`.kpi`
(máximo cuatro por fila) · `.seg` (control segmentado) · `.chips`/`.chip`
(filtros) · `.tbl` (cabecera fija, ordenable, primera columna fija en móvil)
· `.bar` (barra chica al lado de un porcentaje) · `.delta` (▲ +1,8 / ▼ −0,9) ·
`.row-result` (borde izquierdo verde o rojo).

---

## 2. Fases

Cada fase termina con: `npm test` y `tsc` en verde, build de producción,
captura de escritorio y móvil de cada página tocada, commit y push. Nada se
publica a medias: si una fase no cierra en el día, se queda en una rama.

### Fase 1 · Cimientos: tokens, tipografía, cáscara, móvil

Archivos: `src/styles/tokens.css` (nuevo), `src/styles/shell.css` (nuevo),
`src/styles/primitives.css` (nuevo), `src/main.tsx` (orden de hojas),
`index.html` (fuentes), `src/App.tsx` (`data-game="tft"`, nueva cáscara),
`src/Nav.tsx`, `src/SectionHead.tsx` (nuevo), `codex.css`/`base.css`/`home.css`
(reemplazo de literales de fuente por variables; alias de colores).

1. Tokens y alias. Reemplazar literales de `font-family` por variables.
2. Barra superior nueva con buscador (abre la pestaña Jugador del juego activo
   con el texto ya escrito). Móvil: menú.
3. Sub-navegación como chips scrolleables.
4. `SectionHead` de una línea, y usarlo en las seis secciones de Deadlock y las
   cinco de TFT en lugar de `masthead`/`tool-head`.
5. Rejilla `.page` + primitivas, sin usarlas todavía en las páginas (las fases
   siguientes las adoptan).
6. Pie compacto.

Verificación: cada página existente sigue mostrando sus datos; en 420 px no
hay scroll horizontal ni pestañas cortadas.

### Fase 2 · Portada

`src/Home.tsx`, `home.css`. Buscador + último visto + "Hoy en el meta" (de
`patchMovers`, el S de la banda por defecto, el ítem con más ventaja; para TFT
la comp 1 y el ítem que más sube cuando vuelva la publicación) + bloques de
juego con CTA descriptivo + cifras de vanidad al pie.

### Fase 3 · Deadlock: Héroes y página de héroe

`Deadlock.tsx`, `DeadlockBuildCard.tsx`, `DeadlockMastery.tsx`, rutas.
Rail con "Desde el parche" y "Más jugados"; delta en tarjeta; `/deadlock/<héroe>`
como página propia con cabecera de cuatro cifras y sub-pestañas ancladas
(Build · Habilidades · Maestría · Enfrentamientos); Parches pasa a ser una caja
"Registro de cambios" dentro de Héroes (la ruta `/patches` sigue existiendo y
muestra la misma caja a pantalla completa).

### Fase 4 · Deadlock: Jugador

`DeadlockPlayer.tsx`, `DeadlockPeerCard.tsx`, `DeadlockCareerHeroes.tsx`.
Dos columnas con identidad arriba a la derecha, filas con borde de resultado,
cabeceras completas, "vistos recientemente", final con la lectura de la racha.

### Fase 5 · Deadlock: Objetos, Rangos, Escalera

`DeadlockItems.tsx`, `DeadlockItemCharts.tsx`, `DeadlockRanks.tsx`,
`DeadlockPlayerLadder.tsx`. Chips y cabecera fija en Objetos, cuadrantes y
hover en el gráfico; "¿tu rango?" y toggle % en Rangos; fila-enlace, buscador
y filtro por héroe en Escalera.

### Fase 6 · TFT: Meta, Unidades, Ítems, Ladder, Jugador

`MetaView.tsx`, `UnitsView.tsx`, `ItemsView.tsx`, `LadderView.tsx`,
`PlayerView.tsx`, `ProfilePanel.tsx`. La misma cáscara; los filtros (set,
banda) como chips en una caja arriba; las comps como filas compactas (número,
nombre, unidades, cuatro cifras) con el detalle a un clic; Unidades e Ítems
como `.tbl` ordenable; Jugador con el mismo panel de dos columnas que
Deadlock.

### Fase 7 · Limpieza

Retirar Cinzel/Cormorant/Marcellus de `index.html`; borrar reglas muertas que
queden sin selector en el DOM (medido con una pasada por cada página);
`theme-color` y `og.jpg` acordes; actualizar el README del diseño.

---

## 3. Lo que no cambia

- Los datos, el pipeline, las rutas públicas y los textos de los tests.
- Los componentes de contenido pesados (tarjeta de build, informe de partida,
  gráficos) se re-pintan por variables y se reordenan; no se reescriben.
- La identidad de cada juego: TFT sigue siendo oro sobre medianoche y Deadlock
  latón y ámbar sobre negro cálido. Lo que se unifica es la forma, no el color.
