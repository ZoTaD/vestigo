# La tarjeta de build de Deadlock: tres builds por héroe, adentro de la tier list

**Fecha:** 2026-07-31, ampliado el 2026-08-02
**Estado:** implementado y en producción
**Pedido de ZoTaD.** Este documento lo diseña y lo verifica contra el snapshot real.

> **Lo agregado el 2026-08-02 está al final**, en "Los cuatro cambios del
> 2026-08-02": el orden de las habilidades por casilla, el orden de compras
> respetando la cadena, las etiquetas de build, y el panel de compras partido en
> early / mid / late.

Todo lo que dice este documento con un número atrás se midió antes de escribirlo,
sobre **Fantasma+ y sólo Fantasma+**: 528.551 filas jugador de 44.046 partidas para
lo de arquetipos y counters, 166.656 filas para lo de slots.

## Qué reemplaza, y por qué

**El 2026-07-30 se publicó `/deadlock/builds` y estaba mal.** Era una pestaña
aparte con un índice de héroes, una página por héroe y los ítems agrupados por
precio — o sea, una segunda tier list de ítems. Lo que se había pedido es otra
cosa: **que al apretar un héroe en la tier list aparezcan sus mejores ítems**.

El error fue de lectura, y quedó anotado acá porque la causa se repite: la
pregunta que se hizo para acordar el diseño fue *"un jugador abre **la página de
un héroe**, ¿qué se lleva?"*, que ya daba por sentado el lugar. El código lo decía
y no se leyó: `Deadlock.tsx` tiene el comentario *"acá la unidad es el héroe y no
hay nada que abrir todavía"* y los tiers arrancan medio plegados *"ahora que cada
fila va a poder desplegar sus builds"*.

**Lo que se salva entero es el pipeline de medición**
(`docs/design/2026-07-30-builds-por-heroe-deadlock-design.md`): el pareo contra
quien llegó al mismo punto, el mecanismo y el encogimiento siguen siendo la forma
de saber cuánto aporta un ítem en un héroe. Eso no se toca. Lo que se rehace es
todo lo que se le puso encima.

**Se elimina**: la pestaña "Builds", el índice de héroes, la página por héroe, los
grupos por precio y las 76 URLs. **Se conserva**: `matching.ts`, `mechanism.ts` y
el cálculo de `builds.ts`.

## Qué es una build, medido

**Un héroe termina con 12 ítems como máximo.** Verificado sobre 166.656 jugadores
de Fantasma+: la mediana es 11, el percentil 90 es 12 y **el máximo es 12 exacto**.
Ninguno tiene 13. La wiki dice 16 (4 arma + 4 vitalidad + 4 espíritu + 4 flex) y
**no describe lo que medimos**, así que manda el dato.

**Pero se compran 16,98 en promedio**, y la diferencia son las mejoras. De 70.373
jugadores con *Improved Spirit*, **60.240 (86%) tienen además *Extra Spirit*** en
el registro: el T1 queda anotado como compra y el juego lo marca vendido al
mejorarlo. Por eso hay ~17 compras y ~11 ítems equipados.

**Los cuadrados muestran los 12 finales, ya mejorados** (decisión de ZoTaD). Si
la build pasa por `Extra Spirit → Improved Spirit → Boundless Spirit`, el cuadrado
dice *Boundless Spirit*. Las compras intermedias no ocupan lugar.

El catálogo ya tiene lo necesario: `tier` 1-4 que son exactamente los cuatro
precios (800/1600/3200/6400), y `upgradesTo`/`upgradesFrom`. **94 de los 156 ítems
son raíz** (no se construyen de nada) y **57 son sueltos** (ni se mejoran ni salen
de otro). Las cadenas son cortas: 57 de un escalón, 32 de dos, **5 de tres o más**
(la más larga: `Grit → Weapon Shielding → Spirit Shielding → Guardian Ward →
Divine Barrier → Reactive Barrier → Indomitable`).

## Las tres builds

**No siempre hay tres formas distintas de jugar un héroe, y eso está medido.**
Cuota de espíritu sobre arma+espíritu, del decil 1 al 9:

