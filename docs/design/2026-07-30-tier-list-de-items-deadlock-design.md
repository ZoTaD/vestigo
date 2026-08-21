# Tier list de ítems de Deadlock: medir el objeto, no su precio

**Fecha:** 2026-07-30
**Estado:** implementado y en producción (2026-07-30)
**Pedido de ZoTaD.** Este documento lo diseña y lo verifica contra el snapshot real.

Todo lo que dice este documento con un número atrás se midió antes de escribirlo,
sobre la ventana del parche vigente (`2026-07-28 20:28 UTC` en adelante):
**29.914 partidas, 314.424 filas jugador, 156 ítems de tienda**.

## Lo que hacen los cuatro competidores, y por qué copiarlos no sirve

Investigado el 2026-07-30 visitando cada sitio:

| Sitio | Qué publica de ítems |
|---|---|
| [tracklock.gg/items](https://tracklock.gg/items) | Tabla: coste, winrate, Δwinrate, uso, Δuso, win/loss. Filtros de rango, tipo, coste, fecha |
| [deadlock-api.com/items](https://deadlock-api.com/items) | *Item Stats*, *Purchase Analysis* (winrate por patrimonio/minuto), *Build Flow* (0-9m / 9-20m / 20-30m / 30m+), *Item Combos*. Intervalos de Wilson |
| [statlocker.gg](https://statlocker.gg) | Modelo ML **WPA** (Win Probability Added): dispersión minuto × WPA con cuadrantes, y tier list S/A/B |
| [deadlocklabs.gg/items](https://deadlocklabs.gg/items) | Tier list S+/S/A con slot, tier, coste, winrate, pickrate |

**Los cuatro ordenan por winrate crudo, y por eso los cuatro publican la misma
lista: la de los ítems caros.** Medido en nuestros propios datos:

| Coste | Ítems | Compras | Winrate agregado | Minuto mediano de compra |
|---|---|---|---|---|
| 800 (T1) | 23 | 1.440.207 | 50,13% | 5,6 |
| 1600 (T2) | 43 | 1.747.964 | 50,79% | 13,5 |
| 3200 (T3) | 46 | 1.449.083 | 50,66% | 21,7 |
| **6400 (T4)** | 44 | 991.775 | **55,06%** | **32,2** |

Los de 6400 no ganan porque sean mejores objetos: ganan porque **comprar uno
significa que la partida llegó al minuto 32 y se llegó con almas de sobra**. El
winrate de un ítem es, en buena medida, un termómetro de la partida en la que se
compró.

Statlocker nombra el problema en su propia página —*win-more bias, defensive trap,
correlation ≠ causation*— y aun así su tier list S es casi toda de 6400. Nombrar el
sesgo no es corregirlo.

**Dentro de un mismo precio, en cambio, la señal es enorme**: entre los de 3200,
Blood Tribute gana 56,4% y Metal Skin 39,9%. Dieciséis puntos y medio entre dos
objetos que cuestan exactamente lo mismo. Ahí está el dato que nadie publica.

## La decisión: cada ítem se compara contra su propio precio

**`delta` = puntos de winrate sobre lo que rinde un ítem cualquiera de ese precio.**

1. **Base del precio**: el winrate agregado de todas las compras de ítems de ese
   precio. **Se calcula por banda**, no una sola vez — la tabla de arriba es el
   agregado de las cuatro juntas, y cada banda tiene la suya. Un archivo con una base
   prestada de otra banda mediría al ítem contra un juego que no es el suyo.
2. **Encogimiento empírico bayesiano hacia esa base**, no hacia 50%. Es el mismo
   método de momentos que `shrinkageFrom` en `games/deadlock/pipeline/src/build.ts`,
   con el centro corrido: para un ítem de 6400 el centro honesto es 55,06%, y
   encogerlo hacia 50 lo premiaría de nuevo por ser caro.
3. `delta = (winrate encogido − base) × 100`.

**El `k` estimado es un resultado, no un parámetro**, y dice algo que ningún sitio
dice:

| Coste | `k` (partidas equivalentes) | Qué significa |
|---|---|---|
| 800 | 1225 | Entre dos ítems de 800 casi no hay diferencia real |
| 1600 | 825 | |
| 3200 | **296** | Acá elegir bien es donde más rinde |
| 6400 | 606 | |

Con `k=1225`, el mejor ítem de 800 apenas se despega de la base. **Eso no es un
defecto de la métrica: es la respuesta.** Elegir bien entre dos ítems de 800 no te
da puntos de winrate; elegir bien entre dos de 3200 sí. Decir lo contrario sería
inventar una decisión que el juego no ofrece.

### Qué produce la métrica

Con el delta como orden, el top 20 **mezcla precios** (4 de 1600, 5 de 3200, 11 de
6400) en vez de ser veinte de 6400. Los extremos quedan legibles:

| Ítem | Coste | delta | winrate |
|---|---|---|---|
| Blood Tribute | 3200 | **+5,39** | 56,4% |
| Heroic Aura | 3200 | +4,21 | 55,0% |
| Frenzy | 6400 | +3,76 | 59,1% |
| Mystic Slow | 1600 | +2,80 | 53,7% |
| … | | | |
| Disarming Hex | 3200 | −9,30 | 41,0% |
| Metal Skin | 3200 | **−10,47** | 39,9% |

Ningún ítem de 800 entra al top 20, por lo dicho arriba sobre `k`.

### Las dos alternativas descartadas

- **Winrate crudo global.** Lo que hacen los cuatro. Descartado por medición: produce
  una lista de precios disfrazada de tier list.
- **Comparar contra quien llegó al mismo punto** (mismo patrimonio, mismo minuto,
  compró otra cosa). Ataca el confundido de raíz y sin ML, y **es viable**: la serie
  `stats.net_worth` está en el Parquet y leer 1,28 millones de compras con su
  patrimonio tardó 2,9 s. Se descartó **para esta versión**, no para siempre: es más
  caro de calcular, mucho más difícil de explicar en una fila, y la comparación por
  precio ya resuelve el 90% del problema. Queda anotado como el camino si algún día
  hace falta comparar un ítem de 800 contra uno de 6400.

## Los tiers salen de la distribución, como siempre

Cortes sobre el delta en **`+2 / +0,8 / −0,3 / −1,8`**. Reparto medido en la banda
por defecto: **12 / 24 / 49 / 53 / 18** en S/A/B/C/D. Los cortes salen de los
cuartiles reales (q1 −1,04, mediana −0,14, q3 +0,75), igual que los umbrales de las
etiquetas de comp de TFT: **no se elige un número redondo y después se mira qué
pasa.**

**Son los mismos cuatro números para los cuatro precios, y eso es el punto**: el
delta ya está medido contra la base de su propio precio, así que una S de 800 y una
S de 6400 significan lo mismo —"rinde más de dos puntos por encima de lo que rinde
comprar cualquier cosa a ese precio"—. Recalcular los cortes por precio forzaría a
cada grupo a tener sus propias S, y la letra dejaría de comparar nada.

Por eso también los grupos salen desparejos, y está bien: en la banda por defecto
los 800 no producen ninguna S (`k=1225`: no hay diferencias grandes que encontrar),
mientras que los 3200 producen seis.

## La brecha por rango se construyó y se sacó (2026-07-30)

Se publicó midiendo la diferencia de winrate de cada ítem entre Fantasma+ y
Arcanista-abajo: 148 de 156 ítems tenían muestra en los dos extremos y el rango
iba de **−3,9 a +5,4 puntos**. En pantalla eran dos etiquetas, "Difícil" y
"Perdona".

**ZoTaD la rechazó el mismo día y tenía razón.** Un objeto no es difícil ni
fácil: todo el mundo sabe lo que hace un ítem al comprarlo. El número existía,
pero la lectura que le pusimos encima era falsa — lo que esa diferencia mide es
**en qué situaciones lo compra alguien que juega bien**, que es una propiedad de
la build y del momento, no del objeto. Es exactamente la pregunta que van a
contestar las builds por héroe, y contestarla con una etiqueta sobre el ítem era
adelantarse con la herramienta equivocada.

Se removió entera: de la página, del pipeline y del JSON. De paso el build dejó de
hacer dos consultas al snapshot.

**La lección, que es la que vale para lo que viene:** que un número tenga señal
estadística no alcanza para publicarlo. Hay que poder decir qué causa esa señal, y
si la explicación más simple es "esto en realidad mide otra cosa", el número no
describe lo que el rótulo promete.

## El filtro que faltaba: `game_mode = 'Normal'`

**`match_mode = 'Unranked'` no alcanza: incluye Street Brawl.** `match_mode` y
`game_mode` son columnas distintas, y dentro de Unranked conviven `Normal` (38,4 min
de duración media) y `StreetBrawl` (14,4 min): **3.712 de 29.914 partidas, el
12,4%**.

- **Para ítems es decisivo.** Los **17 ítems de coste 9999 son 100% Street Brawl**, y
  sin el filtro encabezan la lista cruda con 61,9%. Con el filtro desaparecen solos,
  sin lista negra que mantener.
- **Para héroes es menor, y se midió antes de alarmar**: mueve el winrate 0,2 puntos
  típicos y 1,0 en el peor caso, y ningún héroe se corre más de 3 puestos. Se corrige
  igual, en el mismo commit, porque es una línea y porque el número publicado debe
  describir el juego que dice describir.

El filtro va en `windowSql` (`games/deadlock/pipeline/src/snapshot.ts`), que es de
donde lo toman los dos pipelines.

## Qué se publica

`games/deadlock/data/items.<banda>.json`, uno por banda, con `items.json` = la banda
por defecto — mismo criterio que `heroes.json`, para que el import estático del
bundle no cambie.

```ts
interface ItemStat {
  itemId: number;
  cost: 800 | 1600 | 3200 | 6400;
  slot: "weapon" | "vitality" | "spirit";
  /** Compras. No se muestra: es el denominador. */
  n: number;
  /** Puntos sobre lo que rinde su precio. Es el número que ordena y que se muestra. */
  delta: number;
  /** Lo que midió sin encoger, para auditar el encogimiento. */
  winRateRaw: number;
  /** Fracción de filas jugador de la banda que lo compraron. */
  pickRate: number;
  /** Minuto mediano de compra. Ubica al ítem en la partida. */
  buyMinute: number;
  thinData?: boolean;
}

interface ItemsFile {
  generatedAt: string;
  band: string;
  patch: { date: string; title: string; link: string };
  provisional?: boolean;
  /** La base de cada precio, publicada: sin ella el delta no se puede verificar. */
  costBaselines: Record<string, number>;
  matches: number;
  boards: number;
  from: string;
  to: string;
  items: ItemStat[];
}
```

**`costBaselines` se publica a propósito.** El delta es una resta contra ese número;
sin él, el lector tendría que confiar. Es la misma regla que `winRateRaw` en héroes.

**El mínimo de muestra**: `MIN_BUYS = 300` para publicar un ítem con su delta.
Debajo de eso se marca `thinData` y se dibuja atenuado, como los héroes de muestra
fina — no se esconde, se avisa.

**Cobertura medida**: con 300 compras, **los 156 ítems califican en las cuatro
bandas**, así que hoy `thinData` no se dispara para nadie. Es una situación mucho más
cómoda que la de TFT, donde `silver-below` publica vacío.

## La página

Ruta **`/deadlock/items`** (slug en inglés, como todo slug del producto).
`DeadlockSection` pasa a `"meta" | "items" | "patches"`.

**Dos columnas: la lista a la izquierda y lo que la resume a la derecha** (pedido de
ZoTaD, 2026-07-30). Son dos preguntas distintas. La lista contesta "tengo N almas,
¿qué compro?" y hay que recorrerla; los gráficos contestan "¿cómo está la tienda?" de
una mirada.

**La columna derecha NO se fija ni tiene scroll propio**, y el primer intento sí.
Fijarla obligaba a ponerle `overflow-y` —es más alta que la pantalla— y eso mete una
segunda barra adentro de la página: la rueda del mouse hace una cosa distinta según
dónde esté el puntero. Rechazado por ZoTaD apenas lo vio. Fluye con la página.

```
┌ .tool-head ───────────────────────────────────────────────┐
│ título + bajada          │ banda, muestra, parche         │
└───────────────────────────────────────────────────────────┘
┌ 6400 ▾ (44) ──────────────────┐ ┌ Lo que rinde vs lo que ─┐
│ S │ ícono nombre [espíritu]   │ │ se compra (dispersión)  │
│   │        +3,76  59,1%  2,2% │ ├─────────────────────────┤
│ … │                           │ │ Vale más de lo que se   │
├ 3200 ▾ (46) ──────────────────┤ │ usa · Se compra más de  │
│ …                             │ │ lo que rinde            │
├ 1600 ▸ (43) ──────────────────┤ ├─────────────────────────┤
├ 800  ▸ (23) ──────────────────┤ │ Dónde está el valor     │
└───────────────────────────────┘ └─(mapa 4×3)──────────────┘
```

- **Cuatro grupos plegables por precio**, cada uno con su S/A/B/C/D adentro.
  **6400 y 3200 abiertos; 1600 y 800 plegados**, y el criterio no es "los caros
  primero": es que `k` mide que ahí es donde elegir bien cambia algo (296 y 606
  contra 825 y 1225). El contenido se monta plegado igual, para Ctrl+F y Google.
- **Tres números por fila: `Ventaja`, `Victorias`, `Uso`.** Los rótulos anteriores
  —"contra su precio" y "comprado en"— se rechazaron por ilegibles (ZoTaD). Qué se
  compara ya lo dice el encabezado del grupo, así que la columna sólo nombra qué es
  el número; "Victorias" y "Uso" son además las palabras que ya usa la tier list de
  héroes.
- **Criterio de aceptación, cumplido y medido**: la primera fila de ítem cae en
  **y=630** con viewport de 720. Con la franja de brecha estaba en 854 y antes de
  compactarla en 1113.

### Los dos gráficos

**Ninguno se dibujó sin verificar antes que dijera algo.**

- **Dispersión uso × ventaja.** Los cuadrantes que importan son las diagonales:
  **32 ítems rinden y casi nadie los compra**, y **38 los compra más de la mitad y
  restan** (Slowing Hex: 15,5% de uso, −3,3). **Cada marca es la imagen del objeto**,
  no un punto de color: es como el jugador lo reconoce, y la altura ya dice cuánta
  ventaja tiene, así que pintarlo además sería codificar dos veces lo mismo. Los que
  caen en los dos cuadrantes que importan se ven enteros y el resto va atenuado.
  **Adentro del dibujo no va ni una palabra**: los rótulos se pisaban entre sí y con
  las marcas, así que viven debajo como texto de verdad —seleccionable, y que el zoom
  de texto del navegador agranda—. El eje de uso es **logarítmico**
  porque va de 0,57% a 47,8% y 59 de 156 están debajo del 5%. El de ventaja está
  **acotado en ±5**, que deja afuera 3 de 156: sin acotarlo, el peor ítem (−9,6)
  aplasta a los otros 155 contra el borde. Los tres recortados se dibujan en el
  borde con anillo punteado y su número real en el tooltip.
- **Mapa de la tienda, 4 precios × 3 categorías.** Se verificó contra las cuatro
  bandas antes de construirlo: **8 de 12 celdas mantienen el signo**, y las 4 que se
  dan vuelta son justo las que están pegadas a cero. La de 3200-vitalidad rinde
  entre −1,2 y −1,4 en las cuatro bandas.

**La escala de color es divergente y validada, no elegida a ojo.** Polos `#e8b44a`
y `#c25a54` con gris neutro al medio: separan **ΔE 21,4 en deuteranopía** (el
objetivo es 8) y los dos pasan 3:1 contra el fondo. El oro del tema daba ΔE 42,8
pero el oxblood quedaba en 2,41:1. **Las celdas del mapa se pintan sobre el fondo
del panel** para que ninguna llegue a ser clara: con la rampa a fuerza completa las
doce quedaban debajo de 4,5:1 de contraste de texto (la peor en 3,4), y eligiendo la
mejor tinta por celda cinco seguían debajo. Apoyadas sobre el panel, la peor da 6,56.

**El número va escrito en cada celda**, no sólo el color, y las dos listas de
nombres son también la vista de tabla que el gráfico necesita para no depender del
color.

## Catálogo e idioma

`catalog.ts` se extiende a ítems. `assets.deadlock-api.com/v2/items?language=english`
y `…=spanish` dan nombre e imagen de tienda; se cruza por `id` con `items.parquet`,
que es de donde salen `cost`, `tier` y `slot_type`. **Nada se traduce a mano**: 172 de
173 ítems de tienda ya vienen con nombre propio en español, igual que los héroes. Las
imágenes se referencian, no se re-alojan.

Un ítem que esté en el snapshot y no en la API de assets **se omite** en vez de
dibujar una fila sin nombre, con un aviso en el build.

## Infraestructura

- **`npm run build:items`**, al lado de `build:heroes`. La consulta completa con las
  cuatro bandas tarda **9,3 s** contra el snapshot; no se baja un byte de más.
- La Action lo corre **sin `continue-on-error`**, al revés que `catalog`: es la fuente
  de la pestaña, igual que `build:heroes`.
- `netlify.toml` **ya cubre `games/deadlock/data`**, así que la publicación no se
  saltea. No hay nada que tocar ahí (y es la trampa que ya se pagó dos veces).
- `sitemap.ts` suma `/deadlock/items` en los dos idiomas.

## Tests

- `itemsFileFrom` **puro y probado sin red**, como `heroesFileFrom`: es donde vive
  todo el criterio.
- Tests de los dos gráficos sobre los datos publicados: que los cuadrantes tengan
  contenido de los dos lados, que ningún ítem caiga en dos a la vez, y que la peor
  góndola medida (3200-vitalidad) siga siendo negativa.
- Un test que verifica que **ningún ítem de coste 9999 sobrevive** al filtro de modo.
- `bands.test.ts` ya compara las tablas de banda contra los archivos escritos; el de
  ítems entra en el mismo mecanismo.

## Lo que deliberadamente no entra

- **Top ítems por héroe.** Hay muestra (~8.300 filas por héroe), pero es la semilla de
  las builds y va con ellas. El orden acordado con ZoTaD es **ítems → counters →
  builds**.
- **Ítems counter** (qué comprar contra un héroe o contra un tipo de daño). Pedido de
  ZoTaD el 2026-07-30, explícitamente para después de esta pestaña.
- **`soldRate` como métrica visible.** Está medido y es interesante (Sprint Boots
  96,5%, Duration Extender 88,5%), pero con la lista agrupada por precio no hace falta
  para que el pickRate sea honesto. Entra si algún día la lista se vuelve global.
- **Combos de ítems.** deadlock-api publica el suyo ordenado por winrate con mínimo de
  10 partidas: su combo número uno tiene **16 partidas y 94%**. Eso es ruido con forma
  de dato, y hacerlo bien pide una muestra que hoy no tenemos.
- **Un modelo tipo WPA.** Statlocker tiene dos data scientists y ocho meses puestos
  ahí. La comparación por precio da el 90% del beneficio con metodología que se puede
  publicar entera en un párrafo, que es nuestra ventaja real.
- **Fases early/mid/late como sección aparte.** Medido: el minuto mediano de compra
  queda determinado por el precio (5,5 / 13,5 / 20,0 / 31,3), así que sería el mismo
  corte dos veces. Lo que queda de señal —dentro de los 3200, Heroic Aura al minuto
  17 y Metal Skin al 30— cabe en la columna `buyMinute`.

## Riesgos

- **El snapshot es de un competidor.** Nada nuevo: ya es el riesgo de la tier list de
  héroes. Lo que se calcula es nuestro; de ellos sale la partida cruda.
- **La base por precio se mueve con el parche.** Es correcto que se mueva —se
  recalcula en cada build— pero significa que el delta de un ítem puede cambiar sin
  que el ítem cambie. Por eso se publica `costBaselines`.
- **Un parche que cambie el precio de un ítem lo muda de grupo.** El `cost` sale del
  snapshot en cada build, así que se acomoda solo; lo que no se puede es comparar ese
  ítem contra sí mismo entre parches. Es el mismo límite que ya tiene `trend`.
