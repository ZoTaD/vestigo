# Builds por héroe en Deadlock: recomendar contra quien llegó al mismo punto

**Fecha:** 2026-07-30
**Estado:** diseñado, sin implementar
**Pedido de ZoTaD.** Este documento lo diseña y lo verifica contra el snapshot real.

Todo lo que dice este documento con un número atrás se midió antes de escribirlo,
sobre la banda por defecto (Fantasma+) y una ventana de quince días
(2026-07-15 → 2026-07-30): **884.735 filas jugador, 75.851 partidas, 15.465.359
compras de ítems de tienda**.

El pedido llegó con una condición explícita: *"es fácil poner los objetos con mayor
winrate de un campeón y listo, tenemos que ir más allá y encontrar el porqué"*.
Este diseño es la respuesta a eso, y las tres capas que propone existen porque cada
una se midió y mejoró algo, no porque suenen sofisticadas.

## Lo que hacen los cuatro competidores

Los mismos cuatro sitios que ya se revisaron para la tier list de ítems
(`docs/design/2026-07-30-tier-list-de-items-deadlock-design.md`) publican, cuando
filtran por héroe, **el winrate crudo del ítem con ese héroe**. Es el número que
sale de dividir victorias sobre compras, y arrastra entero el problema que ya se
documentó para los ítems sueltos: **el winrate de una compra es en buena medida un
termómetro de la partida en la que se compró**.

Filtrar por héroe no lo arregla. Lo agrava, porque cada héroe tiene su propia curva
de partida y su propio momento de compra.

## Que el efecto héroe×ítem existe está medido

Antes de elegir cómo medirlo hay que saber si hay algo que medir. Descomposición de
la varianza de la sinergia héroe×ítem sobre 3.030 celdas con al menos 300 compras:

| | sd |
|---|---|
| Lo que se observa por celda | 2,43 pts |
| Lo que explica el azar (binomial) | 1,43 pts |
| **Señal real** | **1,96 pts** |

Para comparar: la señal del ítem suelto que publica `/deadlock/items` tiene sd ≈ 1,0
punto. **Con qué héroe se compra un ítem importa el doble que qué ítem es.** El `k`
que sale de esa varianza es **648 compras equivalentes**, del mismo orden que los
296-1225 de la tier list de ítems.

La señal está en todos los niveles de popularidad, no sólo en los ítems de nicho:

| Compras de la celda | Celdas | Señal real | `k` |
|---|---|---|---|
| 300-600 | 544 | 2,71 pts | 341 |
| 600-1.200 | 524 | 1,94 pts | 663 |
| 1.200-2.500 | 537 | 2,20 pts | 518 |
| 2.500-6.000 | 585 | 1,65 pts | 922 |
| 6.000+ | 840 | 1,24 pts | 1.619 |

Cobertura: mediana de **78 ítems con al menos 300 compras por héroe** (mínimo 55,
máximo 121, sobre 156 de tienda). La correlación entre el delta por héroe y el delta
global del ítem es **0,648**: la lista de un héroe está emparentada con la global
pero no es la global reordenada.

### La medición que hay que hacer con la ventana correcta

**Medido sobre la ventana del parche vigente (1,8 días) el mismo cálculo da sd real
0,49 y `k`=10.300, o sea "todo es ruido".** Es un artefacto de selección: con esa
muestra los únicos ítems que superan las 300 compras son los que compra todo el
mundo, que son justamente los que menos varían entre héroes. Verificado corriendo la
descomposición por bandas de popularidad, arriba.

**Consecuencia de diseño, no anécdota:** esta página necesita una ventana propia de
quince días **sin anclar al parche**, por el mismo motivo por el que la brecha por
rango de la tier list de héroes tiene la suya. El winrate de un héroe se mueve con el
parche; con qué ítems funciona un héroe es de su diseño y se mide más despacio.

## Capa 1 — parear contra quien llegó al mismo punto

