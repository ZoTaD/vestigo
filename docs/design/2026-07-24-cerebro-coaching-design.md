# El cerebro: hábitos del jugador contra su banda y la de arriba

**Fecha:** 2026-07-24
**Estado:** aprobado, pendiente de implementación

## El problema

El perfil ya dice **qué pasó** (posición promedio, comps más jugadas, rachas) y el
analizador dice **qué falló en una partida**. Ninguno de los dos contesta la
pregunta por la que un jugador vuelve: **qué hacen distinto los que están un
escalón más arriba**.

Las bandas de rango no acumulativas se construyeron justamente para esto
(`docs/design/2026-07-23-meta-por-banda-design.md`), y hasta ahora solo alimentan
la tier list. `EXCLUSIVE` en `bands.ts` particiona la escalera, así que "la banda
de arriba" es una cosa bien definida:

```
silver-below → platinum-gold → diamond-emerald → apex
```

## Verificación de la premisa

Medido sobre el store real (15.087 partidas en disco; **4.789 partidas y 38.312
tableros del parche 16.14**, bastante más que las 3.564 del último build).

### 1. Comparar prevalencias entre bandas NO está confundido

La duda que podía tirar abajo el diseño entero: si las bandas de arriba juegan
mejor, sobreviven más rondas y **cualquier** hábito medido sobre el tablero final
se contamina con "duró más".

No pasa, y la razón es estructural: **las bandas se arman por lobby completo**, así
que cada una tiene exactamente un 1.º, un 2.º, etc. La mezcla de posiciones medida
es **12,5% en cada puesto en las cuatro bandas**. Consecuencia verificada
numéricamente: **el 100% de cada brecha sobrevive** al condicionar por posición.
No hace falta estratificar.

La duración de partida tampoco confunde: 2.049-2.129 s y ronda final 30,1-31,3
entre bandas (~1%).

### 2. Las señales son grandes y monótonas

| hábito | apex | diam/esm | plat/oro | plata- |
|---|---|---|---|---|
| oro sobrante (promedio) | 9,00 | 9,40 | 14,39 | 22,38 |
| nivel | 8,56 | 8,46 | 8,19 | 7,80 |
| carry sin 3 ítems | 1% | 1% | 2% | 7% |
| unidades en tablero | 8,69 | 8,54 | 8,28 | 7,86 |
| 3★ barata (reroll) | 36% | 42% | 54% | 50% |
| rivales eliminados | 0,79 | 0,79 | 0,79 | 0,76 |

**"Rivales eliminados" es constante por construcción** (la suma de eliminaciones
de un lobby es fija). Es un hábito de cero información y queda fuera del
vocabulario: es exactamente la clase de métrica vacía que ya nos costó un rato con
Aatrox.

### 3. Los pares aportan poco — por eso no hay minero de reglas

Se midió co-ocurrencia (lift) e interacción de posición (observado − aditivo) para
todos los pares del vocabulario, por banda. Las interacciones caen entre **−1,3 y
+0,9** posiciones y casi todas son **saturación**: no se puede quedar peor que 8.º.
La más fuerte, `carryShort + lowLevel` (−1,0 a −1,3), es **sub-aditiva** — los dos
hábitos explican lo mismo dos veces.

No aparece ninguna regla escondida. Con 1.032-17.464 tableros por banda, minar
itemsets arbitrarios produciría reglas que suenan bien y no son nada. **Las reglas
de asociación quedan para la fase 2**, cuando el store sea ~10x. El lenguaje
(soporte, confianza, lift) sí se usa para reportar.

### 4. Plata alcanza para esto aunque no alcance para la tier list

`silver-below` tiene **1.032 tableros** del parche: poco para 50 comps, de sobra
para una tasa escalar (±1,5% sobre una proporción del 33%). **El cerebro le habla
a Plata aunque su `comps.silver-below.json` salga vacío.** El cerebro necesita
muchísimos menos datos que la tier list porque mide un puñado de escalares, no 50
comps × 8-24 unidades.

### 5. El cliente ya tiene todo