| Héroe | d1 → d9 | Rango |
|---|---|---|
| Ivy | 0,09 → 1,00 | **0,91** |
| Bebop | 0,11 → 1,00 | 0,89 |
| Abrams | 0,25 → 1,00 | 0,75 |
| Drifter | 0,09 → 0,82 | 0,73 |
| … | | |
| Wraith | 0,30 → 0,50 | 0,20 |
| Shiv | 0,83 → 1,00 | 0,17 |
| **Mo & Krill** | 0,90 → 1,00 | **0,10** |

Ivy y Bebop se juegan de dos maneras muy distintas; **Mo & Krill de una sola**.

**Tres builds no significa tres estilos distintos** (aclaración de ZoTaD): las
tres pueden ser de daño espiritual y diferenciarse en otra cosa — a veces la build
gira alrededor de **una habilidad**, como la build de stun de Seven, que es su
habilidad 2.

**El eje de habilidad también se mide**: `items.imbued_ability_id` dice en qué
habilidad se infundió cada ítem, y **el 76% de los jugadores infunde al menos
uno**. Por héroe se usan exactamente cuatro. El reparto separa donde hay algo que
separar: el héroe 1 reparte **62/26/10/2** y el héroe 7 pone el **99% en una
sola**.

### Cómo se arman

Es la mezcla que pidió ZoTaD entre "los 12 mejores medidos" y "la build real más
ganadora", y sigue el método que ya funcionó para las comps de TFT:

1. **Firma** de cada build real: categoría de daño dominante + habilidad más
   infundida. Es el equivalente del `trait+carry` de TFT.
2. **Fusión por Jaccard** sobre los conjuntos de 12 ítems reales, no sobre
   centroides. **Nada de k-means**: ya está anotado que produce centroides que no
   son builds jugables y hay que "pegarlos" después.
3. Dentro de cada grupo, los 12 cuadrados se llenan con los ítems que **más se
   repiten en ese grupo Y tienen aporte medido positivo**, respetando los slots.
   Ahí entra el pipeline que ya existe.
4. **Se publican hasta tres, y sólo las que se distingan entre sí.** Si dos grupos
   comparten más del 70% de sus ítems son la misma build con otro nombre y se
   publica una. **A un héroe de una sola forma se le publica una sola build**, y
   eso es lo correcto: tres nombres para lo mismo sería inventarle variedad.

### El 0,7 se calibró midiendo, y estos son los números

Igual que el 0,7 de las familias de comps de TFT, el corte no se eligió: se
probaron tres y se miró qué produce cada uno sobre los 38 héroes.

| Corte | Héroes con 3 builds | con 2 | con 1 |
|---|---|---|---|
| 0,5 | 23 | 9 | 6 |
| **0,7** | **35** | 2 | 1 |
| 0,8 | 37 | 1 | 0 |

El 0,5 borra variedad que existe —Ivy se juega de dos formas medidas, con un
rango de cuota de espíritu de 0,91— y el 0,8 deja pasar builds que comparten casi
todo. Con los pisos de **500 partidas y 6 ítems de núcleo**, el resultado
publicado es **32 héroes con tres builds, 3 con dos y 3 con una**.

**La validación que más vale es la que trajo ZoTaD**: dijo que Seven se juega
con tres builds de daño espiritual, y el agrupamiento le da exactamente tres, las
tres de espíritu, sin que nadie se lo dijera.

### Cómo se llaman

**Derivados de lo que la build es** (decisión de ZoTaD), como en la referencia:
"DPS-Spirit", "Vampiric-Spirit", "Vampiric-Spirit-Extra". El nombre se compone de
**el daño dominante** más **el rasgo que la define** (robo de vida, cooldown,
supervivencia), y ambos vocabularios viven en `i18n.ts` en los dos idiomas — son
palabras nuestras, no del juego, así que no se bajan del catálogo.

La primera lleva el rótulo **Recomendada**, que es la de mejor aporte medido.

## Core y counter, separados por medición

**Un ítem de counter no va en la build**, porque depende de la partida (ZoTaD).
Pero la lista no se escribe a mano: se mide.

El primer criterio que probé —"si la compra depende del rival, es counter"— **no
funciona**, y conviene que quede escrito para no volver a intentarlo:

