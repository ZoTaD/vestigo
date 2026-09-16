# Deadlock, dirección A "Cuadrícula" (2026-09-16)

## El pedido

ZoTaD, el 2026-09-15: la página de Deadlock "no tiene correlación". Había bordes
pronunciados al lado de bordes suaves, varias tipografías y tamaños sin una
razón, botones circulares junto a botones cuadrados. Se presentaron tres
direcciones para la tier list de héroes, con datos reales, y eligió la A.

Las tres maquetas están en el canvas
https://claude.ai/artifact/DDcJS7VN3BGgPtnFMNGDSJ (artboards "A · Cuadrícula",
"B · Tabla" y "C · Filas").

## Las reglas de la dirección A

- **Un solo radio: 4 px.** Cajas, controles, tiles, retratos y lo que antes era
  pastilla. Vive en `tokens.css`, en el bloque de Deadlock (`--radius`,
  `--radius-lg`, `--radius-pill`). La portada conserva sus pastillas.
- **Dos tipografías.** Big Shoulders Display para títulos, letras de tier y
  cifras grandes. Barlow para el resto, Barlow Condensed para cifras en columna.
- **Pocos tamaños de texto.** 44 px el título, 40 px la letra de tier, 20 px los
  títulos de caja, 18 px el winrate, 15 y 12 px el texto, 11 px los rótulos.
- **Un control por función.** Las pestañas del juego son pestañas subrayadas.
  La banda es un control segmentado rectangular con la opción elegida rellena.
- **Sin filos de color** en tarjetas ni filas. El color del héroe tiñe el fondo
  del retrato; el parche vigente del registro se marca con un tinte.

## La tier list

- Cada banda es una fila con un bloque de 88 px a la izquierda: la letra, cuántos
  héroes tiene y el rango de winrate que la define ("A · 10 heroes · 51.5–53%").
  Los cortes salen de `TIER_CUTS` en `deadlockData.ts`, los mismos que usa
  `tierOf`, y un test lo asegura.
- La insignia de la banda ya no se repite en cada fila: el selector de arriba la
  muestra una vez.
- El tile mide 96 px en las cinco bandas: retrato de 56 px, nombre, winrate y
  uso. Dificultad y tendencia son cuadrados de 16 px en las esquinas del retrato,
  dibujados en SVG.
- En un teléfono de 375 px entran tres héroes por fila.
- La pestaña se llama "Heroes" / "Héroes" en vez de "Meta".

## Qué cambia en las otras pestañas

La cáscara es compartida, así que Objetos, Rangos, Escalera, Parches, Jugador y
la página de héroe ya tienen las pestañas subrayadas, el selector nuevo y el
radio único en todo lo que usa los tokens. Lo que cada una tiene escrito a mano
en `codex.css` (chips redondos, filos de color en las filas de Objetos) se
rediseña cuando le toque su turno, una pestaña por vez.