**Cada compra se compara sólo contra jugadores del mismo héroe, en el mismo bloque de
cinco minutos, en el mismo quintil de patrimonio, que gastaron lo mismo en otra
cosa.** Es *coarsened exact matching*: se agrupa por covariables engrosadas y se
compara adentro del grupo. Sin modelo, sin ML, todo en SQL.

Esta es exactamente la alternativa que el diseño de la tier list de ítems dejó
anotada —*"comparar contra quien llegó al mismo punto (mismo patrimonio, mismo
minuto, compró otra cosa); se descartó para esta versión, no para siempre"*— y el
momento de traerla es este.

### Cómo se recupera el estado

El snapshot trae, por fila jugador, **series temporales dentro de la partida**:
`stats.time_stamp_s` como eje y `stats.net_worth`, `stats.player_damage`,
`stats.deaths`, `stats.damage_mitigated` y treinta más como valores. `items.game_time_s`
da el segundo exacto de cada compra. Un `ASOF JOIN` entre las dos cosas da el estado
del jugador en el momento de comprar.

**Tres cosas del eje de tiempo que hay que saber y que no son obvias:**

- **El paso NO es fijo.** Conviven partidas muestreadas cada 300 s y cada 180 s, más
  una cola de valores irregulares: sólo 36 de 551.940 jugadores cumplen
  `ts[i] = 180·i`. Indexar por división da mal; por eso `ASOF JOIN` y no aritmética.
- **La primera muestra siempre cae en 180 s**, y el **14,6% de las compras son
  anteriores a ella**. Son las de apertura, donde el estado es igual para todos.
- **Las series son acumuladas** (551.938 de 551.940 monótonas en daño), así que la
  resta entre dos puntos es lo que pasó en ese intervalo. Hay que **castear a BIGINT
  antes de restar**: son `UINTEGER` y una resta que da negativo revienta con
  "Overflow in subtraction of UINT32".

### Que el pareo cambia la respuesta también está medido

| | |
|---|---|
| sd del delta crudo | 3,22 pts |
| sd del delta pareado | 2,82 pts |
| Correlación entre ambos | 0,897 |
| Media \|crudo − pareado\| | 1,02 pts |
| Compras retenidas | **99,5%** |
| **Puestos del top 10 por héroe que cambian de ítem** | **137 de 380 (36%)** |

El peor héroe cambia 7 de sus 10 recomendaciones. Y lo que más se mueve no es
azaroso: **los ítems de robo de vida se desinflan a la mitad**.

| | Crudo | Pareado |
|---|---|---|
| Grey Talon + Spirit Lifesteal | +12,66 | +5,68 |
| Celeste + Bullet Lifesteal | +12,60 | +5,36 |
| Venator + Healing Booster | +10,46 | +4,58 |
| Haze + Debuff Reducer | +1,19 | −5,86 |
| Viscous + Cursed Relic | −10,81 | −4,89 |

Es el sesgo *win-more* de manual: el robo de vida se compra cuando la partida ya
venía bien. Más de la mitad de su ventaja aparente era la partida, no el ítem. **Un
sitio que ordena por winrate crudo le está recomendando a un jugador que va perdiendo
el ítem que compran los que van ganando.**

### El detalle del estimador

Para héroe `h` e ítem `i`, en cada estrato `s` = (bloque de 5 min × quintil de
patrimonio × precio):

- **tratados**: las compras de `i` en `s`.
- **controles**: las demás compras **del mismo precio** en `s`.
- efecto del estrato = tasa de victoria de tratados − la de controles.
- efecto total = promedio de los efectos, **pesado por la cantidad de tratados**
  (o sea, el efecto sobre los que efectivamente compran el ítem).

Un estrato entra si tiene **al menos 20 controles y al menos 5 tratados**. Sin ese
piso, un estrato de una sola compra produce efectos de ±100 puntos y domina el
promedio: el primer intento de esta medición dio deltas de −80 puntos por eso.
(La causa concreta fue peor y vale anotarla: **en DuckDB `/` es división real, no
entera**, así que `buy_s / 300` daba un bloque distinto por segundo y cada estrato
quedaba con una fila. El operador es `//`.)