| Ítem | Base | Swing según rival |
|---|---|---|
| Knockdown | 3,9% | 5,9 pts |
| Metal Skin | 3,3% | 4,9 pts |
| Unstoppable | 8,1% | 3,9 pts |
| **Extra Health** (core puro) | 21,9% | **2,8 pts** |
| Spellbreaker | 4,1% | 2,4 pts |

Extra Health tiene más swing que Spellbreaker. Con el swing crudo no se separan.

**Lo que separa es el swing RELATIVO a la base:**

| | swing / base | |
|---|---|---|
| Extra Health | **13%** | core |
| Mystic Reverb | 20% | core |
| **Unstoppable en Lash** | **36%** | core para él |
| Metal Skin | 148% | counter |
| Knockdown | **151%** | counter |

**Un ítem es core si se compra parejo contra cualquiera, y counter si su compra se
dispara contra alguien.** La face validity es fuerte: Knockdown salta contra
**Vindicta**, que vuela, y Metal Skin contra **Vyper**, que pega con balas.

**Y el criterio es por héroe, que es lo que pedía el caso de Lash**: Lash compra
Unstoppable el **24,2%** contra el **7,3%** del resto —3,3 veces más— y entre 37
rivales distintos se mueve apenas 8,7 puntos. Lo compra pase lo que pase, así que
para él es core aunque para los demás sea counter.

Los counter **se muestran aparte de los 12**, con contra quién saltan.

### El swing relativo castiga al héroe que MÁS compra el counter (2026-08-02)

Contrastando los counters publicados contra lo que nombran las guías aparecieron
falsos negativos, y son los emparejamientos más citados del juego:

| | Base | Contra su peor rival | swing/base | ¿Entraba? |
|---|---|---|---|---|
| Abrams / Phantom Strike vs Vindicta | 38,0% | 59,8% (+21,8 pts) | 0,72 | **no** |
| Paige / Knockdown vs Vindicta | 52,7% | 75,1% (+22,4 pts) | 0,58 | **no** |
| Rem / Divine Barrier vs Pocket | 35,9% | 57,6% (+21,7 pts) | 0,72 | **no** |

Los tres pasan el filtro de ruido con holgura (exceso 3,47 a 3,87). Se caían por
**comunes**: `swing = rango / base` tiene la base en el denominador.

**No alcanza con cambiar un corte por el otro, porque los dos falsos negativos
viven en extremos opuestos del uso.** Shiv/Metal Skin —counter de manual— tiene
un alcance `(máx − base) / (1 − base)` de **0,085**, por debajo de ítems core
como Burst Fire en Drifter (0,114) o Spiritual Overflow en Wraith (0,130): con
base 6,6% su señal sólo se ve como swing relativo.

Así que el criterio es la **unión**: exceso sobre el azar ≥ 2 (gobierna a todos)
**y** (`swing ≥ 1,0` **o** `alcance ≥ 0,30`). El 0,30 cae en el único hueco
ambiguo que dejan los datos —Shiv/Dispel Magic 0,312 real contra Sinclair/Rapid
Recharge 0,266 core puro— y agrega **5 pares y ningún objeto nuevo**: los cinco
son ítems que el método ya llamaba counter en otros héroes, donde el swing sí los
veía. De 84 counters a 89.

### Las tres familias que las guías nombran y NO están, medidas

Anti-cura (Healbane, Decay, Toxic Bullets), silencio (Suppressor, Silence Wave,
Silencer) y Cursed Relic / Ethereal Shift / Reactive Barrier siguen afuera
**después** del arreglo de arriba, y la causa es otra: **no cuentan contra un
rival, cuentan contra el equipo**. Medido sobre la ventana del 2026-08-02, la
tasa de compra según cuántos de los cinco rivales que más la disparan hay
enfrente:

| Ítem | 0 rivales | 3 rivales | Salto |
|---|---|---|---|
| Healbane | 24,4% | 35,2% | **+10,8 pts** |
| Reactive Barrier | 4,5% | 9,6% (4 rivales) | +5,1 pts |
| Suppressor | 6,0% | 10,2% | +4,2 pts |
| *Metal Skin (control)* | *1,1%* | *9,5%* | *+8,4 pts* |