`MatchView` ya carga `level`, `goldLeft`, `lastRound`, unidades con ítems y
`isCarry`, y `compKey` por partida. **No hay que tocar la Edge Function, la API ni
el esquema de Postgres.**

## Lo que NO es este cambio

- **No toca el pipeline de comps ni la tier list.** Se agrega un agregador nuevo al
  lado de los que ya existen.
- **No toca la API.** Todo lo que necesita el cliente ya viaja.
- **No mina reglas de asociación de tamaño arbitrario.** Ver §3.
- **No agrega hábitos de historial** (forzador vs flexible): los Player Tags ya los
  cubren, y medirlos del lado de la banda exigiría agrupar por jugador, donde cada
  uno aporta 1-8 tableros.

## Decisiones tomadas

| Decisión | Elección |
|---|---|
| Unidad de análisis | El **historial** (~20 partidas), no una partida suelta |
| Contra qué se compara | **Tu banda y la de arriba** (una sola, no el techo) |
| Dónde se define un hábito | **Una sola vez**, en el paquete `analysis` |
| Formato de publicación | **Un `habits.json` con las 4 bandas**, no uno por banda |
| Cuándo dispara un hallazgo | **Tres compuertas**, todas obligatorias |
| Orden de los hallazgos | Por **posiciones recuperables**, no por tamaño de brecha |
| `buildSplits` | **Se absorbe** dentro del cerebro |

## Diseño

### 1. `analysis/src/habits.ts` — la definición, una sola vez

Predicados puros sobre una forma mínima que las dos representaciones del
repositorio pueden satisfacer:

```ts
export interface HabitBoard {
  placement: number;
  level: number;
  goldLeft: number;
  units: { id: string; stars: number; cost: number; items: string[] }[];
  /**
   * Hechos que no se leen del tablero solo: ser disputado es un hecho del lobby,
   * y qué comp jugaste depende de la tier list de la banda. Los rellena quien
   * llama — el pipeline tiene los lobbies agrupados y el cliente tiene la partida
   * cruda — para que todos los predicados sigan siendo puros sobre una sola forma.
   */
  contested?: boolean;
  compExact?: boolean;
  compTier?: string;
}
```

El `Board` del analizador ya cumple la parte obligatoria tal cual. El
`Participant` del pipeline necesita un adaptador de tres líneas
(`character_id`→`id`, `tier`→`stars`, `itemNames`→`items`).

Un hábito cuyo campo opcional llegue `undefined` **no se evalúa** (no cuenta como
falso): así una banda sin comps publicadas saltea los tres hábitos de comp en vez
de reportar que nadie juega off-meta.

**Por qué acá y no una copia en cada lado:** la razón de existir del paquete
`analysis` es ser código sin runtime que corre igual en el navegador, en Node y en
los tests. Si un hábito se define dos veces, el día que una copia cambie el cerebro
compara peras con manzanas **sin que nada falle**. Es peor que el caso de
`bands.ts`, porque ahí son tablas de constantes que un test puede comparar entre
sí; acá son funciones y no se pueden comparar.

**Vocabulario v1** (solo hábitos por tablero):

| hábito | corte | de dónde sale |
|---|---|---|
| `hoardsGold` | oro ≥ 26 | `calibration.gold.wastedFrom` |
| `lowLevel` | nivel ≤ 7 | `LEVEL_SPLIT` de `analyzer.ts` |
| `carryShort` | carry con <3 ítems | `FULL_ITEMS` de `calibrate.ts` |
| `rerolls` | alguna 3★ de costo ≤3 | mecánica del juego |
| `contestedCarry` | tu carry lo lleva otro del lobby | `findContested` |
| `offMeta` | el tablero no matchea comp de la banda | `matchComp` |
| `lowTierComp` | comp de tier C o D | `tierComps` |

Los últimos tres necesitan tres campos nuevos en `MatchView` (`contested`,
`compExact`, `compTier`), que el cliente ya puede calcular con lo que recibe.