## Capa 2 — el mecanismo, que es insumo del algoritmo y no va a pantalla

Sobre los mismos pareados, se mide **qué cambia en los seis minutos siguientes a la
compra**: muertes, economía, daño hecho, daño mitigado. Esto **no se muestra**: entra
en el cálculo de la recomendación.

La razón es estadística y es la que justifica toda la capa. **El resultado de una
partida es un bit**, y por eso el winrate por celda tiene un ruido de 1,4-2 puntos de
sd. Daño, muertes y economía son medidas continuas sobre miles de compras: mucho más
precisas. Si el mecanismo predice la victoria, sirve para estimar mejor con la misma
muestra.

**Predice.** Prueba fuera de muestra: se estima todo sobre los primeros 7 días y se
mide qué predice la ventaja real de los 8 días siguientes, sobre 2.304 celdas
presentes en las dos mitades con al menos 300 compras en cada una.

| Predictor (medido en los primeros 7 días) | Correlación con la ventaja real de los 8 siguientes |
|---|---|
| Ventaja pareada directa | 0,683 |
| **Mecanismo solo** (sin mirar quién ganó) | **0,506** |
| Mezcla, peso 0,4 al mecanismo | **0,703** |

Y adentro del mecanismo el reparto contradice la intuición:

| Componente | Correlación |
|---|---|
| **Muertes evitadas** | **0,442** |
| Economía (patrimonio ganado) | 0,231 |
| Daño hecho | 0,133 |
| Daño mitigado | 0,006 |

**Para recomendar no importa tanto cuánto pega un ítem sino cuánto evita morir.**
El daño mitigado no aporta nada y **no entra**.

La traducción de mecanismo a puntos de victoria es una **regresión lineal pooled**
sobre las ~4.200 celdas (`R²` = 0,287 sobre el winrate observado). Pooled y no por
héroe: con una regresión por héroe cada una tendría ~110 celdas y cuatro parámetros,
que es volver a tener el problema de muestra que se estaba resolviendo.

## Capa 3 — encoger hacia el mecanismo, no hacia cero

El estimador final de cada celda es:

```
ventaja = (n · pareada + k · predicha_por_mecanismo) / (n + k)
```

**El blanco del encogimiento es lo que el mecanismo predice para esa celda**, no
cero y no el efecto global del ítem. Sin evidencia propia suficiente, la mejor
apuesta no es "lo que el ítem hace en general" sino "lo que este ítem está
midiblemente haciendo en este héroe".

**Que ese sea el blanco correcto está medido, y es el resultado más lindo de esta
investigación:** el peso óptimo del mecanismo **baja monótonamente al crecer la
muestra**, que es exactamente la firma de un blanco de encogimiento.

| Compras de la celda | Sólo winrate pareado | Con mecanismo | Peso óptimo | Ganancia |
|---|---|---|---|---|
| 300-600 | 0,548 | 0,582 | **0,5** | +0,034 |
| 600-1.200 | 0,700 | 0,717 | **0,4** | +0,017 |
| 1.200-3.000 | 0,749 | 0,758 | **0,3** | +0,009 |
| 3.000+ | 0,809 | 0,817 | **0,2** | +0,008 |

La ganancia es **cuatro veces mayor donde la muestra es fina**, que es donde hace
falta. Y el `k` implícito en esos pesos (~600-700) **coincide con el `k`=648 estimado
por el método de los momentos**, por un camino completamente distinto. Se usa el `k`
estimado de los datos en cada corrida, con los pesos medidos como control: si el `k`
estimado se va lejos de ese rango, el build avisa.

## Lo que se publica

`games/deadlock/data/builds.<banda>.json`, uno por banda, con `builds.json` = la
banda por defecto — mismo criterio que `heroes.json` e `items.json`.