El salto de Healbane es **del tamaño del de Metal Skin**, así que la señal existe
y es fuerte. Pero se reparte entre seis rivales: con una base del 24% y varios
enemigos aportando, ningún rival solo la levanta lo suficiente, y ahí el exceso
sobre el azar se queda en 1,2-2,1. **El eje está mal, no el corte** — aflojarlo
para que entren metería ítems core a montones. Es la feature de counters por
**tipo de daño / composición rival** que quedó pendiente, y necesita su medición
propia.

## La tarjeta

Copia la referencia que pasó ZoTaD. Vive **adentro de la fila de héroe de
`/deadlock`**, que se despliega al apretarla — no en una pestaña propia.

```
┌ tabs ─────────────────────────────────────────────────────────┐
│ [Recomendada: DPS-Espíritu] [Vampírica-Espíritu] [ … ]         │
├───────────────────────────────────────────────────────────────┤
│ ┌ Daño ──────┐ ┌ Orden de ──┐ ┌ Los 12 ────────────────────┐  │
│ │ ▬▬▬ arma   │ │ habilidades│ │ ▣ ▣ ▣ ▣ ▣ ▣                │  │
│ │ ▬▬▬ vida   │ │ ③ ② ① ④    │ │ ▣ ▣ ▣ ▣ ▣ ▣                │  │
│ │ ▬▬▬ espír. │ └────────────┘ └────────────────────────────┘  │
│ └────────────┘                 ┌ Counters ──────────────────┐  │
│                                │ ▣ contra Vindicta …        │  │
│                                └────────────────────────────┘  │
└───────────────────────────────────────────────────────────────┘
```

**El orden de lectura es dónde termina → cómo se llega → qué sumar según el
rival**, y las tres cosas son secciones distintas:

1. **La build terminada**: los doce cuadrados con el ítem final.
2. **Qué comprar en cada escalón**: la misma build partida por tier. Un ítem de
   6400 aparece arriba en su cuadrado y acá aparecen también sus escalones
   previos, porque hay que comprarlos y en ese momento son lo que uno tiene.
3. **Situacionales**: los counter, que no son parte de la build.

- **Daño**: tres barras, arma / vida / espíritu, sumando las stats de los ítems de
  la build. Las stats ya se parsean para las tarjetas de la pestaña de objetos, así
  que no hay fuente nueva.
- **Orden de habilidades**: los cuatro íconos con su número. Ver la dependencia
  abajo.
- **Los 12**: cada cuadrado con su insignia de tier. **Al pasar el mouse aparece la
  tarjeta de ítem que ya existe** (`DeadlockItems`), que hay que extraer a un
  componente compartido.
- **Counters aparte**, con contra qué héroe salta cada uno.

## Datos, y una dependencia nueva

**El orden de habilidades NO está en el snapshot.** Verificado: `ability_stats`
viene vacío (cardinalidad media **0,51**) y `ability_points` es sólo el total.

Sale de **`/v1/analytics/ability-order-stats`**, la API en vivo de deadlock-api,
que devuelve la secuencia con victorias, derrotas y jugadores. **Es una dependencia
nueva de tipo distinto a la que ya teníamos**: hasta ahora dependíamos de su
snapshot de archivos, que si se cae nos deja publicando lo de ayer; esto es su API
en vivo.

**Decisión de ZoTaD: se toma, y si falla el panel no aparece.** Se pide en el
build y se cachea en nuestro JSON, así que una caída afecta a la próxima
publicación y no al sitio. Nada de `abilities.ts` tira: si la API no contesta, el
héroe sale sin `abilityOrder` y la tarjeta no dibuja ese panel.

**Y hay que pedirle el rango, o el panel miente.** El endpoint acepta
`min_average_badge`, y sin él contesta con todos los rangos mezclados debajo de
una tarjeta que dice Fantasma+. Se descubrió comparando contra Deadlock Labs: para
Lash ellos dan `Ground Strike → Grapple → Flog` y nosotros dábamos Flog y Grapple
al revés — no era un error de cálculo, eran dos poblaciones distintas. Va
`min_average_badge=91`, que es Fantasma 1 (la insignia vale `rango*10 + subnivel`).

