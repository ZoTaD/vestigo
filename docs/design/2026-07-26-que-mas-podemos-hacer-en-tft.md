# Qué más podemos hacer en TFT, y qué no

**Fecha:** 2026-07-26
**Estado:** investigación, sin implementar. Se escribe al cerrar TFT para empezar Deadlock.

Investigado navegando MetaTFT y Mobalytics, y verificado contra **nuestros datos reales**:
las 22.016 partidas del store y los campos que produce el pipeline.

## Lo primero: qué trae de verdad una partida

Verificado campo por campo sobre una partida ranked del Set 17. Esto es todo lo que hay:

| Nivel | Campos |
|---|---|
| Partida | `game_datetime`, `game_length`, `game_version` (parche), `queue_id`, `tft_set_number`, `tft_set_core_name` |
| Tablero | `placement`, `level`, `gold_left`, `last_round`, `players_eliminated`, `time_eliminated`, `total_damage_to_players`, `win`, `companion`, `missions`, `riotIdGameName`/`Tagline` |
| Unidad | `character_id`, `itemNames`, `rarity`, `tier` (estrellas) |
| Trait | `name`, `num_units`, `style`, `tier_current`, `tier_total` |

Y lo nuestro encima: la banda de rango de la partida, `rank_snapshots` (LP en el tiempo) y
el ladder de challenger.

## Lo que NO se puede, con la evidencia

- **Posicionamiento en la grilla.** El payload no trae coordenadas. Buscado el string crudo
  en un archivo entero: no aparece `hex`, `position` ni `coord`. ZoTaD ya lo había
  descontado y es correcto.
- **Tier list de aumentos con datos propios.** El campo `augments` **no existe en ninguna de
  las 22.016 partidas**, ni en el Set 17 ni en los sets 4, 13, 14, 15 y 16 que hay en disco.
  Y hay una pista fuerte de que no es un problema nuestro: **la tier list de aumentos de
  MetaTFT la mantiene a mano su equipo de esports**, firmada por un jugador (SpencerTFT) y
  actualizada "hace 10 días", mientras sus comps se actualizan cada pocos minutos. Con 2
  millones de partidas por día, si el dato estuviera en la API la sacarían de ahí.
  Podríamos hacer una lista editorial, pero eso es exactamente lo que este producto decidió
  no hacer: publicar opiniones de otro en vez de mediciones propias.
- **Historia ronda a ronda**: curva de oro, vida, cuándo se rerolleó. Solo existe
  `last_round`, el final. Sin eso no hay "econ curve" ni análisis de rolldown.
- **Quién pegó a quién, y el daño recibido.** Hay daño *hecho*, no el recibido ni el rival.
- **Los componentes del carrusel.** Solo los ítems finales, no cómo se llegó.
- **La etiqueta "Bad MMR" de MetaTFT** (rivales con menos LP). Necesitaría el rango de los
  7 rivales de cada partida; solo lo tenemos para challenger.
- **Overlay en vivo.** Además de necesitar Overwolf, el coaching en vivo está prohibido por
  las reglas de terceros de Riot. Ver [[riot-tft-third-party-limits]].

## Lo que SÍ se puede — y lo barato está en lo que ya calculamos

El hallazgo más útil de esta investigación: **`comps.json` ya trae campos que la UI no
lee**. Cada comp guarda `avgLevel`, `placementVar`, `archetype`, `rerollTarget`,
`starTargets`, `itemPriority`, `winners`, `losers`, y por unidad `frequency`, `core`,
`avgStars`, `threeStarRate`, `avgItems`, `itemizedRate`. Es el mismo patrón que ya pasó dos
veces en este proyecto: el dato estaba y nadie lo leía.

Ordenado por lo que rinde dividido lo que cuesta:

1. **Distribución de nivel por comp.** tactics.tools la tiene y es lo que más se extraña:
   "nivel 8 → 1,9% de las partidas, puesto 6,65; nivel 9 → 98,1%, puesto 3,82". Contesta
   *hasta dónde hay que subir*. Tenemos `level` en cada tablero y ya sabemos qué comp jugó
   cada uno. **Es agregación pura, sin datos nuevos.**
2. **Etiqueta de consistencia.** tactics.tools dice "Consistent" / "High Win %".
   Nosotros **ya calculamos `placementVar`** por comp para el encogimiento y no lo
   mostramos. Una comp de varianza baja es una comp segura, y el número ya está.
3. **Los tres campos capturados y nunca leídos**: `total_damage_to_players`,
   `players_eliminated`, `time_eliminated`. Habilitan un ángulo que **ningún competidor
   muestra**: no "qué comp gana", sino *cómo pierde* — si muere temprano, si aguanta y no
   mata, si hace daño y cae igual. Encaja con lo que este sitio quiere ser.
4. **Breakpoints de trait que de verdad ganan.** `style` (bronce/plata/oro/cromático) se
   captura desde `e38b7fe` y no se usa. Permite decir si el 4 de un trait rinde o si hay
   que llegar al 6.
5. **Nombre de arquetipo por nivel** ("Fast 8", "Reroll nivel 6"), que es como habla la
   gente. Sale de `avgLevel` + `rerollTarget`, los dos ya calculados.
6. **Mejores jugadores de una comp**, con nombre y región: hay `riotIdGameName`, `tagLine`
   y `placement` en cada tablero.
7. **Más Player Tags** de los de MetaTFT que sí podemos: *Good Economy* (`gold_left`),
   *Strong Frontline* (ítems en tanques), *Prefers AD/AP* (clasificando ítems del catálogo).
   Los ejes de Playstyle salen de los mismos números.
8. **Ladder más allá de challenger**: el endpoint de entries por división existe; es cuota
   de Riot, no un dato faltante.
9. **Qué cambió en este parche.** Ya medimos 16.13 vs 16.14 y encontramos que 14 de 30
   comps cambian de letra. Publicarlo es editorial *derivado de datos propios*, que es
   justo el diferencial declarado del producto, y **ninguno de los tres lo hace bien**.
10. **Minileyendas** (`companion`): MetaTFT lo acaba de lanzar y el campo lo tenemos. Poco
    valor, costo casi nulo.

## Lo que hay que aceptar

Los tres competidores tienen **app de escritorio en Overwolf**, y ahí es donde sacan lo que
la API no da. MetaTFT y Mobalytics además **curan contenido con jugadores Challenger**. No
se les gana ni en volumen (5,4 millones de comps contra nuestras ~55.000 tableros) ni en
autoridad editorial. Lo que sí podemos es leer mejor los datos que ya tenemos, que es
exactamente lo que dicen los diez puntos de arriba.

Ver también [[tft-competidores]] y [[riot-api-limites-datos]].