```ts
interface HeroItem {
  itemId: number;
  /** Compras del ítem con ese héroe. Es el denominador; no se muestra. */
  n: number;
  /**
   * Puntos de victoria sobre quien llegó al mismo punto y gastó lo mismo en otra
   * cosa. Es el número que ordena la lista y el que va en pantalla.
   */
  ventaja: number;
  /** La ventaja pareada sin encoger, para auditar el encogimiento. */
  ventajaCruda: number;
  /** Lo que el mecanismo predice por sí solo. Publicado para poder auditarlo. */
  ventajaMecanismo: number;
  /** Qué fracción de las partidas de ese héroe lo compran. */
  pickRate: number;
  /** Minuto mediano de compra con ese héroe. */
  buyMinute: number;
  /**
   * Cuánto de la ventaja es propio de este héroe y no del ítem en general.
   * No se muestra como número: dispara una palabra cuando es grande.
   */
  propio: number;
  thinData?: boolean;
}

interface HeroBuild {
  heroId: number;
  /** Filas jugador de ese héroe en la ventana. El denominador de pickRate. */
  boards: number;
  items: HeroItem[];
}

interface BuildsFile {
  generatedAt: string;
  band: string;
  /** La ventana propia, que NO se ancla al parche. Ver arriba por qué. */
  from: string;
  to: string;
  matches: number;
  provisional?: boolean;
  /** El k estimado en esta corrida. Sin él la ventaja no se puede verificar. */
  k: number;
  /** Los coeficientes de la regresión de mecanismo, por la misma razón. */
  mechanism: { damage: number; deaths: number; economy: number };
  heroes: HeroBuild[];
}
```

`k`, `mechanism`, `ventajaCruda` y `ventajaMecanismo` **se publican a propósito**: la
ventaja es el resultado de una fórmula, y sin sus entradas el lector tendría que
confiar. Es la misma regla que `costBaselines` en ítems y `winRateRaw` en héroes.

**Dos umbrales distintos, y conviene no confundirlos:**

- **`MIN_BUYS = 300`** es la marca de muestra fina, el mismo número que la tier list
  de ítems. Debajo de eso la fila lleva `thinData` y se dibuja atenuada.
- **`MIN_PUBLISH = 50`** es el piso para que la fila exista. Debajo, el ítem no
  aparece en ese héroe: cincuenta compras no alcanzan ni para que el mecanismo diga
  algo, y una fila que es 100% blanco de encogimiento no informa, decora.

Entre los dos, la fila se publica **encogida casi entera hacia lo que el mecanismo
predice**. Que una celda fina degrade a "lo que este ítem está midiblemente haciendo
en este héroe" en vez de desaparecer es la ventaja práctica de haber elegido ese
blanco, y es la diferencia con encoger hacia cero.

**`provisional`** significa lo mismo que en las otras dos pestañas —menos de
`PROVISIONAL_MATCHES` partidas en la ventana— pero acá **no lo puede disparar un
parche reciente**, porque la ventana no se ancla al parche. Si se enciende, lo que
pasó es que el snapshot dejó de actualizarse, y eso es exactamente lo que hay que
avisar.

**Tamaño estimado**: 38 héroes × ~78 ítems ≈ 2.960 filas de ~150 bytes ≈ **450 KB por
banda** sin sangría, del mismo orden que los 399-485 KB que ya pesa cada banda de
ítems. Se piden con `import()` dinámico como el resto. Si molesta, lo primero que se
poda es `ventajaCruda` y `ventajaMecanismo`, que sólo sirven para auditar — pero se
podan sabiendo que se pierde eso.

## La página

**Ruta `/deadlock/builds/<héroe>`**, con índice en `/deadlock/builds`. Slugs en
inglés como todo slug del producto, construidos con el `slugify` que ya existe en
`route.ts`.