**Los IDs cruzan entre las dos fuentes y eso valida las dos**: los que devuelve
`ability-order-stats` para el héroe 1 (`1593133799`, `491391007`, `3516947824`) son
exactamente los que aparecen en `imbued_ability_id` del snapshot.

**Los íconos de habilidad** salen del mismo endpoint que los ítems:
`/v1/assets/items/<abilityId>` da `type: "ability"`, `ability_type: "signature"`,
`name` traducido e `image_webp`. Verificado: `1593133799` es *Afterburn*. Se
referencian, no se re-alojan, como todo el arte de Valve.

## Qué se publica

`games/deadlock/data/builds.json` se rehace: **una sola banda (Fantasma+)**, porque
las builds se piden sólo para ahí. Eso además baja el peso de 2,2 MB a ~550 KB, y
con eso la publicación puede volver a las dos corridas diarias.

```ts
interface BuildItem {
  itemId: number;      // el final, ya mejorado
  tier: 1 | 2 | 3 | 4;
  /** Minuto mediano en que entra. */
  minute: number;
  /** Aporte medido, del pipeline que ya existe. */
  edge: number;
  /** Qué fracción de las builds del grupo lo lleva. Va al hover. */
  prevalence: number;
  /** Los escalones por los que pasa, de la raíz al ítem. Para el hover. */
  chain: number[];
}

interface CounterItem {
  itemId: number;
  /** Contra qué héroes salta, con cuánto sube. */
  against: { heroId: number; points: number }[];
  /** swing / base. Ve los counter de base chica. */
  relativeSwing: number;
  /** (máx − base) / (1 − base). Ve los que el héroe ya compra mucho. */
  reach: number;
}

interface HeroBuild {
  /** "dps-spirit" — la clave, en inglés; la prosa vive en i18n. */
  id: string;
  damage: "weapon" | "spirit" | "mixed";
  trait: "dps" | "vampiric" | "cooldown" | "survival";
  /** La habilidad alrededor de la que gira, si gira alrededor de una. */
  aroundAbility?: number;
  matches: number;
  winRate: number;
  items: BuildItem[];
  /** Ausente si la API de orden falló. El panel no se dibuja. */
  abilityOrder?: number[];
  damageSplit: { weapon: number; vitality: number; spirit: number };
}
```

## Tests

- **El armado de una build, puro y sin red**, como todo lo demás del pipeline.
- **Que dos builds demasiado parecidas se colapsan en una**: el caso sintético de
  dos grupos con 80% de ítems compartidos tiene que publicar una sola.
- **Que un héroe de una sola forma publica una sola build**, contra los datos
  reales: Mo & Krill no puede salir con tres.

---

# Los cuatro cambios del 2026-08-02

Los cuatro salieron de que ZoTaD mirara la tarjeta en producción. Los tres
primeros son correcciones y el cuarto es formato. **Ninguno cambia cómo se mide
una build**: el pareo, el mecanismo y el encogimiento quedan intactos.

## 1. Las habilidades iban por orden de subida, no por casilla

El panel listaba las cuatro filas en el orden en que se **desbloquean**, que es lo
que medimos. Pero el juego las numera del 1 al 4 y así las conoce el jugador: en
Ivy salían **1, 3, 2, 4** y se leía como un error de la página. Medido: pasaba en
**80 de 102 builds y 32 de 38 héroes**.

Ahora las filas van por casilla y el orden de subida se lee en la grilla — está en
qué columna cae la primera marca de cada fila. Verificado en Ivy: Entangling
Thorns desbloquea en el paso 1, Stone Form en el 2, Kudzu Connection en el 4.

**La casilla sale de `signature1..4` del asset del héroe**, cruzada por
`class_name`; un solo pedido cubre los 57. Y el numeral que va arriba de cada
columna es **la imagen del juego**, no un romano escrito: **el sexto subrango no
es un "VI", es una estrella de seis puntas**, así que escribirlo obligaría a
imitar la tipografía de Valve y a inventar con qué dibujar el sexto.

## 2. El orden de compras podía mandar a comprar la mejora antes que el componente

**57 casos en 21 héroes.** El que lo hizo notar: Bebop compraba Trophy Collector
en el paso 3 y Sprint Boots —de lo que se arma— en el 4.