**Un hábito no habla en todas las bandas, y está bien.** `carryShort` aparece en el
0,8% de los tableros de apex: la compuerta de prevalencia lo silencia ahí y solo
habla de Platino para abajo, que es donde llega al 2-7%. Es el comportamiento
correcto, no un bug para "arreglar" bajando el umbral.

### 2. `pipeline/src/aggregate/habits.ts` — la medición por banda

Corre los mismos predicados sobre los tableros de cada banda y publica
`games/tft/data/habits.json`:

```json
{
  "generatedAt": "...", "patch": "16.14", "patchLabel": "17.7",
  "bands": {
    "platinum-gold": {
      "boards": 4168, "matches": 521,
      "habits": {
        "hoardsGold": { "rate": 0.213, "avgWith": 5.22, "avgWithout": 4.31, "n": 888 }
      }
    }
  }
}
```

**Un archivo con las cuatro bandas, no uno por banda.** Es una desviación
consciente de `bandPath`: el panel necesita **dos bandas a la vez**, y con el
patrón actual habría que bajar dos archivos de ~450 KB para leer treinta números.
Así son unos pocos KB en un fetch.

El orden de las bandas se fija con un `BAND_LADDER` explícito en `bands.ts`,
espejado en `ui/src/bands.ts` y cubierto por el test que ya compara las dos copias.

El build imprime la prevalencia de cada hábito por banda en consola, igual que ya
imprime la `C` del encogimiento: un hábito que se sale de la ventana se ve sin ir a
buscarlo.

### 3. `analysis/src/coach.ts` — las tres compuertas

Un hallazgo aparece **solo si pasa las tres**:

1. **Es una elección, no supervivencia** — prevalencia de la banda entre **5% y
   85%**. Es el filtro que mata a `itemsWasted` (≥5 ítems fuera del carry:
   presente en **84-95%** de los tableros con un efecto aparente de −2,2 a −2,8
   posiciones, porque mide *haber sobrevivido lo suficiente para tener ítems
   puestos*).
2. **La banda de arriba difiere de verdad** — diferencia de prevalencia **≥ 5
   puntos porcentuales** y **≥ 2 errores estándar**, con **≥ 500 tableros** en cada
   banda.
3. **Y te paga en tu propia banda** — el hábito cuesta **≥ 0,3 posiciones** medido
   dentro de tu banda, **≥ 2 errores estándar**, y **en la misma dirección** que
   apunta la compuerta 2.

**El error estándar no necesita una constante inventada.** Como las posiciones son
uniformes 1-8 dentro de cada banda —consecuencia directa de que las bandas son
lobbies enteros, verificado arriba— la desviación estándar del placement es
conocida: **≈2,29**. Entonces
`ee = 2,29 · √(1/n_con + 1/n_sin)`, y el costo tiene que superar `2·ee`. Eso
reemplaza al mínimo de tableros por lado, que era un número redondo que además
dejaba afuera a `carryShort` en Plata (7,5% de 1.032 = 77 tableros, pero con un
costo de 1,97 posiciones: 7 errores estándar).

Los pisos prácticos (5pp, 0,3 posiciones) son "¿vale una frase?", no
"¿es real?" — la significancia la cubre el `2·ee`. Van como constantes con su
porqué en el comentario, igual que `MIN_LIFT` en `metaGap.ts`.

**El reroll es el caso que obliga a la compuerta 3:**

| | apex | diam/esm | plat/oro | plata- |
|---|---|---|---|---|
| % que rerollea | 35,5% | 41,9% | 53,6% | 50,0% |
| lo que rinde en su propia banda | −0,41 | −0,49 | −1,07 | −1,37 |

La banda de arriba rerollea menos (compuerta 2 ✓) pero rerollear **mejora** tu
posición dentro de cada banda, y más cuanto más abajo estás (compuerta 3 ✗, signos
opuestos) → **no dispara**. Una implementación que lo haga disparar está rota.