**Una URL por héroe y no un selector, y el motivo es el posicionamiento**: "bebop
build" es lo que la gente busca, y son 38 páginas × 2 idiomas = **76 URLs nuevas con
intención de búsqueda propia**. Un selector dejaría todo eso en una sola dirección.

Lo que hay que tocar en `route.ts`:

- `DeadlockSection` suma `"builds"`, y `DEADLOCK_SECTIONS` lo incluye en el orden de
  las pestañas.
- Aparece un slot de detalle para Deadlock, que hoy no existe (TFT lo tiene vía
  `DETAIL_SECTIONS`). Va como campo propio —`dlDetail`— y no reutilizando `detail`,
  por el mismo motivo por el que `DeadlockSection` es un tipo aparte: mezclarlos
  haría que `/tft/builds` parsee a algo que no existe.
- Un héroe que no se reconoce cae en el índice de builds, no en una página en blanco.

**La forma de la página** hereda lo que ya se resolvió y no se rediscute:

```
┌ .tool-head ───────────────────────────────────────────────┐
│ Bebop · build              │ banda, muestra, ventana      │
└───────────────────────────────────────────────────────────┘
┌ 6400 ▾ (31) ────────────────────────────────────────────┐
│                              Ventaja    Uso      Minuto │
│ ⬡ Spellslinger  [espíritu]     +7,4    12,3%      31,2  │
│   PROPIO DE BEBOP                                       │
│ ⬡ Leech         [vitalidad]    −1,6     8,1%      33,4  │
├ 3200 ▾ (28) ────────────────────────────────────────────┤
│ …                                                       │
├ 1600 ▸ (24) ────────────────────────────────────────────┤
├ 800  ▸ (19) ────────────────────────────────────────────┤
└─────────────────────────────────────────────────────────┘
```

- **`.tool-head`**, la clase genérica que se creó para esto en la pestaña de ítems.
- **Grupos plegables por precio**, 6400 y 3200 abiertos, con el contenido montado
  aunque esté plegado para que Ctrl+F y Google lo encuentren.
- **Tres números por fila: `Ventaja`, `Uso`, `Minuto`.** "Ventaja" y "Uso" son las
  palabras que ya usan las otras dos pestañas. Si un rótulo necesita explicación,
  está mal puesto.
- **`propio` es una palabra, no un número** ("Propio de Bebop"), y sólo cuando es
  grande. El umbral sale de la distribución real igual que los de Difícil/Subiendo:
  se calcula al construir y se elige el corte que etiquete alrededor de un quinto de
  las filas. Que la mayoría no tenga etiqueta es lo que hace que la etiqueta se vea.
  El número queda en el JSON y en el tooltip.
- **Ningún gráfico en la primera versión.** Los dos de la pestaña de ítems se
  construyeron después de verificar que decían algo; acá todavía no se verificó nada
  equivalente, y dibujar por simetría es cómo se llega a un gráfico decorativo.

## Infraestructura

- **`npm run build:builds`**, al lado de `build:heroes` y `build:items`.
- **Se construyen las tablas una sola vez para las cuatro bandas**, con `tier` como
  columna, y se agrega por banda. Reconstruirlas por banda cuadruplicaría el trabajo
  caro: medido, `estado` tarda ~20 s y `compra` ~20 s, mientras el `ASOF JOIN` tarda
  2,4 s y las agregaciones ~2 s. **Total estimado ~90 s para las cuatro bandas.**
- El proceso necesita `--max-old-space-size`, como ya lo necesita `catalog`.
- La Action lo corre **sin `continue-on-error`**: es la fuente de la pestaña, igual
  que `build:heroes` y `build:items`.
- `netlify.toml` **ya cubre `games/deadlock/data`**. No hay nada que tocar ahí, y es
  la trampa que ya se pagó dos veces.
- `sitemap.ts` suma `/deadlock/builds` y las 38 páginas de héroe en los dos idiomas.

## Tests

- **La función que arma el archivo, pura y probada sin red**, como `heroesFileFrom` e
  `itemsFileFrom`: es donde vive todo el criterio.