**No es que el juego lo prohíba**: la tienda deja comprar la mejora de una. Es que
como lista de compras se lee al revés — el panel dice qué hacer con las almas paso
a paso, y mandar a comprar el componente después de la mejora que alimenta no
describe ninguna partida.

**La causa no era un empate mal desempatado**: la mediana del componente está
sesgada tarde. El minuto de Sprint Boots se mide sobre toda la gente que lo
compra, incluida la que lo lleva a Enduring Speed o a Veil Walker mucho después, y
ese mismo número se usa en la build que lo mejora temprano. Dos poblaciones
distintas en un solo número.

Ahora la cadena manda sobre el reloj: se emite por minuto, pero **un paso espera a
su componente**. Verificado: 0 violaciones sobre las 102 builds, y los cuatro
tests de regresión fallan si se revierte el arreglo.

## 3. "Recomendada" prometía un juicio que la tarjeta no emite

Las builds se eligen por cuánta gente las juega y sus doce ítems por prevalencia;
el aporte medido de cada ítem se guarda pero **no filtra ni ordena nada**. Medido:
el ítem publicado promedio tiene ventaja **−0,01** —exactamente el promedio— y
**57 de 102 builds llevan al menos uno claramente malo**. Con Echo Shard el sitio
se contradecía solo: la pestaña de objetos lo mide en −4,12 y la build de Bebop lo
recomendaba.

Las etiquetas ahora dicen **qué es** cada build:

- **"La más jugada"** en la primera, que es como se eligen.
- **"Mejor winrate"** sólo si le gana a **todas** las demás por dos errores
  estándar. Hoy eso pasa en **5 de 34 héroes** (Infernus, Wraith, Yamato, Víctor y
  Graves); en los otros 29 la diferencia no se distingue de una moneda — Lady
  Geist tiene 50,8% contra 50,0% con errores de 2,2 y 1,2. Donde no se sostiene no
  hay etiqueta, y va apareciendo sola a medida que entran partidas.
- **Un héroe con una sola build no lleva ninguna**: no distingue nada.

Las dos pueden caer en la misma build, y en Víctor y Graves caen.

**Se compara el winrate crudo y no uno encogido, a propósito**: encoger hacia 50%
*y además* exigir dos sigmas sería contar la misma incertidumbre dos veces. El
portón ES el tratamiento de la incertidumbre.

## 4. El panel de compras, partido en early / mid / late

Formato copiado de statlocker **sin sus etiquetas de frecuencia**
(SOMETIMES/FREQUENT/CORE), que son un dato que no medimos.

**Los cortes son 0-12 / 12-22 / 22+ y se validaron contra nuestros datos antes de
adoptarlos**: sobre las 102 builds, **ninguna deja un tramo vacío**, con medianas
de 6, 7 y 5 compras y un máximo de 11. No hizo falta inventar cortes propios.

Cada tarjeta lleva el precio en almas arriba —con el símbolo del juego—, el arte
de tienda del ítem, el escalón I-IV en un triángulo en la esquina y el nombre
adentro. **Sin el minuto**: el tramo ya lo dice en su título.

### La geometría se midió sobre la referencia, no se estimó

Las primeras dos versiones se hicieron a ojo y las dos quedaron mal. La tercera
salió de abrir la página con las herramientas del navegador y leer los valores:

| | Referencia | Nosotros |
|---|---|---|
| Proporción de la tarjeta | 0,640 (80/125) | **0,640** |
| Ícono sobre el ancho | 94,1% | **94,0%** |
| Franja del nombre | 36,0% del alto | **36,0%** |
| Radio | 5 px | 5 px |

**El ícono era el error grande.** Lo dibujábamos con 12% de padding a los
costados, y eso dejaba ver la tarjeta alrededor: el arte de tienda de cada ítem ya
trae su propio fondo, así que al achicarlo competían dos fondos y todo se veía
lavado. A ancho completo el problema desaparece — y el 36% de la franja **sale de
la resta**, no hay que fijarlo.

El escalón es un **triángulo** (`clip-path: polygon(0 0, 100% 0, 100% 100%)`), no
una cajita: una caja rectangular se ve pegoteada encima del arte.

### La paleta: apagada, y el escalón la oscurece

