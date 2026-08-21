# Parche vigente, corte por defecto y qué unidades llevan ítems

**Fecha:** 2026-07-24
**Estado:** decisiones tomadas, pendiente de implementación
**Sigue a:** `2026-07-23-meta-por-banda-design.md` (ya implementado y desplegado)

## El problema

La tier list promedia partidas de siete parches y de cuatro meses. No lo dice en
ningún lado, y no es un detalle: entre dos parches consecutivos el meta se mueve
de verdad.

Medido sobre apex + diamante/esmeralda, comparando 16.13 contra 16.14:

| | |
|---|---|
| Comps que estaban en 16.13 y desaparecen en 16.14 | 12 de 42 |
| Comps nuevas en 16.14 | 20 |
| Movimiento promedio de las que sobreviven | **9,8 puestos** |
| Cambiaron de letra (S/A/B/C/D) | **14 de 30** |

Tres de las diez mejores comps del parche anterior directamente no existen en el
actual. Promediarlos es publicar un meta que no es el de ninguno de los dos.

Y el sesgo no se reparte parejo. El `pull` toma las últimas 20 partidas de cada
jugador; un jugador de apex las juega en dos días y uno de Plata tarda meses:

| Banda | 16.14 (actual) | 16.13 | 16.12 y anteriores |
|---|---|---|---|
| apex | 1.916 | 1.192 | 4 |
| diamante / esmeralda | 1.335 | 1.088 | 944 |
| platino / oro | 399 | 492 | 979 |
| **plata y abajo** | **81** | 285 | **1.136** |

El parche más representado en "Plata y abajo" es 16.8, **de abril**. La lista que
publicamos ahí describe el juego de hace tres meses.

## Cómo se llama el parche

`game_version` dice `<Releases/16.14>`, pero el jugador —y los competidores—
lo llaman **17.7**. No es contradicción: 16.x es la versión del cliente y 17.x es
*set punto número de parche dentro del set*.

Verificado contra nuestros propios datos: el Set 17 arranca en la versión 16.8 el
15 de abril de 2026 (el Set 16 termina en 16.7 ese mismo día), y desde ahí 16.8,
16.9, 16.10, 16.11, 16.12, 16.13, 16.14 son siete parches. **16.14 es el séptimo:
17.7**, que es exactamente lo que muestran MetaTFT y tactics.tools.

En pantalla va **17.7**. Internamente se sigue cortando por `game_version`, que es
lo que viene en el dato.

## Qué hacen los competidores

| | Corte por defecto | Ventana temporal | Filtro |
|---|---|---|---|
| MetaTFT | Platino+ | **últimos 3 días** | casillas por tier, combinables |
| tactics.tools | Diamante+ | parche actual (17.7) | desplegable acumulativo |
| Vestigo (hoy) | Apex | **ninguna** | 4 bandas aisladas |

Los dos grandes filtran por tiempo. Nosotros somos los únicos que no.

## Decisiones

| Decisión | Elección |
|---|---|
| Ventana | **Solo el parche vigente.** Una lista, no una por parche |
| Corte por defecto | **Platino+** (Platino, Esmeralda, Diamante, Máster, GM, Challenger) |
| Bandas | Se mantienen las cuatro como filtro secundario |
| Banda sin muestra | No se publica, lo dice, y se llena sola |
| Parches viejos | Quedan en disco, consultables, congelados |

### Por qué solo el parche vigente y no una ventana variable

Se evaluó estirar la ventana hacia atrás por banda hasta alcanzar un mínimo. Se
descartó: agrega umbrales y techos que ningún competidor tiene, y termina
publicando abril con un cartelito. Una regla, un parche.

### Umbral de publicación

Una banda se publica si llega a **2.000 tableros en el parche**. No es un número
inventado: el pipeline ya usa 20 tableros como mínimo para que una comp exista y
120 como fuerza de encogimiento, así que 2.000 es donde una comp mínima es ~1% de
la muestra en vez de ruido.

Con los datos de hoy:

| Banda | Tableros en 16.14 | ¿Se publica? |
|---|---|---|
| **global (Platino+)** | **~28.000** | sí |
| apex | 15.328 | sí |
| diamante / esmeralda | 10.680 | sí |
| platino / oro | 3.192 | sí |
| plata y abajo | 648 | no |

El corte por defecto sale **más grande y más fresco** que la lista de apex que
publicamos hoy (24.896 tableros de siete parches). No hay que elegir.

## Qué unidades llevan ítems

Hoy marcamos **3,87 unidades por comp** como portadoras de ítems, y el 64% de las
comps marca cuatro o más. Una llega a seis. Ningún competidor hace eso.

La causa no es el umbral sino el estadístico: usamos `itemizedRate`, que es
"llevó **al menos un** ítem". En TFT casi toda unidad termina con una sobra
encima, así que ese número no separa nada. Medido en una comp real:

| Unidad | Llevó ≥1 ítem | Promedio de ítems |
|---|---|---|
| Vex (carry) | 98% | **2,79** |
| Graves (carry) | 91% | **2,58** |
| Nunu | 82% | 2,19 |
| Morgana | 70% | **1,90** |
| Blitzcrank | 68% | **1,77** |

Morgana al 70% lleva 1,9 ítems: son restos, no una build. `avgItems` sí separa —
un receptor real está en 2,5-3,0 y uno de sobras por debajo de 2.

Lo confirma la propia data de MetaTFT: en su panel, Maokai aparece con **0 ítems
en el 50,5%** de los tableros. Ellos tampoco usan presencia de ítem como criterio.

**Regla nueva:** una unidad muestra ítems si **es carry de la comp** o si
**`avgItems >= 2,3`**.

| Regla | Unidades marcadas por comp |
|---|---|
| `itemizedRate >= 0,6` (actual) | 3,87 |
| `avgItems >= 2,5` solo | 1,51 — pero se come 21 de 84 carries |
| **carry o `avgItems >= 2,3`** | **2,11** |

El carry va siempre porque es la definición de la comp; el umbral solo agrega al
segundo portador cuando existe de verdad.

## Diseño

### 1. Pipeline

- `patch.ts`: extrae `16.14` de `game_version` y lo traduce a la etiqueta `17.7`
  con la tabla de arranque de set. Puro y con tests.
- `build.ts` filtra al parche más nuevo presente en el store. Override por
  argumento para reconstruir uno viejo.
- Nueva banda `global` (Platino+), que pasa a ser la banda por defecto y por lo
  tanto se queda con los nombres de archivo llanos (`comps.json`). Apex pasa a
  `comps.apex.json` con carga perezosa.
- Cada archivo suma `patch` (`"16.14"`) y `patchLabel` (`"17.7"`).
- La banda que no llega a 2.000 tableros escribe su archivo con `comps: []` y
  `insufficient: true`, para que la UI no reciba un 404.

### 2. UI

- El selector pasa a cinco: **Platino+** (default) · Máster+ · Diamante/Esmeralda
  · Platino/Oro · Plata y abajo.
- La cabecera muestra **Parche 17.7** junto a Conjunto 17.
- Una banda `insufficient` muestra el aviso en vez de una lista.
- `holdsItems` pasa a la regla nueva.

### 3. Archivo de parches viejos

Las partidas viejas no se borran: siguen en `games/tft/data/matches` con su
`game_version`, así que reconstruir el meta de un parche pasado es correr el
build apuntándole. Es lo que después va a alimentar al analizador de patrones.

## Fuera de alcance

- **El cerebro de patrones** (qué hacen distinto los que suben de los que se
  estancan). Es lo que sigue, y necesita esta base primero.
- Filtro por región.
- Ventana de días al estilo MetaTFT: el parche es la unidad de cambio real.

## Riesgo

Al cortar por parche, "Plata y abajo" se queda sin lista hasta que el `pull`
junte muestra del parche vigente. Es el resultado correcto —la alternativa es
seguir publicando abril— pero hay que traer más partidas de elo bajo, y ahí el
`pull` actual rinde poco: 20 partidas por jugador rinden meses de historia vieja
en vez de partidas del parche. Conviene subir jugadores por banda en vez de
partidas por jugador.