- **El estimador pareado, con datos sintéticos donde la respuesta se conoce**:
  construir un caso con confundido conocido (un ítem que sólo se compra yendo
  ganando) y verificar que el pareo lo desarma y el crudo no. Es el único test que
  prueba que el método hace lo que dice.
- **Los pisos de estrato** (≥20 controles, ≥5 tratados): un test con un estrato de
  una sola compra que verifique que no produce un efecto de ±100 puntos. Este test
  existe porque ese bug ya ocurrió.
- **El umbral de la etiqueta `propio`**, contra los archivos publicados: que etiquete
  alrededor de un quinto de las filas y no la mayoría.
- **Que ningún ítem de coste 9999 sobreviva**, como en ítems — el filtro de modo vive
  en `snapshot.ts` y lo comparten los tres pipelines.
- `bands.test.ts` ya compara las tablas de banda contra los archivos escritos; este
  entra en el mismo mecanismo.

## Lo que deliberadamente no entra

- **Recomendación secuencial tipo el paper de Dota 2** (RNN/Transformer sobre el orden
  de compras, [arXiv:2201.08724](https://arxiv.org/abs/2201.08724)). **Recomienda
  imitando**: predice qué va a comprar el jugador, no qué le conviene. Copiaría el
  meta en vez de evaluarlo, que es lo contrario de lo que este producto vende.
- **Un modelo tipo WPA** como el de Statlocker. Ya se descartó para la tier list de
  ítems y el motivo no cambió: pide dos data scientists y ocho meses, y no se puede
  publicar entero en un párrafo, que es nuestra ventaja real.
- **Daño mitigado.** Medido: correlación 0,006 con la victoria. Es ruido.
- **Daño recibido como métrica defensiva.** Medido y **está al revés de lo que
  parece**: los ítems de vitalidad muestran **+142 de daño recibido**, no menos,
  porque sobrevivir significa absorber golpes en vez de morir o desengancharse.
  Mide exposición, no protección. Es la misma familia de error que `itemizedRate` en
  TFT y la brecha por rango en ítems: un número con señal que mide otra cosa que la
  que promete su rótulo.
- **El orden de compra y las fases early/mid/late.** El `buyMinute` ubica cada ítem;
  armar una secuencia recomendada es otro problema y otra página.
- **Ítems counter.** Siguen siendo lo que pidió ZoTaD para después. El orden
  acordado era ítems → counters → builds y esto lo adelanta; los counters quedan
  pendientes igual.
- **Regresión de mecanismo por héroe.** ~110 celdas por héroe y cuatro parámetros:
  volvería a tener el problema de muestra que la capa resuelve.

## Riesgos y límites

- **El pareo controla minuto, patrimonio, héroe y precio. No controla la habilidad
  del jugador ni por qué eligió ese ítem.** Reduce el sesgo win-more —medido, a la
  mitad en los ítems de robo de vida— pero no lo elimina. Va escrito en la página de
  metodología, no sólo acá.
- **La ganancia del mecanismo es real y modesta**: 0,683 → 0,703 de correlación
  fuera de muestra. Justifica la capa por dónde ayuda (muestra fina, +0,034), no por
  el promedio. Si al implementarlo el número no se reproduce, la capa se saca y la
  página sobrevive con el pareo solo, que es donde está el 90% del beneficio.
- **La resolución temporal del estado es de tres a cinco minutos**, que es cada
  cuánto muestrea el juego. Un quintil de patrimonio es un instrumento grueso y hay
  que decirlo así.
- **El snapshot es de un competidor.** Nada nuevo; ya es el riesgo de las otras dos
  pestañas.
- **El peso del mecanismo se calibró mirando la segunda ventana.** Es un solo
  parámetro sobre 2.304 celdas y la curva es plana entre 0,2 y 0,5, así que el
  sobreajuste es despreciable — pero el `k` de producción sale del método de los
  momentos, no de esa calibración, justamente para no depender de ella.