Los colores salieron de muestrear el arte de la referencia píxel por píxel. Lo que
se descubre midiendo es que **el escalón está codificado en cuánto oscurece el
tono**, no sólo en el numeral:

| | T1 | T2 | T3 | T4 |
|---|---|---|---|---|
| weapon | `#EBD8A8` | `#C4A571` | `#A97B48` | `#382C20` |
| vitality | `#D6E0A6` | `#A5B081` | `#4C553F` | `#333220` |
| spirit | `#E6CCED` | `#B79ABF` | `#5C527F` | `#332B2A` |

**Antes acá iban las texturas del juego** (`catalog_tooltip_*`), que son de un
color mucho más vivo: al lado de la referencia el panel entero gritaba. El
triángulo sí va vivo y es constante por categoría — `#EC9719`, `#7BBA1D`,
`#CE90FF` — y el contraste contra el tono apagado es lo que lo hace visible.
`spirit` cae exactamente en `spirit_bright_color` del juego, o sea que la paleta
de la referencia sale de la del juego, apagada.

**La franja del nombre lleva siempre el tono claro de la categoría**, no el del
escalón, y por eso el nombre va negro en las doce combinaciones. La referencia lo
resuelve al revés —aclara el texto en el escalón 4— y eso deja dos colores de
nombre en la misma fila. Medido: negro sobre `#382C20` da **1,45:1** cuando lo
legible arranca en 4,5:1, así que "todos en negro" sin la franja fija no era una
opción.

**La tipografía no es la de Valve, y la referencia tampoco la usa**: usa *Saira
Condensed*, una fuente de Google con licencia abierta. Acá va **Barlow
Condensed**, que el sitio ya carga y es del mismo género — una tercera familia por
una diferencia que sólo se ve al lado no vale los kilobytes.

**Las tarjetas son de ancho fijo, no elástico** — 4,2rem, o sea 80×125 px, el
tamaño de la referencia. Si se estiraran, un tramo de tres las dibujaría del
triple de tamaño que uno de once y las tres secciones dejarían de leerse como la
misma cosa. Medido a 1.440 px: los tres tramos entran **en un renglón cada uno**;
en teléfono, tres por fila.

**Lo único que no se puede replicar** es el fondo, que en la referencia es arte
propio (`card_vitality_1.png`, uno por categoría y escalón). El juego no publica
un equivalente: lo busqué en los 1.333 íconos de la API y no está. Por eso son
colores planos.

**Esto no toca el pipeline.** `buyOrder` ya traía el minuto y el catálogo el
precio, el escalón y la categoría.

**Reemplaza sólo al orden de compra.** "La build terminada · 12 objetos" se queda:
contesta otra pregunta —con qué terminás, de un vistazo— que la secuencia no
contesta sin descartar mentalmente los componentes.

**Lo que no se copió: los pares con "OR"**, que marcan alternativas entre dos
objetos. Es una medición que no hacemos.

## Tests de estos cuatro

- `buildBadges.test.ts`: que la etiqueta de winrate exija ganarle a todas y no
  sólo a la más jugada, que un héroe de una sola build no lleve ninguna, y el caso
  de las dos etiquetas juntas.
- `abilitySlots.test.ts`: el caso real de Ivy (1,3,2,4 → 1,2,3,4) y que el orden
  no se mueva en datos viejos sin casilla, que es lo que mantiene correcto al
  panel de "orden de desbloqueo".
- `buyPhases.test.ts`: los minutos de corte exactos (12 y 22 caen en el tramo de
  arriba), que un tramo vacío no se dibuje, y que no se reordene adentro del tramo
  — reordenar desharía el arreglo de la cadena.
- `builds.test.ts`: cuatro casos nuevos de orden de compra, **verificados fallando
  sin el arreglo**.
- **El corte de counter**, con los casos medidos: Extra Health tiene que quedar
  core y Knockdown counter, y **Unstoppable tiene que quedar core en Lash**.
  Desde el 2026-08-02 también los dos casos del alcance: **Abrams/Phantom Strike
  entra con swing 0,72** y **Sinclair/Rapid Recharge no entra con alcance 0,266**.
- **Que ningún cuadrado tiene un ítem intermedio de una cadena** cuando su mejora
  está en la misma build.
- **Que ninguna build supera los 12**.