**Devuelve id + números, sin prosa**, como los Player Tags y no como `Finding`. Es
la convención que el proyecto ya fijó para lo que se dibuja en el perfil: `Finding`
trae `title`/`detail` ya redactados desde `copy.ts`, mientras que acá la copia vive
en `i18n.ts` con la pantalla que la muestra. Cada hallazgo imprime los cuatro
números que lo respaldan (tu tasa, tu banda, la de arriba, el costo) y la muestra
de cada uno.

### 4. Panel (`ProfilePanel.tsx`) — reemplaza a `SplitRows`

Cada hallazgo, una fila con tres cifras y su muestra:

> **Te quedas con oro en el banco**
> Tú **45%** de tus partidas · Platino/Oro **21%** · Diamante/Esmeralda **13%**
> *En tu banda, caer con 26+ de oro cuesta 0,9 posiciones (n=4.168 tableros).*

**Orden**: por `(tu tasa − tasa de la banda de arriba) × costo en tu banda`, o sea
una estimación de cuántas posiciones ganarías cerrando esa brecha. No por tamaño de
brecha, que premiaría diferencias grandes y baratas. Tope de **3**, el mismo
`MAX_LISTED` de `metaGap`.

**Estado vacío con inventario**: si nada dispara, dice "en lo que medimos, tus
hábitos ya se parecen a los de la banda de arriba" **más la lista de qué se midió**.
Un vacío sin inventario parece un error.

**`buildSplits` se absorbe**: sus dos cortes (oro, nivel) pasan a ser dos hábitos
del vocabulario. El perfil no puede mostrar dos análisis del oro con números
distintos compitiendo entre sí.

### 5. Copia (`i18n.ts`, EN/ES)

Toda la prosa en `i18n.ts` y solo ahí. **Español neutro latinoamericano, sin
voseo**: "te quedas", no "te quedás".

## Bordes

| situación | qué pasa |
|---|---|
| menos de 8 partidas | no se dibuja; misma vara que los Player Tags |
| jugador de apex | no hay banda de arriba: compara contra sus pares y lo dice |
| banda sin tableros para un hábito | ese hábito se saltea; no se adivina |
| banda sin comps publicadas (Plata) | los 3 hábitos que dependen de la tier list se saltean; el resto funciona |
| `habits.json` viejo o ausente | el bloque no se dibuja, sin romper nada |
| Double Up / PvE | excluidas, como en todo `buildProfile` |

## Pruebas

- `analysis/test/habits.test.ts` — cada predicado contra tableros armados a mano.
- `analysis/test/coach.test.ts` — las tres compuertas, con **dos regresiones
  nombradas y con los números reales medidos**: el reroll **no debe disparar**, y
  `itemsWasted` al 95% debe morir en la compuerta 1.
- `pipeline/test/habits.test.ts` — la agregación sobre lobbies sintéticos.
- Test del **adaptador** `Participant → HabitBoard`: es el único punto donde las dos
  formas se tocan, y si miente el cerebro compara mal sin avisar.
- `ui/test/` — orden y tope de los hallazgos.

## Fuera de alcance

- Minado de reglas de asociación de tamaño arbitrario (fase 2, con ~10x muestra).
- Hábitos de historial (forzador vs flexible) — ya los cubren los Player Tags.
- Comparar contra el techo (apex) además de contra la banda de arriba: dar el
  consejo de apex a un jugador de Plata ya se documentó como hablarle de otro juego.
- Cualquier cambio a la tier list, al pipeline de comps, a la API o al esquema.

## Riesgo

El riesgo real no es técnico sino de honestidad: **un hallazgo que suena bien y no
es nada cuesta más confianza que no mostrar nada**. Las tres compuertas existen para
eso, y los dos casos de regresión (reroll, `itemsWasted`) están sacados de los datos
justamente porque los dos *parecen* señal fuerte y no lo son.

El segundo riesgo es la muestra de `platinum-gold` (4.168 tableros) y
`silver-below` (1.032): alcanzan para tasas, pero el costo por posición dentro de la
banda tiene menos respaldo. La compuerta de muestra mínima por hábito lo cubre, y el
número de tableros va impreso en cada fila para que el jugador lo vea.