## Lo que deliberadamente no entra

- **Las otras tres bandas.** Se pidió Fantasma+ y sólo Fantasma+.
- **Tres builds a la fuerza.** Medido: a Mo & Krill no le existen.
- **k-means.** Da centroides que no son builds jugables; ya está anotado en TFT.
- **Los ítems de flex.** La wiki habla de 4 slots extra; nuestro máximo medido es
  12 y no hay nada que distinga un flex en los datos. Si aparece, se revisa.
- **Video de las habilidades.** La API los tiene (`.webm`, `.mp4`) pero un panel de
  orden no necesita reproducir nada.

## Contra qué se compara (verificado el 2026-07-31)

| | Statlocker | Deadlock Labs | Nosotros |
|---|---|---|---|
| Qué es una "build" | **Publicada por un jugador** ("Build by fargareko"), con votos y fecha de última edición | Dos presets: *Popular* y *Best WR* | Hasta 3, agrupadas por cómo se juega |
| Cómo se elige | Curación de la comunidad | **Winrate crudo** | Pareado contra quien llegó al mismo punto |
| Counters | — | Matchups héroe vs héroe | **Ítems** counter, por cuánto salta la compra según el rival |
| Orden de habilidades | Sí | Sí | Sí |
| Refresco | Manual, del autor | Cada 15 min | 2 veces por día |
| Muestra | — | 400,9K partidas, todos los rangos | 76K, sólo Fantasma+ |

**Dónde estamos mejor**: las builds de Statlocker las escribe una persona y
envejecen con ella; el *Best WR* de Deadlock Labs es exactamente el número
confundido que este diseño existe para no publicar; y **ninguno de los dos mide
qué ítems son counter**, que es la parte que el salto de compra contesta con datos.

**Dónde estamos peor, y hay que decirlo**: ellos tienen cinco veces más muestra y
refrescan cada quince minutos. Nuestra ventaja no es el volumen ni la frescura, es
qué se le pregunta a los datos.

## Tres errores de la primera versión, para no repetirlos

Los tres los encontró ZoTaD mirando la página, no los tests. **La verificación
por DOM no alcanza**: se comprobó que los elementos existían y tenían el texto
correcto, y aun así la pantalla estaba rota.

- **Colisión de clase CSS.** El panel de daño se llamó `.dl-split`, que **ya
  existía**: es el layout de dos columnas de la pestaña de objetos
  (`grid-template-columns: 1.55fr 1fr`). El panel heredó eso y dibujó el título y
  las barras uno al lado del otro. Antes de nombrar una clase `dl-*`, buscarla en
  `codex.css`.
- **Íconos gigantes.** `width: 100%` dentro de una grilla de `1fr` crece con el
  contenedor: en pantalla ancha los ítems llegaban a 160px. Van con **tamaño
  fijo**, como en el juego. Y ojo con las unidades: **la raíz del tema son 19px**,
  así que `3.4rem` son 65px y no 54.
- **Ocho ítems en vez de doce.** El núcleo se armaba con los ítems presentes en
  ≥40% de las builds del grupo, y con ese corte salían ocho. El umbral bajó a 0,15
  y los doce se eligen después por prevalencia. Resultado: **107 de 107 builds con
  exactamente doce**.

## Riesgos

- **El nombre de la build lo inventamos nosotros.** "Vampírica" no es vocabulario
  del juego. Si el rasgo que la define no se puede nombrar sin ambigüedad, la build
  sale sólo con su tipo de daño en vez de con un nombre lindo pero falso.
- **La dependencia de la API en vivo.** Mitigada con caché y `continue-on-error`,
  pero es un proveedor que además es competidor.
- **Las tres builds de un héroe pueden compartir el orden de habilidades**, porque
  el orden se pide por héroe y no por build. Es honesto —es el orden más jugado de
  ese héroe— pero un lector podría leerlo como si fuera propio de cada build. Si
  algún día importa, el endpoint permite filtrar más fino.
- **Los pisos de 500 partidas y 6 ítems de núcleo dejan afuera builds reales pero
  raras.** Es a propósito: por debajo de eso lo que se publica es ruido con forma
  de recomendación. La consecuencia visible es que tres héroes salen con una sola
  build.
